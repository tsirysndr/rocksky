//! Saved remote library connections; protocol clients come from `rocksky-libraries`.
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const PUBLIC_FIELDS: [&str; 5] = ["id", "name", "kind", "baseUrl", "username"];
const SECRET_FIELDS: [&str; 3] = ["password", "token", "userId"];
const PLYR_ID: &str = "plyr.fm";

pub struct Libraries {
    path: PathBuf,
    lock: Mutex<()>,
}

type Store = BTreeMap<String, Value>;

fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_string()
}

fn public(config: &Value) -> Value {
    let mut out = json!({});
    for field in PUBLIC_FIELDS {
        out[field] = json!(text(config, field));
    }
    out
}

fn native(request: Value) -> Result<Value, String> {
    let result: Value = serde_json::from_str(&rocksky_libraries::handle(&request.to_string()))
        .map_err(|_| "Library request failed".to_string())?;
    if result["ok"].as_bool().unwrap_or(false) {
        Ok(result)
    } else {
        Err(result["error"]
            .as_str()
            .unwrap_or("Library request failed")
            .to_string())
    }
}

impl Libraries {
    pub fn new(config_dir: PathBuf) -> Self {
        Self {
            path: config_dir.join("remote-libraries.json"),
            lock: Mutex::new(()),
        }
    }

    fn read(&self) -> Store {
        fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn write(&self, store: &Store) -> Result<(), String> {
        let parent = self
            .path
            .parent()
            .ok_or("Library storage unavailable")?;
        fs::create_dir_all(parent).map_err(|_| "Could not save library connections")?;
        let tmp = self.path.with_extension("json.tmp");
        let body = serde_json::to_vec_pretty(store)
            .map_err(|_| "Could not save library connections")?;
        fs::write(&tmp, body).map_err(|_| "Could not save library connections")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        fs::rename(&tmp, &self.path).map_err(|_| "Could not save library connections".into())
    }

    fn config(&self, id: &str) -> Result<Value, String> {
        let _guard = self.lock.lock().map_err(|_| "Library storage unavailable")?;
        self.read()
            .remove(id)
            .ok_or_else(|| "Library was disconnected. Connect it again to play.".to_string())
    }

    pub fn request(&self, request: Value) -> Result<Value, String> {
        let cmd = text(&request, "cmd");
        match cmd.as_str() {
            "list" => {
                let _guard = self.lock.lock().map_err(|_| "Library storage unavailable")?;
                let sources: Vec<Value> = self.read().values().map(public).collect();
                Ok(json!({ "sources": sources }))
            }
            "save" => {
                let mut config = request["config"].clone();
                if !config.is_object() {
                    return Err("Invalid library settings".into());
                }
                let kind = text(&config, "kind");
                let id = match text(&config, "id") {
                    s if !s.is_empty() => s,
                    _ if kind == "plyr" => PLYR_ID.into(),
                    _ => uuid::Uuid::new_v4().to_string(),
                };
                config["id"] = json!(id);
                let previous = {
                    let _guard = self.lock.lock().map_err(|_| "Library storage unavailable")?;
                    self.read().remove(&id)
                };
                if let Some(previous) = &previous {
                    if text(previous, "kind") != kind {
                        return Err("Library type cannot be changed".into());
                    }
                    let same_server = text(previous, "baseUrl").trim_end_matches('/')
                        == text(&config, "baseUrl").trim_end_matches('/')
                        && text(previous, "username") == text(&config, "username");
                    if same_server {
                        for field in SECRET_FIELDS {
                            if text(&config, field).is_empty() {
                                config[field] = json!(text(previous, field));
                            }
                        }
                    }
                }
                let connected = if kind == "plyr" {
                    json!({ "id": PLYR_ID, "kind": "plyr", "name": "plyr.fm", "baseUrl": crate::plyr::API, "username": "" })
                } else {
                    native(json!({ "cmd": "connect", "config": config }))?["config"].clone()
                };
                {
                    let _guard = self.lock.lock().map_err(|_| "Library storage unavailable")?;
                    let mut store = self.read();
                    store.insert(id, connected.clone());
                    self.write(&store)?;
                }
                Ok(json!({ "source": public(&connected) }))
            }
            "remove" => {
                let id = text(&request, "sourceId");
                let _guard = self.lock.lock().map_err(|_| "Library storage unavailable")?;
                let mut store = self.read();
                store.remove(&id);
                self.write(&store)?;
                Ok(json!({}))
            }
            "discover" => {
                let found = native(request)?;
                let devices: Vec<Value> = found["devices"]
                    .as_array()
                    .map(|d| d.iter().map(public).collect())
                    .unwrap_or_default();
                Ok(json!({ "devices": devices }))
            }
            "browse" | "stream" | "writablePlaylists" | "addToPlaylist" | "playlistOperation" => {
                let mut request = request;
                let config = self.config(&text(&request, "sourceId"))?;
                if text(&config, "kind") == "plyr" {
                    return match cmd.as_str() {
                        "browse" => crate::plyr::browse(
                            &text(&request, "id"),
                            &text(&request, "query"),
                            request["offset"].as_u64().unwrap_or(0).min(1_000_000) as usize,
                        ),
                        "stream" => Ok(json!({ "url": crate::plyr::stream(&text(&request, "id"))? })),
                        _ => Err("plyr.fm is read-only".into()),
                    };
                }
                request["config"] = config;
                native(request)
            }
            _ => Err("Unknown library operation".into()),
        }
    }
}

#[tauri::command]
pub async fn remote_library(
    libraries: tauri::State<'_, std::sync::Arc<Libraries>>,
    request: Value,
) -> Result<Value, String> {
    let libraries = libraries.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut result = libraries.request(request)?;
        result.as_object_mut().map(|o| o.remove("ok"));
        Ok(result)
    })
    .await
    .map_err(|_| "Library request failed".to_string())?
}
