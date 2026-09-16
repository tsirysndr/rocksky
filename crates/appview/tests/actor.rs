//! `app.rocksky.actor.*` over a database built from a real repository.
//!
//! The fixtures are the `oops.wtf` records served by `rocksky-mock-pds`, run
//! through backfill first. So these assert against a catalogue derived from
//! genuine scrobbles rather than rows written by hand to match the
//! assertions — which is the difference between testing the handlers and
//! testing my idea of the handlers.

use actix_web::{web, App};
use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use rocksky_mock_pds::MockPds;

/// An instance whose database holds one real backfilled repository.
async fn seeded() -> (AppState, MockPds) {
    let pds = MockPds::with_production_data().await;

    let mut config = Config::for_test();
    config.plc_directory_url = pds.url().to_string();
    config.bsky_appview_url = pds.url().to_string();
    let state = AppState::for_test_with(config).await.expect("state");

    rocksky_appview::backfill::backfill_repo(&state, &pds.did())
        .await
        .expect("backfill the fixture repo");

    (state, pds)
}

macro_rules! app {
    ($state:expr) => {
        actix_web::test::init_service(
            App::new()
                .app_data($state.clone())
                .app_data(web::Data::new($state.clone()))
                .configure(rocksky_appview::xrpc::configure),
        )
        .await
    };
}

async fn get(state: &AppState, uri: &str) -> serde_json::Value {
    let app = app!(state);
    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get().uri(uri).to_request(),
    )
    .await;
    assert_eq!(res.status(), 200, "{uri}");
    actix_web::test::read_body_json(res).await
}

#[actix_web::test]
async fn a_profile_reports_the_totals_the_header_shows() {
    let (state, pds) = seeded().await;
    let did = pds.did();

    let profile = get(
        &state,
        &format!("/xrpc/app.rocksky.actor.getProfile?did={did}"),
    )
    .await;

    assert_eq!(profile["did"], did);
    assert_eq!(profile["handle"], pds.handle());
    assert!(profile["id"].as_str().is_some());

    // The scrobble count must agree with the rows backfill wrote, not be a
    // number the handler made up.
    let db = state.db();
    let scrobbles = db
        .count(&db.sql("SELECT count(*) FROM scrobbles"))
        .await
        .unwrap();
    assert_eq!(profile["scrobblesCount"], scrobbles);
    assert!(scrobbles > 0, "the fixture has scrobbles");

    // And the catalogue counts are present and consistent.
    for field in ["artistsCount", "albumsCount", "tracksCount"] {
        assert!(
            profile[field].as_i64().is_some(),
            "{field} missing: {profile}"
        );
    }
    assert_eq!(profile["isBot"], false);
}

/// A handle must work everywhere a DID does — the UI passes whichever it has.
#[actix_web::test]
async fn an_actor_can_be_named_by_handle() {
    let (state, pds) = seeded().await;

    let by_did = get(
        &state,
        &format!("/xrpc/app.rocksky.actor.getProfile?did={}", pds.did()),
    )
    .await;
    let by_handle = get(
        &state,
        &format!("/xrpc/app.rocksky.actor.getProfile?did={}", pds.handle()),
    )
    .await;

    assert_eq!(by_did, by_handle);
}

#[actix_web::test]
async fn an_unknown_actor_is_an_empty_answer_not_an_error() {
    let (state, _pds) = seeded().await;

    // A profile answers `{}`, which is what the live API does.
    let profile = get(
        &state,
        "/xrpc/app.rocksky.actor.getProfile?did=did:plc:nobodyhere",
    )
    .await;
    assert_eq!(profile, serde_json::json!({}));

    // The lists answer their empty envelope, keyed as the lexicon names them.
    for (method, key) in [
        ("getActorScrobbles", "scrobbles"),
        ("getActorSongs", "tracks"),
        ("getActorAlbums", "albums"),
        ("getActorArtists", "artists"),
        ("getActorLovedSongs", "tracks"),
    ] {
        let body = get(
            &state,
            &format!("/xrpc/app.rocksky.actor.{method}?did=did:plc:nobodyhere"),
        )
        .await;
        assert_eq!(
            body[key],
            serde_json::json!([]),
            "{method} should answer an empty {key}"
        );
    }
}

/// A missing `did` must not 400 — the UI sometimes renders before it has one.
#[actix_web::test]
async fn a_missing_did_answers_empty() {
    let (state, _pds) = seeded().await;

    let body = get(&state, "/xrpc/app.rocksky.actor.getActorSongs").await;
    assert_eq!(body["tracks"], serde_json::json!([]));
}

