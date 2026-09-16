//! The two XRPC methods a feed generator serves.
//!
//! # The response shape follows the lexicon, not the deployed service
//!
//! `apps/feeds` answers `getFeedSkeleton` with
//!
//! ```json
//! { "feed": [ { "scrobble": "at://…" } ] }
//! ```
//!
//! while `app.rocksky.feed.getFeedSkeleton` declares
//!
//! ```json
//! { "scrobbles": [ scrobbleViewBasic ], "cursor": "…" }
//! ```
//!
//! They are not the same object, and the lexicon is the one the generated
//! clients are built from — `crates/rocksky-sdk` deserializes `scrobbles`, so
//! against the deployed service it silently gets none. This implements the
//! lexicon and returns hydrated views.
//!
//! That is a breaking change for anything written against the live service's
//! actual output. Nothing in this repository reads it: the only caller is the
//! generated SDK, which already expects the lexicon's shape.

use crate::feeds::{self, FeedRow};
use crate::FeedsState;
use actix_web::web::{self, ServiceConfig};
use actix_web::{HttpResponse, Responder};
use rocksky_lexicon::app::rocksky::scrobble::defs::ScrobbleViewBasic;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route(
        "/xrpc/app.rocksky.feed.describeFeedGenerator",
        web::get().to(describe),
    )
    .route(
        "/xrpc/app.rocksky.feed.getFeedSkeleton",
        web::get().to(skeleton),
    );
}

