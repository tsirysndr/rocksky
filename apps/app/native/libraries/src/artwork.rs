//! Resumable remote artwork enrichment. Only names go to Rocksky; server URLs
//! and credentials remain in memory. Database generations fence stale workers.
use super::*;
use rocksky_metadata::remote_metadata;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use unicode_normalization::UnicodeNormalization;

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
static SERIAL: AtomicU64 = AtomicU64::new(0);
const WEEK: i64 = 7 * 86400;
fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(Default::default)
}
fn error(_: rusqlite::Error) -> String {
    "Could not access artwork cache".into()
}
fn normalized(s: &str) -> String {
    s.nfkc().collect::<String>().trim().to_lowercase()
}
fn artist_key(s: &str) -> String {
    format!("artist:{}", normalized(s))
}
fn album_key(artist: &str, album: &str) -> String {
    format!("album:{}:{}", normalized(artist), normalized(album))
}
fn directory(root: &str, source: &str) -> PathBuf {
    Path::new(root).join(format!("{:x}", md5::compute(source)))
}
fn local(v: &Value) -> Option<String> {
    let s = v.as_str()?;
    let path = s.strip_prefix("file://")?;
    std::fs::metadata(path)
        .ok()
        .filter(|m| m.is_file() && m.len() > 0)
        .map(|_| s.to_owned())
}
// Provider references are stored without credentials and hydrated on read.
// Existing provider images need neither downloading nor replacement.
fn available_art(c: &Config, data: &Value, field: &str) -> Option<String> {
    index::hydrate_art(c, data["providerArt"].as_str().map(str::to_owned))
        .or_else(|| local(&data[field]))
}
// A URL in DIDL is only a reference: some servers advertise /art URLs
// even when no cover exists. Probe once per URL, without downloading the image.
fn provider_key(reference: &str) -> String {
    format!("provider:{:x}", md5::compute(reference))
}
fn checked_provider(
    db: &Connection,
    c: &Config,
    reference: Option<String>,
    checks: &mut Vec<(String, Value, i64)>,
) -> Result<Option<String>> {
    let Some(reference) = reference else {
        return Ok(None);
    };
    let Some(url) = index::hydrate_art(c, Some(reference.clone())) else {
        return Ok(None);
    };
    let key = provider_key(&reference);
    let (cached, due, _) = record(db, &c.id, &key)?;
    if due > index::now() {
        return Ok((cached["available"] == true).then_some(reference));
    }
    if let Some((_, cached, _)) = checks.iter().find(|(k, _, _)| k == &key) {
        return Ok((cached["available"] == true).then_some(reference));
    }
    let client = client()?;
    let response = client.head(&url).send().and_then(|r| {
        if matches!(r.status().as_u16(), 405 | 501) {
            client.get(&url).header("Range", "bytes=0-0").send()
        } else {
            Ok(r)
        }
    });
    let available = response.is_ok_and(|r| {
        r.status().is_success()
            && r.headers()
                .get("content-type")
                .and_then(|h| h.to_str().ok())
                .is_some_and(|mime| mime.starts_with("image/"))
    });
    checks.push((
        key,
        json!({"available": available}),
        index::now() + if available { WEEK } else { 300 },
    ));
    Ok(available.then_some(reference))
}
fn rejected_provider(db: &Connection, c: &Config, url: &str) -> bool {
    let Some(reference) = index::sanitized_art(c, Some(url.to_owned())) else {
        return false;
    };
    record(db, &c.id, &provider_key(&reference))
        .ok()
        .is_some_and(|(v, _, _)| v["available"] == false)
}
fn indexed_art(
    db: &Connection,
    c: &Config,
    kind: &str,
    title: &str,
    artist: &str,
) -> Result<Option<String>> {
    if title.trim().is_empty() {
        return Ok(None);
    }
    let mut statement = db
        .prepare("SELECT payload FROM entries WHERE source=? AND kind=? AND title=? COLLATE NOCASE")
        .map_err(error)?;
    let rows = statement
        .query_map(params![c.id, kind, title], |r| r.get::<_, String>(0))
        .map_err(error)?;
    for row in rows {
        let entry: Entry =
            serde_json::from_str(&row.map_err(error)?).map_err(|_| "Invalid indexed artwork")?;
        if kind == "album" && normalized(&entry.artist) != normalized(artist) {
            continue;
        }
        if index::hydrate_art(c, entry.art.clone()).is_some() {
            return Ok(entry.art);
        }
    }
    Ok(None)
}
pub(crate) fn schema(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS artwork (source TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, due INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(source,key));
      CREATE TABLE IF NOT EXISTS artwork_priority (source TEXT NOT NULL, id TEXT NOT NULL, requested INTEGER NOT NULL, PRIMARY KEY(source,id));
      CREATE TABLE IF NOT EXISTS artwork_versions (source TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);") .map_err(error)
}
fn record(db: &Connection, source: &str, key: &str) -> Result<(Value, i64, i64)> {
    db.query_row(
        "SELECT payload,due,attempts FROM artwork WHERE source=? AND key=?",
        params![source, key],
        |r| Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()
    .map_err(error)?
    .map(|(s, d, a)| {
        serde_json::from_str(&s)
            .map(|v| (v, d, a))
            .map_err(|_| "Invalid artwork cache".into())
    })
    .unwrap_or(Ok((json!({}), 0, 0)))
}
fn put(
    db: &Connection,
    source: &str,
    key: &str,
    value: &Value,
    due: i64,
    attempts: i64,
) -> Result<()> {
    db.execute("INSERT INTO artwork(source,key,payload,due,attempts) VALUES(?,?,?,?,?) ON CONFLICT(source,key) DO UPDATE SET payload=excluded.payload,due=excluded.due,attempts=excluded.attempts",params![source,key,value.to_string(),due,attempts]).map_err(error)?;
    Ok(())
}
pub fn active(path: &str, id: &str) -> bool {
    jobs()
        .lock()
        .map(|j| j.contains_key(&index::key(path, id)))
        .unwrap_or(false)
}
pub fn stop(path: &str, id: &str) {
    if let Ok(mut jobs) = jobs().lock() {
        if let Some(job) = jobs.remove(&index::key(path, id)) {
            job.store(true, Ordering::Relaxed);
        }
    }
}
pub fn remove(db: &Connection, root: &str, id: &str) -> Result<()> {
    db.execute("DELETE FROM artwork_priority WHERE source=?", [id])
        .map_err(error)?;
    db.execute("DELETE FROM artwork WHERE source=?", [id])
        .map_err(error)?;
    db.execute("DELETE FROM artwork_versions WHERE source=?", [id])
        .map_err(error)?;
    if !root.is_empty() {
        let _ = std::fs::remove_dir_all(directory(root, id));
    }
    Ok(())
}
pub fn revision(db: &Connection, id: &str) -> i64 {
    db.query_row(
        "SELECT revision FROM artwork_versions WHERE source=?",
        [id],
        |r| r.get(0),
    )
    .unwrap_or(0)
}
pub fn start(path: &str, root: &str, c: Config) -> Result<()> {
    if root.is_empty() {
        return Ok(());
    }
    let key = index::key(path, &c.id);
    let mut running = jobs().lock().map_err(|_| "Artwork worker unavailable")?;
    if running.contains_key(&key) {
        return Ok(());
    }
    let db = index::open(path)?;
    let generation = index::generation(&db, &c.id)?;
    if generation < 0 {
        return Ok(());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    running.insert(key.clone(), cancelled.clone());
    let path = path.to_owned();
    let root = root.to_owned();
    let runtime = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(2)
            .build()
            .expect("artwork runtime")
    });
    runtime.spawn_blocking(move || {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            worker(&path, &root, &c, generation, &cancelled)
        }));
        if let Ok(mut jobs) = jobs().lock() {
            if jobs.get(&key).is_some_and(|v| Arc::ptr_eq(v, &cancelled)) {
                jobs.remove(&key);
            }
        }
    });
    Ok(())
}
fn valid(db: &Connection, c: &Config, generation: i64, cancelled: &AtomicBool) -> bool {
    !cancelled.load(Ordering::Relaxed) && index::generation(db, &c.id).ok() == Some(generation)
}
fn worker(
    path: &str,
    root: &str,
    c: &Config,
    generation: i64,
    cancelled: &AtomicBool,
) -> Result<()> {
    let mut db = index::open(path)?;
    let dir = directory(root, &c.id);
    // Creation and removal are serialized with source-generation changes.
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(error)?;
    if !valid(&tx, c, generation, cancelled) {
        return Ok(());
    }
    // Revisit records created before provider URLs were checked.
    if record(&tx, &c.id, "migration:provider-validation")?.0["done"] != true {
        tx.execute(
            "UPDATE artwork SET due=0 WHERE source=? AND key LIKE 'track:%'",
            [&c.id],
        )
        .map_err(error)?;
        put(
            &tx,
            &c.id,
            "migration:provider-validation",
            &json!({"done":true}),
            0,
            0,
        )?;
    }
    std::fs::create_dir_all(&dir).map_err(|_| "Could not create artwork cache")?;
    // A killed process can leave a partial audio buffer or unpublished image.
    for file in std::fs::read_dir(&dir)
        .map_err(|_| "Could not inspect artwork cache")?
        .flatten()
    {
        let path = file.path();
        if path.extension().is_some_and(|e| e == "audio" || e == "img")
            && !referenced(&tx, &c.id, &path)
        {
            let _ = std::fs::remove_file(path);
        }
    }
    tx.commit().map_err(error)?;
    while valid(&db, c, generation, cancelled) {
        let candidate: Option<String> = db.query_row("SELECT e.payload FROM entries e LEFT JOIN artwork a ON a.source=e.source AND a.key='track:'||e.id LEFT JOIN artwork_priority p ON p.source=e.source AND p.id=e.id WHERE e.source=? AND e.kind='track' AND (a.due IS NULL OR a.due<=?) ORDER BY COALESCE(p.requested,0) DESC, COALESCE(a.due,0), e.rowid LIMIT 1",params![c.id,index::now()],|r|r.get(0)).optional().map_err(error)?;
        if let Some(payload) = candidate {
            let entry: Entry =
                serde_json::from_str(&payload).map_err(|_| "Invalid indexed track")?;
            enrich(&mut db, &dir, c, generation, cancelled, &entry, &search)?;
        } else if index::active(path, &c.id) {
            std::thread::sleep(Duration::from_millis(250));
        } else {
            break;
        }
    }
    Ok(())
}
fn download(url: &str, path: &Path) -> Option<String> {
    if !matches!(Url::parse(url).ok()?.scheme(), "http" | "https") {
        return None;
    }
    remote_metadata::artwork(url, path).ok()?;
    Some(format!("file://{}", path.display()))
}
fn search(artist: &str) -> Result<Vec<Value>> {
    // Deliberately independent of the remote server's client/configuration.
    let mut url = Url::parse("https://api.rocksky.app/xrpc/app.rocksky.feed.search").unwrap();
    url.query_pairs_mut()
        .append_pair("query", artist)
        .append_pair("size", "100");
    use std::io::Read;
    let response = response(client()?.get(url))?;
    let mut bytes = Vec::new();
    response
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Artist lookup unavailable")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Artist response too large".into());
    }
    let result: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid artist response")?;
    Ok(array(&result, "hits"))
}
fn matched_artist(hits: &[Value], artist: &str) -> Option<String> {
    let pictures: HashSet<String> = hits
        .iter()
        .filter(|v| {
            text(v, "uri").contains("/app.rocksky.artist/")
                && normalized(&text(v, "name")) == normalized(artist)
        })
        .map(|v| text(v, "picture"))
        .filter(|s| {
            Url::parse(s)
                .ok()
                .is_some_and(|u| matches!(u.scheme(), "http" | "https"))
        })
        .collect();
    (pictures.len() == 1)
        .then(|| pictures.into_iter().next())
        .flatten()
}
fn retry(attempts: i64) -> i64 {
    (300 * (1i64 << attempts.clamp(0, 8))).min(86400)
}
fn indexed_payload(db: &Connection, c: &Config, id: &str) -> Result<Option<String>> {
    db.query_row(
        "SELECT payload FROM entries WHERE source=? AND kind='track' AND id=?",
        params![c.id, id],
        |r| r.get(0),
    )
    .optional()
    .map_err(error)
}
fn referenced(db: &Connection, source: &str, file: &Path) -> bool {
    let url = format!("file://{}", file.display());
    db.query_row("SELECT EXISTS(SELECT 1 FROM artwork WHERE source=? AND (json_extract(payload,'$.art')=? OR json_extract(payload,'$.albumArt')=?))",params![source,url,url],|r|r.get(0)).unwrap_or(true)
}
fn enrich(
    db: &mut Connection,
    dir: &Path,
    c: &Config,
    generation: i64,
    cancelled: &AtomicBool,
    entry: &Entry,
    lookup: &impl Fn(&str) -> Result<Vec<Value>>,
) -> Result<()> {
    let snapshot = indexed_payload(db, c, &entry.id)?;
    if snapshot
        .as_ref()
        .is_some_and(|s| serde_json::to_string(entry).ok().as_ref() != Some(s))
    {
        return Ok(());
    }
    let key = format!("track:{}", entry.id);
    let (old, _, attempts) = record(db, &c.id, &key)?;
    let mut data = json!({"title":entry.title,"artist":entry.artist,"album":entry.album,"durationMs":entry.duration_ms});
    for field in [
        "title",
        "artist",
        "album",
        "albumArtist",
        "durationMs",
        "genre",
        "year",
        "trackNumber",
        "discNumber",
    ] {
        if !old[field].is_null() {
            data[field] = old[field].clone();
        }
    }
    // Each attempt writes private files; they become visible only after the
    // generation check and transaction commit. Failed attempts are removed.
    let prefix = format!(
        "{}-{}-{}-{}",
        std::process::id(),
        generation,
        index::now(),
        SERIAL.fetch_add(1, Ordering::Relaxed)
    );
    let cover = dir.join(format!("{prefix}-cover.img"));
    let picture = dir.join(format!("{prefix}-artist.img"));
    let audio = dir.join(format!("{prefix}.audio"));
    let result = (|| {
        let mut checks = Vec::new();
        let (album, _, _) = record(db, &c.id, &album_key(&entry.artist, &entry.album))?;
        let provider_cover = entry
            .art
            .clone()
            .filter(|art| index::hydrate_art(c, Some(art.clone())).is_some())
            .or(indexed_art(db, c, "album", &entry.album, &entry.artist)?);
        let provider_cover = checked_provider(db, c, provider_cover, &mut checks)?;
        data["providerArt"] = json!(provider_cover);
        let mut art = local(&old["albumArt"]).or_else(|| local(&album["art"]));
        if !valid(db, c, generation, cancelled) {
            return Ok(());
        }
        if provider_cover.is_none() && art.is_none() {
            let stream = if c.kind == "upnp" {
                upnp::stream(c, &entry.id)
            } else {
                http::stream(c, &entry.id)
            };
            if let Ok(url) = stream {
                if let Ok(tags) = remote_metadata::read(&url, &audio, &cover) {
                    for field in [
                        "title",
                        "artist",
                        "album",
                        "albumArtist",
                        "durationMs",
                        "genre",
                        "year",
                        "trackNumber",
                        "discNumber",
                    ] {
                        let v = &tags[field];
                        if !v.is_null()
                            && !v.as_str().is_some_and(|s| s.trim().is_empty())
                            && v.as_u64() != Some(0)
                        {
                            data[field] = v.clone();
                        }
                    }
                    art = local(&tags["albumArt"]);
                }
            }
        }
        data["albumArt"] = json!(art);
        if !valid(db, c, generation, cancelled) {
            return Ok(());
        }
        let artist = text(&data, "artist");
        let ak = artist_key(&artist);
        let (mut artist_data, artist_due, artist_attempts) = record(db, &c.id, &ak)?;
        let mut artist_update = None;
        let artist_provider = indexed_art(db, c, "artist", &artist, "")?;
        if let Some(provider) = checked_provider(db, c, artist_provider, &mut checks)? {
            artist_data = json!({"providerArt":provider});
            artist_update = Some((index::now() + WEEK, 0));
        }
        if !artist.trim().is_empty()
            && available_art(c, &artist_data, "art").is_none()
            && artist_due <= index::now()
        {
            let provider = http::artist_artwork(c, &entry.id, &artist)
                .ok()
                .flatten()
                .and_then(|url| index::sanitized_art(c, Some(url)));
            let provider = checked_provider(db, c, provider, &mut checks)?;
            let mut image = None;
            let mut failed = false;
            if provider.is_none() && valid(db, c, generation, cancelled) {
                match lookup(&artist) {
                    Ok(hits) => {
                        if let Some(url) = matched_artist(&hits, &artist) {
                            image = download(&url, &picture);
                            failed = image.is_none();
                        }
                    }
                    Err(_) => failed = true,
                }
            }
            artist_data = json!({"art":image,"providerArt":provider});
            artist_update = Some((
                if failed {
                    index::now() + retry(artist_attempts)
                } else {
                    index::now() + WEEK
                },
                if failed { artist_attempts + 1 } else { 0 },
            ));
        }
        let tx = db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(error)?;
        if !valid(&tx, c, generation, cancelled) || indexed_payload(&tx, c, &entry.id)? != snapshot
        {
            return Ok(());
        }
        for (key, payload, due) in checks {
            put(&tx, &c.id, &key, &payload, due, 0)?;
        }
        tx.execute(
            "DELETE FROM artwork_priority WHERE source=? AND id=?",
            params![c.id, entry.id],
        )
        .map_err(error)?;
        let has_cover = provider_cover.is_some() || art.is_some();
        let mut due = if has_cover {
            index::now() + WEEK
        } else {
            index::now() + retry(attempts)
        };
        if !artist.trim().is_empty() && available_art(c, &artist_data, "art").is_none() {
            let artist_retry = artist_update.map(|v| v.0).unwrap_or(artist_due);
            if artist_retry > index::now() {
                due = due.min(artist_retry);
            }
        }
        put(
            &tx,
            &c.id,
            &key,
            &data,
            due,
            if has_cover { 0 } else { attempts + 1 },
        )?;
        if let Some((due, attempts)) = artist_update {
            put(&tx, &c.id, &ak, &artist_data, due, attempts)?;
        }
        // Keep the server's album identity too: embedded tags may spell the
        // artist/album differently from its browse containers.
        if has_cover && !entry.album.is_empty() {
            put(
                &tx,
                &c.id,
                &album_key(&entry.artist, &entry.album),
                &json!({"art":art,"providerArt":provider_cover}),
                index::now() + WEEK,
                0,
            )?;
        }
        let album = text(&data, "album");
        if has_cover && !album.is_empty() {
            let aa = text(&data, "albumArtist");
            for name in [&artist, &aa].into_iter().filter(|s| !s.is_empty()) {
                put(
                    &tx,
                    &c.id,
                    &album_key(name, &album),
                    &json!({"art":art,"providerArt":provider_cover}),
                    index::now() + WEEK,
                    0,
                )?;
            }
        }
        tx.execute("INSERT INTO artwork_versions(source,revision) VALUES(?,1) ON CONFLICT(source) DO UPDATE SET revision=revision+1",[&c.id]).map_err(error)?;
        tx.commit().map_err(error)?;
        // Keep successful image files; prune only after all references exist.
        prune(db, dir, &c.id)?;
        Ok(())
    })();
    let _ = std::fs::remove_file(audio);
    // Never leave partial images or images from cancelled/failed generations.
    for file in [cover, picture] {
        if !referenced(db, &c.id, &file) {
            let _ = std::fs::remove_file(file);
        }
    }
    result
}
fn prune(db: &Connection, dir: &Path, source: &str) -> Result<()> {
    let mut files: Vec<_> = std::fs::read_dir(dir)
        .map_err(|_| "Could not inspect artwork cache")?
        .filter_map(|f| f.ok())
        .filter_map(|f| f.metadata().ok().map(|m| (f.path(), m)))
        .filter(|(p, _)| p.extension().is_some_and(|e| e == "img"))
        .collect();
    files.sort_by_key(|(_, m)| std::cmp::Reverse(m.modified().ok()));
    let mut size = 0;
    for (path, meta) in files {
        size += meta.len();
        if size > 200 * 1024 * 1024 {
            let _ = std::fs::remove_file(&path);
            // Evicted records become eligible on a later maintenance pass, not in
            // this pass (which would otherwise loop forever on large libraries).
            let url = format!("file://{}", path.display());
            db.execute("UPDATE artwork SET due=MIN(due,?) WHERE source=? AND (json_extract(payload,'$.art')=? OR json_extract(payload,'$.albumArt')=?)",params![index::now()+86400,source,url,url]).map_err(error)?;
        }
    }
    Ok(())
}
pub fn metadata(path: &str, c: &Config, id: &str) -> Result<Value> {
    let db = index::open(path)?;
    let (mut data, _, _) = record(&db, &c.id, &format!("track:{id}"))?;
    if data.as_object().is_some_and(|v| v.is_empty()) {
        return Ok(Value::Null);
    }
    if data["providerArt"]
        .as_str()
        .is_some_and(|s| rejected_provider(&db, c, s))
    {
        data["providerArt"] = Value::Null;
    }
    data["albumArt"] = json!(available_art(c, &data, "albumArt"));
    let (artist, _, _) = record(&db, &c.id, &artist_key(&text(&data, "artist")))?;
    data["artistPicture"] = json!(available_art(c, &artist, "art"));
    Ok(data)
}
/// Browsed tracks enter the queue immediately, ahead of the full crawl.
pub fn queue_page(path: &str, c: &Config, page: &Value) -> Result<()> {
    let mut db = index::open(path)?;
    let generation = index::generation(&db, &c.id)?;
    if generation < 0 {
        return Ok(());
    }
    let entries = page["entries"].as_array().cloned().unwrap_or_default();
    let tracks = entries
        .iter()
        .filter(|e| e["kind"] == "track")
        .filter_map(|e| serde_json::from_value::<Entry>(e.clone()).ok())
        .collect();
    index::store_page(&mut db, c, generation, tracks)?;
    let tx = db.transaction().map_err(error)?;
    if index::generation(&tx, &c.id)? != generation {
        return Ok(());
    }
    for entry in entries {
        let ids: Vec<String> = if entry["kind"] == "track" {
            vec![text(&entry, "id")]
        } else if entry["kind"] == "album" || entry["kind"] == "artist" {
            let (column, name) = if entry["kind"] == "album" {
                ("album", text(&entry, "title"))
            } else {
                ("artist", text(&entry, "title"))
            };
            let mut stmt = tx.prepare(&format!("SELECT id FROM entries WHERE source=? AND kind='track' AND {column}=? COLLATE NOCASE")).map_err(error)?;
            let rows = stmt
                .query_map(params![c.id, name], |r| r.get(0))
                .map_err(error)?;
            rows.collect::<std::result::Result<_, _>>().map_err(error)?
        } else {
            Vec::new()
        };
        for id in ids {
            if record(&tx, &c.id, &format!("track:{id}"))?.1 <= index::now() {
                tx.execute("INSERT INTO artwork_priority(source,id,requested) VALUES(?,?,?) ON CONFLICT(source,id) DO UPDATE SET requested=excluded.requested", params![c.id,id,index::now()]).map_err(error)?;
            }
        }
    }
    tx.commit().map_err(error)
}
pub fn merge(path: &str, c: &Config, mut page: Value) -> Result<Value> {
    let db = index::open(path)?;
    if let Some(entries) = page["entries"].as_array_mut() {
        for entry in entries {
            // Keep artwork explicitly returned by the server on browse/search.
            if entry["art"].as_str().is_some_and(|s| {
                (s.starts_with("http://") || s.starts_with("https://"))
                    && !rejected_provider(&db, c, s)
            }) {
                continue;
            }
            let kind = text(entry, "kind");
            if kind == "track" {
                let (data, _, _) = record(&db, &c.id, &format!("track:{}", text(entry, "id")))?;
                for field in ["title", "artist", "album", "durationMs"] {
                    if !data[field].is_null() {
                        entry[field] = data[field].clone();
                    }
                }
                if let Some(art) = available_art(c, &data, "albumArt") {
                    entry["art"] = json!(art);
                    continue;
                }
            }
            let key = if kind == "artist" {
                artist_key(&text(entry, "title"))
            } else {
                album_key(
                    &text(entry, "artist"),
                    &text(entry, if kind == "album" { "title" } else { "album" }),
                )
            };
            let (data, _, _) = record(&db, &c.id, &key)?;
            if let Some(art) = available_art(c, &data, "art") {
                entry["art"] = json!(art);
            }
        }
    }
    Ok(page)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    fn setup() -> (tempfile::TempDir, String, Connection, Config, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let path = temp
            .path()
            .join("index.sqlite")
            .to_string_lossy()
            .into_owned();
        let db = index::open(&path).unwrap();
        let c = Config {
            id: "source".into(),
            base_url: "http://127.0.0.1:1".into(),
            kind: "upnp".into(),
            ..Config::default()
        };
        db.execute(
            "INSERT INTO sources(id,generation,state) VALUES(?,1,'ready')",
            [&c.id],
        )
        .unwrap();
        let dir = directory(temp.path().to_str().unwrap(), &c.id);
        std::fs::create_dir_all(&dir).unwrap();
        (temp, path, db, c, dir)
    }
    fn track() -> Entry {
        Entry {
            id: "track".into(),
            kind: "track".into(),
            title: "Song".into(),
            artist: "Singer".into(),
            album: "Album".into(),
            ..Entry::default()
        }
    }
    fn server(mime: &'static str, body: Vec<u8>) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 8192];
            let _ = socket.read(&mut request).unwrap();
            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
            socket.write_all(&body).unwrap();
        });
        (url, worker)
    }
    fn cached_cover(db: &Connection, c: &Config, dir: &Path) {
        let art = dir.join("existing.img");
        std::fs::write(&art, b"image").unwrap();
        put(
            db,
            &c.id,
            &album_key("Singer", "Album"),
            &json!({"art":format!("file://{}",art.display())}),
            0,
            0,
        )
        .unwrap();
    }
    fn healthy_provider(db: &Connection, c: &Config, url: &str) {
        put(
            db,
            &c.id,
            &provider_key(url),
            &json!({"available":true}),
            index::now() + WEEK,
            0,
        )
        .unwrap();
    }
    #[test]
    fn missing_provider_cover_falls_back_and_replaces_broken_browse_url() {
        let (_temp, path, mut db, c, dir) = setup();
        cached_cover(&db, &c, &dir);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/missing", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = [0; 4096];
            let n = socket.read(&mut bytes).unwrap();
            assert!(String::from_utf8_lossy(&bytes[..n]).starts_with("HEAD "));
            socket
                .write_all(
                    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .unwrap();
        });
        let mut entry = track();
        entry.art = Some(url.clone());
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &entry,
            &|_| Ok(vec![]),
        )
        .unwrap();
        server.join().unwrap();
        assert!(rejected_provider(&db, &c, &url));
        let page = merge(&path, &c, json!({"entries":[entry]})).unwrap();
        assert!(local(&page["entries"][0]["art"]).is_some());
        assert!(local(&metadata(&path, &c, "track").unwrap()["albumArt"]).is_some());
    }
    #[test]
    fn provider_probe_checks_headers_without_downloading_image_and_reuses_result() {
        let (_temp, _path, db, c, _dir) = setup();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/cover", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = [0; 4096];
            let n = socket.read(&mut bytes).unwrap();
            assert!(String::from_utf8_lossy(&bytes[..n]).starts_with("HEAD "));
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: 999999\r\nConnection: close\r\n\r\n").unwrap();
        });
        let mut checks = Vec::new();
        assert_eq!(
            checked_provider(&db, &c, Some(url.clone()), &mut checks).unwrap(),
            Some(url.clone())
        );
        server.join().unwrap();
        for (key, value, due) in &checks {
            put(&db, &c.id, key, value, *due, 0).unwrap();
        }
        assert_eq!(
            checked_provider(&db, &c, Some(url.clone()), &mut Vec::new()).unwrap(),
            Some(url)
        );
    }
    #[test]
    fn visible_track_is_enriched_while_upnp_crawl_is_still_running() {
        let (temp, path, db, mut c, _dir) = setup();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        c.kind = "upnp".into();
        c.control_url = format!("http://{}", listener.local_addr().unwrap());
        c.service_type = "urn:schemas-upnp-org:service:ContentDirectory:1".into();
        let (release, wait) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = [0; 8192];
            let _ = socket.read(&mut bytes);
            let _ = wait.recv_timeout(Duration::from_secs(5));
            let body="<Envelope><BrowseResponse><Result>&lt;DIDL-Lite/&gt;</Result><NumberReturned>0</NumberReturned><TotalMatches>0</TotalMatches></BrowseResponse></Envelope>";
            write!(
                socket,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });
        index::start(&path, c.clone(), true, false).unwrap();
        let mut entry = track();
        entry.artist.clear();
        entry.art = Some("https://covers.test/a".into());
        healthy_provider(&db, &c, entry.art.as_ref().unwrap());
        queue_page(&path, &c, &json!({"entries":[entry]})).unwrap();
        start(&path, temp.path().to_str().unwrap(), c.clone()).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while revision(&db, &c.id) == 0 && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let updated = revision(&db, &c.id) > 0;
        let scanning = index::active(&path, &c.id);
        stop(&path, &c.id);
        let _ = release.send(());
        server.join().unwrap();
        assert!(updated, "Visible cover must publish before crawl finishes");
        assert!(scanning);
    }
    #[test]
    #[ignore = "requires ROCKSKY_UPNP_URL and ROCKSKY_UPNP_TRACK on the local network"]
    fn live_upnp_embedded_cover() {
        let (_temp, path, mut db, mut c, dir) = setup();
        c.kind = "upnp".into();
        c.base_url = std::env::var("ROCKSKY_UPNP_URL").unwrap();
        upnp::connect(&mut c).unwrap();
        let id = std::env::var("ROCKSKY_UPNP_TRACK").unwrap();
        let entry = Entry {
            id,
            kind: "track".into(),
            ..Entry::default()
        };
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &entry,
            &|_| Ok(vec![]),
        )
        .unwrap();
        let data = metadata(&path, &c, &entry.id).unwrap();
        assert!(
            local(&data["albumArt"]).is_some(),
            "No embedded cover: {data}"
        );
        println!("Live UPnP embedded cover extracted: {}", data["title"]);
    }
    #[test]
    fn complete_provider_artwork_skips_downloads_extraction_and_public_search() {
        let (_temp, path, mut db, mut c, dir) = setup();
        c.kind = "jellyfin".into();
        c.base_url = "http://127.0.0.1:1".into();
        c.token = "private-token".into();
        let mut entry = track();
        entry.art = Some(format!("{}/cover.jpg", c.base_url));
        healthy_provider(&db, &c, entry.art.as_ref().unwrap());
        healthy_provider(&db, &c, &format!("{}/artist.jpg", c.base_url));
        let artist = Entry {
            id: "artist".into(),
            kind: "artist".into(),
            title: "Singer".into(),
            art: Some(format!("{}/artist.jpg", c.base_url)),
            ..Entry::default()
        };
        db.execute("INSERT INTO entries(source,id,kind,title,artist,album,payload,generation) VALUES(?,'artist','artist','Singer','','',?,1)",params![c.id,serde_json::to_string(&artist).unwrap()]).unwrap();
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &entry,
            &|_| panic!("Provider artwork must bypass Rocksky"),
        )
        .unwrap();
        let data = metadata(&path, &c, &entry.id).unwrap();
        assert!(text(&data, "albumArt").contains("/cover.jpg?api_key=private-token"));
        assert!(text(&data, "artistPicture").contains("/artist.jpg?api_key=private-token"));
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        let stored: String = db
            .query_row("SELECT group_concat(payload) FROM artwork", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert!(!stored.contains("private-token"));
        // Existing server artwork must also win over older fallback images.
        cached_cover(&db, &c, &dir);
        let page = merge(&path, &c, json!({"entries":[entry]})).unwrap();
        assert_eq!(
            page["entries"][0]["art"],
            format!("{}/cover.jpg", c.base_url)
        );
    }
    #[test]
    fn supplied_cover_only_still_looks_up_missing_artist_without_audio_read() {
        let (_temp, path, mut db, mut c, dir) = setup();
        c.base_url = "http://127.0.0.1:1".into();
        let mut entry = track();
        entry.art = Some(format!("{}/cover.jpg", c.base_url));
        healthy_provider(&db, &c, entry.art.as_ref().unwrap());
        let lookups = std::cell::Cell::new(0);
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &entry,
            &|_| {
                lookups.set(lookups.get() + 1);
                Ok(vec![])
            },
        )
        .unwrap();
        assert_eq!(lookups.get(), 1);
        assert_eq!(
            metadata(&path, &c, &entry.id).unwrap()["albumArt"],
            entry.art.unwrap()
        );
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    }
    #[test]
    fn artist_matching_rejects_ambiguous_and_unrelated_hits() {
        let hit = json!({"uri":"at://did/app.rocksky.artist/a","name":"Ｓｉｎｇｅｒ","picture":"https://images.test/a"});
        assert_eq!(
            matched_artist(&[hit.clone()], " singer ").as_deref(),
            Some("https://images.test/a")
        );
        assert!(matched_artist(&[hit.clone(),json!({"uri":"at://did/app.rocksky.artist/b","name":"Singer","picture":"https://images.test/b"})],"Singer").is_none());
        assert!(matched_artist(&[hit], "Other Singer").is_none());
        assert!(matched_artist(&[json!({"uri":"at://did/app.rocksky.song/a","name":"Singer","picture":"https://images.test/a"})],"Singer").is_none());
    }
    #[test]
    fn foreground_refresh_resumes_stopped_worker_without_reindexing_display_rows() {
        let (temp, path, db, c, dir) = setup();
        let mut entry = track();
        entry.artist.clear();
        entry.art = Some("http://127.0.0.1:1/cover.jpg".into());
        put(&db, &c.id, &provider_key(entry.art.as_ref().unwrap()),
            &json!({"available":false}), index::now() + WEEK, 0).unwrap();
        let image = dir.join("cover.img");
        std::fs::write(&image, b"cached cover").unwrap();
        let cover = format!("file://{}", image.display());
        put(&db, &c.id, &album_key("", &entry.album),
            &json!({"art":cover}), index::now() + WEEK, 0).unwrap();
        queue_page(&path, &c, &json!({"entries":[entry]})).unwrap();
        stop(&path, &c.id);
        assert_eq!(revision(&db, &c.id), 0);
        let original = indexed_payload(&db, &c, &entry.id).unwrap();
        let mut displayed = entry.clone();
        displayed.title = "Enriched display title".into();
        let result = super::super::run(json!({
            "cmd":"artworkMerge", "config":c, "indexPath":path,
            "artworkRoot":temp.path().to_str().unwrap(), "resume":true,
            "page":{"entries":[displayed],"nextOffset":100}
        })).unwrap();
        assert_eq!(result["nextOffset"], 100);
        assert_eq!(result["entries"][0]["art"], cover);
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while active(&path, &c.id) && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(revision(&db, &c.id), 1);
        assert_eq!(indexed_payload(&db, &c, &entry.id).unwrap(), original);
        assert_eq!(metadata(&path, &c, &entry.id).unwrap()["albumArt"], cover);
    }
    #[test]
    fn tokio_worker_skips_supplied_cover_and_remembers_progress() {
        let (temp, path, db, mut c, dir) = setup();
        let mut entry = track();
        c.base_url = "http://127.0.0.1:1".into();
        entry.art = Some("http://127.0.0.1:1/cover.jpg".into());
        healthy_provider(&db, &c, entry.art.as_ref().unwrap());
        entry.artist = String::new();
        db.execute("INSERT INTO entries(source,id,kind,title,artist,album,payload,generation) VALUES(?,?,'track',?,'',?,?,1)",params![c.id,entry.id,entry.title,entry.album,serde_json::to_string(&entry).unwrap()]).unwrap();
        start(&path, temp.path().to_str().unwrap(), c.clone()).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while active(&path, &c.id) && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(!active(&path, &c.id));
        let data = metadata(&path, &c, &entry.id).unwrap();
        assert_eq!(data["albumArt"], entry.art.clone().unwrap());
        assert_eq!(revision(&db, &c.id), 1);
        worker(
            &path,
            temp.path().to_str().unwrap(),
            &c,
            1,
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(revision(&db, &c.id), 1);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        let page = merge(&path, &c, json!({"entries":[entry]})).unwrap();
        assert_eq!(page["entries"][0]["art"], data["albumArt"]);
    }
    #[test]
    fn embedded_remote_cover_uses_shared_reader_and_removes_audio_buffer() {
        let (_temp, path, mut db, mut c, dir) = setup();
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../crates/audio/tests/fixtures/tagged.mp3");
        let tags = rocksky_metadata::metadata::read(&fixture, &dir.join("fixture.img")).unwrap();
        put(
            &db,
            &c.id,
            &artist_key(&text(&tags, "artist")),
            &json!({}),
            index::now() + WEEK,
            0,
        )
        .unwrap();
        let (url, server) = server("audio/mpeg", std::fs::read(fixture).unwrap());
        c.kind = "navidrome".into();
        c.base_url = url;
        c.password = "private-password".into();
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &track(),
            &|_| panic!("Cached artist must not be looked up"),
        )
        .unwrap();
        server.join().unwrap();
        let data = metadata(&path, &c, "track").unwrap();
        assert!(local(&data["albumArt"]).is_some());
        assert_eq!(data["artist"], tags["artist"]);
        let albums = merge(
            &path,
            &c,
            json!({"entries":[{"id":"album","kind":"album","title":"Album","artist":"Singer"}]}),
        )
        .unwrap();
        assert!(local(&albums["entries"][0]["art"]).is_some());
        assert!(!data.to_string().contains("private-password"));
        assert!(std::fs::read_dir(&dir)
            .unwrap()
            .all(|f| f.unwrap().path().extension().unwrap() != "audio"));
    }
    #[test]
    fn artist_download_is_reused_across_tracks_and_updates_artist_rows() {
        let (_temp, path, mut db, c, dir) = setup();
        cached_cover(&db, &c, &dir);
        let (url, server) = server("image/png", b"artist".to_vec());
        let lookup = |_: &str| {
            Ok(vec![
                json!({"uri":"at://did/app.rocksky.artist/a","name":"Singer","picture":url}),
            ])
        };
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &track(),
            &lookup,
        )
        .unwrap();
        server.join().unwrap();
        let mut second = track();
        second.id = "second".into();
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &second,
            &|_| panic!("Artist lookup must be deduplicated"),
        )
        .unwrap();
        let first = metadata(&path, &c, "track").unwrap();
        let second = metadata(&path, &c, "second").unwrap();
        assert_eq!(first["albumArt"], second["albumArt"]);
        assert_eq!(first["artistPicture"], second["artistPicture"]);
        assert!(local(&first["artistPicture"]).is_some());
        let page=merge(&path,&c,json!({"entries":[{"kind":"artist","title":"Singer"},{"kind":"album","title":"Album","artist":"Singer"}]})).unwrap();
        assert_eq!(page["entries"][0]["art"], first["artistPicture"]);
        assert_eq!(page["entries"][1]["art"], first["albumArt"]);
    }
    #[test]
    fn transient_artist_failure_is_retried_before_cover_ttl() {
        let (_temp, _path, mut db, c, dir) = setup();
        cached_cover(&db, &c, &dir);
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &track(),
            &|_| Err("offline".into()),
        )
        .unwrap();
        let (_, due, attempts) = record(&db, &c.id, &artist_key("Singer")).unwrap();
        assert_eq!(attempts, 1);
        assert!(due > index::now() && due <= index::now() + 300);
        assert_eq!(record(&db, &c.id, "track:track").unwrap().1, due);
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &track(),
            &|_| panic!("Backoff must suppress lookups"),
        )
        .unwrap();
    }
    #[test]
    fn disconnect_during_lookup_cannot_resurrect_cache() {
        let (temp, path, mut db, c, dir) = setup();
        cached_cover(&db, &c, &dir);
        enrich(
            &mut db,
            &dir,
            &c,
            1,
            &AtomicBool::new(false),
            &track(),
            &|_| {
                index::remove_with_artwork(&path, &c.id, temp.path().to_str().unwrap()).unwrap();
                Ok(vec![])
            },
        )
        .unwrap();
        assert!(metadata(&path, &c, "track").unwrap().is_null());
        assert!(!dir.exists());
        assert_eq!(revision(&db, &c.id), 0);
    }
}
