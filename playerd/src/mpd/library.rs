use super::protocol::{Error, Result as MpdResult};
use crate::control::{item_uri, Control, Entry};
use anyhow::{anyhow, Result};
use rocksky_sdk::RemoteQueueItem;
use std::collections::BTreeMap;
use std::sync::Arc;

pub async fn fetch(control: &Control) -> Result<Vec<Entry>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    let mut items = Vec::new();
    let mut offset = 0;
    loop {
        let rows: serde_json::Value = client
            .get(format!(
                "{}/uploads",
                control.config.api_url.trim_end_matches('/')
            ))
            .bearer_auth(&control.token)
            .query(&[("skip", offset), ("limit", 500)])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let rows = rows
            .as_array()
            .ok_or_else(|| anyhow!("invalid uploads response"))?;
        if rows.is_empty() {
            break;
        }
        offset += rows.len();
        for row in rows {
            let t = &row["track"];
            let s = |v: &serde_json::Value, k: &str| v[k].as_str().unwrap_or("").to_owned();
            let item = RemoteQueueItem {
                upload_id: s(&row["upload"], "id"),
                track_id: s(t, "id"),
                title: s(t, "title"),
                artist: s(t, "artist"),
                album: s(t, "album"),
                album_artist: s(t, "albumArtist"),
                album_art: s(t, "albumArt"),
                duration_ms: t["duration"].as_u64().unwrap_or(0),
                track_number: t["trackNumber"].as_i64().unwrap_or(0) as i32,
                ..Default::default()
            };
            if item.upload_id.is_empty() && item.track_id.is_empty() {
                continue;
            }
            items.push(Entry {
                id: 0,
                uri: String::new(),
                item,
            });
        }
        if offset >= 100_000 {
            return Err(anyhow!("library exceeds MPD index limit"));
        }
    }
    Ok(items)
}
pub fn tag<'a>(entry: &'a Entry, key: &str) -> Option<&'a str> {
    match key.to_ascii_lowercase().as_str() {
        "artist" => Some(&entry.item.artist),
        "albumartist" => Some(&entry.item.album_artist),
        "album" => Some(&entry.item.album),
        "title" => Some(&entry.item.title),
        _ => None,
    }
}
pub fn matches(entry: &Entry, args: &[String], exact: bool) -> MpdResult<bool> {
    if args.len() % 2 != 0 {
        return Err(Error::argument("use tag/value filter pairs"));
    }
    for pair in args.chunks(2) {
        let key = pair[0].to_ascii_lowercase();
        let values = match key.as_str() {
            "any" => vec![
                entry.item.title.clone(),
                entry.item.artist.clone(),
                entry.item.album.clone(),
                entry.item.album_artist.clone(),
            ],
            "file" => vec![item_uri(entry)],
            "base" => vec![path(entry)],
            _ => vec![tag(entry, &key)
                .ok_or_else(|| Error::argument("unsupported tag"))?
                .to_string()],
        };
        let found = values.iter().any(|v| {
            if key == "base" {
                v.starts_with(&pair[1])
            } else if exact {
                v == &pair[1]
            } else {
                v.to_lowercase().contains(&pair[1].to_lowercase())
            }
        });
        if !found {
            return Ok(false);
        }
    }
    Ok(true)
}
fn component(s: &str) -> String {
    if s.is_empty() {
        "Unknown".into()
    } else {
        s.replace('%', "%25")
            .replace('/', "%2F")
            .replace(['\r', '\n'], " ")
    }
}
pub fn path(e: &Entry) -> String {
    format!("{}/{}", component(&e.item.artist), component(&e.item.album))
}
pub fn merge(remote: &[Entry], control: &Control) -> Vec<Entry> {
    let mut all = BTreeMap::new();
    for e in remote.iter().cloned().chain(control.view().entries) {
        all.insert(item_uri(&e), e);
    }
    all.into_values().collect()
}
pub async fn playlists(control: &Control) -> Result<Vec<crate::mcp::subsonic::Playlist>> {
    let lib = crate::mcp::subsonic::Subsonic::connect(
        &control.config.api_url,
        &control.config.navidrome_url,
        &control.token,
    )
    .await?;
    lib.playlists().await
}
pub async fn playlist(control: &Arc<Control>, name: &str) -> Result<Vec<Entry>> {
    let lib = crate::mcp::subsonic::Subsonic::connect(
        &control.config.api_url,
        &control.config.navidrome_url,
        &control.token,
    )
    .await?;
    let lists = lib.playlists().await?;
    let list = lists
        .iter()
        .find(|p| p.name == name || p.id == name)
        .ok_or_else(|| anyhow!("playlist not found"))?;
    let (_, songs) = lib.playlist(&list.id).await?;
    Ok(songs
        .into_iter()
        .map(|s| Entry {
            id: 0,
            uri: String::new(),
            item: s.to_queue_item(),
        })
        .collect())
}