#[actix_web::test]
async fn a_feed_carries_the_fields_the_ui_renders() {
    let (state, pds) = seeded().await;

    let body = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorScrobbles?did={}&limit=5",
            pds.did()
        ),
    )
    .await;

    let scrobbles = body["scrobbles"].as_array().expect("an array");
    assert!(!scrobbles.is_empty(), "the fixture repo has scrobbles");
    assert!(scrobbles.len() <= 5, "the limit is respected");

    let first = &scrobbles[0];
    // The compact row, field for field against the live response. `trackUri`
    // and `albumUri` may be null for a track this instance has not seen
    // published, so their presence is what is asserted, not their value.
    for field in [
        "id",
        "uri",
        "title",
        "artist",
        "album",
        "albumArtist",
        "did",
        "handle",
        "createdAt",
    ] {
        assert!(
            !first[field].is_null(),
            "{field} is null in a feed row: {first}"
        );
    }
    for field in ["trackId", "trackUri", "albumUri", "artistUri", "albumArt"] {
        assert!(
            first.get(field).is_some(),
            "{field} is absent from a feed row: {first}"
        );
    }
    assert_eq!(first["did"], pds.did());
    assert_eq!(first["liked"], false, "nobody has liked it in this test");

    // The global feed's fields must *not* leak in: that view is 36 fields to
    // this one's 16, and a profile page reading `user` instead of `handle`
    // would render blank.
    for field in [
        "user",
        "userAvatar",
        "cover",
        "date",
        "lyrics",
        "likesCount",
    ] {
        assert!(
            first.get(field).is_none(),
            "{field} belongs to the global feed, not the actor feed: {first}"
        );
    }

    // Newest first.
    let dates: Vec<&str> = scrobbles
        .iter()
        .filter_map(|s| s["createdAt"].as_str())
        .collect();
    let mut sorted = dates.clone();
    sorted.sort_by(|a, b| b.cmp(a));
    assert_eq!(dates, sorted, "a feed is newest first");
}

/// Top-songs is ranked by this actor's play count, and the counts must be the
/// real ones.
#[actix_web::test]
async fn top_songs_are_ranked_by_play_count() {
    let (state, pds) = seeded().await;

    let body = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorSongs?did={}&limit=20",
            pds.did()
        ),
    )
    .await;

    let tracks = body["tracks"].as_array().expect("an array");
    assert!(!tracks.is_empty(), "the fixture implies tracks");

    let counts: Vec<i64> = tracks
        .iter()
        .map(|t| t["playCount"].as_i64().expect("a playCount"))
        .collect();

    let mut descending = counts.clone();
    descending.sort_by(|a, b| b.cmp(a));
    assert_eq!(counts, descending, "ranked by plays, descending");
    assert!(counts.iter().all(|count| *count > 0), "{counts:?}");

    // The top entry's count must match the scrobbles actually recorded for it.
    let db = state.db();
    let top_id = tracks[0]["id"].as_str().expect("an id");
    let mut sql = db.sql("SELECT count(*) FROM scrobbles WHERE track_id = ");
    sql.bind(top_id);
    assert_eq!(
        counts[0],
        db.count(&sql).await.unwrap(),
        "playCount disagrees with the scrobbles table"
    );

    // And the view carries what the list renders.
    for field in ["title", "artist", "album", "duration", "sha256"] {
        assert!(
            !tracks[0][field].is_null(),
            "{field} missing: {}",
            tracks[0]
        );
    }
    assert!(tracks[0]["uniqueListeners"].as_i64().is_some());
}

#[actix_web::test]
async fn top_albums_and_artists_are_ranked_the_same_way() {
    let (state, pds) = seeded().await;
    let did = pds.did();

    for (method, key) in [("getActorAlbums", "albums"), ("getActorArtists", "artists")] {
        let body = get(
            &state,
            &format!("/xrpc/app.rocksky.actor.{method}?did={did}&limit=20"),
        )
        .await;

        let items = body[key].as_array().unwrap_or_else(|| panic!("{method}"));
        assert!(!items.is_empty(), "{method} answered nothing");

        let counts: Vec<i64> = items
            .iter()
            .map(|item| item["playCount"].as_i64().expect("a playCount"))
            .collect();
        let mut descending = counts.clone();
        descending.sort_by(|a, b| b.cmp(a));
        assert_eq!(counts, descending, "{method} is not ranked by plays");
    }
}

