use std::{collections::HashMap, sync::{atomic::{AtomicBool, AtomicU64, Ordering}, Arc, Mutex}, time::{Duration, Instant}};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};
use tokio::sync::oneshot;

const SIDECAR_NAME: &str = "atomize-sidecar";
const MAX_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(60);

pub struct SidecarRelay {
    app: AppHandle,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    child: Mutex<Option<CommandChild>>,
    restarts: Mutex<Vec<Instant>>,
    ready: AtomicBool,
    fatal: AtomicBool,
}

impl SidecarRelay {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self { app, next_id: AtomicU64::new(1), pending: Mutex::new(HashMap::new()), child: Mutex::new(None), restarts: Mutex::new(Vec::new()), ready: AtomicBool::new(false), fatal: AtomicBool::new(false) })
    }

    pub fn start(self: &Arc<Self>) -> Result<(), String> {
        if self.fatal.load(Ordering::SeqCst) { return Err("Atomize sidecar is unavailable. Retry to start it again.".into()); }
        let catalog_root = self.app.path().resource_dir().map_err(|e| e.to_string())?;
        let command = self.app.shell().sidecar(SIDECAR_NAME).map_err(|e| e.to_string())?.env("ATOMIZE_CATALOG_ROOT", catalog_root);
        let (mut receiver, child) = command.spawn().map_err(|e| e.to_string())?;
        *self.child.lock().unwrap() = Some(child);
        let relay = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = receiver.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => relay.handle_stdout(&bytes),
                    CommandEvent::Terminated(_) => { relay.handle_exit(); break; }
                    _ => {}
                }
            }
        });
        Ok(())
    }

    fn handle_stdout(&self, bytes: &[u8]) {
        let Ok(value) = serde_json::from_slice::<Value>(bytes) else { return };
        if value.get("method").and_then(Value::as_str) == Some("sidecar.ready") { self.ready.store(true, Ordering::SeqCst); return; }
        let Some(id) = value.get("id").and_then(Value::as_u64) else { return };
        let Some(sender) = self.pending.lock().unwrap().remove(&id) else { return };
        let outcome = match (value.get("result"), value.get("error")) {
            (Some(result), _) => Ok(result.clone()),
            (_, Some(error)) => Err(error.get("message").and_then(Value::as_str).unwrap_or("Sidecar request failed.").to_owned()),
            _ => Err("Malformed sidecar response.".into()),
        };
        let _ = sender.send(outcome);
    }

    fn handle_exit(self: &Arc<Self>) {
        self.ready.store(false, Ordering::SeqCst);
        *self.child.lock().unwrap() = None;
        let now = Instant::now();
        let mut restarts = self.restarts.lock().unwrap();
        restarts.retain(|at| now.duration_since(*at) <= RESTART_WINDOW);
        if restarts.len() >= MAX_RESTARTS { self.fatal.store(true, Ordering::SeqCst); return; }
        restarts.push(now);
        drop(restarts);
        let _ = self.start();
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        if self.fatal.load(Ordering::SeqCst) { return Err("Atomize sidecar failed repeatedly. Select Retry to restart it.".into()); }
        if !self.ready.load(Ordering::SeqCst) { return Err("Atomize sidecar is still starting.".into()); }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, sender);
        let request = encode_request(id, method, params);
        if let Some(child) = self.child.lock().unwrap().as_mut() { child.write(format!("{request}\n").as_bytes()).map_err(|e| e.to_string())?; }
        else { self.pending.lock().unwrap().remove(&id); return Err("Atomize sidecar is not running.".into()); }
        receiver.await.map_err(|_| "Atomize sidecar stopped before responding.".to_owned())?
    }

    pub fn retry(self: &Arc<Self>) -> Result<(), String> {
        self.fatal.store(false, Ordering::SeqCst);
        self.restarts.lock().unwrap().clear();
        self.start()
    }
    pub fn mark_fatal(&self) { self.fatal.store(true, Ordering::SeqCst); }
    pub fn is_fatal(&self) -> bool { self.fatal.load(Ordering::SeqCst) }
}

pub fn encode_request(id: u64, method: &str, params: Value) -> String { json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn encodes_a_correlated_request() { assert_eq!(encode_request(4, "catalog.list", json!({})), r#"{"id":4,"jsonrpc":"2.0","method":"catalog.list","params":{}}"#); }
    #[test] fn malformed_or_unknown_responses_are_safe_to_ignore() {
        let malformed = serde_json::from_slice::<Value>(b"not json");
        assert!(malformed.is_err());
        let mut pending: HashMap<u64, oneshot::Sender<Result<Value, String>>> = HashMap::new();
        assert!(pending.remove(&999).is_none());
    }
}
