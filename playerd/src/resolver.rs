//! Resolve remote queue items to playable URLs, and local paths to queue
//! items.
//!
//! Uploads stream through `{api}/uploads/{id}/stream?token=…` — the `?token=`
//! is an opaque short-lived token from `/uploads/stream-token`, not the JWT.
//! Library tracks without an upload id stream from Navidrome with the
//! Subsonic credentials cached in `~/.rocksky/navidrome.json` (handle + a
//! dedicated API key, provisioned on first use like the CLI does).

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use rocksky_sdk::RemoteQueueItem;
use serde::{Deserialize, Serialize};

use crate::config::{expand_tilde, Config};

#[derive(Serialize, Deserialize, Clone)]
pub struct NavidromeCreds {
    pub handle: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
}

fn navidrome_creds_path() -> PathBuf {
    expand_tilde("~/.rocksky/navidrome.json")
}

pub struct Resolver {
    http: reqwest::Client,
    api_url: String,
    navidrome_url: String,
    token: String,
    stream_token: Option<(String, Instant)>,
    navidrome: Option<NavidromeCreds>,
}

impl Resolver {
    pub fn new(config: &Config, token: String) -> Self {
        Resolver {
            http: reqwest::Client::new(),
            api_url: config.api_url.trim_end_matches('/').to_string(),
            navidrome_url: config.navidrome_url.trim_end_matches('/').to_string(),
            token,
            stream_token: None,
            navidrome: None,
        }
    }

    pub async fn resolve(&mut self, item: &RemoteQueueItem) -> Option<String> {
        if !item.upload_id.is_empty() {
            let token = self.stream_token().await?;
            return Some(format!(
                "{}/uploads/{}/stream?token={token}",
                self.api_url, item.upload_id
            ));
        }
        if !item.track_id.is_empty() {
            let creds = match self.navidrome_creds().await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!("navidrome credentials unavailable: {e}");
                    return None;
                }
            };
            return Some(format!(
                "{}/rest/stream?u={}&p={}&c=rocksky&v=1.16.1&id={}",
                self.navidrome_url, creds.handle, creds.api_key, item.track_id
            ));
        }
        None
    }

    /// Server TTL is 1 h; refresh after 50 min so in-flight enqueues never
    /// race expiry.
    async fn stream_token(&mut self) -> Option<String> {
        if let Some((token, fetched)) = &self.stream_token {
            if fetched.elapsed() < Duration::from_secs(50 * 60) && !token.is_empty() {
                return Some(token.clone());
            }
        }
        #[derive(Deserialize)]
        struct StreamToken {
            token: String,
        }
        let res = self
            .http
            .get(format!("{}/uploads/stream-token", self.api_url))
            .bearer_auth(&self.token)
            .send()
            .await;
        match res {
            Ok(res) if res.status().is_success() => match res.json::<StreamToken>().await {
                Ok(body) => {
                    self.stream_token = Some((body.token.clone(), Instant::now()));
                    Some(body.token)
                }
                Err(e) => {
                    tracing::warn!("stream-token: bad response body: {e}");
                    None
                }
            },
            Ok(res) => {
                tracing::warn!("stream-token: HTTP {}", res.status());
                None
            }
            Err(e) => {
                tracing::warn!("stream-token: request failed: {e}");
                None
            }
        }
    }

    async fn navidrome_creds(&mut self) -> Result<NavidromeCreds> {
        if let Some(creds) = &self.navidrome {
            return Ok(creds.clone());
        }
        let path = navidrome_creds_path();
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(creds) = serde_json::from_str::<NavidromeCreds>(&raw) {
                self.navidrome = Some(creds.clone());
                return Ok(creds);
            }
        }

        #[derive(Deserialize)]
        struct ProfileHandle {
            handle: String,
        }
        let profile: ProfileHandle = self
            .http
            .get(format!("{}/profile", self.api_url))
            .bearer_auth(&self.token)
            .send()
            .await
            .context("fetching profile")?
            .error_for_status()
            .context("fetching profile")?
            .json()
            .await
            .context("parsing profile")?;

        #[derive(Deserialize)]
        struct ApiKey {
            api_key: String,
        }
        let key: ApiKey = self
            .http
            .post(format!("{}/apikeys", self.api_url))
            .bearer_auth(&self.token)
            .json(&serde_json::json!({ "name": "playerd" }))
            .send()
            .await
            .context("creating API key")?
            .error_for_status()
            .context("creating API key")?
            .json()
            .await
            .context("parsing API key")?;

        let creds = NavidromeCreds {
            handle: profile.handle,
            api_key: key.api_key,
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::write(&path, serde_json::to_string(&creds)?) {
            tracing::warn!("could not cache navidrome credentials: {e}");
        }
        self.navidrome = Some(creds.clone());
        Ok(creds)
    }
}

/// Expand CLI paths (files or directories, recursively) into engine queue
/// entries plus the matching queue metadata read from the files' tags.
pub fn scan_local(paths: &[PathBuf]) -> Result<(Vec<String>, Vec<RemoteQueueItem>)> {
    let mut files = Vec::new();
    for path in paths {
        collect(path, &mut files)?;
    }

    let mut uris = Vec::with_capacity(files.len());
    let mut items = Vec::with_capacity(files.len());
    for file in files {
        let meta = rockbox_metadata::read(&file).unwrap_or_default();
        let stem = file
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        items.push(RemoteQueueItem {
            title: if meta.title.is_empty() { stem } else { meta.title },
            artist: meta.artist,
            album: meta.album,
            album_artist: meta.albumartist,
            duration_ms: meta.duration.as_millis() as u64,
            track_number: meta.track_number.unwrap_or(0) as i32,
            ..Default::default()
        });
        uris.push(file.to_string_lossy().into_owned());
    }
    Ok((uris, items))
}

fn collect(path: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    if path.is_dir() {
        let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
            .with_context(|| format!("reading {}", path.display()))?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .collect();
        entries.sort();
        for entry in entries {
            collect(&entry, out)?;
        }
        return Ok(());
    }
    if !path.is_file() {
        return Err(anyhow!("no such file: {}", path.display()));
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned());
    if name.as_deref().and_then(rockbox_metadata::probe).is_some() {
        out.push(path.to_path_buf());
    }
    Ok(())
}