/// An actor's own play count is not the same number as how many people played
/// it — the profile shows both, so they must not be conflated.
#[actix_web::test]
async fn play_count_and_unique_listeners_are_different_numbers() {
    let (state, pds) = seeded().await;

    let body = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorSongs?did={}&limit=20",
            pds.did()
        ),
    )
    .await;

    let tracks = body["tracks"].as_array().unwrap();
    // Only one account is indexed here, so every listener count is 1 while
    // play counts vary — which is exactly the case where conflating the two
    // would go unnoticed against a multi-user database.
    for track in tracks {
        assert_eq!(
            track["uniqueListeners"], 1,
            "one indexed account means one listener: {track}"
        );
    }
    assert!(
        tracks.iter().any(|t| t["playCount"].as_i64() != Some(1)),
        "no track was played more than once, so the test proves nothing"
    );
}

/// Paging must not repeat or skip an entry, which is what an unstable tie
/// break causes.
#[actix_web::test]
async fn paging_top_songs_covers_each_track_once() {
    let (state, pds) = seeded().await;
    let did = pds.did();

    let mut seen = Vec::new();
    for offset in (0..20).step_by(5) {
        let body = get(
            &state,
            &format!("/xrpc/app.rocksky.actor.getActorSongs?did={did}&limit=5&offset={offset}"),
        )
        .await;
        for track in body["tracks"].as_array().unwrap() {
            seen.push(track["id"].as_str().unwrap().to_string());
        }
    }

    let unique: std::collections::HashSet<_> = seen.iter().collect();
    assert_eq!(
        unique.len(),
        seen.len(),
        "a track appeared on two pages: ties are not broken deterministically"
    );
}

/// A date window narrows the ranking. The fixture's scrobbles are all in the
/// past, so a future window must be empty rather than ignored.
#[actix_web::test]
async fn a_date_window_narrows_the_ranking() {
    let (state, pds) = seeded().await;
    let did = pds.did();

    let all = get(
        &state,
        &format!("/xrpc/app.rocksky.actor.getActorSongs?did={did}&limit=50"),
    )
    .await;
    assert!(!all["tracks"].as_array().unwrap().is_empty());

    let future = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorSongs?did={did}&startDate=2099-01-01T00:00:00.000Z"
        ),
    )
    .await;
    assert_eq!(
        future["tracks"],
        serde_json::json!([]),
        "a window after every scrobble must exclude them all"
    );
}

/// Loved songs answer the full track view, not the compact one — the page
/// shows a detail row per track.
#[actix_web::test]
async fn loved_songs_carry_the_detailed_track_view() {
    let (state, pds) = seeded().await;
    let db = state.db();

    // The fixture's likes reference tracks by URI; like one that exists so the
    // join has something to return.
    let track_id: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM tracks LIMIT 1"))
        .await
        .unwrap()
        .expect("the backfill produced tracks");
    let user_id: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users LIMIT 1"))
        .await
        .unwrap()
        .expect("the backfill indexed the account");

    let mut insert = db.sql("INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES (");
    insert
        .bind(rocksky_appview::db::new_id())
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(&track_id)
        .push(")");
    db.execute(&insert).await.expect("record a like");

    let body = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorLovedSongs?did={}",
            pds.did()
        ),
    )
    .await;

    let tracks = body["tracks"].as_array().expect("an array");
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0]["id"], track_id);

    // The detail fields the compact view omits. They may be null — the point
    // is that the key is present, because the UI reads it.
    for field in [
        "lyrics",
        "isrc",
        "mbId",
        "bpm",
        "key",
        "genre",
        "label",
        "spotifyLink",
        "updatedAt",
        "xataVersion",
    ] {
        assert!(
            tracks[0].get(field).is_some(),
            "{field} is absent from the detailed view: {}",
            tracks[0]
        );
    }
}

/// The limit these methods default to is 10, not the 20 the rest of the API
/// uses — a profile page asks for ten of everything.
#[actix_web::test]
async fn the_default_limit_is_ten() {
    let (state, pds) = seeded().await;

    // Enough scrobbles to exceed ten, so a default of 20 would show.
    let body = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.actor.getActorScrobbles?did={}",
            pds.did()
        ),
    )
    .await;

    let count = body["scrobbles"].as_array().unwrap().len();
    let db = state.db();
    let total = db
        .count(&db.sql("SELECT count(*) FROM scrobbles"))
        .await
        .unwrap();

    assert!(total > 10, "the fixture must exceed the default to test it");
    assert_eq!(count, 10, "the default page is ten");
}
