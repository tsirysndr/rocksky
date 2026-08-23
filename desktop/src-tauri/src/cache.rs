//! Media cache, mirroring the rocksky CLI's track cache: remote tracks are
//! keyed by upload/track id, downloaded to `<id>.<ext>` (via a `.part` temp
//! file), played from disk when present, and pruned oldest-first past the size
//! cap. Enabled state and the cap are configurable from the UI and persisted.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase", default)]
pub struct CacheConfig {
    pub enabled: bool,
    pub max_size_mb: u64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        // Same default cap as the CLI (2 GB).
        Self {
            enabled: true,
            max_size_mb: 2048,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatsDto {
    pub files: usize,
    pub bytes: u64,
    pub dir: String,
    pub enabled: bool,
    pub max_size_mb: u64,
}

pub struct MediaCache {
    dir: PathBuf,
    config_path: PathBuf,
    config: Mutex<CacheConfig>,
    inflight: Mutex<HashSet<String>>,
}

const EXTS: &[(&str, &str)] = &[
    ("audio/mpeg", "mp3"),
    ("audio/mp3", "mp3"),
    ("audio/flac", "flac"),
    ("audio/x-flac", "flac"),
    ("audio/mp4", "m4a"),
    ("audio/x-m4a", "m4a"),
    ("audio/aac", "aac"),
    ("audio/ogg", "ogg"),
    ("application/ogg", "ogg"),
    ("audio/opus", "opus"),
    ("audio/wav", "wav"),
    ("audio/x-wav", "wav"),
    ("audio/webm", "webm"),
];

fn ext_for(content_type: Option<&str>) -> &'static str {
    content_type
        .and_then(|ct| {
            let ct = ct.split(';').next().unwrap_or("").trim().to_lowercase();
            EXTS.iter().find(|(m, _)| *m == ct).map(|(_, e)| *e)
        })
        .unwrap_or("mp3")
}

impl MediaCache {
    pub fn new(cache_dir: PathBuf, config_dir: PathBuf) -> Self {
        let dir = cache_dir.join("tracks");
        let config_path = config_dir.join("media-cache.json");
        let config = fs::read_to_string(&config_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            dir,
            config_path,
            config: Mutex::new(config),
            inflight: Mutex::new(HashSet::new()),
        }
    }

    pub fn config(&self) -> CacheConfig {
        *self.config.lock().unwrap()
    }

    pub fn set_config(&self, config: CacheConfig) {
        *self.config.lock().unwrap() = config;
        if let Some(parent) = self.config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&config) {
            let _ = fs::write(&self.config_path, json);
        }
        self.prune();
    }

    /// The cached file for `id`, whatever its extension.
    pub fn lookup(&self, id: &str) -> Option<PathBuf> {
        if id.is_empty() {
            return None;
        }
        for entry in fs::read_dir(&self.dir).ok()?.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.ends_with(".part") {
                continue;
            }
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);
            if stem == id {
                return Some(entry.path());
            }
        }
        None
    }

    /// Download `url` into the cache under `id` (once; concurrent requests for
    /// the same id are dropped). Blocking-IO friendly: call from an async task.
    pub async fn download(&self, id: &str, url: &str) -> Result<PathBuf, String> {
        if id.is_empty() {
            return Err("not cacheable: empty id".into());
        }
        if let Some(path) = self.lookup(id) {
            return Ok(path);
        }
        if !self.inflight.lock().unwrap().insert(id.to_string()) {
            return Err("already downloading".into());
        }
        let result = self.download_inner(id, url).await;
        self.inflight.lock().unwrap().remove(id);
        result
    }

    async fn download_inner(&self, id: &str, url: &str) -> Result<PathBuf, String> {
        fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let tmp = self.dir.join(format!("{id}.part"));
        let cleanup = |tmp: &Path| {
            let _ = fs::remove_file(tmp);
        };

        let res = reqwest::get(url).await.map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("cache download failed: {}", res.status()));
        }
        let ext = ext_for(
            res.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok()),
        );
        let dest = self.dir.join(format!("{id}.{ext}"));

        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let mut res = res;
        loop {
            match res.chunk().await {
                Ok(Some(chunk)) => {
                    use std::io::Write;
                    if let Err(e) = file.write_all(&chunk) {
                        cleanup(&tmp);
                        return Err(e.to_string());
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    cleanup(&tmp);
                    return Err(e.to_string());
                }
            }
        }
        drop(file);
        fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
        self.prune();
        Ok(dest)
    }

    pub fn stats(&self) -> CacheStatsDto {
        let config = self.config();
        let mut files = 0usize;
        let mut bytes = 0u64;
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().ends_with(".part") {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    files += 1;
                    bytes += meta.len();
                }
            }
        }
        CacheStatsDto {
            files,
            bytes,
            dir: self.dir.to_string_lossy().into_owned(),
            enabled: config.enabled,
            max_size_mb: config.max_size_mb,
        }
    }

    pub fn clear(&self) {
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    /// Evict oldest files once the cache grows past the configured cap.
    fn prune(&self) {
        let cap = self.config().max_size_mb.saturating_mul(1024 * 1024);
        let Ok(entries) = fs::read_dir(&self.dir) else {
            return;
        };
        let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = entries
            .flatten()
            .filter(|e| !e.file_name().to_string_lossy().ends_with(".part"))
            .filter_map(|e| {
                let meta = e.metadata().ok()?;
                Some((
                    e.path(),
                    meta.len(),
                    meta.modified().unwrap_or(std::time::UNIX_EPOCH),
                ))
            })
            .collect();
        let mut total: u64 = files.iter().map(|(_, size, _)| size).sum();
        if total <= cap {
            return;
        }
        files.sort_by_key(|(_, _, mtime)| *mtime);
        for (path, size, _) in files {
            if total <= cap {
                break;
            }
            let _ = fs::remove_file(path);
            total = total.saturating_sub(size);
        }
    }
}

#[tauri::command]
pub fn cache_get_config(cache: State<'_, MediaCache>) -> CacheConfig {
    cache.config()
}

#[tauri::command]
pub fn cache_set_config(cache: State<'_, MediaCache>, config: CacheConfig) -> CacheStatsDto {
    cache.set_config(config);
    cache.stats()
}

#[tauri::command]
pub fn cache_stats(cache: State<'_, MediaCache>) -> CacheStatsDto {
    cache.stats()
}

#[tauri::command]
pub fn cache_clear(cache: State<'_, MediaCache>) -> CacheStatsDto {
    cache.clear();
    cache.stats()
}
