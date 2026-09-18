//! The write procedures, against an in-memory PDS.
//!
//! These are the first XRPC procedures that publish to a user's repository, so
//! what is being tested is not just the row in the database but the *record* —
//! that it was written, that it has the shape the lexicon declares, and that
//! it is removed again on the reverse operation.
//!
//! `rocksky-mock-pds` makes that checkable: it stores what it is sent, so the
//! assertions read the repository rather than trusting a 200.

use actix_web::{web, App};
use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use rocksky_mock_pds::MockPds;

const PASSWORD: &str = "app-password";

/// The whole HTTP surface, as a test service.
///
/// A macro rather than a function because `actix_http::Request` — the service's
/// request type — is not nameable from here: actix re-exports the type but not
/// the crate, so there is no path to write in the return type.
macro_rules! app {
    ($state:expr) => {
        actix_web::test::init_service(
            App::new()
                .app_data($state.clone())
                .app_data(web::Data::new($state.clone()))
                .configure(rocksky_appview::rest::configure)
                .configure(rocksky_appview::xrpc::configure),
        )
        .await
    };
}

/// An instance with one signed-in account and one track in the catalogue.
async fn signed_in() -> (AppState, MockPds, String, String) {
    let pds = MockPds::builder()
        .account("did:plc:alice", "alice.test", PASSWORD)
        .start()
        .await;

    let mut config = Config::for_test();
    config.plc_directory_url = pds.url().to_string();
    config.bsky_appview_url = pds.url().to_string();
    let state = AppState::for_test_with(config).await.expect("state");

    // Sign in through the real route, so the session is stored the way a user
    // would leave it.
    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/login")
            .set_json(serde_json::json!({
                "handle": "alice.test",
                "password": PASSWORD,
            }))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200, "sign-in should succeed");
    let body = actix_web::test::read_body(response).await;
    let token = String::from_utf8(body.to_vec())
        .unwrap()
        .trim_start_matches("jwt:")
        .to_string();

    // A song to like. Its URI has to be a record the PDS will answer
    // `getRecord` for, because a like carries a strong ref and the CID comes
    // from there.
    let song_uri = format!("at://{}/app.rocksky.song/3song", pds.did());
    pds.put_record(
        "app.rocksky.song",
        "3song",
        serde_json::json!({
            "$type": "app.rocksky.song",
            "title": "Roygbiv",
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 151_000,
            "createdAt": "2026-01-01T00:00:00.000Z",
        }),
    );

    let db = state.db();
    let track_id = rocksky_appview::db::new_id();
    let mut insert = db.sql(
        "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, uri) \
         VALUES (",
    );
    insert
        .bind(&track_id)
        .push(", ")
        .bind("Roygbiv")
        .push(", ")
        .bind("Boards of Canada")
        .push(", ")
        .bind("Boards of Canada")
        .push(", ")
        .bind("Music Has the Right to Children")
        .push(", ")
        .bind(151_000i64)
        .push(", ")
        .bind(rocksky_core::track_hash(
            "Roygbiv",
            "Boards of Canada",
            "Music Has the Right to Children",
        ))
        .push(", ")
        .bind(&song_uri)
        .push(")");
    db.execute(&insert).await.expect("insert the track");

    (state, pds, token, song_uri)
}

/// A GET that must succeed, returning its JSON body.
async fn get(state: &AppState, uri: &str) -> serde_json::Value {
    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get().uri(uri).to_request(),
    )
    .await;
    assert_eq!(response.status(), 200, "{uri}");
    actix_web::test::read_body_json(response).await
}

/// The caller's unread notification count.
async fn unread_count(state: &AppState, token: &str) -> i64 {
    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/xrpc/app.rocksky.notification.getUnreadCount")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    let body: serde_json::Value = actix_web::test::read_body_json(response).await;
    body["count"].as_i64().expect("a count")
}

async fn post(state: &AppState, token: &str, uri: &str, body: serde_json::Value) -> u16 {
    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri(uri)
            .insert_header(("authorization", format!("Bearer {token}")))
            .set_json(body)
            .to_request(),
    )
    .await;
    response.status().as_u16()
}

