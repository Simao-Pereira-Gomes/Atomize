use std::{collections::HashMap, sync::{atomic::{AtomicBool, AtomicU64, Ordering}, Arc, Mutex}, time::{Duration, Instant}};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};
use tokio::sync::oneshot;

const SIDECAR_NAME: &str = "atomize-sidecar";
const MAX_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, serde::Serialize)]
pub struct SidecarError { pub code: String, pub message: String }

pub struct SidecarRelay {
    app: AppHandle,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, SidecarError>>>>,
    validation_requests: Mutex<HashMap<String, u64>>,
    child: Mutex<Option<CommandChild>>,
    restarts: Mutex<Vec<Instant>>,
    ready: AtomicBool,
    fatal: AtomicBool,
}

impl SidecarRelay {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self { app, next_id: AtomicU64::new(1), pending: Mutex::new(HashMap::new()), validation_requests: Mutex::new(HashMap::new()), child: Mutex::new(None), restarts: Mutex::new(Vec::new()), ready: AtomicBool::new(false), fatal: AtomicBool::new(false) })
    }

    pub fn start(self: &Arc<Self>) -> Result<(), String> {
        if self.fatal.load(Ordering::SeqCst) { return Err("Atomize sidecar is unavailable. Retry to start it again.".into()); }
        let catalog_root = self.app.path().resource_dir().map_err(|e| e.to_string())?;
        let copilot = copilot_cli_path()?;
        let command = self.app.shell().sidecar(SIDECAR_NAME).map_err(|e| e.to_string())?
            .env("ATOMIZE_CATALOG_ROOT", catalog_root)
            .env("ATOMIZE_COPILOT_CLI_PATH", copilot);
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
        match value.get("method").and_then(Value::as_str) {
            Some("sidecar.ready") => { self.ready.store(true, Ordering::SeqCst); return; }
            // Out-of-band notifications carry no request id; forward their params
            // straight to the frontend as a Tauri event instead of matching a pending call.
            Some("ai.progress") => { let _ = self.app.emit("ai-draft-progress", value.get("params")); return; }
            _ => {}
        }
        let Some(id) = value.get("id").and_then(Value::as_u64) else { return };
        let Some(sender) = self.pending.lock().unwrap().remove(&id) else { return };
        let outcome = response_outcome(&value);
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

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, SidecarError> {
        self.request_with_validation_key(method, params, None).await
    }

    async fn request_with_validation_key(&self, method: &str, params: Value, validation_key: Option<&str>) -> Result<Value, SidecarError> {
        if self.fatal.load(Ordering::SeqCst) { return Err(SidecarError { code: "SIDECAR_UNAVAILABLE".into(), message: "Atomize sidecar failed repeatedly. Select Retry to restart it.".into() }); }
        if !self.ready.load(Ordering::SeqCst) { return Err(SidecarError { code: "SIDECAR_STARTING".into(), message: "Atomize sidecar is still starting.".into() }); }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, sender);
        if let Some(key) = validation_key { self.validation_requests.lock().unwrap().insert(key.to_owned(), id); }
        let request = encode_request(id, method, params);
        if let Some(child) = self.child.lock().unwrap().as_mut() { child.write(format!("{request}\n").as_bytes()).map_err(|e| SidecarError { code: "SIDECAR_WRITE_FAILED".into(), message: e.to_string() })?; }
        else { self.pending.lock().unwrap().remove(&id); return Err(SidecarError { code: "SIDECAR_UNAVAILABLE".into(), message: "Atomize sidecar is not running.".into() }); }
        let outcome = receiver.await.map_err(|_| SidecarError { code: "SIDECAR_STOPPED".into(), message: "Atomize sidecar stopped before responding.".into() })?;
        if let Some(key) = validation_key { self.validation_requests.lock().unwrap().remove(key); }
        outcome
    }

    pub async fn validate(&self, validation_id: String, params: Value) -> Result<Value, SidecarError> {
        self.request_with_validation_key("validation.online", params, Some(&validation_id)).await
    }

    pub fn cancel_validation(&self, validation_id: &str) -> Result<(), SidecarError> {
        let Some(id) = self.validation_requests.lock().unwrap().remove(validation_id) else { return Ok(()); };
        self.pending.lock().unwrap().remove(&id);
        let notification = json!({ "jsonrpc": "2.0", "method": "$/cancelRequest", "params": { "id": id } });
        let mut child = self.child.lock().unwrap();
        let Some(child) = child.as_mut() else { return Ok(()); };
        child.write(format!("{notification}\n").as_bytes()).map_err(|e| SidecarError { code: "SIDECAR_WRITE_FAILED".into(), message: e.to_string() })
    }

    pub fn retry(self: &Arc<Self>) -> Result<(), String> {
        self.fatal.store(false, Ordering::SeqCst);
        self.restarts.lock().unwrap().clear();
        self.start()
    }
    pub fn mark_fatal(&self) { self.fatal.store(true, Ordering::SeqCst); }
    pub fn is_fatal(&self) -> bool { self.fatal.load(Ordering::SeqCst) }
}

// Tauri strips the target suffix while staging external binaries beside the app
// executable (both in target/debug and in a packaged app).
fn copilot_cli_path() -> Result<std::path::PathBuf, String> {
    let executable_dir = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .map(std::path::Path::to_path_buf)
        .ok_or_else(|| "Atomize Studio executable has no parent directory.".to_string())?;
    Ok(executable_dir.join(format!("atomize-copilot{}", if cfg!(target_os = "windows") { ".exe" } else { "" })))
}

fn response_outcome(value: &Value) -> Result<Value, SidecarError> {
    match (value.get("result"), value.get("error")) {
        (Some(result), _) => Ok(result.clone()),
        (_, Some(error)) => Err(SidecarError { code: error.get("code").and_then(Value::as_str).unwrap_or("SIDECAR_REQUEST_FAILED").to_owned(), message: error.get("message").and_then(Value::as_str).unwrap_or("Sidecar request failed.").to_owned() }),
        _ => Err(SidecarError { code: "MALFORMED_SIDECAR_RESPONSE".into(), message: "Malformed sidecar response.".into() }),
    }
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
    #[test] fn preserves_a_structured_sidecar_error() {
        let error = response_outcome(&json!({ "error": { "code": "GROUNDING_TOKEN_EXPIRED", "message": "Token expired." } })).unwrap_err();
        assert_eq!(error.code, "GROUNDING_TOKEN_EXPIRED");
        assert_eq!(error.message, "Token expired.");
    }
    #[test] fn resolves_the_staged_copilot_binary_without_a_target_suffix() {
        let path = copilot_cli_path().unwrap();
        let file_name = path.file_name().unwrap().to_string_lossy();
        assert_eq!(file_name, if cfg!(target_os = "windows") { "atomize-copilot.exe" } else { "atomize-copilot" });
    }
}
