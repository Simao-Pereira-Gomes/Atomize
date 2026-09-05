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
async fn catalog_install_item(content: String, name: String, scope: String, overwrite: bool, workspace_root: Option<String>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("catalog.install", json!({ "content": content, "name": name, "scope": scope, "overwrite": overwrite, "workspaceRoot": workspace_root })).await
}

#[tauri::command]
async fn grounding_load(profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    relay.request("grounding.fetch", json!({ "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token })).await
}

#[tauri::command]
async fn validation_online(validation_id: String, template: serde_json::Value, profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    relay.validate(validation_id, json!({ "template": template, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await
}

#[tauri::command]
fn validation_cancel(validation_id: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<(), sidecar::SidecarError> {
    relay.cancel_validation(&validation_id)
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
async fn ai_auth_status(relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("ai.authStatus", json!({})).await
}

#[tauri::command]
async fn generate_query_stories(source: String, profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    relay.request("generate.queryStories", json!({ "source": source, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await
}

#[tauri::command]
async fn generate_run(run_id: String, source: String, profile: String, dry_run: bool, scope: serde_json::Value, continue_on_error: Option<bool>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    relay.run_generate(run_id.clone(), json!({
        "runId": run_id,
        "source": source,
        "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token },
        "dryRun": dry_run,
        "scope": scope,
        "continueOnError": continue_on_error,
    })).await
}

#[tauri::command]
fn generate_cancel(run_id: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<(), sidecar::SidecarError> {
    relay.cancel_generate(&run_id)
}

#[tauri::command]
async fn template_resolve_local(path: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("template.resolveLocal", json!({ "path": path })).await
}

#[tauri::command]
async fn preview_inspect(source: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("preview.inspect", json!({ "source": source })).await
}

#[tauri::command]
async fn preview_mock_story(source: String, mock_story: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("preview.mockStory", json!({ "source": source, "mockStory": mock_story })).await
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

// Finder/Dock/Spotlight launch GUI apps with the bare system PATH (no `/etc/paths.d` or shell
// rc/profile entries), unlike a terminal. The bundled `atomize-copilot` shells out to `gh` to
// check sign-in state, so when `gh` lives under Homebrew (`/opt/homebrew/bin` or `/usr/local/bin`)
// the check silently reports "not authenticated" even though `gh auth login` succeeded — it simply
// never finds `gh`. Capture the user's real PATH from a login shell once at startup so it and
// every process it spawns (the sidecar, then atomize-copilot, then `gh`) inherit it.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn fix_path_env() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let Ok(output) = std::process::Command::new(&shell).args(["-lc", "echo -n \"$PATH\""]).output() else { return };
    if !output.status.success() { return; }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !path.is_empty() { std::env::set_var("PATH", path); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    fix_path_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| { let relay = SidecarRelay::new(app.handle().clone()); if relay.start().is_err() { relay.mark_fatal(); } app.manage(relay); Ok(()) })
        .invoke_handler(tauri::generate_handler![catalog_list_items, catalog_remove_item, catalog_install_item, grounding_load, validation_online, validation_cancel, ai_generate, ai_cancel, ai_auth_status, generate_query_stories, generate_run, generate_cancel, template_resolve_local, preview_inspect, preview_mock_story, retry_sidecar, sidecar_fatal, connection_list_profiles, connection_add_profile, connection_rotate_token, connection_remove_profile, connection_set_default])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
