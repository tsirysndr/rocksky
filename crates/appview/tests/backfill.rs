//! Backfill, end to end, against a real CAR from an in-memory PDS.
//!
//! Until there was a mock, this path could only be tested by pointing at the
//! live network: it resolves a DID, downloads the repository as a CAR, parses
//! the frames, reads the commit, walks the MST for record keys and projects
//! every record into the database. That is five things that can each be
//! subtly wrong, and a stub returning JSON would have exercised none of them.
//!
//! `rocksky-mock-pds` builds the archive for real — real frames, a real
//! prefix-compressed tree over the record keys — from a repository captured
//! from production. So these run offline, in milliseconds, over data that has
//! the shapes real records have.

use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use rocksky_mock_pds::MockPds;

async fn state_pointing_at(pds: &MockPds) -> AppState {
    let mut config = Config::for_test();
    // Resolution starts at the directory and follows the DID document to the
    // PDS, so pointing both at the mock keeps the whole hop inside the test.
    config.plc_directory_url = pds.url().to_string();
    config.bsky_appview_url = pds.url().to_string();
    AppState::for_test_with(config).await.expect("state")
}

async fn count(state: &AppState, table: &str) -> i64 {
    let db = state.db();
    db.count(&db.sql(&format!("SELECT count(*) FROM {table}")))
        .await
        .expect("count")
}

/// A repository captured from production, projected into an empty database.
#[actix_web::test]
async fn a_production_repository_backfills_into_a_catalogue() {
    let pds = MockPds::with_production_data().await;
    let state = state_pointing_at(&pds).await;
    let did = pds.did();

    let stats = rocksky_appview::backfill::backfill_repo(&state, &did)
        .await
        .expect("backfill must succeed against a real archive");

    // The fixture's scrobbles became scrobble rows.
    let scrobbles = pds.record_count("app.rocksky.scrobble");
    assert!(scrobbles > 0, "the fixture has scrobbles to project");
    assert_eq!(
        count(&state, "scrobbles").await,
        scrobbles as i64,
        "every scrobble record became a row: {stats:?}"
    );

    // And the catalogue they imply exists, deduplicated — a repo of 24
    // scrobbles does not imply 24 albums.
    let tracks = count(&state, "tracks").await;
    let albums = count(&state, "albums").await;
    let artists = count(&state, "artists").await;

    assert!(tracks > 0, "scrobbles imply tracks");
    assert!(
        albums > 0 && albums <= tracks,
        "{albums} albums, {tracks} tracks"
    );
    assert!(
        artists > 0 && artists <= albums,
        "{artists} artists, {albums} albums"
    );

    // The account itself was indexed, with the handle read from the DID
    // document's `alsoKnownAs` — an appview lookup is not required.
    let db = state.db();
    let mut sql = db.sql("SELECT handle FROM users WHERE did = ");
    sql.bind(&did);
    assert_eq!(
        db.fetch_scalar::<String>(&sql).await.unwrap().as_deref(),
        Some(pds.handle().as_str()),
    );
}

/// Running it twice must not double anything: a repo is re-synced routinely,
/// and the projection is keyed on content so it has to be idempotent.
#[actix_web::test]
async fn backfilling_twice_changes_nothing() {
    let pds = MockPds::with_production_data().await;
    let state = state_pointing_at(&pds).await;
    let did = pds.did();

    rocksky_appview::backfill::backfill_repo(&state, &did)
        .await
        .expect("first pass");

    let after_first = (
        count(&state, "scrobbles").await,
        count(&state, "tracks").await,
        count(&state, "albums").await,
        count(&state, "artists").await,
        count(&state, "album_tracks").await,
        count(&state, "artist_tracks").await,
    );

    rocksky_appview::backfill::backfill_repo(&state, &did)
        .await
        .expect("second pass");

    let after_second = (
        count(&state, "scrobbles").await,
        count(&state, "tracks").await,
        count(&state, "albums").await,
        count(&state, "artists").await,
        count(&state, "album_tracks").await,
        count(&state, "artist_tracks").await,
    );

    assert_eq!(
        after_first, after_second,
        "a second backfill duplicated rows"
    );
}