async fn delete(state: &AppState, token: &str, uri: &str) -> u16 {
    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::delete()
            .uri(uri)
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    response.status().as_u16()
}

/// How many rows a table holds.
async fn count(state: &AppState, table: &str) -> i64 {
    let db = state.db();
    db.count(&db.sql(&format!("SELECT count(*) FROM {table}")))
        .await
        .unwrap()
}

/// The payload `crates/navidrome` posts when a Subsonic client stars a song.
fn subsonic_star_payload() -> serde_json::Value {
    serde_json::json!({
        "title": "Roygbiv",
        "artist": "Boards of Canada",
        "album": "Music Has the Right to Children",
        "albumArtist": "Boards of Canada",
        "duration": 151_000,
        "albumArt": "https://example.invalid/cover.jpg",
        "trackNumber": 4,
        "discNumber": 1,
    })
}

#[actix_web::test]
async fn liking_a_song_writes_a_record_and_a_row() {
    let (state, pds, token, song_uri) = signed_in().await;

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.likeSong",
        serde_json::json!({ "uri": song_uri }),
    )
    .await;
    assert_eq!(status, 200);

    // The record, in the user's repository.
    let likes = pds.records(Some("app.rocksky.like"));
    assert_eq!(likes.len(), 1, "one like record");

    let record = &likes[0].value;
    assert_eq!(record["$type"], "app.rocksky.like");
    assert_eq!(
        record["subject"]["uri"], song_uri,
        "the strong ref names the song"
    );
    assert!(
        record["subject"]["cid"]
            .as_str()
            .is_some_and(|cid| !cid.is_empty()),
        "the strong ref must carry the song's CID: {record}"
    );
    assert!(record["createdAt"].as_str().is_some());

    // And the row, so the like shows without waiting for a sync.
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM loved_tracks"))
            .await
            .unwrap(),
        1
    );
}

/// The UI toggles, so a double-click must not write two records.
#[actix_web::test]
async fn liking_twice_is_idempotent() {
    let (state, pds, token, song_uri) = signed_in().await;

    for attempt in 1..=3 {
        let status = post(
            &state,
            &token,
            "/xrpc/app.rocksky.like.likeSong",
            serde_json::json!({ "uri": song_uri }),
        )
        .await;
        assert_eq!(status, 200, "attempt {attempt}");
    }

    assert_eq!(
        pds.record_count("app.rocksky.like"),
        1,
        "three clicks, one record"
    );
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM loved_tracks"))
            .await
            .unwrap(),
        1
    );
}

#[actix_web::test]
async fn unliking_removes_the_record_and_the_row() {
    let (state, pds, token, song_uri) = signed_in().await;

    post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.likeSong",
        serde_json::json!({ "uri": song_uri }),
    )
    .await;
    assert_eq!(pds.record_count("app.rocksky.like"), 1);

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.dislikeSong",
        serde_json::json!({ "uri": song_uri }),
    )
    .await;
    assert_eq!(status, 200);

    assert_eq!(
        pds.record_count("app.rocksky.like"),
        0,
        "the record must be deleted, not just the row"
    );
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM loved_tracks"))
            .await
            .unwrap(),
        0
    );
}

/// Unliking something never liked is the state the caller wanted, not an
/// error.
#[actix_web::test]
async fn unliking_what_was_never_liked_succeeds() {
    let (state, _pds, token, song_uri) = signed_in().await;

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.dislikeSong",
        serde_json::json!({ "uri": song_uri }),
    )
    .await;
    assert_eq!(status, 200);
}

#[actix_web::test]
async fn liking_requires_authentication() {
    let (state, pds, _token, song_uri) = signed_in().await;
    let app = app!(state);

    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.like.likeSong")
            .set_json(serde_json::json!({ "uri": song_uri }))
            .to_request(),
    )
    .await;

    assert_eq!(response.status(), 401);
    assert_eq!(
        pds.record_count("app.rocksky.like"),
        0,
        "nothing may be written for an unauthenticated caller"
    );
}

#[actix_web::test]
async fn liking_an_unknown_song_is_a_bad_request() {
    let (state, pds, token, _song_uri) = signed_in().await;

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.likeSong",
        serde_json::json!({ "uri": "at://did:plc:alice/app.rocksky.song/nosuch" }),
    )
    .await;
    assert_eq!(status, 400);
    assert_eq!(pds.record_count("app.rocksky.like"), 0);
}

