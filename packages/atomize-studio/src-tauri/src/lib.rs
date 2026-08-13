mod sidecar;
use std::sync::Arc;
use serde_json::json;
use sidecar::SidecarRelay;
use tauri::Manager;

#[tauri::command]
async fn catalog_list_templates(relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, String> {
    relay.request("catalog.list", json!({})).await
}

#[tauri::command]
fn retry_sidecar(relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<(), String> { relay.retry() }

#[tauri::command]
fn sidecar_fatal(relay: tauri::State<'_, Arc<SidecarRelay>>) -> bool { relay.is_fatal() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| { let relay = SidecarRelay::new(app.handle().clone()); if relay.start().is_err() { relay.mark_fatal(); } app.manage(relay); Ok(()) })
        .invoke_handler(tauri::generate_handler![catalog_list_templates, retry_sidecar, sidecar_fatal])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
