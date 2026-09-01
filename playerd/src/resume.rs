//! Queue + position persistence across restarts.
//!
//! The engine already persists the queue and the exact position for us — see
//! `rockbox_playback`'s resume feature, enabled via `PlayerConfig::resume_file`.
//! It writes an extended `.m3u8` atomically, on track change / pause / stop /
//! shutdown and periodically while playing. `Player::resume()` restores it
//! *paused*, with the seek deferred until the track opens — which is the only
//! correct way to land on a position, since a plain `seek()` is dropped when no
//! decoder is open yet.
//!
//! Two things that file can't carry, which this module adds:
//!
//! 1. **Metadata.** An `.m3u8` is a list of URIs. Controllers need titles,
//!    artists and album art, so a sidecar JSON keyed by URI holds the queue
//!    item each URI was enqueued as.
//! 2. **Re-resolution.** A remote track's URI is a stream URL carrying a
//!    short-lived token; replaying it after a restart gets a 401. The sidecar
//!    keeps each entry's stable `uploadId` / `trackId`, so the URL can be
//!    minted again. Local file paths are replayable as-is and are kept
//!    verbatim (dropped only if the file has since gone).
//!
//! Because the fresh URLs differ from the saved ones, the resume file is
//! rewritten with them before `Player::resume()` reads it. That means writing
//! the crate's format by hand; [`write_resume_file`] mirrors
//! `rockbox-playback`'s `resume::save` and is the one place coupled to it. If
//! the format ever drifts, `load_resume` returns `None` and the daemon simply
//! starts empty rather than misbehaving.

use std::collections::HashMap;
use std::path::Path;

use rocksky_sdk::RemoteQueueItem;
use serde::{Deserialize, Serialize};

use crate::resolver::Resolver;

/// One queue entry as persisted: everything a controller renders, plus the ids
/// needed to mint a fresh stream URL.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavedItem {
    pub upload_id: String,
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub album_art: String,
    pub duration_ms: u64,
    pub song_uri: String,
    pub album_uri: String,
    pub track_number: i32,
}

impl From<&RemoteQueueItem> for SavedItem {
    fn from(i: &RemoteQueueItem) -> Self {
        SavedItem {
            upload_id: i.upload_id.clone(),
            track_id: i.track_id.clone(),
            title: i.title.clone(),
            artist: i.artist.clone(),
            album: i.album.clone(),
            album_artist: i.album_artist.clone(),
            album_art: i.album_art.clone(),
            duration_ms: i.duration_ms,
            song_uri: i.song_uri.clone(),
            album_uri: i.album_uri.clone(),
            track_number: i.track_number,
        }
    }
}

impl From<&SavedItem> for RemoteQueueItem {
    fn from(s: &SavedItem) -> Self {
        RemoteQueueItem {
            upload_id: s.upload_id.clone(),
            track_id: s.track_id.clone(),
            title: s.title.clone(),
            artist: s.artist.clone(),
            album: s.album.clone(),
            album_artist: s.album_artist.clone(),
            album_art: s.album_art.clone(),
            duration_ms: s.duration_ms,
            song_uri: s.song_uri.clone(),
            album_uri: s.album_uri.clone(),
            track_number: s.track_number,
        }
    }
}

/// The sidecar: queue metadata keyed by the URI the engine holds.
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Sidecar {
    pub items: HashMap<String, SavedItem>,
}

impl Sidecar {
    pub fn load(path: &Path) -> Sidecar {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// Write the sidecar, creating the directory if needed. Best-effort: losing
    /// it costs metadata on the next restore, never playback.
    pub fn save(&self, path: &Path) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        match serde_json::to_string(self) {
            Ok(json) => {
                if let Err(e) = std::fs::write(path, json) {
                    tracing::warn!("could not write resume sidecar: {e}");
                }
            }
            Err(e) => tracing::warn!("could not encode resume sidecar: {e}"),
        }
    }
}

/// Write an extended `.m3u8` in the shape `rockbox_playback::load_resume`
/// expects: an `#EXTM3U` header, the resume index and elapsed milliseconds as
/// header comments, then one URI per line.
fn write_resume_file(path: &Path, uris: &[String], index: usize, elapsed_ms: u64) -> bool {
    let mut out = String::with_capacity(64 + uris.len() * 64);
    out.push_str("#EXTM3U\n");
    out.push_str(&format!("#RESUME-INDEX:{index}\n"));
    out.push_str(&format!("#RESUME-ELAPSED:{elapsed_ms}\n"));
    for uri in uris {
        // A URI with a newline in it would corrupt the line-per-track format;
        // the crate's own writer skips those too.
        if uri.contains('\n') {
            continue;
        }
        out.push_str(uri);
        out.push('\n');
    }
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // Temp + rename, so a crash mid-write can't leave a half-written queue.
    let tmp = path.with_extension("m3u8.tmp");
    if let Err(e) = std::fs::write(&tmp, &out) {
        tracing::warn!("could not write resume file: {e}");
        return false;
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        tracing::warn!("could not replace resume file: {e}");
        let _ = std::fs::remove_file(&tmp);
        return false;
    }
    true
}

