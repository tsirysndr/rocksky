//! Artist pictures from the Rocksky API, fetched by a background tokio task and
//! cached on disk for every library (local, Navidrome, Jellyfin, UPnP, plyr.fm).
use crate::remote::DEFAULT_API_URL;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tokio::sync::Notify;
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Entry {
    picture: Option<String>,
    checked_at: u64,
    attempts: u32,
}

pub struct ArtistPictures {
    dir: PathBuf,
    index_path: PathBuf,
    entries: Mutex<HashMap<String, Entry>>,
    queue: Mutex<VecDeque<String>>,
    queued: Mutex<HashSet<String>>,
    notify: Notify,
}

fn normalized(s: &str) -> String {
    s.nfkc().collect::<String>().trim().to_lowercase()
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn retry_after(attempts: u32) -> u64 {
    (300 * (1u64 << attempts.min(8))).min(86_400)
}

fn file_name(key: &str, bytes: &[u8]) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    key.hash(&mut h);
    let ext = if bytes.starts_with(b"\x89PNG") {
        "png"
    } else if bytes.starts_with(b"RIFF") {
        "webp"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else {
        "jpg"
    };
    format!("{:016x}.{ext}", h.finish())
}

fn matched_picture(hits: &[Value], artist: &str) -> Option<String> {
    let wanted = normalized(artist);
    let pictures: HashSet<&str> = hits
        .iter()
        .filter(|v| {
            v["uri"].as_str().unwrap_or("").contains("/app.rocksky.artist/")
                && normalized(v["name"].as_str().unwrap_or("")) == wanted
        })
        .filter_map(|v| v["picture"].as_str())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .collect();
    (pictures.len() == 1).then(|| pictures.into_iter().next().map(str::to_owned)).flatten()
}

impl ArtistPictures {
    fn new(cache_dir: PathBuf) -> Arc<Self> {
        let index_path = cache_dir.join("artist-pictures.json");
        let entries = fs::read_to_string(&index_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Arc::new(Self {
            dir: cache_dir.join("artist-art"),
            index_path,
            entries: Mutex::new(entries),
            queue: Mutex::new(VecDeque::new()),
            queued: Mutex::new(HashSet::new()),
            notify: Notify::new(),
        })
    }

    fn save(&self) {
        let entries = self.entries.lock().unwrap();
        if let Ok(body) = serde_json::to_vec(&*entries) {
            let _ = fs::write(&self.index_path, body);
        }
    }

    /// Cached pictures for `names`; unknown or stale names are queued for the worker.
    pub fn lookup(&self, names: &[String]) -> HashMap<String, Option<String>> {
        let entries = self.entries.lock().unwrap();
        let mut queue = self.queue.lock().unwrap();
        let mut queued = self.queued.lock().unwrap();
        let mut out = HashMap::new();
        for name in names {
            let key = normalized(name);
            if key.is_empty() {
                continue;
            }
            let entry = entries.get(&key);
            let picture = entry
                .and_then(|e| e.picture.clone())
                .filter(|p| std::path::Path::new(p).is_file());
            let due = match entry {
                Some(_) if picture.is_some() => false,
                Some(e) => now() >= e.checked_at + retry_after(e.attempts),
                None => true,
            };
            if due && queued.insert(key.clone()) {
                queue.push_back(name.clone());
            }
            out.insert(name.clone(), picture);
        }
        if !queue.is_empty() {
            self.notify.notify_one();
        }
        out
    }

    async fn resolve(&self, client: &reqwest::Client, name: &str) -> Option<Vec<u8>> {
        let mut url = reqwest::Url::parse(&format!("{DEFAULT_API_URL}/xrpc/app.rocksky.feed.search")).ok()?;
        url.query_pairs_mut().append_pair("query", name).append_pair("size", "100");
        let result: Value = client.get(url).send().await.ok()?.error_for_status().ok()?.json().await.ok()?;
        let hits = result["hits"].as_array().cloned().unwrap_or_default();
        let picture = matched_picture(&hits, name)?;
        let response = client.get(picture).send().await.ok()?.error_for_status().ok()?;
        let is_image = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|m| m.starts_with("image/"));
        if !is_image {
            return None;
        }
        let bytes = response.bytes().await.ok()?;
        (!bytes.is_empty() && bytes.len() <= 20 * 1024 * 1024).then(|| bytes.to_vec())
    }

    async fn run(self: Arc<Self>, app: tauri::AppHandle) {
        let _ = fs::create_dir_all(&self.dir);
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("http client");
        loop {
            let next = self.queue.lock().unwrap().pop_front();
            let Some(name) = next else {
                self.notify.notified().await;
                continue;
            };
            let key = normalized(&name);
            let bytes = self.resolve(&client, &name).await;
            let picture = bytes.and_then(|bytes| {
                let path = self.dir.join(file_name(&key, &bytes));
                fs::write(&path, bytes).ok().map(|_| path.to_string_lossy().into_owned())
            });
            {
                let mut entries = self.entries.lock().unwrap();
                let entry = entries.entry(key.clone()).or_default();
                entry.checked_at = now();
                entry.attempts = if picture.is_some() { 0 } else { entry.attempts + 1 };
                entry.picture = picture.clone();
            }
            self.queued.lock().unwrap().remove(&key);
            self.save();
            if picture.is_some() {
                let _ = app.emit("artist-pictures", vec![name]);
            }
        }
    }
}

pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let pictures = ArtistPictures::new(app.path().app_cache_dir()?);
    app.manage(pictures.clone());
    tauri::async_runtime::spawn(pictures.run(app.clone()));
    Ok(())
}

#[tauri::command]
pub fn artist_pictures(
    pictures: tauri::State<'_, Arc<ArtistPictures>>,
    names: Vec<String>,
) -> HashMap<String, Option<String>> {
    pictures.lookup(&names)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn picks_the_single_matching_artist_hit() {
        let hits = vec![
            json!({"uri": "at://did/app.rocksky.artist/a", "name": "Ｓｉｎｇｅｒ", "picture": "https://img/a"}),
            json!({"uri": "at://did/app.rocksky.song/b", "name": "Singer", "picture": "https://img/b"}),
        ];
        assert_eq!(matched_picture(&hits, "singer").as_deref(), Some("https://img/a"));
        let ambiguous = vec![
            hits[0].clone(),
            json!({"uri": "at://did/app.rocksky.artist/c", "name": "Singer", "picture": "https://img/c"}),
        ];
        assert!(matched_picture(&ambiguous, "Singer").is_none());
    }
}