#[actix_web::test]
async fn a_like_without_a_uri_is_a_bad_request() {
    let (state, _pds, token, _song_uri) = signed_in().await;

    assert_eq!(
        post(
            &state,
            &token,
            "/xrpc/app.rocksky.like.likeSong",
            serde_json::json!({}),
        )
        .await,
        400
    );
}

/// A PDS that refuses the write must not leave a row claiming success.
#[actix_web::test]
async fn a_refused_record_write_leaves_no_row() {
    let (state, pds, token, song_uri) = signed_in().await;

    pds.always_fail("com.atproto.repo.createRecord", 502, "UpstreamFailure");

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.like.likeSong",
        serde_json::json!({ "uri": song_uri }),
    )
    .await;
    assert_eq!(status, 502, "the failure must surface, not be swallowed");

    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM loved_tracks"))
            .await
            .unwrap(),
        0,
        "no row may exist for a like that was never published"
    );

    // And once the PDS recovers, the like works.
    pds.clear_failures();
    assert_eq!(
        post(
            &state,
            &token,
            "/xrpc/app.rocksky.like.likeSong",
            serde_json::json!({ "uri": song_uri }),
        )
        .await,
        200
    );
    assert_eq!(pds.record_count("app.rocksky.like"), 1);
}

// ------------------------------------------------------------------- follows

/// A second account to follow.
async fn add_account(state: &AppState, did: &str, handle: &str) {
    let db = state.db();
    let mut insert = db.sql("INSERT INTO users (xata_id, did, handle, avatar, is_bot) VALUES (");
    insert
        .bind(rocksky_appview::db::new_id())
        .push(", ")
        .bind(did)
        .push(", ")
        .bind(handle)
        .push(", ")
        .bind("")
        .push(", ")
        .bind(false)
        .push(")");
    db.execute(&insert).await.expect("insert the account");
}

