#[cfg(not(target_os = "macos"))]
use keyring::Entry;
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
#[cfg(not(target_os = "macos"))]
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

pub fn list() -> Result<Vec<AzureDevOpsProfile>, String> {
    let file = read_file()?; let defaults = file.get("defaultProfiles").and_then(Value::as_object).ok_or("Connections file has an invalid defaultProfiles record.")?;
    Ok(profiles(&file)?.iter().filter_map(|profile| azure_profile(profile, defaults)).collect())
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

#[cfg(not(target_os = "macos"))]
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

#[cfg(not(target_os = "macos"))]
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
    let profile = profiles(&file).map_err(|message| ConnectionError { code: "PROFILE_UNAVAILABLE", message })?.iter()
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
    if [input.name.as_str(), input.organization_url.as_str(), input.project.as_str(), input.team.as_str(), input.pat.as_str()].iter().any(|v| v.trim().is_empty()) { return Err("Profile name, organization URL, project, team, and PAT are required.".into()); }
    let _lock = acquire_lock()?; let mut file = read_file()?;
    if profiles(&file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(input.name.as_str())) { return Err(format!("Profile \"{}\" already exists.", input.name)); }
    store_profile_token(&input.name, &input.pat)?;
    let now = chrono_like_now(); let is_first = !file.get("defaultProfiles").and_then(Value::as_object).is_some_and(|defaults| defaults.contains_key("azure-devops"));
    profiles_mut(&mut file)?.push(json!({"name":input.name,"platform":"azure-devops","organizationUrl":input.organization_url,"project":input.project,"team":input.team,"token":{"strategy":"keychain"},"createdAt":now,"updatedAt":now}));
    if is_first { defaults_mut(&mut file)?.insert("azure-devops".into(), Value::String(input.name.clone())); }
    if let Err(error) = write_file(&file) { let _ = delete_profile_token(&input.name); return Err(error); } Ok(())
}
pub fn rotate(name: String, pat: String) -> Result<(), String> {
    if pat.trim().is_empty() { return Err("PAT is required.".into()); }
    let _lock = acquire_lock()?; let mut file = read_file()?; let profile = profiles_mut(&mut file)?.iter_mut().find(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    let old = read_profile_token(&name).ok(); store_profile_token(&name, &pat)?;
    profile["token"] = json!({"strategy":"keychain"}); profile["updatedAt"] = Value::String(chrono_like_now());
    if let Err(error) = write_file(&file) { if let Some(previous) = old { let _ = store_profile_token(&name, &previous); } return Err(error); } Ok(())
}
pub fn remove(name: String) -> Result<(), String> {
    let _lock = acquire_lock()?; let mut file = read_file()?; let list = profiles_mut(&mut file)?; let index = list.iter().position(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    let keyring_backed = list[index].get("token").and_then(Value::as_object).and_then(|token| token.get("strategy")).and_then(Value::as_str) == Some("keychain");
    list.remove(index); if file.get("defaultProfiles").and_then(Value::as_object).and_then(|d| d.get("azure-devops")).and_then(Value::as_str) == Some(name.as_str()) { defaults_mut(&mut file)?.remove("azure-devops"); }
    write_file(&file)?; if !keyring_backed { return Ok(()); } delete_profile_token(&name).map_err(|_| "Profile was removed, but its credential could not be deleted. Retry credential cleanup from a system keychain manager.".to_owned())
}
pub fn set_default(name: String) -> Result<(), String> { let _lock = acquire_lock()?; let mut file = read_file()?; if !profiles(&file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")) { return Err(format!("Azure DevOps profile \"{name}\" not found.")); } defaults_mut(&mut file)?.insert("azure-devops".into(), Value::String(name)); write_file(&file) }
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
}
