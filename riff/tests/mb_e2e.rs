//! End-to-end tests for riff-mb: real routes, real DuckDB, real dump rows.
//!
//! `tests/mb-sample/` is a committed slice of the actual MusicBrainz NDJSON
//! dumps (a few dozen lines per entity, curated to carry an aliased artist,
//! an ISRC'd recording and a credited release group). The suite imports them
//! exactly the way `riff-mb-import` does, serves them exactly the way
//! `riff-mb` does, and asserts on rows discovered from the slice rather than
//! hardcoded, so re-extracting a different slice does not rewrite the suite.

use actix_web::{http::StatusCode, test, web, App};
use duckdb::Connection;
use riff::mb::{self, import};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

fn dumps_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/mb-sample")
}

/// The database is imported once for the whole test binary; tests only read.
fn db_path() -> &'static Path {
    static DB: OnceLock<(tempfile::TempDir, PathBuf)> = OnceLock::new();
    let (_, path) = DB.get_or_init(|| {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("mb.duckdb");
        let conn = Connection::open(&path).expect("open duckdb");
        let report = import::import_all(&conn, &dumps_dir(), None, import::DEFAULT_MAX_OBJECT_SIZE)
            .expect("import");
        assert_eq!(report.len(), mb::ENTITIES.len(), "every entity imports");
        (dir, path)
    });
    path
}

async fn get(uri: &str) -> (StatusCode, Value) {
    let settings = mb::db::Settings {
        db_path: db_path().to_path_buf(),
        pool_size: 4,
        pool_timeout: std::time::Duration::from_secs(5),
        writable: false,
    };
    let (catalog, _) = mb::db::open(&settings).expect("open catalog");
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(mb::routes::configure),
    )
    .await;
    let req = test::TestRequest::get().uri(uri).to_request();
    let res = test::call_service(&app, req).await;
    let status = res.status();
    let body = test::read_body(res).await;
    let json = serde_json::from_slice(&body).unwrap_or(Value::Null);
    (status, json)
}

/// First line of an entity's sample file, parsed.
fn sample(entity: &str) -> Value {
    let file = dumps_dir().join(format!("{entity}.jsonl"));
    let line = std::fs::read_to_string(file)
        .expect("sample file")
        .lines()
        .next()
        .expect("non-empty sample")
        .to_string();
    serde_json::from_str(&line).expect("valid json")
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[actix_web::test]
async fn lookup_every_entity_roundtrips_the_document() {
    for entity in mb::ENTITIES {
        let doc = sample(entity.path);
        let id = doc["id"].as_str().unwrap();
        let (status, body) = get(&format!("/ws/2/{}/{id}", entity.path)).await;
        assert_eq!(status, StatusCode::OK, "{} lookup", entity.path);
        // The stored document is returned verbatim — not reshaped, not pruned.
        assert_eq!(body, doc, "{} lookup returns the dump line", entity.path);
    }
}

#[actix_web::test]
async fn lookup_unknown_mbid_is_a_musicbrainz_shaped_404() {
    let (status, body) = get("/ws/2/artist/00000000-0000-0000-0000-000000000000").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "Not Found");
    assert!(body["help"].as_str().unwrap().contains("musicbrainz.org"));
}

#[actix_web::test]
async fn lookup_unknown_entity_404s() {
    let (status, _) = get("/ws/2/nonsense/00000000-0000-0000-0000-000000000000").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn search_matches_the_scrobbler_query_shape() {
    let doc = sample("recording");
    let title = doc["title"].as_str().unwrap();
    let artist = doc["artist-credit"][0]["name"].as_str().unwrap();
    let query = format!(r#"recording:"{title}" AND artist:"{artist}" AND status:Official"#);

    let (status, body) = get(&format!(
        "/ws/2/recording?query={}&fmt=json&inc=artists+releases+isrcs",
        urlencode(&query)
    ))
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["count"].as_u64().unwrap() >= 1);
    assert!(body["created"].as_str().unwrap().ends_with('Z'));
    let hit = body["recordings"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == doc["id"])
        .expect("sampled recording is found");
    assert_eq!(hit["score"], 100);
    assert_eq!(hit["title"], doc["title"]);
    assert!(hit["artist-credit"].is_array(), "credits ride along");
}

#[actix_web::test]
async fn search_is_case_insensitive() {
    let doc = sample("artist");
    let name = doc["name"].as_str().unwrap().to_uppercase();
    let (status, body) = get(&format!("/ws/2/artist?query={}", urlencode(&name))).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body["artists"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["id"] == doc["id"]),
        "uppercased bare query still matches"
    );
}