#[actix_web::test]
async fn following_writes_a_record_naming_the_did() {
    let (state, pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.graph.followAccount?account=bob.test")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);

    let body: serde_json::Value = actix_web::test::read_body_json(response).await;
    assert_eq!(body["subject"]["did"], "did:plc:bob");
    assert_eq!(body["count"], 1, "bob now has one follower");

    let follows = pds.records(Some("app.rocksky.graph.follow"));
    assert_eq!(follows.len(), 1);
    // A DID, not a strong ref: an account is not a record.
    assert_eq!(follows[0].value["subject"], "did:plc:bob");
    assert_eq!(follows[0].value["$type"], "app.rocksky.graph.follow");
}

#[actix_web::test]
async fn following_the_same_account_twice_writes_one_record() {
    let (state, pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;

    for _ in 0..3 {
        let app = app!(state);
        actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::post()
                .uri("/xrpc/app.rocksky.graph.followAccount?account=bob.test")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
    }

    assert_eq!(pds.record_count("app.rocksky.graph.follow"), 1);
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM follows"))
            .await
            .unwrap(),
        1
    );
}

#[actix_web::test]
async fn an_account_cannot_follow_itself() {
    let (state, pds, token, _) = signed_in().await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.graph.followAccount?account=alice.test")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;

    assert_eq!(response.status(), 400);
    assert_eq!(pds.record_count("app.rocksky.graph.follow"), 0);
}

#[actix_web::test]
async fn unfollowing_removes_the_record() {
    let (state, pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;

    for method in ["followAccount", "unfollowAccount"] {
        let app = app!(state);
        let response = actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::post()
                .uri(&format!(
                    "/xrpc/app.rocksky.graph.{method}?account=bob.test"
                ))
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(response.status(), 200, "{method}");
    }

    assert_eq!(pds.record_count("app.rocksky.graph.follow"), 0);
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM follows"))
            .await
            .unwrap(),
        0
    );
}

#[actix_web::test]
async fn the_graph_reads_both_directions() {
    let (state, _pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;

    let app = app!(state);
    actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.graph.followAccount?account=bob.test")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;

    // Alice follows bob…
    let follows = get(
        &state,
        "/xrpc/app.rocksky.graph.getFollows?actor=alice.test",
    )
    .await;
    assert_eq!(follows["follows"].as_array().unwrap().len(), 1);
    assert_eq!(follows["follows"][0]["did"], "did:plc:bob");
    assert_eq!(follows["subject"]["did"], "did:plc:alice");

    // …so bob is followed by alice, and not the other way round.
    let followers = get(
        &state,
        "/xrpc/app.rocksky.graph.getFollowers?actor=bob.test",
    )
    .await;
    assert_eq!(followers["followers"].as_array().unwrap().len(), 1);
    assert_eq!(followers["followers"][0]["did"], "did:plc:alice");
    assert_eq!(followers["count"], 1);

    let alices_followers = get(
        &state,
        "/xrpc/app.rocksky.graph.getFollowers?actor=alice.test",
    )
    .await;
    assert_eq!(
        alices_followers["followers"].as_array().unwrap().len(),
        0,
        "the directions must not be mixed up"
    );
}

#[actix_web::test]
async fn an_unknown_actor_answers_an_empty_graph() {
    let (state, _pds, _token, _) = signed_in().await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/xrpc/app.rocksky.graph.getFollowers?actor=did:plc:nobody")
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);

    let body: serde_json::Value = actix_web::test::read_body_json(response).await;
    assert_eq!(body["subject"], serde_json::json!({}));
    assert_eq!(body["followers"], serde_json::json!([]));
}

// -------------------------------------------------------------------- shouts

/// Seeds an album and an artist, so the subject resolution has all five kinds
/// available.
async fn seed_subjects(state: &AppState, pds: &MockPds) -> (String, String) {
    let db = state.db();

    let album_uri = format!("at://{}/app.rocksky.album/3album", pds.did());
    let mut insert = db.sql("INSERT INTO albums (xata_id, title, artist, sha256, uri) VALUES (");
    insert
        .bind(rocksky_appview::db::new_id())
        .push(", ")
        .bind("Music Has the Right to Children")
        .push(", ")
        .bind("Boards of Canada")
        .push(", ")
        .bind(rocksky_core::album_hash(
            "Music Has the Right to Children",
            "Boards of Canada",
        ))
        .push(", ")
        .bind(&album_uri)
        .push(")");
    db.execute(&insert).await.expect("insert the album");

    let artist_uri = format!("at://{}/app.rocksky.artist/3artist", pds.did());
    let mut insert = db.sql("INSERT INTO artists (xata_id, name, sha256, uri) VALUES (");
    insert
        .bind(rocksky_appview::db::new_id())
        .push(", ")
        .bind("Boards of Canada")
        .push(", ")
        .bind(rocksky_core::artist_hash("Boards of Canada"))
        .push(", ")
        .bind(&artist_uri)
        .push(")");
    db.execute(&insert).await.expect("insert the artist");

    (album_uri, artist_uri)
}

/// Each subject kind must land in its own column, or a song's shouts appear
/// under an album.
#[actix_web::test]
async fn a_shout_lands_on_the_column_its_subject_implies() {
    let (state, pds, token, song_uri) = signed_in().await;
    let (album_uri, artist_uri) = seed_subjects(&state, &pds).await;
    let db = state.db();

    let cases = [
        (song_uri.clone(), "track_id"),
        (album_uri, "album_id"),
        (artist_uri, "artist_id"),
    ];

    for (uri, column) in &cases {
        let status = post(
            &state,
            &token,
            "/xrpc/app.rocksky.shout.createShout",
            serde_json::json!({ "message": "nice one", "uri": uri }),
        )
        .await;
        assert_eq!(status, 200, "posting to {uri}");

        let count = db
            .count(&db.sql(&format!(
                "SELECT count(*) FROM shouts WHERE {column} IS NOT NULL"
            )))
            .await
            .unwrap();
        assert_eq!(count, 1, "{uri} should have populated {column}");
    }

    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts"))
            .await
            .unwrap(),
        3
    );
    assert_eq!(pds.record_count("app.rocksky.shout"), 3);
}

