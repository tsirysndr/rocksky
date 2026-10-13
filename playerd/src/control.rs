//! Local protocol adapters share the real engine, metadata registry and queue.
use crate::{
    config::Config,
    engine::{EngineCmd, Snapshot},
    remote::Shared,
    resolver::Resolver,
};
use anyhow::{anyhow, bail, Result};
use rocksky_sdk::RemoteQueueItem;
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Clone)]
pub struct Entry {
    pub id: u64,
    pub uri: String,
    pub item: RemoteQueueItem,
}
#[derive(Clone)]
pub struct View {
    pub snapshot: Snapshot,
    pub entries: Vec<Entry>,
    pub version: u64,
}
impl View {
    pub fn current(&self) -> Option<&Entry> {
        self.snapshot.status.index.and_then(|i| self.entries.get(i))
    }
}
#[derive(Default)]
struct Ids {
    next: u64,
    version: u64,
    entries: Vec<(String, u64)>,
    pending: Option<Vec<(String, u64)>>,
}
impl Ids {
    fn reconcile(&mut self, uris: &[String]) -> Vec<u64> {
        if self
            .pending
            .as_ref()
            .is_some_and(|entries| entries.iter().map(|(u, _)| u).eq(uris.iter()))
        {
            self.entries = self.pending.take().unwrap();
            self.version = self.version.wrapping_add(1);
        }
        if self.entries.iter().map(|(u, _)| u).eq(uris.iter()) {
            return self.entries.iter().map(|(_, id)| *id).collect();
        }
        let mut old: HashMap<String, VecDeque<u64>> = HashMap::new();
        for (uri, id) in self.entries.drain(..) {
            old.entry(uri).or_default().push_back(id);
        }
        self.entries = uris
            .iter()
            .map(|uri| {
                let id = old
                    .get_mut(uri)
                    .and_then(VecDeque::pop_front)
                    .unwrap_or_else(|| {
                        self.next += 1;
                        self.next
                    });
                (uri.clone(), id)
            })
            .collect();
        self.version = self.version.wrapping_add(1);
        self.entries.iter().map(|(_, id)| *id).collect()
    }
}

