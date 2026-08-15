mod sidecar;
mod connections;
use std::sync::Arc;
use serde_json::json;
use sidecar::SidecarRelay;
use tauri::Manager;

#[tauri::command]
async fn catalog_list_items(relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, String> {
    relay.request("catalog.list", json!({})).await.map_err(|error| error.message)
}

#[tauri::command]
async fn catalog_remove_item(kind: String, name: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("catalog.remove", json!({ "kind": kind, "name": name })).await
}

#[tauri::command]
async fn grounding_load(profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    relay.request("grounding.fetch", json!({ "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token })).await
}

#[tauri::command]
async fn ai_generate(draft_id: String, prose: String, grounding: Option<serde_json::Value>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("ai.generate", json!({ "draftId": draft_id, "prose": prose, "grounding": grounding })).await
}

#[tauri::command]
async fn ai_cancel(draft_id: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("ai.cancel", json!({ "draftId": draft_id })).await
}

#[tauri::command]
async fn template_resolve_local(path: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("template.resolveLocal", json!({ "path": path })).await
}

#[tauri::command]
fn retry_sidecar(relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<(), String> { relay.retry() }

#[tauri::command]
fn sidecar_fatal(relay: tauri::State<'_, Arc<SidecarRelay>>) -> bool { relay.is_fatal() }

#[tauri::command] fn connection_list_profiles() -> Result<Vec<connections::AzureDevOpsProfile>, String> { connections::list() }
#[tauri::command] fn connection_add_profile(profile: connections::NewAzureDevOpsProfile) -> Result<(), String> { connections::add(profile) }
#[tauri::command] fn connection_rotate_token(name: String, pat: String) -> Result<(), String> { connections::rotate(name, pat) }
#[tauri::command] fn connection_remove_profile(name: String) -> Result<(), String> { connections::remove(name) }
#[tauri::command] fn connection_set_default(name: String) -> Result<(), String> { connections::set_default(name) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| { let relay = SidecarRelay::new(app.handle().clone()); if relay.start().is_err() { relay.mark_fatal(); } app.manage(relay); Ok(()) })
        .invoke_handler(tauri::generate_handler![catalog_list_items, catalog_remove_item, grounding_load, ai_generate, ai_cancel, template_resolve_local, retry_sidecar, sidecar_fatal, connection_list_profiles, connection_add_profile, connection_rotate_token, connection_remove_profile, connection_set_default])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