/// What a restore produced.
pub struct Restored {
    /// Queue metadata, positionally aligned with the restored queue.
    pub items: Vec<RemoteQueueItem>,
    /// URI per entry, for the sidecar's next save.
    pub uris: Vec<String>,
    pub index: usize,
    pub elapsed_ms: u64,
}

/// Rebuild the saved queue with playable URIs and rewrite the resume file so
/// `Player::resume()` picks up the fresh ones. Returns `None` when there is
/// nothing to resume, or when nothing in the saved queue is playable any more.
pub async fn restore(
    resume_path: &Path,
    sidecar_path: &Path,
    resolver: &mut Resolver,
) -> Option<Restored> {
    let state = rockbox_playback::load_resume(resume_path)?;
    if state.tracks.is_empty() {
        return None;
    }
    let sidecar = Sidecar::load(sidecar_path);

    let saved_index = state.index.min(state.tracks.len().saturating_sub(1));
    let mut items = Vec::with_capacity(state.tracks.len());
    let mut uris = Vec::with_capacity(state.tracks.len());
    // The index has to follow the entries that survive, not the original
    // position — dropping a dead track ahead of it would otherwise resume on
    // the wrong song.
    let mut index = 0usize;
    let mut dropped = 0usize;
    let mut current_survived = false;

    for (i, track) in state.tracks.iter().enumerate() {
        let saved_uri = track.to_string_lossy().into_owned();
        let meta = sidecar.items.get(&saved_uri).cloned().unwrap_or_default();

        let uri = if saved_uri.starts_with("http://") || saved_uri.starts_with("https://") {
            // A stream URL's token has expired by now — mint a new one from the
            // ids the sidecar kept.
            let item: RemoteQueueItem = (&meta).into();
            resolver.resolve(&item).await
        } else if Path::new(&saved_uri).exists() {
            Some(saved_uri.clone())
        } else {
            None
        };

        let Some(uri) = uri else {
            dropped += 1;
            tracing::debug!(uri = %saved_uri, "resume: entry no longer playable, dropping");
            continue;
        };
        if i <= saved_index {
            index = items.len();
            current_survived = i == saved_index;
        }
        let mut item: RemoteQueueItem = (&meta).into();
        if item.title.is_empty() {
            // No sidecar entry (a queue from before the sidecar existed, or a
            // local file): fall back to the file name so it isn't blank.
            item.title = Path::new(&saved_uri)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| saved_uri.clone());
        }
        items.push(item);
        uris.push(uri);
    }

    if uris.is_empty() {
        tracing::info!("resume: nothing in the saved queue is playable any more");
        return None;
    }
    if dropped > 0 {
        tracing::warn!("resume: dropped {dropped} entr(ies) that no longer resolve");
    }

    // The position belongs to one specific track. Keep it only if that track
    // survived — landing mid-way through a different song would be worse than
    // starting it from the top.
    let elapsed_ms = if current_survived {
        state.elapsed.as_millis() as u64
    } else {
        0
    };

    if !write_resume_file(resume_path, &uris, index, elapsed_ms) {
        return None;
    }
    Some(Restored {
        items,
        uris,
        index,
        elapsed_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The one place coupled to `rockbox-playback`'s on-disk format: prove what
    /// we write is what its loader reads back. If the crate ever changes the
    /// format, this fails here rather than silently resuming nothing.
    #[test]
    fn resume_file_round_trips_through_the_engine_loader() {
        let dir = std::env::temp_dir().join(format!("playerd-resume-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("queue.m3u8");

        let uris = vec![
            "/music/a.flac".to_string(),
            "https://api.rocksky.app/uploads/abc/stream?token=xyz".to_string(),
            "/music/c.mp3".to_string(),
        ];
        assert!(write_resume_file(&path, &uris, 2, 61_500));

        let state = rockbox_playback::load_resume(&path).expect("loader read our file");
        assert_eq!(state.index, 2);
        assert_eq!(state.elapsed.as_millis() as u64, 61_500);
        let read: Vec<String> = state
            .tracks
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        assert_eq!(read, uris);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sidecar_round_trips() {
        let dir = std::env::temp_dir().join(format!("playerd-sidecar-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("queue.meta.json");

        let mut items = HashMap::new();
        items.insert(
            "https://example/stream?token=old".to_string(),
            SavedItem {
                upload_id: "upload-1".into(),
                title: "Chaser".into(),
                artist: "Calibro 35".into(),
                duration_ms: 182_320,
                ..Default::default()
            },
        );
        Sidecar { items }.save(&path);

        let back = Sidecar::load(&path);
        let item = back
            .items
            .get("https://example/stream?token=old")
            .expect("entry survived");
        assert_eq!(item.upload_id, "upload-1");
        assert_eq!(item.title, "Chaser");
        assert_eq!(item.duration_ms, 182_320);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A missing sidecar must not be fatal — the queue still resumes, just
    /// without titles.
    #[test]
    fn sidecar_missing_reads_as_empty() {
        let missing = std::env::temp_dir().join("playerd-no-such-sidecar.json");
        std::fs::remove_file(&missing).ok();
        assert!(Sidecar::load(&missing).items.is_empty());
    }
}
