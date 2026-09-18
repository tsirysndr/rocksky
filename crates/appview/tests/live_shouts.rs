//! The shout and follow projections, against real records from the network.
//!
//! Gated on `ROCKSKY_LIVE_SHOUTS`, because it reads from somebody else's PDS:
//!
//! ```sh
//! ROCKSKY_LIVE_SHOUTS=1 cargo test -p rocksky-appview --test live_shouts
//! ```
//!
//! What this checks that the unit tests cannot is the *record shape*. The unit
//! tests use records written to match the lexicon; these are the records that
//! actually exist, which is where the surprise was — every profile shout in
//! the wild names its own author's `app.bsky.actor.profile/self` as the
//! subject, so a shout on someone else's profile cannot be placed from the
//! record alone.
//!
//! Playlists are covered here too, for the same reason.

use rocksky_appview::db::schema::{Follows, Shouts};
use rocksky_appview::ingest::{self, IncomingRecord};
use rocksky_appview::sea_query::{Expr, Func, Query};

/// An account with a useful spread of shouts: on songs, albums, artists,
/// scrobbles and profiles, including replies.
const REPO: &str = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

fn enabled() -> bool {
    std::env::var("ROCKSKY_LIVE_SHOUTS").is_ok_and(|v| !v.is_empty())
}

async fn records(http: &reqwest::Client, collection: &str) -> Vec<(String, serde_json::Value)> {
    let pds = rocksky_appview::atproto::resolve_pds(http, "https://plc.directory", REPO)
        .await
        .expect("the DID resolves");

    let response: serde_json::Value = http
        .get(format!("{pds}/xrpc/com.atproto.repo.listRecords"))
        .query(&[("repo", REPO), ("collection", collection), ("limit", "100")])
        .send()
        .await
        .expect("listRecords")
        .json()
        .await
        .expect("JSON");

    response["records"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|record| {
            let uri = record["uri"].as_str()?.to_string();
            Some((uri, record["value"].clone()))
        })
        .collect()
}

fn incoming(uri: &str, collection: &str, value: serde_json::Value) -> IncomingRecord {
    // `at://<did>/<collection>/<rkey>`
    let rkey = uri.rsplit('/').next().unwrap_or_default().to_string();
    let did = uri
        .strip_prefix("at://")
        .and_then(|rest| rest.split('/').next())
        .unwrap_or_default()
        .to_string();
    IncomingRecord {
        did,
        collection: collection.to_string(),
        rkey,
        value,
    }
}

#[tokio::test]
async fn real_shout_records_are_projected() {
    if !enabled() {
        return;
    }

    let http = reqwest::Client::new();
    let db = rocksky_appview::db::connect_in_memory().await.unwrap();

    let shouts = records(&http, ingest::SHOUT_NSID).await;
    assert!(!shouts.is_empty(), "the test repo has shouts");

    let mut stats = ingest::IngestStats::default();
    for (uri, value) in &shouts {
        stats.merge(
            ingest::ingest(&db, &incoming(uri, ingest::SHOUT_NSID, value.clone()))
                .await
                .unwrap(),
        );
    }

    eprintln!(
        "{} shout records -> {} stored, {} skipped",
        shouts.len(),
        stats.shouts,
        stats.skipped
    );

    // Every one of them is a shout, so none may be skipped: a skipped record
    // is a comment silently lost.
    assert_eq!(
        stats.shouts as usize,
        shouts.len(),
        "some real shout records were not projected"
    );

    let stored = db
        .count(
            &Query::select()
                .expr(db.cast_int(Func::count(Expr::col(Shouts::XataId))))
                .from(Shouts::Table)
                .to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(stored as usize, shouts.len());

    // Replies are linked. The subjects are not in this database — no
    // scrobbles were ingested — so `parent_id` is the one link that can
    // resolve here, and the test repo contains replies.
    let replies = db
        .count(
            &Query::select()
                .expr(db.cast_int(Func::count(Expr::col(Shouts::XataId))))
                .from(Shouts::Table)
                .and_where(Expr::col(Shouts::ParentId).is_not_null())
                .to_owned(),
        )
        .await
        .unwrap();
    eprintln!("{replies} of them are replies with a resolved parent");
}

#[tokio::test]
async fn real_follow_records_are_projected() {
    if !enabled() {
        return;
    }

    let http = reqwest::Client::new();
    let db = rocksky_appview::db::connect_in_memory().await.unwrap();

    let follows = records(&http, ingest::FOLLOW_NSID).await;
    if follows.is_empty() {
        eprintln!("skipping: the test repo has no follow records");
        return;
    }

    let mut stats = ingest::IngestStats::default();
    for (uri, value) in &follows {
        stats.merge(
            ingest::ingest(&db, &incoming(uri, ingest::FOLLOW_NSID, value.clone()))
                .await
                .unwrap(),
        );
    }

    eprintln!(
        "{} follow records -> {} stored, {} skipped",
        follows.len(),
        stats.follows,
        stats.skipped
    );
    assert!(stats.follows > 0, "no real follow record was projected");

    let rows = db
        .count(
            &Query::select()
                .expr(db.cast_int(Func::count(Expr::col(Follows::XataId))))
                .from(Follows::Table)
                .to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(rows, stats.follows as i64);
}

#[tokio::test]
async fn real_playlist_records_are_projected() {
    if !enabled() {
        return;
    }

    let http = reqwest::Client::new();
    let db = rocksky_appview::db::connect_in_memory().await.unwrap();

    let playlists = records(&http, ingest::PLAYLIST_NSID).await;
    assert!(!playlists.is_empty(), "the test repo has playlists");

    let mut stats = ingest::IngestStats::default();
    for (uri, value) in &playlists {
        stats.merge(
            ingest::ingest(&db, &incoming(uri, ingest::PLAYLIST_NSID, value.clone()))
                .await
                .unwrap(),
        );
    }
    eprintln!(
        "{} playlist records -> {} stored, {} skipped",
        playlists.len(),
        stats.playlists,
        stats.skipped
    );
    assert_eq!(
        stats.playlists as usize,
        playlists.len(),
        "a real playlist record was not projected"
    );

    // Then the entries, which is where the ownership rule and the
    // track-from-metadata path are exercised against real records.
    let entries = records(&http, ingest::PLAYLIST_SONG_NSID).await;
    assert!(!entries.is_empty(), "the test repo has playlist entries");

    let mut entry_stats = ingest::IngestStats::default();
    for (uri, value) in &entries {
        entry_stats.merge(
            ingest::ingest(
                &db,
                &incoming(uri, ingest::PLAYLIST_SONG_NSID, value.clone()),
            )
            .await
            .unwrap(),
        );
    }
    eprintln!(
        "{} entry records -> {} stored, {} skipped",
        entries.len(),
        entry_stats.playlist_songs,
        entry_stats.skipped
    );

    // Not all of them will land: only the 100 most recent playlists were
    // fetched, so an entry for an older one has nothing to attach to. What
    // matters is that the ones that can attach do, and that each stored entry
    // brought its track with it.
    assert!(
        entry_stats.playlist_songs > 0,
        "no real playlist entry was projected"
    );

    let tracks = db
        .count(
            &Query::select()
                .expr(db.cast_int(Func::count(Expr::col(
                    rocksky_appview::db::schema::Tracks::XataId,
                ))))
                .from(rocksky_appview::db::schema::Tracks::Table)
                .to_owned(),
        )
        .await
        .unwrap();
    assert!(
        tracks >= entry_stats.playlist_songs as i64,
        "each stored entry has to have created its track: {tracks} tracks for \
         {} entries",
        entry_stats.playlist_songs
    );
}