pub struct Control {
    pub shared: Arc<Shared>,
    pub config: Config,
    pub token: String,
    pub shutdown: Arc<tokio::sync::Notify>,
    pub gate: tokio::sync::Mutex<()>,
    resolver: tokio::sync::Mutex<Resolver>,
    ids: Mutex<Ids>,
    art: Mutex<HashMap<String, String>>,
}
impl Control {
    pub fn new(shared: Arc<Shared>, config: Config, token: String) -> Arc<Self> {
        Arc::new(Self {
            resolver: tokio::sync::Mutex::new(Resolver::new(&config, token.clone())),
            shared,
            config,
            token,
            shutdown: Arc::new(tokio::sync::Notify::new()),
            gate: tokio::sync::Mutex::new(()),
            ids: Mutex::new(Ids::default()),
            art: Mutex::new(HashMap::new()),
        })
    }
    pub fn view(&self) -> View {
        let snapshot = self.shared.engine.snapshot();
        let mut items = self.shared.derived_queue(&snapshot.queue);
        if let Some(item) = snapshot.status.index.and_then(|i| items.get_mut(i)) {
            if let Some(meta) = &snapshot.status.metadata {
                if !meta.title.is_empty() {
                    item.title = meta.title.clone();
                }
                if !meta.artist.is_empty() {
                    item.artist = meta.artist.clone();
                }
                if !meta.album.is_empty() {
                    item.album = meta.album.clone();
                }
                if !meta.albumartist.is_empty() {
                    item.album_artist = meta.albumartist.clone();
                }
                if !meta.duration.is_zero() {
                    item.duration_ms = meta.duration.as_millis() as u64;
                }
            }
        }
        let mut ids = self.ids.lock().unwrap();
        let keys = ids.reconcile(&snapshot.queue);
        let entries = snapshot
            .queue
            .iter()
            .zip(items)
            .zip(keys)
            .map(|((uri, item), id)| Entry {
                uri: uri.clone(),
                item,
                id,
            })
            .collect();
        View {
            snapshot,
            entries,
            version: ids.version,
        }
    }
    pub async fn command(&self, cmd: EngineCmd) -> Result<()> {
        let _guard = self.gate.lock().await;
        self.apply(cmd).await
    }
    pub async fn apply(&self, cmd: EngineCmd) -> Result<()> {
        self.shared
            .engine
            .execute(cmd)
            .await
            .map_err(|e| anyhow!(e))?;
        crate::remote::push_state(&self.shared);
        Ok(())
    }
    pub async fn resolve(&self, uri: &str) -> Result<(String, RemoteQueueItem)> {
        if let Some(id) = uri.strip_prefix("rocksky:upload:") {
            if id.is_empty() {
                bail!("empty upload id");
            }
            let item = RemoteQueueItem {
                upload_id: id.into(),
                ..Default::default()
            };
            let url = self
                .resolver
                .lock()
                .await
                .resolve(&item)
                .await
                .ok_or_else(|| anyhow!("cannot resolve upload"))?;
            return Ok((url, item));
        }
        if let Some(id) = uri.strip_prefix("rocksky:track:") {
            if id.is_empty() {
                bail!("empty track id");
            }
            let library = crate::mcp::subsonic::Subsonic::connect(
                &self.config.api_url,
                &self.config.navidrome_url,
                &self.token,
            )
            .await?;
            let item = library.song(id).await?.to_queue_item();
            let url = self
                .resolver
                .lock()
                .await
                .resolve(&item)
                .await
                .ok_or_else(|| anyhow!("cannot resolve track"))?;
            return Ok((url, item));
        }
        if uri.starts_with("http://") || uri.starts_with("https://") {
            let (item, url) = crate::resolver::external_audio(uri.into()).await?;
            return Ok((url, item));
        }
        let path = if uri.starts_with("file:") {
            reqwest::Url::parse(uri)?
                .to_file_path()
                .map_err(|_| anyhow!("invalid file URI"))?
        } else {
            std::path::PathBuf::from(uri)
        };
        if !path.is_file() {
            bail!("audio file does not exist");
        }
        let (mut urls, mut items) = crate::resolver::scan_local(&[path.canonicalize()?])?;
        if urls.len() != 1 {
            bail!("expected one audio file");
        }
        Ok((urls.remove(0), items.remove(0)))
    }
    pub async fn add(&self, uri: &str, position: Option<usize>, play: bool) -> Result<u64> {
        let _guard = self.gate.lock().await;
        let (url, item) = self.resolve(uri).await?;
        self.add_resolved(vec![(url, item)], position, play)
            .await
            .map(|v| v[0])
    }
    /// Caller holds gate. Register metadata before the engine can publish it.
    pub async fn add_resolved(
        &self,
        tracks: Vec<(String, RemoteQueueItem)>,
        position: Option<usize>,
        play: bool,
    ) -> Result<Vec<u64>> {
        let view = self.view();
        let pos = position.unwrap_or(view.entries.len());
        if pos > view.entries.len() {
            bail!("invalid queue position");
        }
        let paths: Vec<_> = tracks.iter().map(|(u, _)| u.clone()).collect();
        self.shared.remember_uris(tracks);
        let new_ids = {
            let mut ids = self.ids.lock().unwrap();
            let mut expected: Vec<_> = view.entries.iter().map(|e| (e.uri.clone(), e.id)).collect();
            let added: Vec<_> = paths
                .iter()
                .cloned()
                .map(|u| {
                    ids.next += 1;
                    (u, ids.next)
                })
                .collect();
            let result = added.iter().map(|(_, id)| *id).collect();
            expected.splice(pos..pos, added);
            ids.pending = Some(expected);
            result
        };
        self.apply_queue(EngineCmd::InsertAt { paths, index: pos })
            .await?;
        if play {
            self.apply(EngineCmd::PlayAt {
                index: pos,
                position: Duration::ZERO,
            })
            .await?;
        }
        Ok(new_ids)
    }
    pub async fn remove(&self, start: usize, end: usize) -> Result<()> {
        let _guard = self.gate.lock().await;
        let view = self.view();
        if start > end || end > view.entries.len() {
            bail!("invalid queue range");
        }
        self.ids.lock().unwrap().pending = Some(
            view.entries
                .into_iter()
                .enumerate()
                .filter(|(i, _)| *i < start || *i >= end)
                .map(|(_, e)| (e.uri, e.id))
                .collect(),
        );
        self.apply_queue(EngineCmd::RemoveRange { start, end })
            .await
    }
    async fn apply_queue(&self, command: EngineCmd) -> Result<()> {
        let result = self.apply(command).await;
        if result.is_ok() {
            self.view();
        }
        self.ids.lock().unwrap().pending = None;
        result
    }
    pub async fn move_entry(&self, from: usize, to: usize) -> Result<()> {
        let _guard = self.gate.lock().await;
        let mut entries = self.view().entries;
        if from >= entries.len() || to >= entries.len() {
            bail!("invalid queue position");
        }
        let entry = entries.remove(from);
        entries.insert(to, entry);
        self.ids.lock().unwrap().pending =
            Some(entries.into_iter().map(|e| (e.uri, e.id)).collect());
        self.apply_queue(EngineCmd::Move { from, to }).await
    }
    pub fn art_url(&self, entry: &Entry) -> Option<String> {
        self.art
            .lock()
            .unwrap()
            .get(&art_key(entry))
            .cloned()
            .filter(|u| !u.is_empty())
            .or_else(|| normalize_art_uri(&entry.item.album_art))
    }
    /// Download/extract off the playback/D-Bus threads. Cache file URIs let
    /// desktop shells read protected remote covers without credentials.
    pub async fn prepare_art(self: &Arc<Self>, entry: Entry) {
        use std::hash::{Hash, Hasher};
        let key = art_key(&entry);
        if self.art.lock().unwrap().contains_key(&key) {
            return;
        }
        let result = tokio::task::spawn_blocking(move || -> Option<String> {
            let root = crate::config::expand_tilde("~/.cache/rocksky/playerd-art");
            std::fs::create_dir_all(&root).ok()?;
            let mut hash = std::collections::hash_map::DefaultHasher::new();
            art_key(&entry).hash(&mut hash);
            let path = root.join(format!("{:016x}.image", hash.finish()));
            if !path.is_file() {
                if let Some(url) = normalize_art_uri(&entry.item.album_art) {
                    if url.starts_with("file:") {
                        return Some(url);
                    }
                    rocksky_metadata::remote_metadata::artwork(&url, &path).ok()?;
                } else if entry.uri.starts_with("http://") || entry.uri.starts_with("https://") {
                    let cache = path.with_extension("media");
                    let _ = rocksky_metadata::remote_metadata::read(&entry.uri, &cache, &path);
                    let _ = std::fs::remove_file(cache);
                } else {
                    let audio = std::fs::canonicalize(&entry.uri).ok()?;
                    let _ = rocksky_metadata::metadata::read(&audio, &path);
                    if !path.is_file() {
                        for name in ["cover.jpg", "cover.png", "folder.jpg", "folder.png"] {
                            let sibling = audio.parent()?.join(name);
                            if sibling.is_file() {
                                return reqwest::Url::from_file_path(sibling)
                                    .ok()
                                    .map(|u| u.to_string());
                            }
                        }
                    }
                }
            }
            path.is_file()
                .then(|| {
                    reqwest::Url::from_file_path(path)
                        .ok()
                        .map(|u| u.to_string())
                })
                .flatten()
        })
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
        self.art.lock().unwrap().insert(key, result);
    }
}
fn art_key(e: &Entry) -> String {
    format!("{}\n{}", e.uri, e.item.album_art)
}
pub fn normalize_art_uri(value: &str) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    if let Ok(url) = reqwest::Url::parse(value) {
        if matches!(url.scheme(), "http" | "https") {
            return Some(url.to_string());
        }
        if url.scheme() == "file" && url.to_file_path().ok().is_some_and(|p| p.is_file()) {
            return Some(url.to_string());
        }
    }
    let path = std::path::Path::new(value);
    if path.is_absolute() && path.is_file() {
        return reqwest::Url::from_file_path(path)
            .ok()
            .map(|u| u.to_string());
    }
    None
}
pub fn item_uri(entry: &Entry) -> String {
    if !entry.item.upload_id.is_empty() {
        format!("rocksky:upload:{}", entry.item.upload_id)
    } else if !entry.item.track_id.is_empty() {
        format!("rocksky:track:{}", entry.item.track_id)
    } else {
        entry.uri.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_survive_deletes_moves_and_duplicate_uris() {
        let mut ids = Ids::default();
        assert_eq!(
            ids.reconcile(&["a".into(), "b".into(), "a".into()]),
            vec![1, 2, 3]
        );
        assert_eq!(
            ids.reconcile(&["b".into(), "a".into(), "a".into()]),
            vec![2, 1, 3]
        );
        assert_eq!(ids.reconcile(&["b".into(), "a".into()]), vec![2, 1]);
        assert_eq!(
            ids.reconcile(&["b".into(), "a".into(), "c".into()]),
            vec![2, 1, 4]
        );
    }
    #[test]
    fn artwork_uri_escapes_local_paths_and_rejects_unsupported_schemes() {
        let path = std::env::temp_dir().join(format!("playerd art #{}.png", std::process::id()));
        std::fs::write(&path, [1, 2, 3]).unwrap();
        let uri = normalize_art_uri(path.to_str().unwrap()).unwrap();
        assert!(uri.starts_with("file://"));
        assert!(uri.contains("%23"));
        assert_eq!(
            reqwest::Url::parse(&uri).unwrap().to_file_path().unwrap(),
            path
        );
        std::fs::remove_file(path).unwrap();
        assert!(normalize_art_uri("javascript:alert(1)").is_none());
    }
}
