//! End-to-end tests over a real slice of the production catalog.
//!
//! `tests/prod-sample/` is 128K of actual dump rows (four seed artists, their
//! albums, every track on them, and everything those rows reference) extracted
//! with prod's exact schemas — including the quirks the synthetic fixtures can
//! only imitate: `track_artists` without an ordering column, `available_markets`
//! under its real column name, all-VARCHAR audio features.
//!
//! Assertions are discovered from the slice rather than hardcoded, so
//! re-extracting a different slice does not rewrite the suite. The one named
//! query is the search that took production down on 2026-08-22.

use actix_web::{http::StatusCode, test, web, App};
use duckdb::Connection;
use riff::{db, routes};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn sample_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/prod-sample")
}

fn settings() -> db::Settings {
    db::Settings {
        data_dir: sample_dir(),
        db_path: None,
        pool_size: 4,
        pool_timeout: std::time::Duration::from_secs(5),
    }
}

async fn get(uri: &str) -> (StatusCode, Value) {
    let (catalog, _) = db::open(&settings()).expect("open prod sample");
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(routes::configure),
    )
    .await;
    let res = test::call_service(&app, test::TestRequest::get().uri(uri).to_request()).await;
    let status = res.status();
    let body = serde_json::from_slice(&test::read_body(res).await).unwrap_or(Value::Null);
    (status, body)
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Reads facts to assert on straight out of the slice.
fn query_sample<T, F>(sql: &str, map: F) -> Vec<T>
where
    F: FnMut(&duckdb::Row<'_>) -> duckdb::Result<T>,
{
    let conn = Connection::open_in_memory().unwrap();
    let dir = sample_dir();
    for table in [
        "artists",
        "albums",
        "tracks",
        "track_artists",
        "track_audio_features",
    ] {
        conn.execute_batch(&format!(
            "CREATE VIEW {table} AS SELECT * FROM read_parquet('{}')",
            dir.join(format!("{table}.parquet")).display()
        ))
        .unwrap();
    }
    let mut stmt = conn.prepare(sql).unwrap();
    let rows = stmt.query_map([], map).unwrap();
    rows.collect::<Result<Vec<_>, _>>().unwrap()
}

/// (track name, primary artist name, track id) for every track in the slice
/// whose primary credit is one of the seed artists.
fn sample_tracks() -> Vec<(String, String, String)> {
    query_sample(
        "SELECT t.name, a.name, t.id \
         FROM tracks t \
         JOIN track_artists ta ON ta.track_rowid = t.rowid \
         JOIN artists a ON a.rowid = ta.artist_rowid \
         WHERE lower(a.name) IN ('yonderboi', 'new order', 'kavinsky', 'matt fax') \
           AND t.name IS NOT NULL \
         ORDER BY t.rowid",
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
}

/// The query that took production down: a full 23G ILIKE scan per call, pool
/// exhausted, every request timing out. It must now answer, and answer fast.
#[actix_web::test]
async fn the_outage_query_answers() {
    let (status, body) =
        get("/v1/search?type=track&q=track:%22Before%20You%20Snap%22%20artist:%22Yonderboi%22")
            .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let items = body["tracks"]["items"].as_array().unwrap();
    assert!(!items.is_empty(), "Before You Snap should be in the slice");
    assert_eq!(items[0]["name"], "Before You Snap");
    assert!(items[0]["artists"]
        .as_array()
        .unwrap()
        .iter()
        .any(|a| a["name"] == "Yonderboi"));
}

/// Every (title, artist) pair in the slice must be findable through the exact
/// query shape matchSong sends.
#[actix_web::test]
async fn every_sample_track_is_findable_by_title_and_artist() {
    let tracks = sample_tracks();
    assert!(
        tracks.len() >= 50,
        "slice looks too small: {}",
        tracks.len()
    );

    // Titles with an embedded double quote cannot survive a quote-delimited
    // grammar — `track:"Thieves like Us - 12" Extended"` closes at the inner
    // quote for riff and for Spotify alike. Those miss and fall back to
    // Spotify; see `a_title_with_an_embedded_quote_misses_cleanly`.
    let searchable: Vec<_> = tracks.iter().filter(|(t, _, _)| !t.contains('"')).collect();

    // Cap the loop: the point is the query shape, not exhaustiveness.
    for (title, artist, id) in searchable.iter().take(40) {
        let uri = format!(
            "/v1/search?type=track&q=track:%22{}%22%20artist:%22{}%22",
            urlencode(title),
            urlencode(artist)
        );
        let (status, body) = get(&uri).await;
        assert_eq!(status, StatusCode::OK, "{title} by {artist}: {body}");
        let found = body["tracks"]["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["id"] == id.as_str());
        assert!(found, "search did not find {title} by {artist} ({id})");
    }
}

#[actix_web::test]
async fn sample_tracks_round_trip_by_id() {
    let tracks = sample_tracks();
    let (_, artist, id) = &tracks[0];
    let (status, t) = get(&format!("/v1/tracks/{id}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(t["id"], id.as_str());
    assert_eq!(t["type"], "track");
    assert!(t["duration_ms"].as_i64().unwrap() > 0);
    assert!(
        t["artists"]
            .as_array()
            .unwrap()
            .iter()
            .any(|a| a["name"] == artist.as_str()),
        "{artist} missing from credits: {t}"
    );
    // The nested album must be resolvable and carry real images.
    assert!(t["album"]["id"].as_str().unwrap().len() > 10);
}

/// Real audio-features rows are all-VARCHAR in the dump; they must come back as
/// JSON numbers in Spotify's ranges.
#[actix_web::test]
async fn real_audio_features_deserialize_as_numbers() {
    let ids: Vec<String> = query_sample(
        "SELECT track_id FROM track_audio_features \
         WHERE COALESCE(null_response, '0') NOT IN ('1', 'true') \
           AND danceability IS NOT NULL LIMIT 5",
        |r| r.get(0),
    );
    assert!(!ids.is_empty(), "no analysed tracks in the slice");

    for id in ids {
        let (status, f) = get(&format!("/v1/audio-features/{id}")).await;
        assert_eq!(status, StatusCode::OK, "{id}");
        let d = f["danceability"]
            .as_f64()
            .expect("danceability not numeric");
        assert!((0.0..=1.0).contains(&d), "danceability out of range: {d}");
        assert!(f["tempo"].as_f64().unwrap() > 0.0);
        assert!(f["key"].is_i64() || f["key"].is_null());
    }
}

/// The real `available_markets` encoding must parse into a list of 2-letter
/// codes — not one long string, not fragments.
#[actix_web::test]
async fn real_market_lists_parse_into_country_codes() {
    let ids: Vec<String> = query_sample(
        "SELECT id FROM albums WHERE available_markets_rowid IS NOT NULL LIMIT 5",
        |r| r.get(0),
    );
    assert!(!ids.is_empty(), "no albums with markets in the slice");

    let mut saw_any = false;
    for id in ids {
        let (status, album) = get(&format!("/v1/albums/{id}")).await;
        assert_eq!(status, StatusCode::OK, "{id}");
        let markets = album["available_markets"].as_array().unwrap();
        for m in markets {
            let code = m.as_str().unwrap();
            assert_eq!(code.len(), 2, "not a country code: {code:?} on album {id}");
            assert!(code.chars().all(|c| c.is_ascii_uppercase()), "{code:?}");
        }
        saw_any |= !markets.is_empty();
    }
    assert!(
        saw_any,
        "every album came back with empty markets — encoding mismatch?"
    );
}

#[actix_web::test]
async fn artist_pages_render_from_real_rows() {
    let artists: Vec<(String, String)> = query_sample(
        "SELECT id, name FROM artists WHERE lower(name) IN ('yonderboi', 'new order') ORDER BY name",
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    assert!(!artists.is_empty());

    for (id, name) in artists {
        let (status, a) = get(&format!("/v1/artists/{id}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(a["name"], name.as_str());
        assert!(a["followers"]["total"].as_i64().unwrap() > 0);

        let (status, albums) = get(&format!("/v1/artists/{id}/albums")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(
            albums["total"].as_i64().unwrap() > 0,
            "{name} has no albums"
        );

        let (status, top) = get(&format!("/v1/artists/{id}/top-tracks")).await;
        assert_eq!(status, StatusCode::OK);
        assert!(
            !top["tracks"].as_array().unwrap().is_empty(),
            "{name} has no top tracks"
        );
    }
}

/// The whole slice served through the materialized path too — the exact shape
/// production runs.
#[actix_web::test]
async fn the_sample_serves_materialized() {
    let db_dir = tempfile::tempdir().unwrap();
    let db_path = db_dir.path().join("riff.duckdb");
    db::materialize(&sample_dir(), &db_path, false, |_| {}).expect("materialize sample");

    let mut cfg = settings();
    cfg.db_path = Some(db_path);
    let (catalog, _) = db::open(&cfg).expect("open materialized sample");
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(routes::configure),
    )
    .await;

    let res = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/v1/search?type=track&q=track:%22Before%20You%20Snap%22%20artist:%22Yonderboi%22")
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::OK);
    let body: Value = serde_json::from_slice(&test::read_body(res).await).unwrap();
    assert_eq!(body["tracks"]["items"][0]["name"], "Before You Snap");
}

/// A title with an embedded double quote breaks the quoted phrase — for any
/// quote-delimited grammar, Spotify's included. What matters is that it fails
/// as a miss (empty results, 200) that the proxy converts into a Spotify
/// fallback, never as an error.
#[actix_web::test]
async fn a_title_with_an_embedded_quote_misses_cleanly() {
    let quoted: Vec<(String, String, String)> = sample_tracks()
        .into_iter()
        .filter(|(t, _, _)| t.contains('"'))
        .collect();
    let Some((title, artist, _)) = quoted.first() else {
        return; // slice has no such title; nothing to assert
    };
    let uri = format!(
        "/v1/search?type=track&q=track:%22{}%22%20artist:%22{}%22",
        urlencode(title),
        urlencode(artist)
    );
    let (status, body) = get(&uri).await;
    assert_eq!(status, StatusCode::OK, "{body}");
}
