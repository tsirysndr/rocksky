//! A like on a song this instance has never seen.
//!
//! The firehose delivers records repository by repository, so a like in one
//! account's repo pointing at a song in another's arrives before — or instead
//! of — the repository holding that song. A like carries nothing but the
//! reference: no title, no artist, no duration. So it cannot be stored
//! unattached the way a shout can, and before this it was counted as skipped
//! and lost.
//!
//! Run against `rocksky-mock-pds`, which serves both the DID document and
//! `com.atproto.repo.getRecord`, so the whole resolution path is exercised
//! rather than stubbed.

use rocksky_appview::db::schema::{LovedTracks, Tracks};
use rocksky_appview::ingest::{self, IncomingRecord};
use rocksky_appview::sea_query::{Expr, Func, Query};
use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use rocksky_mock_pds::MockPds;

const OWNER: &str = "did:plc:songowner";
const LIKER: &str = "did:plc:liker";
const SONG_RKEY: &str = "3song";

fn song_uri() -> String {
    format!("at://{OWNER}/{}/{SONG_RKEY}", ingest::SONG_NSID)
}

/// A PDS holding the song, in the *owner's* repository — not the liker's.
async fn pds_with_the_song() -> MockPds {
    MockPds::builder()
        .account(OWNER, "owner.example", "password")
        .account(LIKER, "liker.example", "password")
        .record(
            OWNER,
            ingest::SONG_NSID,
            SONG_RKEY,
            serde_json::json!({
                "$type": ingest::SONG_NSID,
                "title": "Roygbiv",
                "artist": "Boards of Canada",
                "album": "Music Has the Right to Children",
                "albumArtist": "Boards of Canada",
                "duration": 151_000,
                "albumArtUrl": "https://cdn.invalid/mhtrtc.jpg",
                "createdAt": "2026-01-01T00:00:00.000Z",
            }),
        )
        .start()
        .await
}

async fn state_pointing_at(base: &str) -> AppState {
    let mut config = Config::for_test();
    config.plc_directory_url = base.to_string();
    config.bsky_appview_url = base.to_string();
    AppState::for_test_with(config).await.expect("state")
}

fn a_like() -> IncomingRecord {
    IncomingRecord {
        did: LIKER.into(),
        collection: ingest::LIKE_NSID.into(),
        rkey: "3like".into(),
        value: serde_json::json!({
            "$type": ingest::LIKE_NSID,
            "subject": { "uri": song_uri(), "cid": "bafysong" },
            "createdAt": "2026-02-01T00:00:00.000Z",
        }),
    }
}

async fn count(state: &AppState, table: impl rocksky_appview::sea_query::IntoTableRef) -> i64 {
    let db = state.db();
    db.count(
        &Query::select()
            .expr(db.cast_int(Func::count(Expr::col(
                rocksky_appview::sea_query::Alias::new("xata_id"),
            ))))
            .from(table)
            .to_owned(),
    )
    .await
    .unwrap()
}

/// The projection alone cannot store this like — that is the precondition for
/// the rest of the test meaning anything.
#[tokio::test]
async fn ingest_alone_cannot_store_a_like_for_an_unknown_song() {
    let db = rocksky_appview::db::connect_in_memory().await.unwrap();

    let stats = ingest::ingest(&db, &a_like()).await.unwrap();
    assert_eq!(stats.likes, 0);
    assert_eq!(stats.skipped, 1, "nothing to attach the like to");
}

/// With a PDS to ask, the song is fetched and the like lands.
#[actix_web::test]
async fn a_like_on_someone_elses_song_is_recovered() {
    let pds = pds_with_the_song().await;
    let state = state_pointing_at(pds.url()).await;

    let like = a_like();
    // As the firehose delivers it: the song is not indexed here.
    let first = ingest::ingest(state.db(), &like).await.unwrap();
    assert_eq!(first.likes, 0);
    assert_eq!(count(&state, Tracks::Table).await, 0);

    let recovered = rocksky_appview::materialise::resolve_like(&state, &like).await;
    assert_eq!(
        recovered.likes, 1,
        "the like was stored after fetching the song"
    );
    assert_eq!(recovered.skipped, 0);

    // The song came with it, as a full track rather than a stub: the record
    // carries the metadata, so the album and artist are built too.
    assert_eq!(count(&state, Tracks::Table).await, 1);
    assert_eq!(count(&state, LovedTracks::Table).await, 1);

    let title = state
        .db()
        .fetch_scalar::<String>(
            &Query::select()
                .column(Tracks::Title)
                .from(Tracks::Table)
                .to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(title.as_deref(), Some("Roygbiv"));

    // The track is addressable by the URI the like named, which is what lets
    // a second like on the same song attach without another fetch.
    let uri = state
        .db()
        .fetch_scalar::<String>(
            &Query::select()
                .column(Tracks::Uri)
                .from(Tracks::Table)
                .to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(uri.as_deref(), Some(song_uri().as_str()));

    let second = ingest::ingest(state.db(), &a_like()).await.unwrap();
    assert_eq!(second.skipped, 0, "the song is indexed now");
}

/// A subject the PDS does not have is reported as skipped rather than
/// retried forever or counted as a success.
#[actix_web::test]
async fn a_like_for_a_song_that_does_not_exist_is_skipped() {
    let pds = pds_with_the_song().await;
    let state = state_pointing_at(pds.url()).await;

    let mut like = a_like();
    like.value["subject"]["uri"] =
        serde_json::json!(format!("at://{OWNER}/{}/3missing", ingest::SONG_NSID));

    let result = rocksky_appview::materialise::resolve_like(&state, &like).await;
    assert_eq!(result.likes, 0);
    assert_eq!(result.skipped, 1);
    assert_eq!(count(&state, Tracks::Table).await, 0);
}

/// A like with no subject at all cannot be resolved, and must not cost a
/// request to find that out.
#[actix_web::test]
async fn a_like_with_no_subject_is_skipped() {
    let pds = pds_with_the_song().await;
    let state = state_pointing_at(pds.url()).await;

    let like = IncomingRecord {
        did: LIKER.into(),
        collection: ingest::LIKE_NSID.into(),
        rkey: "3empty".into(),
        value: serde_json::json!({ "$type": ingest::LIKE_NSID }),
    };

    let result = rocksky_appview::materialise::resolve_like(&state, &like).await;
    assert_eq!(result.skipped, 1);
}