/// `app.rocksky.feed.describeFeedGenerator`
///
/// The list a client walks to discover what this generator serves. It carries
/// no metadata beyond the URIs — a feed's display name and description live in
/// its `app.rocksky.feed.generator` record, in the publisher's repository.
async fn describe(state: web::Data<FeedsState>) -> impl Responder {
    let config = state.config();

    HttpResponse::Ok().json(DescribeOutput {
        did: config.own_did(),
        feeds: feeds::FEEDS
            .iter()
            .map(|feed| FeedUri {
                uri: config.feed_uri(feed.rkey),
            })
            .collect(),
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct DescribeOutput {
    pub did: String,
    pub feeds: Vec<FeedUri>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FeedUri {
    pub uri: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SkeletonParams {
    pub feed: String,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonOutput {
    pub scrobbles: Vec<ScrobbleViewBasic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// `app.rocksky.feed.getFeedSkeleton`
async fn skeleton(
    state: web::Data<FeedsState>,
    params: web::Query<SkeletonParams>,
) -> impl Responder {
    let Some(rkey) = feed_rkey(&params.feed) else {
        return error(
            "InvalidRequest",
            "Unsupported algorithm",
            actix_web::http::StatusCode::BAD_REQUEST,
        );
    };

    let Some(feed) = feeds::find(&rkey) else {
        // Named `UnsupportedAlgorithm`, as upstream does — a client that asked
        // for a feed this generator does not serve needs to tell that apart
        // from a malformed request.
        return error(
            "UnsupportedAlgorithm",
            "Unsupported algorithm",
            actix_web::http::StatusCode::BAD_REQUEST,
        );
    };

    let limit = params.limit.unwrap_or(feeds::DEFAULT_LIMIT);
    let db = state.db();
    let query = feeds::query(&db, feed, limit, params.cursor.as_deref());

    let rows: Vec<FeedRow> = match db.fetch_all(&query).await {
        Ok(rows) => rows,
        Err(err) => {
            tracing::error!(feed = %params.feed, error = %err, "could not read a feed");
            return error(
                "InternalServerError",
                "Could not read that feed.",
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
            );
        }
    };

    HttpResponse::Ok().json(SkeletonOutput {
        cursor: feeds::next_cursor(&rows),
        scrobbles: rows.iter().map(view).collect(),
    })
}

/// The record key of a feed AT-URI, if it names a feed of this generator's.
///
/// The collection is checked as well as the shape: a URI pointing at
/// `app.rocksky.song` with a matching last segment is not a feed, and letting
/// it through would serve a feed for a request that asked for something else.
fn feed_rkey(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("at://")?;
    let mut parts = rest.splitn(3, '/');
    let _repo = parts.next()?;
    let collection = parts.next()?;
    let rkey = parts.next()?;

    if collection != "app.rocksky.feed.generator" || rkey.is_empty() || rkey.contains('/') {
        return None;
    }
    Some(rkey.to_string())
}

/// One row as the lexicon's view.
fn view(row: &FeedRow) -> ScrobbleViewBasic {
    ScrobbleViewBasic {
        id: Some(row.id.clone()),
        uri: row.uri.clone(),
        // The three fractional digits `toISOString()` produces, since clients
        // compare these strings.
        created_at: Some(rocksky_db::format_timestamp(row.timestamp)),
        title: Some(row.title.clone()),
        artist: Some(row.artist.clone()),
        album: Some(row.album.clone()),
        album_artist: Some(row.album_artist.clone()),
        album_art: row.album_art.clone(),
        album_uri: row.album_uri.clone(),
        artist_uri: row.artist_uri.clone(),
        sha256: Some(row.sha256.clone()),
        track_id: Some(row.track_id.clone()),
        track_uri: row.track_uri.clone(),
        did: Some(row.did.clone()),
        handle: Some(row.handle.clone()),
        avatar: Some(row.avatar.clone()),
        // A feed skeleton is not personalised — no algorithm here needs the
        // caller's identity — so there is no viewer to have liked anything,
        // and a `likes_count` would be a second query per row.
        liked: None,
        likes_count: None,
    }
}

/// The `@atproto/xrpc-server` error envelope: `{error, message}`.
fn error(name: &str, message: &str, status: actix_web::http::StatusCode) -> HttpResponse {
    HttpResponse::build(status).json(serde_json::json!({
        "error": name,
        "message": message,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test as http, App};

    async fn state() -> FeedsState {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        FeedsState::new(db, crate::Config::for_test())
    }

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    .app_data(web::Data::new($state.clone()))
                    .configure(crate::configure),
            )
            .await
        };
    }

    /// A feed URI must name this collection. Accepting any collection would
    /// serve a feed for a request that asked for a song.
    #[test]
    fn only_a_feed_generator_uri_names_a_feed() {
        assert_eq!(
            feed_rkey("at://did:plc:x/app.rocksky.feed.generator/metalcore").as_deref(),
            Some("metalcore")
        );

        for uri in [
            "at://did:plc:x/app.rocksky.song/metalcore",
            "at://did:plc:x/app.bsky.feed.generator/metalcore",
            "at://did:plc:x/app.rocksky.feed.generator/",
            "at://did:plc:x/app.rocksky.feed.generator",
            "https://example.com/metalcore",
            "metalcore",
            "",
        ] {
            assert!(feed_rkey(uri).is_none(), "{uri} was accepted");
        }
    }

    /// The advertised list is what a client subscribes from, so it has to name
    /// this instance and every feed.
    #[actix_web::test]
    async fn describe_lists_every_feed_under_this_did() {
        let app = app!(state().await);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.feed.describeFeedGenerator")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["did"], "did:web:feeds.example.com");

        let advertised = body["feeds"].as_array().unwrap();
        assert_eq!(advertised.len(), feeds::FEEDS.len());
        assert!(advertised.iter().any(|feed| feed["uri"]
            == "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore"));
    }

    /// An unknown feed is a 400 naming the reason, not an empty page that
    /// looks like a feed nobody has scrobbled to.
    #[actix_web::test]
    async fn an_unknown_feed_is_refused() {
        let app = app!(state().await);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.feed.getFeedSkeleton?feed=at://did:plc:x/app.rocksky.feed.generator/nope")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);

        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["error"], "UnsupportedAlgorithm");
    }

    /// The whole point: a genre feed returns only scrobbles whose artist is
    /// tagged with that genre, newest first, and pages with the cursor.
    #[actix_web::test]
    async fn a_genre_feed_filters_orders_and_pages() {
        let state = state().await;
        let db = state.db();

        let user = rocksky_db::new_id();
        let insert_user = rocksky_db::sea_query::Query::insert()
            .into_table(rocksky_db::schema::Users::Table)
            .columns([
                rocksky_db::schema::Users::XataId,
                rocksky_db::schema::Users::Did,
                rocksky_db::schema::Users::Handle,
                rocksky_db::schema::Users::Avatar,
            ])
            .values_panic([
                user.clone().into(),
                "did:plc:alice".into(),
                "alice.test".into(),
                "".into(),
            ])
            .to_owned();
        db.execute(&insert_user).await.unwrap();

        // Two artists: one tagged metalcore, one not.
        for (id, name, genres) in [
            ("rec_a_core", "Coreband", r#"["metalcore","metal"]"#),
            ("rec_a_pop", "Popband", r#"["dance pop"]"#),
        ] {
            let insert = rocksky_db::sea_query::Query::insert()
                .into_table(rocksky_db::schema::Artists::Table)
                .columns([
                    rocksky_db::schema::Artists::XataId,
                    rocksky_db::schema::Artists::Name,
                    rocksky_db::schema::Artists::Sha256,
                    rocksky_db::schema::Artists::Genres,
                ])
                .values_panic([id.into(), name.into(), id.into(), genres.into()])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }

        for (id, title, artist) in [
            ("rec_t_core", "Breakdown", "Coreband"),
            ("rec_t_pop", "Chorus", "Popband"),
        ] {
            let insert = rocksky_db::sea_query::Query::insert()
                .into_table(rocksky_db::schema::Tracks::Table)
                .columns([
                    rocksky_db::schema::Tracks::XataId,
                    rocksky_db::schema::Tracks::Title,
                    rocksky_db::schema::Tracks::Artist,
                    rocksky_db::schema::Tracks::AlbumArtist,
                    rocksky_db::schema::Tracks::Album,
                    rocksky_db::schema::Tracks::Duration,
                    rocksky_db::schema::Tracks::Sha256,
                ])
                .values_panic([
                    id.into(),
                    title.into(),
                    artist.into(),
                    artist.into(),
                    "An Album".into(),
                    1000i64.into(),
                    id.into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }

        // Three metalcore scrobbles and one pop, at known times.
        for (id, track, artist, at) in [
            (
                "rec_s1",
                "rec_t_core",
                "rec_a_core",
                "2026-01-01T00:00:01.000Z",
            ),
            (
                "rec_s2",
                "rec_t_core",
                "rec_a_core",
                "2026-01-01T00:00:02.000Z",
            ),
            (
                "rec_s3",
                "rec_t_core",
                "rec_a_core",
                "2026-01-01T00:00:03.000Z",
            ),
            (
                "rec_s4",
                "rec_t_pop",
                "rec_a_pop",
                "2026-01-01T00:00:04.000Z",
            ),
        ] {
            let insert = rocksky_db::sea_query::Query::insert()
                .into_table(rocksky_db::schema::Scrobbles::Table)
                .columns([
                    rocksky_db::schema::Scrobbles::XataId,
                    rocksky_db::schema::Scrobbles::UserId,
                    rocksky_db::schema::Scrobbles::TrackId,
                    rocksky_db::schema::Scrobbles::ArtistId,
                    rocksky_db::schema::Scrobbles::Timestamp,
                ])
                .values_panic([
                    id.into(),
                    user.clone().into(),
                    track.into(),
                    artist.into(),
                    at.into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }

        let app = app!(state);
        let feed = "at://did:plc:x/app.rocksky.feed.generator/metalcore";

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(&format!(
                    "/xrpc/app.rocksky.feed.getFeedSkeleton?feed={feed}"
                ))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;

        let ids: Vec<&str> = body["scrobbles"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].as_str().unwrap())
            .collect();
        // The pop scrobble is excluded, and the rest are newest first.
        assert_eq!(ids, vec!["rec_s3", "rec_s2", "rec_s1"], "{body}");

        // The view is hydrated, not a bare URI — the lexicon's shape.
        assert_eq!(body["scrobbles"][0]["title"], "Breakdown");
        assert_eq!(body["scrobbles"][0]["handle"], "alice.test");

        // And the cursor walks backwards through the same order.
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(&format!(
                    "/xrpc/app.rocksky.feed.getFeedSkeleton?feed={feed}&limit=1"
                ))
                .to_request(),
        )
        .await;
        let page: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(page["scrobbles"].as_array().unwrap().len(), 1);
        assert_eq!(page["scrobbles"][0]["id"], "rec_s3");

        let cursor = page["cursor"].as_str().unwrap().to_string();
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri(&format!(
                    "/xrpc/app.rocksky.feed.getFeedSkeleton?feed={feed}&limit=1&cursor={cursor}"
                ))
                .to_request(),
        )
        .await;
        let next: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(
            next["scrobbles"][0]["id"], "rec_s2",
            "the cursor must not repeat the row it came from: {next}"
        );
    }

    /// The `all` feed joins no artist row, so a scrobble whose artist is
    /// missing still appears — an inner join would silently drop it.
    #[actix_web::test]
    async fn the_all_feed_includes_every_scrobble() {
        let state = state().await;
        let db = state.db();

        let user = rocksky_db::new_id();
        let insert_user = rocksky_db::sea_query::Query::insert()
            .into_table(rocksky_db::schema::Users::Table)
            .columns([
                rocksky_db::schema::Users::XataId,
                rocksky_db::schema::Users::Did,
                rocksky_db::schema::Users::Handle,
                rocksky_db::schema::Users::Avatar,
            ])
            .values_panic([
                user.clone().into(),
                "did:plc:alice".into(),
                "alice.test".into(),
                "".into(),
            ])
            .to_owned();
        db.execute(&insert_user).await.unwrap();

        let insert_track = rocksky_db::sea_query::Query::insert()
            .into_table(rocksky_db::schema::Tracks::Table)
            .columns([
                rocksky_db::schema::Tracks::XataId,
                rocksky_db::schema::Tracks::Title,
                rocksky_db::schema::Tracks::Artist,
                rocksky_db::schema::Tracks::AlbumArtist,
                rocksky_db::schema::Tracks::Album,
                rocksky_db::schema::Tracks::Duration,
                rocksky_db::schema::Tracks::Sha256,
            ])
            .values_panic([
                "rec_t".into(),
                "Untagged".into(),
                "Nobody".into(),
                "Nobody".into(),
                "An Album".into(),
                1000i64.into(),
                "rec_t".into(),
            ])
            .to_owned();
        db.execute(&insert_track).await.unwrap();

        // No `artist_id`: nothing has tagged this artist.
        let insert = rocksky_db::sea_query::Query::insert()
            .into_table(rocksky_db::schema::Scrobbles::Table)
            .columns([
                rocksky_db::schema::Scrobbles::XataId,
                rocksky_db::schema::Scrobbles::UserId,
                rocksky_db::schema::Scrobbles::TrackId,
                rocksky_db::schema::Scrobbles::Timestamp,
            ])
            .values_panic([
                "rec_s".into(),
                user.into(),
                "rec_t".into(),
                "2026-01-01T00:00:00.000Z".into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();

        let app = app!(state);
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.feed.getFeedSkeleton?feed=at://did:plc:x/app.rocksky.feed.generator/all")
                .to_request(),
        )
        .await;
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["scrobbles"].as_array().unwrap().len(), 1, "{body}");
        assert_eq!(body["scrobbles"][0]["title"], "Untagged");
    }

    /// An unbounded `limit` would serialize the whole history.
    #[actix_web::test]
    async fn the_limit_is_capped() {
        let app = app!(state().await);
        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.feed.getFeedSkeleton?feed=at://did:plc:x/app.rocksky.feed.generator/all&limit=100000")
                .to_request(),
        )
        .await;
        // No rows to return, but it must answer rather than try.
        assert_eq!(res.status(), 200);

        let db = rocksky_db::connect_in_memory().await.unwrap();
        let sql = feeds::query(&db, feeds::find("all").unwrap(), 100_000, None)
            .to_string(rocksky_db::sea_query::SqliteQueryBuilder);
        assert!(
            sql.contains(&format!("LIMIT {}", feeds::MAX_LIMIT)),
            "{sql}"
        );
    }
}
