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

struct PendingRequests {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, SidecarError>>>>,
    // Keyed by a caller-chosen domain id (a Validation id or a Generate run id) rather than the
    // internal JSON-RPC id, so Rust can translate a cancel-by-domain-id call into the raw
    // `$/cancelRequest` notification the sidecar's generic per-request AbortSignal understands.
    cancellable: Mutex<HashMap<String, u64>>,
}

impl Default for PendingRequests {
    fn default() -> Self { Self::new() }
}

impl PendingRequests {
    fn new() -> Self {
        Self { next_id: AtomicU64::new(1), pending: Mutex::new(HashMap::new()), cancellable: Mutex::new(HashMap::new()) }
    }

    fn register(&self, cancel_key: Option<&str>) -> (u64, oneshot::Receiver<Result<Value, SidecarError>>) {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, sender);
        if let Some(key) = cancel_key { self.cancellable.lock().unwrap().insert(key.to_owned(), id); }
        (id, receiver)
    }

    fn resolve(&self, id: u64, outcome: Result<Value, SidecarError>) -> bool {
        match self.pending.lock().unwrap().remove(&id) {
            Some(sender) => sender.send(outcome).is_ok(),
            None => false,
        }
    }

    fn forget_cancel_key(&self, key: &str) { self.cancellable.lock().unwrap().remove(key); }

    fn drop_pending(&self, id: u64) { self.pending.lock().unwrap().remove(&id); }

    fn take_for_cancel(&self, key: &str) -> Option<u64> {
        let id = self.cancellable.lock().unwrap().remove(key)?;
        self.pending.lock().unwrap().remove(&id);
        Some(id)
    }
}

pub struct SidecarRelay {
    app: AppHandle,
    requests: PendingRequests,
    child: Mutex<Option<CommandChild>>,
    restarts: Mutex<Vec<Instant>>,
    ready: AtomicBool,
    fatal: AtomicBool,
}

