mod sidecar;
mod connections;
mod open_panel;
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
    forget_if_rejected(&profile, relay.request("grounding.fetch", json!({ "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token })).await)
}

#[tauri::command]
async fn validation_online(validation_id: String, template: serde_json::Value, profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    forget_if_rejected(&profile, relay.validate(validation_id, json!({ "template": template, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await)
}

#[tauri::command]
fn validation_cancel(validation_id: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<(), sidecar::SidecarError> {
    relay.cancel_validation(&validation_id)
}

#[tauri::command]
async fn ai_generate(draft_id: String, prose: String, grounding: Option<serde_json::Value>, story_grounding: Option<serde_json::Value>, document_grounding: Option<serde_json::Value>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("ai.generate", json!({ "draftId": draft_id, "prose": prose, "grounding": grounding, "storyGrounding": story_grounding, "documentGrounding": document_grounding })).await
}

fn forget_if_rejected<T>(profile: &str, result: Result<T, sidecar::SidecarError>) -> Result<T, sidecar::SidecarError> {
    if let Err(error) = &result { if connections::is_rejected_token_code(&error.code) { connections::forget_token(profile); } }
    result
}

fn grounding_connection(profile: &str) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    Ok(json!({ "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token }))
}

#[tauri::command]
async fn references_list(start_path: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("references.list", json!({ "startPath": start_path })).await
}

#[tauri::command]
async fn references_save(workspace_root: String, entry: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("references.save", json!({ "workspaceRoot": workspace_root, "entry": entry })).await
}

#[tauri::command]
async fn references_load(workspace_root: String, entries: Vec<String>, profile: Option<String>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let profile = profile.filter(|name| !name.is_empty());
    let connection = match &profile {
        Some(name) => Some(grounding_connection(name)?),
        None => None,
    };
    let result = relay.request("references.load", json!({ "workspaceRoot": workspace_root, "entries": entries, "connection": connection })).await;
    match &profile { Some(name) => forget_if_rejected(name, result), None => result }
}

#[tauri::command]
async fn wiki_list(profile: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    forget_if_rejected(&profile, relay.request("wiki.list", json!({ "connection": grounding_connection(&profile)? })).await)
}

#[tauri::command]
async fn wiki_pages(profile: String, wiki: String, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    forget_if_rejected(&profile, relay.request("wiki.pages", json!({ "wiki": wiki, "connection": grounding_connection(&profile)? })).await)
}

#[tauri::command]
async fn stories_search(profile: String, search: serde_json::Value, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    forget_if_rejected(&profile, relay.request("stories.search", json!({ "search": search, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await)
}

#[tauri::command]
async fn story_grounding_load(profile: String, story_ids: Vec<String>, include_sensitive: bool, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    forget_if_rejected(&profile, relay.request("grounding.stories", json!({ "storyIds": story_ids, "includeSensitive": include_sensitive, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await)
}

#[tauri::command]
async fn ai_improve(draft_id: String, template: serde_json::Value, guidance: Option<String>, grounding: Option<serde_json::Value>, story_grounding: Option<serde_json::Value>, document_grounding: Option<serde_json::Value>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    relay.request("ai.improve", json!({ "draftId": draft_id, "template": template, "guidance": guidance, "grounding": grounding, "storyGrounding": story_grounding, "documentGrounding": document_grounding })).await
}

#[tauri::command]
async fn stories_applied(profile: String, template_filter: serde_json::Value, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    forget_if_rejected(&profile, relay.request("stories.applied", json!({ "templateFilter": template_filter, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await)
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
    forget_if_rejected(&profile, relay.request("generate.queryStories", json!({ "source": source, "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token } })).await)
}

#[tauri::command]
async fn generate_run(run_id: String, source: String, profile: String, dry_run: bool, scope: serde_json::Value, continue_on_error: Option<bool>, relay: tauri::State<'_, Arc<SidecarRelay>>) -> Result<serde_json::Value, sidecar::SidecarError> {
    let connection = connections::resolve_for_grounding(&profile).map_err(|error| sidecar::SidecarError { code: error.code.into(), message: error.message })?;
    forget_if_rejected(&profile, relay.run_generate(run_id.clone(), json!({
        "runId": run_id,
        "source": source,
        "connection": { "organizationUrl": connection.organization_url, "project": connection.project, "team": connection.team, "token": connection.token },
        "dryRun": dry_run,
        "scope": scope,
        "continueOnError": continue_on_error,
    })).await)
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

// A Start Menu/desktop-icon launch spawns Studio from explorer.exe, which only reloads its own
// environment block when it (re)starts — not when something later modifies PATH, e.g. installing
// `gh` or the GitHub CLI. A terminal opened afterwards always sees the current value because it
// reads it fresh at launch, so this only shows up for GUI launches, and only once something has
// been added to PATH since the user's last logon/Explorer restart. The bundled `atomize-copilot`
// shells out to `gh` to check sign-in state, so a stale PATH here reads as "not authenticated"
// even after a successful `gh auth login`. The registry keys below are PATH's actual persisted
// source of truth — read the current machine + user values from there instead of trusting the
// inherited (possibly stale) process environment.
#[cfg(target_os = "windows")]
fn fix_path_env() {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    fn read_path(hive: winreg::HKEY, subkey: &str) -> Option<String> {
        RegKey::predef(hive).open_subkey(subkey).ok()?.get_value::<String, _>("Path").ok()
    }

    fn expand(value: &str) -> String {
        let mut result = String::with_capacity(value.len());
        let mut rest = value;
        while let Some(start) = rest.find('%') {
            let Some(end) = rest[start + 1..].find('%') else { break };
            let end = start + 1 + end;
            result.push_str(&rest[..start]);
            let name = &rest[start + 1..end];
            match std::env::var(name) {
                Ok(value) => result.push_str(&value),
                Err(_) => result.push_str(&rest[start..=end]),
            }
            rest = &rest[end + 1..];
        }
        result.push_str(rest);
        result
    }

    let machine = read_path(HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment");
    let user = read_path(HKEY_CURRENT_USER, "Environment");
    let combined = [machine, user].into_iter().flatten().map(|value| expand(&value)).collect::<Vec<_>>().join(";");
    if !combined.is_empty() { std::env::set_var("PATH", combined); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    fix_path_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| { let relay = SidecarRelay::new(app.handle().clone()); if relay.start().is_err() { relay.mark_fatal(); } app.manage(relay); Ok(()) })
        .invoke_handler(tauri::generate_handler![catalog_list_items, catalog_remove_item, catalog_install_item, grounding_load, validation_online, validation_cancel, ai_generate, ai_improve, ai_cancel, ai_auth_status, stories_search, story_grounding_load, stories_applied, references_list, references_save, references_load, wiki_list, wiki_pages, generate_query_stories, generate_run, generate_cancel, template_resolve_local, preview_inspect, preview_mock_story, retry_sidecar, sidecar_fatal, connection_list_profiles, connection_add_profile, connection_rotate_token, connection_remove_profile, connection_set_default, open_panel::open_atomize_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
