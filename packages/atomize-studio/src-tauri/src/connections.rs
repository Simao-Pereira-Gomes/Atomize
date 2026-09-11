#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use keyring::Entry;
#[cfg(target_os = "windows")]
use keyring_core::Entry;
#[cfg(not(target_os = "macos"))]
use keyring::Error as KeyringError;
#[cfg(target_os = "macos")]
use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, fs::{self, OpenOptions}, io::Write, path::PathBuf, thread, time::{Duration, SystemTime}};

const KEYRING_SERVICE: &str = "atomize";
const LOCK_WAIT: Duration = Duration::from_secs(5);
const STALE_LOCK: Duration = Duration::from_secs(30);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAzureDevOpsProfile { pub name: String, pub organization_url: String, pub project: String, pub team: String, pub pat: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureDevOpsProfile { pub name: String, pub platform: &'static str, pub is_default: bool, pub organization_url: String, pub project: String, pub team: String }

#[derive(Debug, Serialize)]
pub struct ConnectionError { pub code: &'static str, pub message: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedAzureDevOpsConnection { pub organization_url: String, pub project: String, pub team: String, pub token: String }

fn atomize_dir() -> Result<PathBuf, String> {
    let home = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")).ok_or("Could not determine your home directory.")?;
    Ok(PathBuf::from(home).join(".atomize"))
}
fn connections_path() -> Result<PathBuf, String> { Ok(atomize_dir()?.join("connections.json")) }
fn lock_path() -> Result<PathBuf, String> { Ok(atomize_dir()?.join("connections.json.lock")) }

struct ProfileLock(PathBuf);
impl Drop for ProfileLock { fn drop(&mut self) { let _ = fs::remove_file(&self.0); } }
fn acquire_lock() -> Result<ProfileLock, String> {
    let directory = atomize_dir()?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let path = lock_path()?;
    let start = SystemTime::now();
    loop {
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => { file.write_all(b"atomize connection profile mutation\n").map_err(|e| e.to_string())?; return Ok(ProfileLock(path)); }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let stale = fs::metadata(&path).and_then(|m| m.modified()).ok().and_then(|time| SystemTime::now().duration_since(time).ok()).is_some_and(|age| age > STALE_LOCK);
                if stale { let _ = fs::remove_file(&path); continue; }
                if SystemTime::now().duration_since(start).unwrap_or_default() >= LOCK_WAIT { return Err("Another Atomize client is updating Connection Profiles. Try again shortly.".into()); }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn read_file() -> Result<Value, String> {
    let path = connections_path()?;
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).map(normalize_file).map_err(|_| "Connections file contains invalid JSON. Repair it before managing profiles in Studio.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({"version":"2", "defaultProfiles": {}, "profiles": []})),
        Err(error) => Err(error.to_string()),
    }
}
fn normalize_file(mut file: Value) -> Value {
    if file.get("defaultProfiles").is_some() { return file; }
    let default_name = file.get("defaultProfile").and_then(Value::as_str).map(str::to_owned);
    let default_platform = default_name.as_deref().and_then(|name| file.get("profiles").and_then(Value::as_array).and_then(|profiles| profiles.iter().find(|profile| profile.get("name").and_then(Value::as_str) == Some(name))).and_then(|profile| profile.get("platform")).and_then(Value::as_str).map(str::to_owned));
    let mut defaults = serde_json::Map::new();
    if let (Some(name), Some(platform)) = (default_name, default_platform) { defaults.insert(platform, Value::String(name)); }
    file["defaultProfiles"] = Value::Object(defaults);
    if let Some(object) = file.as_object_mut() { object.remove("defaultProfile"); object.insert("version".into(), Value::String("2".into())); }
    file
}
fn profiles(file: &Value) -> Result<&Vec<Value>, String> { file.get("profiles").and_then(Value::as_array).ok_or("Connections file has an invalid profiles list.".into()) }
fn profiles_mut(file: &mut Value) -> Result<&mut Vec<Value>, String> { file.get_mut("profiles").and_then(Value::as_array_mut).ok_or("Connections file has an invalid profiles list.".into()) }
fn defaults_mut(file: &mut Value) -> Result<&mut serde_json::Map<String, Value>, String> { file.get_mut("defaultProfiles").and_then(Value::as_object_mut).ok_or("Connections file has an invalid defaultProfiles record.".into()) }
fn write_file(file: &Value) -> Result<(), String> {
    let path = connections_path()?; let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(&tmp, raw).map_err(|e| e.to_string())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?; }
    fs::rename(tmp, path).map_err(|e| e.to_string())
}
#[cfg(target_os = "windows")]
fn windows_target_name(name: &str) -> String {
    format!("{KEYRING_SERVICE}/{name}")
}

#[cfg(target_os = "windows")]
fn entry(name: &str) -> Result<Entry, String> {
    keyring::Entry::store_status().as_ref().map_err(|error| error.to_string())?;
    let target = windows_target_name(name);
    let modifiers = std::collections::HashMap::from([("target", target.as_str())]);
    Entry::new_with_modifiers(KEYRING_SERVICE, name, &modifiers).map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn entry(name: &str) -> Result<Entry, String> { Entry::new(KEYRING_SERVICE, name).map_err(|e| e.to_string()) }
fn azure_profile(value: &Value, defaults: &serde_json::Map<String, Value>) -> Option<AzureDevOpsProfile> {
    if value.get("platform")?.as_str()? != "azure-devops" { return None; }
    let name = value.get("name")?.as_str()?.to_owned();
    Some(AzureDevOpsProfile {
        is_default: defaults.get("azure-devops").and_then(Value::as_str) == Some(name.as_str()),
        platform: "azure-devops", name,
        organization_url: value.get("organizationUrl")?.as_str()?.to_owned(),
        project: value.get("project")?.as_str()?.to_owned(),
        team: value.get("team")?.as_str()?.to_owned(),
    })
}

pub fn list() -> Result<Vec<AzureDevOpsProfile>, String> { list_from_file(&read_file()?) }

fn list_from_file(file: &Value) -> Result<Vec<AzureDevOpsProfile>, String> {
    let defaults = file.get("defaultProfiles").and_then(Value::as_object).ok_or("Connections file has an invalid defaultProfiles record.")?;
    Ok(profiles(file)?.iter().filter_map(|profile| azure_profile(profile, defaults)).collect())
}

/// Resolves a Connection Profile immediately before a sidecar call. The token is
/// deliberately returned only to the native caller; it is never serialised to the webview.
pub fn resolve_for_grounding(name: &str) -> Result<ResolvedAzureDevOpsConnection, ConnectionError> {
    let file = read_file().map_err(|message| ConnectionError { code: "PROFILE_UNAVAILABLE", message })?;
    resolve_grounding_from_file(&file, name, |profile_name| {
        read_profile_token(profile_name)
    })
}

fn missing_credential_error() -> ConnectionError {
    ConnectionError {
        code: "CREDENTIAL_MISSING",
        message: "This Connection Profile has no token in your operating system's credential store. Rotate its token in Studio to reconnect.".into(),
    }
}

#[cfg(target_os = "macos")]
fn read_profile_token(name: &str) -> Result<String, ConnectionError> {
    let password = get_generic_password(KEYRING_SERVICE, name).map_err(security_read_error)?;
    String::from_utf8(password).map_err(|_| ConnectionError {
        code: "CREDENTIAL_UNAVAILABLE",
        message: "Studio could not read this profile's token from your operating system's credential store.".into(),
    })
}

#[cfg(target_os = "macos")]
fn security_read_error(error: security_framework::base::Error) -> ConnectionError {
    if error.code() == -25300 { return missing_credential_error(); }
    ConnectionError {
        code: "CREDENTIAL_UNAVAILABLE",
        message: format!("Studio could not access this profile's token in your operating system's credential store: {error}"),
    }
}

#[cfg(target_os = "macos")]
fn store_profile_token(name: &str, token: &str) -> Result<(), String> {
    set_generic_password(KEYRING_SERVICE, name, token.as_bytes()).map_err(|error| error.to_string())
}

// keyring-rs's `set_password`/`get_password` re-encode the Windows Credential Manager
// blob as UTF-16LE text (the native Windows string convention). keytar (the CLI's Node
// backend) instead writes the token as raw UTF-8 bytes. Mixing the two either corrupts
// an odd-length token into a decode error or silently garbles an even-length one into
// the wrong string, so both stay on the raw-bytes API to agree on the blob's layout.
#[cfg(target_os = "windows")]
fn store_profile_token(name: &str, token: &str) -> Result<(), String> {
    entry(name)?.set_secret(token.as_bytes()).map_err(|error| error.to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn store_profile_token(name: &str, token: &str) -> Result<(), String> {
    entry(name)?.set_password(token).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn delete_profile_token(name: &str) -> Result<(), String> {
    match delete_generic_password(KEYRING_SERVICE, name) {
        Ok(()) => Ok(()),
        // A legacy Studio profile may have been written through `keyring` to a
        // different Keychain search domain. Its canonical entry is therefore
        // already absent from the CLI-compatible location. Removing the file
        // record is still a successful profile deletion.
        Err(error) if error.code() == -25300 => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
fn delete_profile_token(name: &str) -> Result<(), String> {
    entry(name)?.delete_credential().map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn read_profile_token(name: &str) -> Result<String, ConnectionError> {
    let key = entry(name).map_err(|_| ConnectionError {
        code: "CREDENTIAL_UNAVAILABLE",
        message: "Studio could not access this profile's token in your operating system's credential store. Check that a native credential store is available, then rotate the token in Studio if needed.".into(),
    })?;
    let bytes = key.get_secret().map_err(credential_read_error)?;
    String::from_utf8(bytes).map_err(|_| ConnectionError {
        code: "CREDENTIAL_UNAVAILABLE",
        message: "Studio could not read this profile's token from your operating system's credential store.".into(),
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn read_profile_token(name: &str) -> Result<String, ConnectionError> {
    let key = entry(name).map_err(|_| ConnectionError {
        code: "CREDENTIAL_UNAVAILABLE",
        message: "Studio could not access this profile's token in your operating system's credential store. Check that a native credential store is available, then rotate the token in Studio if needed.".into(),
    })?;
    key.get_password().map_err(credential_read_error)
}

#[cfg(not(target_os = "macos"))]
fn credential_read_error(error: KeyringError) -> ConnectionError {
    match error {
        KeyringError::NoEntry => missing_credential_error(),
        error => ConnectionError {
            code: "CREDENTIAL_UNAVAILABLE",
            message: format!("Studio could not access this profile's token in your operating system's credential store: {error}"),
        },
    }
}

fn resolve_grounding_from_file(
    file: &Value,
    name: &str,
    credential: impl FnOnce(&str) -> Result<String, ConnectionError>,
) -> Result<ResolvedAzureDevOpsConnection, ConnectionError> {
    let profile = profiles(file).map_err(|message| ConnectionError { code: "PROFILE_UNAVAILABLE", message })?.iter()
        .find(|profile| profile.get("name").and_then(Value::as_str) == Some(name) && profile.get("platform").and_then(Value::as_str) == Some("azure-devops"))
        .ok_or_else(|| ConnectionError { code: "PROFILE_NOT_FOUND", message: format!("Azure DevOps profile \"{name}\" not found.") })?;
    if profile.get("token").and_then(Value::as_object).and_then(|token| token.get("strategy")).and_then(Value::as_str) != Some("keychain") {
        return Err(ConnectionError { code: "INSECURE_TOKEN_STORAGE", message: "This Connection Profile uses CLI insecure storage. Rotate its token in Studio to use it here.".into() });
    }
    let token = credential(name)?;
    Ok(ResolvedAzureDevOpsConnection {
        organization_url: profile.get("organizationUrl").and_then(Value::as_str).ok_or_else(|| ConnectionError { code: "PROFILE_UNAVAILABLE", message: "Connection Profile has an invalid organization URL.".into() })?.to_owned(),
        project: profile.get("project").and_then(Value::as_str).ok_or_else(|| ConnectionError { code: "PROFILE_UNAVAILABLE", message: "Connection Profile has an invalid project.".into() })?.to_owned(),
        team: profile.get("team").and_then(Value::as_str).ok_or_else(|| ConnectionError { code: "PROFILE_UNAVAILABLE", message: "Connection Profile has an invalid team.".into() })?.to_owned(),
        token,
    })
}
pub fn add(input: NewAzureDevOpsProfile) -> Result<(), String> {
    let _lock = acquire_lock()?; let mut file = read_file()?;
    apply_add(&mut file, &input, &chrono_like_now())?;
    store_profile_token(&input.name, &input.pat)?;
    if let Err(error) = write_file(&file) { let _ = delete_profile_token(&input.name); return Err(error); } Ok(())
}
// The in-memory half of `add`: validate, reject a duplicate name, append the profile with a
// `keychain` token marker, and adopt it as the Azure DevOps default when it is the first one.
// Pulled out so it is testable without a real OS credential store or `~/.atomize` write.
fn apply_add(file: &mut Value, input: &NewAzureDevOpsProfile, now: &str) -> Result<(), String> {
    if [input.name.as_str(), input.organization_url.as_str(), input.project.as_str(), input.team.as_str(), input.pat.as_str()].iter().any(|v| v.trim().is_empty()) { return Err("Profile name, organization URL, project, team, and PAT are required.".into()); }
    if profiles(file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(input.name.as_str())) { return Err(format!("Profile \"{}\" already exists.", input.name)); }
    let is_first = !file.get("defaultProfiles").and_then(Value::as_object).is_some_and(|defaults| defaults.contains_key("azure-devops"));
    profiles_mut(file)?.push(json!({"name":input.name,"platform":"azure-devops","organizationUrl":input.organization_url,"project":input.project,"team":input.team,"token":{"strategy":"keychain"},"createdAt":now,"updatedAt":now}));
    if is_first { defaults_mut(file)?.insert("azure-devops".into(), Value::String(input.name.clone())); }
    Ok(())
}
pub fn rotate(name: String, pat: String) -> Result<(), String> {
    if pat.trim().is_empty() { return Err("PAT is required.".into()); }
    let _lock = acquire_lock()?; let mut file = read_file()?;
    apply_rotate(&mut file, &name, &chrono_like_now())?;
    let old = read_profile_token(&name).ok(); store_profile_token(&name, &pat)?;
    if let Err(error) = write_file(&file) { if let Some(previous) = old { let _ = store_profile_token(&name, &previous); } return Err(error); } Ok(())
}
fn apply_rotate(file: &mut Value, name: &str, now: &str) -> Result<(), String> {
    let profile = profiles_mut(file)?.iter_mut().find(|p| p.get("name").and_then(Value::as_str) == Some(name) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    profile["token"] = json!({"strategy":"keychain"}); profile["updatedAt"] = Value::String(now.to_owned());
    Ok(())
}
pub fn remove(name: String) -> Result<(), String> {
    let _lock = acquire_lock()?; let mut file = read_file()?;
    let keyring_backed = apply_remove(&mut file, &name)?;
    write_file(&file)?; if !keyring_backed { return Ok(()); } delete_profile_token(&name).map_err(|_| "Profile was removed, but its credential could not be deleted. Retry credential cleanup from a system keychain manager.".to_owned())
}
// Returns whether the removed profile's token lived in the OS credential store, so the caller
// knows whether a `delete_profile_token` follow-up is owed.
fn apply_remove(file: &mut Value, name: &str) -> Result<bool, String> {
    let list = profiles_mut(file)?; let index = list.iter().position(|p| p.get("name").and_then(Value::as_str) == Some(name) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    let keyring_backed = list[index].get("token").and_then(Value::as_object).and_then(|token| token.get("strategy")).and_then(Value::as_str) == Some("keychain");
    list.remove(index); if file.get("defaultProfiles").and_then(Value::as_object).and_then(|d| d.get("azure-devops")).and_then(Value::as_str) == Some(name) { defaults_mut(file)?.remove("azure-devops"); }
    Ok(keyring_backed)
}
pub fn set_default(name: String) -> Result<(), String> { let _lock = acquire_lock()?; let mut file = read_file()?; apply_set_default(&mut file, &name)?; write_file(&file) }
fn apply_set_default(file: &mut Value, name: &str) -> Result<(), String> {
    if !profiles(file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(name) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")) { return Err(format!("Azure DevOps profile \"{name}\" not found.")); }
    defaults_mut(file)?.insert("azure-devops".into(), Value::String(name.to_owned())); Ok(())
}
fn chrono_like_now() -> String { format!("{:?}", SystemTime::now()) }

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(strategy: &str) -> Value {
        json!({"version":"2","defaultProfiles":{},"profiles":[{"name":"ado","platform":"azure-devops","organizationUrl":"https://dev.azure.com/org","project":"Project","team":"Team","token":{"strategy":strategy}}]})
    }

    #[test]
    fn resolves_a_keyring_profile_with_an_in_memory_credential_store() {
        let resolved = resolve_grounding_from_file(&profile("keychain"), "ado", |_| Ok("fake-token".into())).unwrap();
        assert_eq!(resolved.organization_url, "https://dev.azure.com/org");
        assert_eq!(resolved.token, "fake-token");
    }

    #[test]
    fn rejects_a_keyfile_profile_without_querying_the_credential_store() {
        let result = resolve_grounding_from_file(&profile("keyfile"), "ado", |_| panic!("credential store must not be used"));
        assert_eq!(result.unwrap_err().code, "INSECURE_TOKEN_STORAGE");
    }

    #[test]
    fn explains_how_to_recover_when_a_keychain_marker_has_no_credential() {
        let result = resolve_grounding_from_file(&profile("keychain"), "ado", |_| Err(ConnectionError {
            code: "CREDENTIAL_MISSING",
            message: "This Connection Profile has no token in your operating system's credential store. Rotate its token in Studio to reconnect.".into(),
        }));
        let error = result.unwrap_err();
        assert_eq!(error.code, "CREDENTIAL_MISSING");
        assert_eq!(error.message, "This Connection Profile has no token in your operating system's credential store. Rotate its token in Studio to reconnect.");
    }

    #[test]
    fn distinguishes_a_missing_credential_from_a_native_keychain_failure() {
        let error = missing_credential_error();
        assert_eq!(error.code, "CREDENTIAL_MISSING");
        assert!(error.message.contains("Rotate its token"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_target_name_matches_the_clis_keytar_convention() {
        // The CLI's keytar backend writes Windows Credential Manager entries under
        // `service + "/" + account"`. Studio must build the identical TargetName or a
        // profile token created by one client becomes invisible to the other.
        assert_eq!(windows_target_name("ado"), "atomize/ado");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_maps_item_not_found_to_a_missing_credential() {
        let error = security_read_error(security_framework::base::Error::from_code(-25300));
        assert_eq!(error.code, "CREDENTIAL_MISSING");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_maps_any_other_keychain_status_to_an_unavailable_credential() {
        let error = security_read_error(security_framework::base::Error::from_code(-25293));
        assert_eq!(error.code, "CREDENTIAL_UNAVAILABLE");
        assert!(error.message.contains("credential store"));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn non_macos_maps_a_missing_keyring_entry_to_a_missing_credential() {
        assert_eq!(credential_read_error(KeyringError::NoEntry).code, "CREDENTIAL_MISSING");
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn non_macos_maps_any_other_keyring_error_to_an_unavailable_credential() {
        let error = credential_read_error(KeyringError::Invalid("token".into(), "corrupt".into()));
        assert_eq!(error.code, "CREDENTIAL_UNAVAILABLE");
    }

    fn new_input(name: &str) -> NewAzureDevOpsProfile {
        NewAzureDevOpsProfile { name: name.into(), organization_url: "https://dev.azure.com/org".into(), project: "Project".into(), team: "Team".into(), pat: "pat-123".into() }
    }

    #[test]
    fn apply_add_makes_the_first_profile_the_default_and_marks_it_keychain_backed() {
        let mut file = json!({"version":"2","defaultProfiles":{},"profiles":[]});
        apply_add(&mut file, &new_input("ado"), "now").unwrap();
        assert_eq!(file["defaultProfiles"]["azure-devops"], json!("ado"));
        assert_eq!(file["profiles"][0]["token"]["strategy"], json!("keychain"));
        assert_eq!(file["profiles"][0]["createdAt"], json!("now"));
    }

    #[test]
    fn apply_add_leaves_an_existing_default_untouched_for_a_second_profile() {
        let mut file = json!({"version":"2","defaultProfiles":{"azure-devops":"ado"},"profiles":[{"name":"ado","platform":"azure-devops","token":{"strategy":"keychain"}}]});
        apply_add(&mut file, &new_input("ado-2"), "now").unwrap();
        assert_eq!(file["defaultProfiles"]["azure-devops"], json!("ado"));
        assert_eq!(file["profiles"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn apply_add_rejects_a_duplicate_name() {
        let mut file = json!({"version":"2","defaultProfiles":{},"profiles":[{"name":"ado","platform":"azure-devops","token":{"strategy":"keychain"}}]});
        assert!(apply_add(&mut file, &new_input("ado"), "now").unwrap_err().contains("already exists"));
    }

    #[test]
    fn apply_add_rejects_a_blank_field() {
        let mut file = json!({"version":"2","defaultProfiles":{},"profiles":[]});
        let mut input = new_input("ado");
        input.team = "   ".into();
        assert!(apply_add(&mut file, &input, "now").unwrap_err().contains("required"));
    }

    #[test]
    fn apply_rotate_refreshes_the_marker_and_timestamp() {
        let mut file = profile("keychain");
        file["profiles"][0]["updatedAt"] = json!("old");
        apply_rotate(&mut file, "ado", "fresh").unwrap();
        assert_eq!(file["profiles"][0]["token"]["strategy"], json!("keychain"));
        assert_eq!(file["profiles"][0]["updatedAt"], json!("fresh"));
    }

    #[test]
    fn apply_rotate_reports_an_unknown_profile() {
        assert!(apply_rotate(&mut profile("keychain"), "missing", "fresh").unwrap_err().contains("not found"));
    }

    #[test]
    fn apply_remove_reports_whether_the_token_lived_in_the_credential_store() {
        assert!(apply_remove(&mut profile("keychain"), "ado").unwrap());
        assert!(!apply_remove(&mut profile("keyfile"), "ado").unwrap());
    }

    #[test]
    fn apply_remove_clears_a_default_that_pointed_at_the_removed_profile() {
        let mut file = profile("keychain");
        file["defaultProfiles"]["azure-devops"] = json!("ado");
        apply_remove(&mut file, "ado").unwrap();
        assert!(file["defaultProfiles"].get("azure-devops").is_none());
        assert!(file["profiles"].as_array().unwrap().is_empty());
    }

    #[test]
    fn apply_remove_reports_an_unknown_profile() {
        assert!(apply_remove(&mut profile("keychain"), "missing").unwrap_err().contains("not found"));
    }

    #[test]
    fn apply_set_default_requires_an_existing_profile() {
        let mut file = profile("keychain");
        assert!(apply_set_default(&mut file, "missing").unwrap_err().contains("not found"));
        apply_set_default(&mut file, "ado").unwrap();
        assert_eq!(file["defaultProfiles"]["azure-devops"], json!("ado"));
    }

    #[test]
    fn list_from_file_keeps_only_azure_devops_profiles_and_flags_the_default() {
        let file = json!({"version":"2","defaultProfiles":{"azure-devops":"ado"},"profiles":[
            {"name":"ado","platform":"azure-devops","organizationUrl":"https://dev.azure.com/org","project":"P","team":"T","token":{"strategy":"keychain"}},
            {"name":"other","platform":"github","token":{"strategy":"keychain"}}
        ]});
        let listed = list_from_file(&file).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "ado");
        assert!(listed[0].is_default);
    }

    #[test]
    fn normalize_file_migrates_a_v1_default_profile_to_the_v2_map() {
        let migrated = normalize_file(json!({"defaultProfile":"ado","profiles":[{"name":"ado","platform":"azure-devops"}]}));
        assert_eq!(migrated["version"], json!("2"));
        assert_eq!(migrated["defaultProfiles"]["azure-devops"], json!("ado"));
        assert!(migrated.get("defaultProfile").is_none());
    }

    #[test]
    fn normalize_file_leaves_a_v2_file_untouched() {
        let original = profile("keychain");
        assert_eq!(normalize_file(original.clone()), original);
    }

    #[test]
    fn normalize_file_drops_a_v1_default_that_names_no_known_profile() {
        assert_eq!(normalize_file(json!({"defaultProfile":"ghost","profiles":[]}))["defaultProfiles"], json!({}));
    }

    #[test]
    fn resolve_grounding_reports_a_missing_profile() {
        let error = resolve_grounding_from_file(&profile("keychain"), "missing", |_| Ok("t".into())).unwrap_err();
        assert_eq!(error.code, "PROFILE_NOT_FOUND");
    }

    #[test]
    fn resolve_grounding_rejects_a_keychain_profile_with_no_organization_url() {
        let mut file = profile("keychain");
        file["profiles"][0].as_object_mut().unwrap().remove("organizationUrl");
        let error = resolve_grounding_from_file(&file, "ado", |_| Ok("t".into())).unwrap_err();
        assert_eq!(error.code, "PROFILE_UNAVAILABLE");
    }
}