/// A profile shout is the awkward case: a *user* id in `artist_id`, plus a
/// `profile_shouts` row.
#[actix_web::test]
async fn a_profile_shout_links_through_profile_shouts() {
    let (state, pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;
    let db = state.db();

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.shout.createShout",
        serde_json::json!({ "message": "hello bob", "uri": "did:plc:bob" }),
    )
    .await;
    assert_eq!(status, 200);

    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM profile_shouts"))
            .await
            .unwrap(),
        1,
        "a profile shout must be linked"
    );

    // And `artist_id` holds bob's *user* row id, not an artist's.
    let artist_id: String = db
        .fetch_scalar(&db.sql("SELECT artist_id FROM shouts LIMIT 1"))
        .await
        .unwrap()
        .expect("artist_id is set");
    let bob_id: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:bob'"))
        .await
        .unwrap()
        .expect("bob exists");
    assert_eq!(artist_id, bob_id);

    // No artist row was invented to satisfy the column.
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM artists"))
            .await
            .unwrap(),
        0
    );
    assert_eq!(pds.record_count("app.rocksky.shout"), 1);
}

#[actix_web::test]
async fn a_shout_on_an_unknown_subject_is_refused() {
    let (state, pds, token, _) = signed_in().await;

    for uri in [
        "at://did:plc:alice/app.rocksky.song/nosuch",
        "https://example.com/not-a-record",
        "did:plc:nobody",
    ] {
        let status = post(
            &state,
            &token,
            "/xrpc/app.rocksky.shout.createShout",
            serde_json::json!({ "message": "hi", "uri": uri }),
        )
        .await;
        assert_eq!(status, 400, "{uri}");
    }

    assert_eq!(pds.record_count("app.rocksky.shout"), 0);
}

#[actix_web::test]
async fn a_shout_needs_a_message_and_a_subject() {
    let (state, _pds, token, song_uri) = signed_in().await;

    for body in [
        serde_json::json!({ "uri": song_uri }),
        serde_json::json!({ "message": "   ", "uri": song_uri }),
        serde_json::json!({ "message": "hi" }),
        serde_json::json!({}),
    ] {
        assert_eq!(
            post(&state, &token, "/xrpc/app.rocksky.shout.createShout", body).await,
            400
        );
    }
}

/// A reply inherits its parent's subject, so it shows under the same song.
#[actix_web::test]
async fn a_reply_inherits_its_parents_subject() {
    let (state, pds, token, song_uri) = signed_in().await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.shout.createShout")
            .insert_header(("authorization", format!("Bearer {token}")))
            .set_json(serde_json::json!({ "message": "first", "uri": song_uri }))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    let parent: serde_json::Value = actix_web::test::read_body_json(response).await;
    let parent_id = parent["id"].as_str().expect("the shout's id").to_string();

    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.shout.replyShout",
        serde_json::json!({ "shoutId": parent_id, "message": "agreed" }),
    )
    .await;
    assert_eq!(status, 200);

    let db = state.db();
    // Both shouts hang off the same track…
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts WHERE track_id IS NOT NULL"))
            .await
            .unwrap(),
        2
    );
    // …and exactly one is a reply.
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts WHERE parent_id IS NOT NULL"))
            .await
            .unwrap(),
        1
    );

    // The subject list shows only the top-level shout; the replies list shows
    // the reply.
    let top = get(
        &state,
        &format!(
            "/xrpc/app.rocksky.shout.getTrackShouts?uri={}",
            urlencoding::encode(&song_uri)
        ),
    )
    .await;
    assert_eq!(
        top["shouts"].as_array().unwrap().len(),
        1,
        "a reply must not appear at the top level: {top}"
    );
    assert_eq!(top["shouts"][0]["message"], "first");
    assert_eq!(top["shouts"][0]["author"]["did"], "did:plc:alice");
}

#[actix_web::test]
async fn replying_to_nothing_is_refused() {
    let (state, pds, token, _) = signed_in().await;

    assert_eq!(
        post(
            &state,
            &token,
            "/xrpc/app.rocksky.shout.replyShout",
            serde_json::json!({ "shoutId": "nosuch", "message": "hi" }),
        )
        .await,
        400
    );
    assert_eq!(pds.record_count("app.rocksky.shout"), 0);
}

