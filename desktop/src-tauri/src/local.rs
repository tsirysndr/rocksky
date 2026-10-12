//! Music files on this computer, indexed from one folder (default ~/Music).
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use tauri::Manager;

const AUDIO_EXTENSIONS: [&str; 17] = [
    "mp3", "flac", "m4a", "m4b", "mp4", "aac", "ogg", "oga", "opus", "wav", "aif", "aiff", "wma",
    "ape", "wv", "mpc", "alac",
];

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Track {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub duration_ms: u64,
    pub track_number: Option<u64>,
    pub disc_number: Option<u64>,
    pub year: Option<u64>,
    pub genre: Option<String>,
    pub art: Option<String>,
    pub mtime: u64,
    pub size: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Index {
    folder: String,
    tracks: BTreeMap<String, Track>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Scan {
    state: String,
    count: usize,
    error: Option<String>,
    rescan_queued: bool,
}

pub struct LocalLibrary {
    config_path: PathBuf,
    index_path: PathBuf,
    art_dir: PathBuf,
    default_folder: PathBuf,
    index: Mutex<Index>,
    scan: Mutex<Scan>,
}

fn hash(s: &str) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn key(track: &Track) -> String {
    let artist = if track.album_artist.is_empty() { &track.artist } else { &track.album_artist };
    format!("{}\u{0}{}", artist.to_lowercase(), track.album.to_lowercase())
}

fn text(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").trim().to_string()
}

fn image_ext(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG") {
        "png"
    } else if bytes.starts_with(b"RIFF") {
        "webp"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else {
        "jpg"
    }
}

impl LocalLibrary {
    pub fn new(config_dir: PathBuf, cache_dir: PathBuf, default_folder: PathBuf) -> Arc<Self> {
        let index_path = cache_dir.join("local-music-index.json");
        let index = fs::read_to_string(&index_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Arc::new(Self {
            config_path: config_dir.join("local-music.json"),
            index_path,
            art_dir: cache_dir.join("local-art"),
            default_folder,
            index: Mutex::new(index),
            scan: Mutex::new(Scan { state: "idle".into(), ..Scan::default() }),
        })
    }

    pub fn folder(&self) -> PathBuf {
        fs::read_to_string(&self.config_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v["folder"].as_str().map(PathBuf::from))
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| self.default_folder.clone())
    }

    fn set_folder(&self, folder: &Path) -> Result<(), String> {
        if !folder.is_dir() {
            return Err("Choose a folder that exists".into());
        }
        if let Some(parent) = self.config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&self.config_path, json!({ "folder": folder }).to_string())
            .map_err(|_| "Could not save the music folder".to_string())
    }

    fn save_index(&self, index: &Index) {
        if let Some(parent) = self.index_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(body) = serde_json::to_vec(index) {
            let _ = fs::write(&self.index_path, body);
        }
    }

    fn walk(folder: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(folder) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            if path.is_dir() {
                Self::walk(&path, out);
            } else if path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            {
                out.push(path);
            }
        }
    }

    fn read_track(&self, path: &Path, mtime: u64, size: u64, art_cache: &mut HashMap<String, Option<String>>) -> Track {
        let id = hash(&path.to_string_lossy());
        let tmp_art = self.art_dir.join(format!("{id}.tmp"));
        let meta = rocksky_metadata::metadata::read(path, &tmp_art).unwrap_or_else(|_| json!({}));
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let title = text(&meta, "title");
        let mut track = Track {
            id,
            path: path.to_string_lossy().into_owned(),
            title: if title.is_empty() { stem } else { title },
            artist: text(&meta, "artist"),
            album_artist: text(&meta, "albumArtist"),
            album: text(&meta, "album"),
            duration_ms: meta["durationMs"].as_u64().unwrap_or(0),
            track_number: meta["trackNumber"].as_u64().filter(|n| *n > 0),
            disc_number: meta["discNumber"].as_u64().filter(|n| *n > 0),
            year: meta["year"].as_u64().filter(|n| *n > 0),
            genre: meta["genre"].as_str().filter(|g| !g.is_empty()).map(str::to_owned),
            art: None,
            mtime,
            size,
        };
        let album_key = key(&track);
        if let Some(art) = art_cache.get(&album_key) {
            track.art = art.clone();
            let _ = fs::remove_file(&tmp_art);
        } else if let Ok(bytes) = fs::read(&tmp_art) {
            let final_art = self.art_dir.join(format!("{}.{}", hash(&album_key), image_ext(&bytes)));
            let art = if bytes.is_empty() || fs::rename(&tmp_art, &final_art).is_err() {
                let _ = fs::remove_file(&tmp_art);
                None
            } else {
                Some(final_art.to_string_lossy().into_owned())
            };
            art_cache.insert(album_key, art.clone());
            track.art = art;
        }
        track
    }

    fn run_scan(self: &Arc<Self>, force: bool) {
        let folder = self.folder();
        let _ = fs::create_dir_all(&self.art_dir);
        let mut files = Vec::new();
        Self::walk(&folder, &mut files);
        files.sort();
        let previous = {
            let index = self.index.lock().unwrap();
            if index.folder == folder.to_string_lossy() && !force {
                index.tracks.clone()
            } else {
                BTreeMap::new()
            }
        };
        let mut art_cache: HashMap<String, Option<String>> = previous
            .values()
            .filter(|t| t.art.is_some())
            .map(|t| (key(t), t.art.clone()))
            .collect();
        let mut tracks = BTreeMap::new();
        for (i, path) in files.iter().enumerate() {
            let Ok(meta) = fs::metadata(path) else { continue };
            let mtime = meta.modified().ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
            let size = meta.len();
            let path_str = path.to_string_lossy().into_owned();
            let track = match previous.get(&path_str) {
                Some(t) if t.mtime == mtime && t.size == size => t.clone(),
                _ => self.read_track(path, mtime, size, &mut art_cache),
            };
            tracks.insert(path_str, track);
            if i % 25 == 0 {
                self.scan.lock().unwrap().count = i + 1;
            }
        }
        let index = Index { folder: folder.to_string_lossy().into_owned(), tracks };
        self.save_index(&index);
        *self.index.lock().unwrap() = index;
        let mut scan = self.scan.lock().unwrap();
        scan.count = files.len();
        scan.state = "done".into();
    }

    pub fn start_scan(self: &Arc<Self>, force: bool) {
        {
            let mut scan = self.scan.lock().unwrap();
            if scan.state == "scanning" {
                scan.rescan_queued = true;
                return;
            }
            *scan = Scan { state: "scanning".into(), ..Scan::default() };
        }
        let lib = self.clone();
        std::thread::spawn(move || loop {
            lib.run_scan(force);
            let mut scan = lib.scan.lock().unwrap();
            if !scan.rescan_queued {
                break;
            }
            *scan = Scan { state: "scanning".into(), ..Scan::default() };
        });
    }

    fn status(&self) -> Value {
        let index = self.index.lock().unwrap();
        json!({
            "folder": self.folder(),
            "scan": self.scan.lock().unwrap().clone(),
            "tracks": index.tracks.len(),
        })
    }

    fn matches(track: &Track, q: &str) -> bool {
        q.is_empty()
            || format!("{} {} {} {}", track.title, track.artist, track.album_artist, track.album)
                .to_lowercase()
                .contains(q)
    }

    fn sorted(index: &Index) -> Vec<&Track> {
        let mut tracks: Vec<&Track> = index.tracks.values().collect();
        tracks.sort_by(|a, b| {
            let ka = (a.album_artist.is_empty().then_some(&a.artist).unwrap_or(&a.album_artist).to_lowercase(), a.album.to_lowercase(), a.disc_number.unwrap_or(0), a.track_number.unwrap_or(0), a.title.to_lowercase());
            let kb = (b.album_artist.is_empty().then_some(&b.artist).unwrap_or(&b.album_artist).to_lowercase(), b.album.to_lowercase(), b.disc_number.unwrap_or(0), b.track_number.unwrap_or(0), b.title.to_lowercase());
            ka.cmp(&kb)
        });
        tracks
    }

    fn albums(index: &Index, q: &str, artist: Option<&str>) -> Vec<Value> {
        let mut albums: Vec<(String, Value)> = Vec::new();
        let mut seen: HashMap<String, usize> = HashMap::new();
        for track in Self::sorted(index) {
            if track.album.is_empty() {
                continue;
            }
            let album_artist = if track.album_artist.is_empty() { &track.artist } else { &track.album_artist };
            if artist.is_some_and(|a| a != hash(&album_artist.to_lowercase())) {
                continue;
            }
            if !q.is_empty() && !format!("{} {}", track.album, album_artist).to_lowercase().contains(q) {
                continue;
            }
            let k = key(track);
            match seen.get(&k) {
                Some(&i) => {
                    let count = albums[i].1["trackCount"].as_u64().unwrap_or(0) + 1;
                    albums[i].1["trackCount"] = json!(count);
                    if albums[i].1["art"].is_null() {
                        albums[i].1["art"] = json!(track.art);
                    }
                }
                None => {
                    seen.insert(k.clone(), albums.len());
                    albums.push((
                        k.clone(),
                        json!({
                            "id": hash(&k),
                            "title": track.album,
                            "artist": album_artist,
                            "artistId": hash(&album_artist.to_lowercase()),
                            "year": track.year,
                            "art": track.art,
                            "trackCount": 1,
                        }),
                    ));
                }
            }
        }
        albums.into_iter().map(|(_, v)| v).collect()
    }

    fn artists(index: &Index, q: &str) -> Vec<Value> {
        let mut artists: BTreeMap<String, Value> = BTreeMap::new();
        for track in index.tracks.values() {
            let name = if track.album_artist.is_empty() { &track.artist } else { &track.album_artist };
            if name.is_empty() || (!q.is_empty() && !name.to_lowercase().contains(q)) {
                continue;
            }
            let entry = artists.entry(name.to_lowercase()).or_insert_with(|| {
                json!({ "id": hash(&name.to_lowercase()), "name": name, "art": null, "albums": [], "trackCount": 0 })
            });
            entry["trackCount"] = json!(entry["trackCount"].as_u64().unwrap_or(0) + 1);
            if entry["art"].is_null() {
                entry["art"] = json!(track.art);
            }
            if !track.album.is_empty() {
                let k = json!(key(track));
                let list = entry["albums"].as_array_mut().unwrap();
                if !list.contains(&k) {
                    list.push(k);
                }
            }
        }
        artists
            .into_values()
            .map(|mut a| {
                a["albumCount"] = json!(a["albums"].as_array().map_or(0, |l| l.len()));
                a.as_object_mut().unwrap().remove("albums");
                a
            })
            .collect()
    }

    pub fn request(self: &Arc<Self>, app: &tauri::AppHandle, request: Value) -> Result<Value, String> {
        let cmd = text(&request, "cmd");
        let q = text(&request, "query").to_lowercase();
        match cmd.as_str() {
            "status" => Ok(self.status()),
            "scan" => {
                self.start_scan(request["force"].as_bool().unwrap_or(false));
                Ok(self.status())
            }
            "setFolder" => {
                self.set_folder(Path::new(&text(&request, "folder")))?;
                self.start_scan(true);
                Ok(self.status())
            }
            "pickFolder" => {
                use tauri_plugin_dialog::DialogExt;
                let picked = app
                    .dialog()
                    .file()
                    .set_directory(self.folder())
                    .set_title("Choose your music folder")
                    .blocking_pick_folder()
                    .and_then(|f| f.into_path().ok());
                let Some(folder) = picked else {
                    return Ok(json!({ "cancelled": true }));
                };
                self.set_folder(&folder)?;
                self.start_scan(true);
                Ok(self.status())
            }
            "tracks" => {
                let index = self.index.lock().unwrap();
                let offset = request["offset"].as_u64().unwrap_or(0) as usize;
                let limit = request["limit"].as_u64().unwrap_or(200).clamp(1, 1000) as usize;
                let album = request["albumId"].as_str();
                let artist = request["artistId"].as_str();
                let all: Vec<&Track> = Self::sorted(&index)
                    .into_iter()
                    .filter(|t| album.is_none_or(|a| a == hash(&key(t))))
                    .filter(|t| {
                        artist.is_none_or(|a| {
                            let name = if t.album_artist.is_empty() { &t.artist } else { &t.album_artist };
                            a == hash(&name.to_lowercase()) || a == hash(&t.artist.to_lowercase())
                        })
                    })
                    .filter(|t| Self::matches(t, &q))
                    .collect();
                let page: Vec<&Track> = all.iter().skip(offset).take(limit).copied().collect();
                let next = (offset + page.len() < all.len()).then_some(offset + page.len());
                Ok(json!({ "tracks": page, "total": all.len(), "nextOffset": next }))
            }
            "albums" => {
                let index = self.index.lock().unwrap();
                Ok(json!({ "albums": Self::albums(&index, &q, request["artistId"].as_str()) }))
            }
            "artists" => {
                let index = self.index.lock().unwrap();
                Ok(json!({ "artists": Self::artists(&index, &q) }))
            }
            _ => Err("Unknown local library operation".into()),
        }
    }
}

pub fn init(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let config_dir = app.path().app_config_dir()?;
    let cache_dir = app.path().app_cache_dir()?;
    let default_folder = app
        .path()
        .audio_dir()
        .ok()
        .or_else(|| app.path().home_dir().ok().map(|h| h.join("Music")))
        .unwrap_or_else(|| PathBuf::from("~/Music"));
    let library = LocalLibrary::new(config_dir, cache_dir, default_folder);
    library.start_scan(false);
    app.manage(library);
    Ok(())
}

#[tauri::command]
pub async fn local_library(
    app: tauri::AppHandle,
    library: tauri::State<'_, Arc<LocalLibrary>>,
    request: Value,
) -> Result<Value, String> {
    let library = library.inner().clone();
    tokio::task::spawn_blocking(move || library.request(&app, request))
        .await
        .map_err(|_| "Local library request failed".to_string())?
}