/// The MST is where record keys live, so a scrobble's URI can only be right
/// if the tree was walked correctly. This is the assertion that would catch a
/// reader ignoring prefix compression: the collection name would come back
/// truncated.
#[actix_web::test]
async fn every_scrobble_gets_the_uri_its_key_implies() {
    let pds = MockPds::with_production_data().await;
    let state = state_pointing_at(&pds).await;
    let did = pds.did();

    rocksky_appview::backfill::backfill_repo(&state, &did)
        .await
        .expect("backfill");

    let db = state.db();
    let uris: Vec<String> = db
        .fetch_scalars::<String>(&db.sql("SELECT uri FROM scrobbles ORDER BY uri"))
        .await
        .expect("uris");

    let mut expected: Vec<String> = pds
        .records(Some("app.rocksky.scrobble"))
        .iter()
        .map(|record| format!("at://{did}/app.rocksky.scrobble/{}", record.rkey))
        .collect();
    expected.sort();

    assert_eq!(
        uris, expected,
        "a URI is wrong, which means the MST walk or the prefix expansion is"
    );
}

/// A repo large enough that its tree has subtrees, so the walk recurses.
#[actix_web::test]
async fn a_repository_with_a_deep_tree_backfills_completely() {
    let pds = MockPds::start().await;

    // Enough scrobbles that the tree is more than one node, and each one
    // distinct so none of them dedupe away.
    for i in 0..200 {
        pds.put_record(
            "app.rocksky.scrobble",
            &format!("3mu{i:05}"),
            serde_json::json!({
                "$type": "app.rocksky.scrobble",
                "title": format!("Track {i}"),
                "artist": "Deep Tree",
                "album": format!("Album {}", i / 10),
                "albumArtist": "Deep Tree",
                "duration": 180_000 + i,
                "createdAt": "2026-01-01T00:00:00.000Z",
            }),
        );
    }

    let state = state_pointing_at(&pds).await;
    rocksky_appview::backfill::backfill_repo(&state, &pds.did())
        .await
        .expect("backfill");

    assert_eq!(
        count(&state, "scrobbles").await,
        200,
        "a record was lost walking the tree"
    );
    assert_eq!(count(&state, "tracks").await, 200);
    assert_eq!(count(&state, "albums").await, 20, "10 tracks per album");
    assert_eq!(count(&state, "artists").await, 1);
}

/// An empty repository is not an error — a new account has one.
#[actix_web::test]
async fn an_empty_repository_backfills_to_nothing() {
    let pds = MockPds::start().await;
    let state = state_pointing_at(&pds).await;

    rocksky_appview::backfill::backfill_repo(&state, &pds.did())
        .await
        .expect("an empty repo is not a failure");

    assert_eq!(count(&state, "scrobbles").await, 0);
    // The account is still indexed, so it can be followed or scrobbled to.
    assert_eq!(count(&state, "users").await, 1);
}

/// A DID nobody serves must fail rather than silently indexing an empty
/// account.
#[actix_web::test]
async fn an_unknown_did_is_an_error() {
    let pds = MockPds::start().await;
    let state = state_pointing_at(&pds).await;

    let result = rocksky_appview::backfill::backfill_repo(&state, "did:plc:nobodyhere").await;
    assert!(
        result.is_err(),
        "an unresolvable DID must not look like success"
    );
    assert_eq!(count(&state, "users").await, 0);
}

/// A PDS that refuses the sync must surface as a failure, not as a partial
/// import that looks complete.
#[actix_web::test]
async fn a_refused_sync_fails_without_indexing_anything() {
    let pds = MockPds::with_production_data().await;
    let state = state_pointing_at(&pds).await;

    pds.always_fail("com.atproto.sync.getRepo", 502, "UpstreamFailure");

    let result = rocksky_appview::backfill::backfill_repo(&state, &pds.did()).await;
    assert!(result.is_err(), "a 502 from getRepo must not be swallowed");
    assert_eq!(count(&state, "scrobbles").await, 0);

    // And once the PDS recovers, a retry works — so a transient failure is
    // not permanent.
    pds.clear_failures();
    rocksky_appview::backfill::backfill_repo(&state, &pds.did())
        .await
        .expect("the retry succeeds");
    assert!(count(&state, "scrobbles").await > 0);
}

/// `run` takes several DIDs and reports on each independently, so one bad
/// repo does not abort the rest.
#[actix_web::test]
async fn one_failing_repository_does_not_stop_the_others() {
    let pds = MockPds::with_production_data().await;
    let state = state_pointing_at(&pds).await;

    let reports =
        rocksky_appview::backfill::run(&state, &["did:plc:nobodyhere".to_string(), pds.did()])
            .await;

    assert_eq!(reports.len(), 2);
    assert!(
        count(&state, "scrobbles").await > 0,
        "the good repo was still imported"
    );
}