/// Only the author may remove a shout, and removing it takes its replies.
#[actix_web::test]
async fn removing_a_shout_takes_its_replies_and_its_record() {
    let (state, pds, token, song_uri) = signed_in().await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.shout.createShout")
            .insert_header(("authorization", format!("Bearer {token}")))
            .set_json(serde_json::json!({ "message": "first", "uri": song_uri }))
            .to_request(),
    )
    .await;
    let parent: serde_json::Value = actix_web::test::read_body_json(response).await;
    let parent_id = parent["id"].as_str().unwrap().to_string();

    post(
        &state,
        &token,
        "/xrpc/app.rocksky.shout.replyShout",
        serde_json::json!({ "shoutId": parent_id, "message": "agreed" }),
    )
    .await;

    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts"))
            .await
            .unwrap(),
        2
    );
    assert_eq!(pds.record_count("app.rocksky.shout"), 2);

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri(&format!(
                "/xrpc/app.rocksky.shout.removeShout?id={parent_id}"
            ))
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);

    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts"))
            .await
            .unwrap(),
        0,
        "the reply must go with its parent, not be orphaned"
    );
    // The parent's record is deleted; the reply's is left, because deleting it
    // would need its own rkey and the reply is already unreachable.
    assert_eq!(pds.record_count("app.rocksky.shout"), 1);
}

#[actix_web::test]
async fn one_account_cannot_remove_anothers_shout() {
    let (state, _pds, token, song_uri) = signed_in().await;

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/xrpc/app.rocksky.shout.createShout")
            .insert_header(("authorization", format!("Bearer {token}")))
            .set_json(serde_json::json!({ "message": "mine", "uri": song_uri }))
            .to_request(),
    )
    .await;
    let shout: serde_json::Value = actix_web::test::read_body_json(response).await;
    let shout_id = shout["id"].as_str().unwrap().to_string();

    // A second account, with its own token.
    add_account(&state, "did:plc:bob", "bob.test").await;
    let bobs_token =
        rocksky_appview::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri(&format!(
                "/xrpc/app.rocksky.shout.removeShout?id={shout_id}"
            ))
            .insert_header(("authorization", format!("Bearer {bobs_token}")))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 403);

    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM shouts"))
            .await
            .unwrap(),
        1,
        "the shout must survive someone else's delete"
    );
}

// ------------------------------------------------------------- notifications

#[actix_web::test]
async fn notifications_are_listed_newest_first_and_counted() {
    let (state, _pds, token, song_uri) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;
    let db = state.db();

    let alice: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:alice'"))
        .await
        .unwrap()
        .unwrap();
    let bob: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:bob'"))
        .await
        .unwrap()
        .unwrap();

    for (index, kind) in ["like", "follow", "shout"].iter().enumerate() {
        let mut insert = db.sql(
            "INSERT INTO notifications (xata_id, user_id, actor_id, type, subject_uri, read, xata_createdat) VALUES (",
        );
        insert
            .bind(rocksky_appview::db::new_id())
            .push(", ")
            .bind(&alice)
            .push(", ")
            .bind(&bob)
            .push(", ")
            .bind(*kind)
            .push(", ")
            .bind(&song_uri)
            .push(", ")
            .bind(false)
            .push(", ")
            .bind(format!("2026-01-0{}T00:00:00.000Z", index + 1))
            .push(")");
        db.execute(&insert).await.expect("insert a notification");
    }

    let app = app!(state);
    let response = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/xrpc/app.rocksky.notification.listNotifications")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    let body: serde_json::Value = actix_web::test::read_body_json(response).await;

    let list = body["notifications"].as_array().unwrap();
    assert_eq!(list.len(), 3);
    assert_eq!(body["unreadCount"], 3);

    // Newest first.
    assert_eq!(list[0]["type"], "shout");
    assert_eq!(list[2]["type"], "like");

    // The actor is attached, and the subject enriched from the tracks table.
    assert_eq!(list[0]["actor"]["did"], "did:plc:bob");
    assert_eq!(list[0]["actor"]["handle"], "bob.test");
    assert_eq!(list[0]["subject"]["title"], "Roygbiv");
    assert_eq!(list[0]["subject"]["artist"], "Boards of Canada");
    assert_eq!(list[0]["read"], false);
}

