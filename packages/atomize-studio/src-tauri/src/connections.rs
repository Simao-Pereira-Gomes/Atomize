use keyring::Entry;
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
pub fn add(input: NewAzureDevOpsProfile) -> Result<(), String> {
    if [input.name.as_str(), input.organization_url.as_str(), input.project.as_str(), input.team.as_str(), input.pat.as_str()].iter().any(|v| v.trim().is_empty()) { return Err("Profile name, organization URL, project, team, and PAT are required.".into()); }
    let _lock = acquire_lock()?; let mut file = read_file()?;
    if profiles(&file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(input.name.as_str())) { return Err(format!("Profile \"{}\" already exists.", input.name)); }
    let key = entry(&input.name)?; key.set_password(&input.pat).map_err(|e| e.to_string())?;
    let now = chrono_like_now(); let is_first = !file.get("defaultProfiles").and_then(Value::as_object).is_some_and(|defaults| defaults.contains_key("azure-devops"));
    profiles_mut(&mut file)?.push(json!({"name":input.name,"platform":"azure-devops","organizationUrl":input.organization_url,"project":input.project,"team":input.team,"token":{"strategy":"keychain"},"createdAt":now,"updatedAt":now}));
    if is_first { defaults_mut(&mut file)?.insert("azure-devops".into(), Value::String(input.name.clone())); }
    if let Err(error) = write_file(&file) { let _ = key.delete_credential(); return Err(error); } Ok(())
}
pub fn rotate(name: String, pat: String) -> Result<(), String> {
    if pat.trim().is_empty() { return Err("PAT is required.".into()); }
    let _lock = acquire_lock()?; let mut file = read_file()?; let profile = profiles_mut(&mut file)?.iter_mut().find(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    let key = entry(&name)?; let old = key.get_password().ok(); key.set_password(&pat).map_err(|e| e.to_string())?;
    profile["token"] = json!({"strategy":"keychain"}); profile["updatedAt"] = Value::String(chrono_like_now());
    if let Err(error) = write_file(&file) { if let Some(previous) = old { let _ = key.set_password(&previous); } return Err(error); } Ok(())
}
pub fn remove(name: String) -> Result<(), String> {
    let _lock = acquire_lock()?; let mut file = read_file()?; let list = profiles_mut(&mut file)?; let index = list.iter().position(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")).ok_or_else(|| format!("Azure DevOps profile \"{name}\" not found."))?;
    let keyring_backed = list[index].get("token").and_then(Value::as_object).and_then(|token| token.get("strategy")).and_then(Value::as_str) == Some("keychain");
    list.remove(index); if file.get("defaultProfiles").and_then(Value::as_object).and_then(|d| d.get("azure-devops")).and_then(Value::as_str) == Some(name.as_str()) { defaults_mut(&mut file)?.remove("azure-devops"); }
    write_file(&file)?; if !keyring_backed { return Ok(()); } entry(&name)?.delete_credential().map_err(|_| "Profile was removed, but its credential could not be deleted. Retry credential cleanup from a system keychain manager.".to_owned())
}
pub fn set_default(name: String) -> Result<(), String> { let _lock = acquire_lock()?; let mut file = read_file()?; if !profiles(&file)?.iter().any(|p| p.get("name").and_then(Value::as_str) == Some(name.as_str()) && p.get("platform").and_then(Value::as_str) == Some("azure-devops")) { return Err(format!("Azure DevOps profile \"{name}\" not found.")); } defaults_mut(&mut file)?.insert("azure-devops".into(), Value::String(name)); write_file(&file) }
fn chrono_like_now() -> String { format!("{:?}", SystemTime::now()) }