#[actix_web::test]
async fn search_finds_artists_through_aliases() {
    let (doc, alias) = mb_first_artist_with_alias();
    let (status, body) = get(&format!(
        "/ws/2/artist?query={}",
        urlencode(&format!(r#"artist:"{alias}""#))
    ))
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body["artists"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["id"] == doc["id"]),
        "alias {alias:?} finds its artist"
    );
}

fn mb_first_artist_with_alias() -> (Value, String) {
    let file = dumps_dir().join("artist.jsonl");
    for line in std::fs::read_to_string(file).unwrap().lines() {
        let doc: Value = serde_json::from_str(line).unwrap();
        if let Some(alias) = doc["aliases"][0]["name"].as_str() {
            if !alias.contains('"') {
                let alias = alias.to_string();
                return (doc, alias);
            }
        }
    }
    panic!("sample has no aliased artist");
}

#[actix_web::test]
async fn isrc_search_and_lookup_agree() {
    let (recording, isrc) = {
        let file = dumps_dir().join("recording.jsonl");
        std::fs::read_to_string(file)
            .unwrap()
            .lines()
            .find_map(|line| {
                let doc: Value = serde_json::from_str(line).unwrap();
                let isrc = doc["isrcs"][0].as_str()?.to_string();
                Some((doc, isrc))
            })
            .expect("sample has a recording with an ISRC")
    };

    let (status, body) = get(&format!("/ws/2/isrc/{}", isrc.to_lowercase())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["isrc"], isrc.to_uppercase());
    assert!(body["recordings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == recording["id"]));

    let (status, body) = get(&format!("/ws/2/recording?query=isrc:{isrc}")).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["recordings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == recording["id"]));
}

#[actix_web::test]
async fn browse_release_groups_by_artist() {
    let doc = sample("release-group");
    let artist_id = doc["artist-credit"][0]["artist"]["id"].as_str().unwrap();
    let (status, body) = get(&format!("/ws/2/release-group?artist={artist_id}&limit=100")).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["release-group-count"].as_u64().unwrap() >= 1);
    assert_eq!(body["release-group-offset"], 0);
    assert!(
        body["release-groups"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["id"] == doc["id"]),
        "sampled release group is in its artist's browse"
    );
}

#[actix_web::test]
async fn paging_clamps_and_offsets() {
    let doc = sample("release-group");
    let artist_id = doc["artist-credit"][0]["artist"]["id"].as_str().unwrap();
    let (_, first) = get(&format!("/ws/2/release-group?artist={artist_id}&limit=1")).await;
    let total = first["release-group-count"].as_u64().unwrap();
    assert_eq!(first["release-groups"].as_array().unwrap().len(), 1);
    if total > 1 {
        let (_, second) = get(&format!(
            "/ws/2/release-group?artist={artist_id}&limit=1&offset=1"
        ))
        .await;
        assert_ne!(
            first["release-groups"][0]["id"], second["release-groups"][0]["id"],
            "offset pages"
        );
    }
}

#[actix_web::test]
async fn collection_without_query_or_artist_is_a_400() {
    let (status, body) = get("/ws/2/recording").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("query"));
}

#[actix_web::test]
async fn reimporting_an_entity_is_idempotent() {
    // A fresh database imported twice ends with the same rows, not doubles —
    // this is what lets the server-side import be resumed after a failure.
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("mb.duckdb");
    let conn = Connection::open(&path).expect("open duckdb");
    let spec = mb::entity("recording").unwrap();
    let file = import::dump_file(&dumps_dir(), spec).expect("sample dump");

    import::create_shared_tables(&conn).unwrap();
    let size = import::DEFAULT_MAX_OBJECT_SIZE;
    let first = import::import_entity(&conn, spec, &file, size).unwrap();
    let second = import::import_entity(&conn, spec, &file, size).unwrap();
    assert_eq!(first, second);

    let isrcs: u64 = conn
        .query_row(
            "SELECT count(DISTINCT recording_id) FROM mb_recording_isrc",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let with_isrcs: u64 = conn
        .query_row(
            "SELECT count(*) FROM mb_recording WHERE len(json_extract_string(data, '$.isrcs[*]')) > 0",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(isrcs, with_isrcs, "isrc side table matches the documents");
}