#[actix_web::test]
async fn marking_seen_clears_the_count() {
    let (state, _pds, token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;
    let db = state.db();

    let alice: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:alice'"))
        .await
        .unwrap()
        .unwrap();
    let bob: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:bob'"))
        .await
        .unwrap()
        .unwrap();

    let mut ids = Vec::new();
    for _ in 0..3 {
        let id = rocksky_appview::db::new_id();
        ids.push(id.clone());
        let mut insert =
            db.sql("INSERT INTO notifications (xata_id, user_id, actor_id, type, read) VALUES (");
        insert
            .bind(&id)
            .push(", ")
            .bind(&alice)
            .push(", ")
            .bind(&bob)
            .push(", ")
            .bind("like")
            .push(", ")
            .bind(false)
            .push(")");
        db.execute(&insert).await.unwrap();
    }

    assert_eq!(unread_count(&state, &token).await, 3);

    // Marking one leaves two.
    let status = post(
        &state,
        &token,
        "/xrpc/app.rocksky.notification.updateSeen",
        serde_json::json!({ "ids": [ids[0]] }),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(unread_count(&state, &token).await, 2);

    // An empty list marks everything, which is the "mark all read" button.
    post(
        &state,
        &token,
        "/xrpc/app.rocksky.notification.updateSeen",
        serde_json::json!({ "ids": [] }),
    )
    .await;
    assert_eq!(unread_count(&state, &token).await, 0);
}

/// One account must not be able to mark another's notifications read.
#[actix_web::test]
async fn marking_seen_is_scoped_to_the_caller() {
    let (state, _pds, _token, _) = signed_in().await;
    add_account(&state, "did:plc:bob", "bob.test").await;
    let db = state.db();

    let bob: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:bob'"))
        .await
        .unwrap()
        .unwrap();
    let alice: String = db
        .fetch_scalar(&db.sql("SELECT xata_id FROM users WHERE did = 'did:plc:alice'"))
        .await
        .unwrap()
        .unwrap();

    // A notification belonging to bob.
    let id = rocksky_appview::db::new_id();
    let mut insert =
        db.sql("INSERT INTO notifications (xata_id, user_id, actor_id, type, read) VALUES (");
    insert
        .bind(&id)
        .push(", ")
        .bind(&bob)
        .push(", ")
        .bind(&alice)
        .push(", ")
        .bind("like")
        .push(", ")
        .bind(false)
        .push(")");
    db.execute(&insert).await.unwrap();

    // Alice tries to mark it, naming bob's id explicitly.
    let alices_token =
        rocksky_appview::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice")
            .unwrap();
    post(
        &state,
        &alices_token,
        "/xrpc/app.rocksky.notification.updateSeen",
        serde_json::json!({ "ids": [id] }),
    )
    .await;

    let still_unread = db
        .count(&db.sql("SELECT count(*) FROM notifications WHERE read = 0"))
        .await
        .unwrap();
    assert_eq!(
        still_unread, 1,
        "another account's notification must stay unread"
    );
}

#[actix_web::test]
async fn notifications_require_authentication() {
    let (state, _pds, _token, _) = signed_in().await;
    let app = app!(state);

    for uri in [
        "/xrpc/app.rocksky.notification.getUnreadCount",
        "/xrpc/app.rocksky.notification.listNotifications",
    ] {
        let response = actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::get().uri(uri).to_request(),
        )
        .await;
        assert_eq!(response.status(), 401, "{uri}");
    }
}

// ------------------------------------------------- starring from a Subsonic client
//
// `crates/navidrome` cannot address a song by AT-URI — a Subsonic client has
// never heard of one — so it posts the track itself to `POST /likes` and
// unstars with `DELETE /likes/{sha256}`. Both routes answered 404 until they
// were served, which made starring in a Subsonic client silently do nothing.

#[actix_web::test]
async fn starring_a_song_over_rest_writes_the_same_record_and_row() {
    let (state, pds, token, song_uri) = signed_in().await;

    let status = post(&state, &token, "/likes", subsonic_star_payload()).await;
    assert_eq!(status, 200);

    // The same record the XRPC procedure writes, pinned to the song's CID.
    let likes = pds.records(Some("app.rocksky.like"));
    assert_eq!(likes.len(), 1, "one like record");
    assert_eq!(likes[0].value["subject"]["uri"], song_uri);
    assert!(
        likes[0].value["subject"]["cid"]
            .as_str()
            .is_some_and(|cid| !cid.is_empty()),
        "the strong ref must carry the song's CID: {}",
        likes[0].value
    );

    assert_eq!(count(&state, "loved_tracks").await, 1);

    // And it attached to the track that was already there rather than making a
    // second one — the payload is resolved by content hash, which is the whole
    // reason this route can work without a URI.
    assert_eq!(count(&state, "tracks").await, 1, "no duplicate track row");
}

#[actix_web::test]
async fn unstarring_removes_the_record_and_the_row() {
    let (state, pds, token, _song_uri) = signed_in().await;

    assert_eq!(
        post(&state, &token, "/likes", subsonic_star_payload()).await,
        200
    );
    assert_eq!(count(&state, "loved_tracks").await, 1);

    // Subsonic's unstar carries only the hash, which is what navidrome sends.
    let sha256 = rocksky_core::track_hash(
        "Roygbiv",
        "Boards of Canada",
        "Music Has the Right to Children",
    );
    assert_eq!(
        delete(&state, &token, &format!("/likes/{sha256}")).await,
        200
    );

    assert_eq!(count(&state, "loved_tracks").await, 0, "the row is gone");
    assert!(
        pds.records(Some("app.rocksky.like")).is_empty(),
        "the record is gone from the repository too"
    );
}

/// Starring twice must not produce two records: a client that retries, or a
/// user double-tapping, would otherwise leave a second like in the repository
/// that nothing ever removes.
#[actix_web::test]
async fn starring_twice_is_one_like() {
    let (state, pds, token, _song_uri) = signed_in().await;

    for _ in 0..2 {
        assert_eq!(
            post(&state, &token, "/likes", subsonic_star_payload()).await,
            200
        );
    }

    assert_eq!(count(&state, "loved_tracks").await, 1);
    assert_eq!(pds.records(Some("app.rocksky.like")).len(), 1);
}

/// A song nobody has published: the star still counts, it simply has no record
/// to point at. A like's subject is a strongRef, so there is nothing to write
/// to the repository until a scrobble creates the song record.
#[actix_web::test]
async fn starring_an_unpublished_song_records_the_like_locally() {
    let (state, pds, token, _song_uri) = signed_in().await;

    let status = post(
        &state,
        &token,
        "/likes",
        serde_json::json!({
            "title": "Olson",
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 90_000,
        }),
    )
    .await;
    assert_eq!(status, 200);

    assert_eq!(count(&state, "loved_tracks").await, 1);
    // Created by the star itself, beside the one the fixture seeded.
    assert_eq!(count(&state, "tracks").await, 2);
    // And nothing in the repository, because there is no song record to point
    // at — a like with a fabricated strong ref would not validate anywhere.
    assert!(
        pds.records(Some("app.rocksky.like")).is_empty(),
        "a like was published for a song with no record"
    );
}

/// Unstarring something this instance has never seen is the state the caller
/// asked for, not an error — `apps/api` answers the same.
#[actix_web::test]
async fn unstarring_an_unknown_song_succeeds() {
    let (state, _pds, token, _song_uri) = signed_in().await;
    assert_eq!(delete(&state, &token, "/likes/deadbeef").await, 200);
}

/// The four fields the content hash is built from are required: a star that
/// hashed differently from the scrobble of the same song would attach to a
/// different row, and the song would appear both liked and not.
#[actix_web::test]
async fn starring_needs_the_fields_the_hash_is_built_from() {
    let (state, _pds, token, _song_uri) = signed_in().await;

    for missing in ["title", "artist", "album", "albumArtist"] {
        let mut body = subsonic_star_payload();
        body.as_object_mut().unwrap().remove(missing);
        assert_eq!(
            post(&state, &token, "/likes", body).await,
            400,
            "{missing} must be required"
        );
    }
}