impl SidecarRelay {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self { app, requests: PendingRequests::new(), child: Mutex::new(None), restarts: Mutex::new(Vec::new()), ready: AtomicBool::new(false), fatal: AtomicBool::new(false) })
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
            Some("generate.progress") => { let _ = self.app.emit("generate-run-progress", value.get("params")); return; }
            _ => {}
        }
        let Some(id) = value.get("id").and_then(Value::as_u64) else { return };
        self.requests.resolve(id, response_outcome(&value));
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
        self.request_with_cancel_key(method, params, None).await
    }

    async fn request_with_cancel_key(&self, method: &str, params: Value, cancel_key: Option<&str>) -> Result<Value, SidecarError> {
        if self.fatal.load(Ordering::SeqCst) { return Err(SidecarError { code: "SIDECAR_UNAVAILABLE".into(), message: "Atomize sidecar failed repeatedly. Select Retry to restart it.".into() }); }
        if !self.ready.load(Ordering::SeqCst) { return Err(SidecarError { code: "SIDECAR_STARTING".into(), message: "Atomize sidecar is still starting.".into() }); }
        let (id, receiver) = self.requests.register(cancel_key);
        let request = encode_request(id, method, params);
        if let Some(child) = self.child.lock().unwrap().as_mut() { child.write(format!("{request}\n").as_bytes()).map_err(|e| SidecarError { code: "SIDECAR_WRITE_FAILED".into(), message: e.to_string() })?; }
        else { self.requests.drop_pending(id); return Err(SidecarError { code: "SIDECAR_UNAVAILABLE".into(), message: "Atomize sidecar is not running.".into() }); }
        let outcome = receiver.await.map_err(|_| SidecarError { code: "SIDECAR_STOPPED".into(), message: "Atomize sidecar stopped before responding.".into() })?;
        if let Some(key) = cancel_key { self.requests.forget_cancel_key(key); }
        outcome
    }

    pub async fn validate(&self, validation_id: String, params: Value) -> Result<Value, SidecarError> {
        self.request_with_cancel_key("validation.online", params, Some(&validation_id)).await
    }

    pub fn cancel_validation(&self, validation_id: &str) -> Result<(), SidecarError> {
        self.cancel_by_key(validation_id)
    }

    /// `generate.run` has no dedicated sidecar-side cancel handler — like Online Validation, cancelling
    /// only abandons the pending response via the generic `$/cancelRequest` mechanism (`atomize-core`
    /// has no cancellation hook to actually interrupt an in-flight batch).
    pub async fn run_generate(&self, run_id: String, params: Value) -> Result<Value, SidecarError> {
        self.request_with_cancel_key("generate.run", params, Some(&run_id)).await
    }

    pub fn cancel_generate(&self, run_id: &str) -> Result<(), SidecarError> {
        self.cancel_by_key(run_id)
    }

    fn cancel_by_key(&self, key: &str) -> Result<(), SidecarError> {
        let Some(id) = self.requests.take_for_cancel(key) else { return Ok(()); };
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

    #[test] fn response_outcome_unwraps_a_successful_result() {
        assert_eq!(response_outcome(&json!({ "result": { "count": 2 } })).unwrap(), json!({ "count": 2 }));
    }

    #[test] fn a_registered_request_receives_its_response() {
        let requests = PendingRequests::new();
        let (id, mut rx) = requests.register(None);
        assert!(requests.resolve(id, Ok(json!({ "ok": true }))));
        assert_eq!(rx.try_recv().unwrap().unwrap(), json!({ "ok": true }));
    }

    #[test] fn a_structured_error_response_reaches_the_waiter() {
        let requests = PendingRequests::new();
        let (id, mut rx) = requests.register(None);
        requests.resolve(id, Err(SidecarError { code: "GROUNDING_TOKEN_EXPIRED".into(), message: "expired".into() }));
        assert_eq!(rx.try_recv().unwrap().unwrap_err().code, "GROUNDING_TOKEN_EXPIRED");
    }

    #[test] fn resolving_an_unknown_id_is_a_harmless_no_op() {
        assert!(!PendingRequests::new().resolve(404, Ok(Value::Null)));
    }

    #[test] fn correlation_ids_are_monotonic() {
        let requests = PendingRequests::new();
        let (first, _a) = requests.register(None);
        let (second, _b) = requests.register(None);
        assert!(second > first);
    }

    // ADR-0054: cancelling an in-flight request abandons its pending response and any late
    // reply for that correlation id is silently ignored.
    #[test] fn cancelling_an_in_flight_request_unblocks_the_waiter_and_drops_a_late_response() {
        let requests = PendingRequests::new();
        let (id, mut rx) = requests.register(Some("run-1"));
        assert_eq!(requests.take_for_cancel("run-1"), Some(id));
        assert!(matches!(rx.try_recv(), Err(oneshot::error::TryRecvError::Closed)));
        assert!(!requests.resolve(id, Ok(json!({ "late": true }))));
    }

    #[test] fn cancelling_an_unknown_key_is_a_no_op() {
        assert_eq!(PendingRequests::new().take_for_cancel("never-registered"), None);
    }

    #[test] fn a_request_without_a_cancel_key_is_not_cancellable_by_key() {
        let requests = PendingRequests::new();
        let (_id, _rx) = requests.register(None);
        assert_eq!(requests.take_for_cancel("run-1"), None);
    }

    #[test] fn forgetting_a_cancel_key_leaves_the_response_channel_intact() {
        let requests = PendingRequests::new();
        let (id, mut rx) = requests.register(Some("run-1"));
        requests.forget_cancel_key("run-1");
        assert_eq!(requests.take_for_cancel("run-1"), None);
        assert!(requests.resolve(id, Ok(json!("done"))));
        assert_eq!(rx.try_recv().unwrap().unwrap(), json!("done"));
    }
}
