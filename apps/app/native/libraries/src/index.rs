//! Persistent, credential-free metadata search. Blocking clients run on a bounded
//! Tokio blocking pool; cancellation is cooperative between network pages.
use super::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(Default::default)
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn db_error(_: rusqlite::Error) -> String {
    "Could not access the remote search index".into()
}
fn open(path: &str) -> Result<Connection> {
    if let Some(parent) = Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|_| "Could not create search index")?;
    }
    let db = Connection::open(path).map_err(db_error)?;
    db.busy_timeout(Duration::from_secs(5)).map_err(db_error)?;
    db.execute_batch("PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'idle', updated INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS entries (rowid INTEGER PRIMARY KEY, source TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL, payload TEXT NOT NULL, generation INTEGER NOT NULL, UNIQUE(source,kind,id));
      CREATE INDEX IF NOT EXISTS entries_source ON entries(source,generation);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(title, artist, album, content='entries', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2', prefix='2 3 4');
      CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN INSERT INTO search(rowid,title,artist,album) VALUES(new.rowid,new.title,new.artist,new.album); END;
      CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN INSERT INTO search(search,rowid,title,artist,album) VALUES('delete',old.rowid,old.title,old.artist,old.album); END;
      CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN INSERT INTO search(search,rowid,title,artist,album) VALUES('delete',old.rowid,old.title,old.artist,old.album); INSERT INTO search(rowid,title,artist,album) VALUES(new.rowid,new.title,new.artist,new.album); END;") .map_err(db_error)?;
    Ok(db)
}
fn key(path: &str, id: &str) -> String {
    format!("{path}\n{id}")
}
fn generation(db: &Connection, id: &str) -> Result<i64> {
    db.query_row("SELECT generation FROM sources WHERE id=?", [id], |r| {
        r.get(0)
    })
    .optional()
    .map_err(db_error)
    .map(|v| v.unwrap_or(-1))
}
fn begin(db: &mut Connection, id: &str, reset: bool) -> Result<i64> {
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if reset {
        tx.execute("DELETE FROM entries WHERE source=?", [id])
            .map_err(db_error)?;
    }
    tx.execute("INSERT INTO sources(id,generation,state,updated) VALUES(?,1,'indexing',?) ON CONFLICT(id) DO UPDATE SET generation=generation+1,state='indexing',updated=excluded.updated",params![id,now()]).map_err(db_error)?;
    let n = generation(&tx, id)?;
    tx.commit().map_err(db_error)?;
    Ok(n)
}
pub fn start(path: &str, c: Config, force: bool, reset: bool) -> Result<Value> {
    if !["navidrome", "jellyfin", "plex", "kodi", "upnp"].contains(&c.kind.as_str())
        || c.id.is_empty()
    {
        return Err("Unsupported remote search library".into());
    }
    let mut running = jobs().lock().map_err(|_| "Search worker unavailable")?;
    let job_key = key(path, &c.id);
    if let Some(old) = running.get(&job_key) {
        if !force && !reset {
            return Ok(json!({"started":false}));
        }
        old.store(true, Ordering::Relaxed);
    }
    let mut db = open(path)?;
    if !force && !reset {
        let recent: Option<(String, i64)> = db
            .query_row(
                "SELECT state,updated FROM sources WHERE id=?",
                [&c.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(db_error)?;
        if recent.is_some_and(|(state, time)| {
            (state == "ready" && now() - time < 6 * 3600)
                || (state == "error" && now() - time < 300)
        }) {
            return Ok(json!({"started":false}));
        }
    }
    let runtime = RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(2)
            .enable_all()
            .build()
            .expect("search runtime")
    });
    let generation = begin(&mut db, &c.id, reset)?;
    let cancelled = Arc::new(AtomicBool::new(false));
    running.insert(job_key.clone(), cancelled.clone());
    let path = path.to_owned();
    runtime.spawn_blocking(move || {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crawl(&path, &c, generation, &cancelled)
        }));
        if !cancelled.load(Ordering::Relaxed) {
            if let Ok(mut db) = open(&path) {
                let _ = finish(&mut db, &c.id, generation, matches!(outcome, Ok(Ok(()))));
            }
        }
        if let Ok(mut running) = jobs().lock() {
            if running
                .get(&job_key)
                .is_some_and(|v| Arc::ptr_eq(v, &cancelled))
            {
                running.remove(&job_key);
            }
        }
    });
    Ok(json!({"started":true}))
}
pub fn remove(path: &str, id: &str) -> Result<Value> {
    let mut running = jobs().lock().map_err(|_| "Search worker unavailable")?;
    if let Some(job) = running.remove(&key(path, id)) {
        job.store(true, Ordering::Relaxed);
    }
    let mut db = open(path)?;
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    tx.execute("DELETE FROM entries WHERE source=?", [id])
        .map_err(db_error)?;
    // Keep a generation tombstone so an in-flight page cannot resurrect data.
    tx.execute("INSERT INTO sources(id,generation,state) VALUES(?,1,'removed') ON CONFLICT(id) DO UPDATE SET generation=generation+1,state='removed'",[id]).map_err(db_error)?;
    tx.commit().map_err(db_error)?;
    Ok(json!({}))
}
fn sanitized_art(c: &Config, art: Option<String>) -> Option<String> {
    let mut u = Url::parse(art.as_deref()?).ok()?;
    if !matches!(u.scheme(), "http" | "https") {
        return None;
    }
    if c.kind == "navidrome" && u.path().contains("getCoverArt") {
        return u
            .query_pairs()
            .find(|(k, _)| k == "id")
            .map(|(_, v)| format!("cover:{v}"));
    }
    u.set_username("").ok()?;
    u.set_password(None).ok()?;
    u.set_query(None);
    u.set_fragment(None);
    Some(u.to_string())
}
fn hydrate_art(c: &Config, art: Option<String>) -> Option<String> {
    let art = art?;
    if let Some(id) = art.strip_prefix("cover:") {
        return super::http::indexed_cover(c, id).ok();
    }
    let mut u = Url::parse(&art).ok()?;
    let base = Url::parse(&c.base_url).ok()?;
    if u.origin() == base.origin() {
        match c.kind.as_str() {
            "jellyfin" => {
                u.query_pairs_mut().append_pair("api_key", &c.token);
            }
            "plex" => {
                u.query_pairs_mut().append_pair("X-Plex-Token", &c.token);
            }
            "kodi" => {
                u.set_username(&c.username).ok()?;
                u.set_password(Some(&c.password)).ok()?;
            }
            _ => {}
        }
    }
    Some(u.to_string())
}
fn store_page(
    db: &mut Connection,
    c: &Config,
    generation_id: i64,
    entries: Vec<Entry>,
) -> Result<()> {
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if generation(&tx, &c.id)? != generation_id {
        return Err("Indexing cancelled".into());
    }
    {
        let mut insert=tx.prepare_cached("INSERT INTO entries(source,id,kind,title,artist,album,payload,generation) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source,kind,id) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,payload=excluded.payload,generation=excluded.generation").map_err(db_error)?;
        for mut entry in entries {
            if !["track", "album", "artist", "playlist"].contains(&entry.kind.as_str()) {
                continue;
            }
            entry.art = sanitized_art(c, entry.art);
            let payload = serde_json::to_string(&entry).map_err(|_| "Invalid indexed metadata")?;
            insert
                .execute(params![
                    c.id,
                    entry.id,
                    entry.kind,
                    entry.title,
                    entry.artist,
                    entry.album,
                    payload,
                    generation_id
                ])
                .map_err(db_error)?;
        }
    }
    tx.commit().map_err(db_error)
}
fn finish(db: &mut Connection, id: &str, gen: i64, success: bool) -> Result<()> {
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if generation(&tx, id)? != gen {
        return Ok(());
    }
    if success {
        tx.execute(
            "DELETE FROM entries WHERE source=? AND generation<>?",
            params![id, gen],
        )
        .map_err(db_error)?;
    }
    tx.execute("UPDATE sources SET state=?,updated=?,completed=CASE WHEN ? THEN ? ELSE completed END WHERE id=?",params![if success{"ready"}else{"error"},now(),success,now(),id]).map_err(db_error)?;
    tx.commit().map_err(db_error)
}
fn crawl(path: &str, c: &Config, gen: i64, cancelled: &AtomicBool) -> Result<()> {
    let mut db = open(path)?;
    let roots: Vec<String> = match c.kind.as_str() {
        "upnp" | "plex" => vec![String::new()],
        _ => ["tracks", "albums", "artists", "playlists"]
            .iter()
            .map(|s| s.to_string())
            .collect(),
    };
    let mut queue: VecDeque<(String, usize)> = roots.into_iter().map(|id| (id, 0)).collect();
    let mut visited = HashSet::new();
    let mut failed = false;
    while let Some((id, depth)) = queue.pop_front() {
        if cancelled.load(Ordering::Relaxed) {
            return Err("Indexing cancelled".into());
        }
        if !visited.insert(id.clone()) {
            continue;
        }
        if depth > 128 {
            return Err("Server folder nesting is too deep".into());
        }
        let mut offset = 0;
        loop {
            if cancelled.load(Ordering::Relaxed) {
                return Err("Indexing cancelled".into());
            }
            let page = match if c.kind == "upnp" {
                super::upnp::browse(c, &id, offset, 100)
            } else {
                super::http::browse(c, &id, "", offset, 100)
            } {
                Ok(page) => page,
                Err(_) => {
                    failed = true;
                    break;
                }
            };
            for entry in &page.entries {
                if c.kind == "plex" && id.is_empty() && entry.id.starts_with("section:") {
                    let section = entry.id.trim_start_matches("section:");
                    for child in [
                        format!("tracks:{section}"),
                        format!("artists:{section}"),
                        entry.id.clone(),
                        "playlists:all".into(),
                    ] {
                        queue.push_back((child, depth + 1));
                    }
                } else if (c.kind == "upnp" && entry.kind != "track")
                    || (c.kind == "navidrome" && entry.kind == "album")
                {
                    queue.push_back((entry.id.clone(), depth + 1));
                }
            }
            if cancelled.load(Ordering::Relaxed) {
                return Err("Indexing cancelled".into());
            }
            store_page(&mut db, c, gen, page.entries)?;
            match page.next_offset {
                Some(next) if next > offset => offset = next,
                Some(_) => {
                    failed = true;
                    break;
                }
                None => break,
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    if failed {
        Err("Some folders could not be indexed".into())
    } else {
        Ok(())
    }
}
fn fts_query(query: &str) -> String {
    query
        .chars()
        .take(256)
        .collect::<String>()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|v| !v.is_empty())
        .take(16)
        .map(|v| format!("\"{v}\"*"))
        .collect::<Vec<_>>()
        .join(" AND ")
}
pub fn search(
    path: &str,
    configs: &[Config],
    query: &str,
    kind: &str,
    offset: usize,
) -> Result<Value> {
    let db = open(path)?;
    let query = fts_query(query);
    if query.is_empty() {
        return Ok(json!({"entries":[],"nextOffset":null}));
    }
    let allowed = serde_json::to_string(&configs.iter().map(|c| &c.id).collect::<Vec<_>>())
        .map_err(|_| "Invalid libraries")?;
    let mut statement=db.prepare("SELECT e.source,e.payload FROM search JOIN entries e ON search.rowid=e.rowid WHERE search MATCH ? AND e.source IN (SELECT value FROM json_each(?)) AND (?='' OR e.kind=?) ORDER BY bm25(search,5.0,2.0,1.0),e.source,e.kind,e.id LIMIT 51 OFFSET ?").map_err(db_error)?;
    let rows = statement
        .query_map(params![query, allowed, kind, kind, offset], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    let mut entries = Vec::new();
    for row in rows {
        let (source, payload) = row.map_err(db_error)?;
        if let Some(c) = configs.iter().find(|c| c.id == source) {
            let mut entry: Entry =
                serde_json::from_str(&payload).map_err(|_| "Invalid search metadata")?;
            entry.art = hydrate_art(c, entry.art);
            let mut entry = serde_json::to_value(entry).map_err(|_| "Invalid search metadata")?;
            entry["sourceId"] = json!(source);
            entry["sourceName"] = json!(c.name);
            entry["sourceKind"] = json!(c.kind);
            entries.push(entry);
        }
    }
    let more = entries.len() > 50;
    entries.truncate(50);
    Ok(json!({"entries":entries,"nextOffset":if more{Some(offset+50)}else{None}}))
}
pub fn status(path: &str, configs: &[Config]) -> Result<Value> {
    let db = open(path)?;
    let mut sources = vec![];
    for c in configs {
        let (state, updated, completed) = db
            .query_row(
                "SELECT state,updated,completed FROM sources WHERE id=?",
                [&c.id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(db_error)?
            .unwrap_or(("idle".into(), 0, 0));
        let count: i64 = db
            .query_row(
                "SELECT count(*) FROM entries WHERE source=?",
                [&c.id],
                |r| r.get(0),
            )
            .map_err(db_error)?;
        sources.push(json!({"sourceId":c.id,"name":c.name,"state":state,"updated":updated,"completed":completed,"count":count}));
    }
    Ok(json!({"sources":sources}))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Database(String);
    impl Database {
        fn new() -> Self {
            Self(
                std::env::temp_dir()
                    .join(format!(
                        "rocksky-index-{}-{}.sqlite",
                        std::process::id(),
                        SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_nanos()
                    ))
                    .to_string_lossy()
                    .into_owned(),
            )
        }
    }
    impl Drop for Database {
        fn drop(&mut self) {
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(format!("{}{suffix}", self.0));
            }
        }
    }
    fn config(id: &str) -> Config {
        Config {
            id: id.into(),
            kind: "jellyfin".into(),
            name: id.into(),
            base_url: "https://music.test".into(),
            token: "secret".into(),
            ..Config::default()
        }
    }
    fn entry(id: &str, title: &str) -> Entry {
        Entry {
            id: id.into(),
            title: title.into(),
            kind: "track".into(),
            artist: "Björk".into(),
            album: "Début".into(),
            art: Some("https://music.test/Items/a/Images/Primary?api_key=secret".into()),
            ..Entry::default()
        }
    }
    #[test]
    fn tokio_worker_indexes_all_pages_and_reuses_fresh_index() {
        let (base, worker) = crate::protocol_tests::server(vec![
            r#"{"Items":[{"Id":"1","Name":"First track","Type":"Audio"}],"TotalRecordCount":2}"#,
            r#"{"Items":[{"Id":"2","Name":"Second track","Type":"Audio"}],"TotalRecordCount":2}"#,
            r#"{"Items":[],"TotalRecordCount":0}"#,
            r#"{"Items":[],"TotalRecordCount":0}"#,
            r#"{"Items":[],"TotalRecordCount":0}"#,
        ]);
        let path = Database::new();
        let c = Config {
            base_url: base,
            user_id: "user".into(),
            ..config("worker")
        };
        assert_eq!(
            start(&path.0, c.clone(), false, false).unwrap()["started"],
            true
        );
        for _ in 0..500 {
            if status(&path.0, &[c.clone()]).unwrap()["sources"][0]["state"] == "ready" {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            status(&path.0, &[c.clone()]).unwrap()["sources"][0]["state"],
            "ready"
        );
        assert_eq!(
            search(&path.0, &[c.clone()], "track", "", 0).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            start(&path.0, c.clone(), false, false).unwrap()["started"],
            false
        );
        let requests = worker.join().unwrap();
        assert_eq!(requests.len(), 5);
        assert!(requests[1].contains("StartIndex=1"));
        assert!(start(
            &path.0,
            Config {
                kind: "uploaded".into(),
                ..c
            },
            false,
            false
        )
        .is_err());
    }
    #[test]
    fn fts_is_persistent_accent_insensitive_and_scoped_with_safe_literal_queries() {
        let path = Database::new();
        let c = config("one");
        let other = config("two");
        let mut db = open(&path.0).unwrap();
        let g = begin(&mut db, &c.id, false).unwrap();
        store_page(&mut db, &c, g, vec![entry("song", "Human Behaviour")]).unwrap();
        finish(&mut db, &c.id, g, true).unwrap();
        let g = begin(&mut db, &other.id, false).unwrap();
        store_page(&mut db, &other, g, vec![entry("song", "Hidden title")]).unwrap();
        drop(db);
        let result = search(&path.0, &[c.clone()], "bjork deb hum", "", 0).unwrap();
        assert_eq!(result["entries"][0]["title"], "Human Behaviour");
        assert!(result["entries"][0]["art"]
            .as_str()
            .unwrap()
            .contains("api_key=secret"));
        assert!(
            search(&path.0, &[c.clone()], "Hidden", "", 0).unwrap()["entries"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(
            search(&path.0, &[c.clone()], "Human", "album", 0).unwrap()["entries"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            fts_query("hum\" OR * (NEAR)"),
            "\"hum\"* AND \"OR\"* AND \"NEAR\"*"
        );
        assert!(search(&path.0, &[c], "\"*()", "", 0).unwrap()["entries"]
            .as_array()
            .unwrap()
            .is_empty());
        let db = open(&path.0).unwrap();
        let payload: String = db
            .query_row("SELECT payload FROM entries LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(!payload.contains("secret"));
        assert!(!payload.contains("api_key"));
    }
    #[test]
    fn failed_refresh_preserves_cache_success_prunes_and_cancelled_pages_cannot_resurrect() {
        let path = Database::new();
        let c = config("one");
        let mut db = open(&path.0).unwrap();
        let first = begin(&mut db, &c.id, false).unwrap();
        store_page(&mut db, &c, first, vec![entry("old", "Old song")]).unwrap();
        finish(&mut db, &c.id, first, true).unwrap();
        let second = begin(&mut db, &c.id, false).unwrap();
        store_page(&mut db, &c, second, vec![entry("new", "New song")]).unwrap();
        finish(&mut db, &c.id, second, false).unwrap();
        assert_eq!(
            search(&path.0, &[c.clone()], "song", "", 0).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let third = begin(&mut db, &c.id, false).unwrap();
        store_page(&mut db, &c, third, vec![entry("new", "New song")]).unwrap();
        finish(&mut db, &c.id, third, true).unwrap();
        assert_eq!(
            search(&path.0, &[c.clone()], "song", "", 0).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(store_page(&mut db, &c, second, vec![entry("old", "Old song")]).is_err());
        remove(&path.0, &c.id).unwrap();
        assert!(store_page(&mut db, &c, third, vec![entry("new", "New song")]).is_err());
        assert!(search(&path.0, &[c], "song", "", 0).unwrap()["entries"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    #[test]
    fn index_pages_large_libraries_without_duplicate_results() {
        let path = Database::new();
        let c = config("one");
        let mut db = open(&path.0).unwrap();
        let g = begin(&mut db, &c.id, false).unwrap();
        for batch in 0..20 {
            store_page(
                &mut db,
                &c,
                g,
                (0..100)
                    .map(|i| entry(&format!("{}", batch * 100 + i), "Track"))
                    .collect(),
            )
            .unwrap();
        }
        store_page(&mut db, &c, g, vec![entry("1", "Track")]).unwrap();
        finish(&mut db, &c.id, g, true).unwrap();
        let mut ids = HashSet::new();
        let mut offset = 0;
        loop {
            let page = search(&path.0, &[c.clone()], "tra", "", offset).unwrap();
            for e in page["entries"].as_array().unwrap() {
                assert!(ids.insert(text(e, "id")));
            }
            match page["nextOffset"].as_u64() {
                Some(n) => offset = n as usize,
                None => break,
            }
        }
        assert_eq!(ids.len(), 2000);
        assert_eq!(status(&path.0, &[c]).unwrap()["sources"][0]["count"], 2000);
    }
    #[test]
    fn artwork_tokens_are_rebuilt_only_for_the_current_server() {
        let c = config("one");
        assert_eq!(
            hydrate_art(&c, Some("https://unrelated.test/image".into())).unwrap(),
            "https://unrelated.test/image"
        );
        let kodi = Config {
            kind: "kodi".into(),
            username: "me".into(),
            password: "password".into(),
            base_url: "http://kodi.test".into(),
            ..Config::default()
        };
        let art = sanitized_art(
            &kodi,
            Some("http://me:password@kodi.test/image/a?token=secret".into()),
        );
        assert_eq!(art.as_deref(), Some("http://kodi.test/image/a"));
        assert!(hydrate_art(&kodi, art).unwrap().contains("me:password@"));
    }
}
