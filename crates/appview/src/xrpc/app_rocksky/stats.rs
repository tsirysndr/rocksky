//! `app.rocksky.stats.*`

use crate::actors;
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::state::AppState;
use crate::xrpc::json;
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.stats.getGlobalStats", get_global_stats);
    xrpc_query!(cfg, "app.rocksky.stats.getStats", get_stats);
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct GlobalStatsView {
    pub scrobbles: i64,
    pub users: i64,
    pub artists: i64,
    pub albums: i64,
    pub tracks: i64,
}

/// `app.rocksky.stats.getGlobalStats`
///
/// Answers zeroes on failure, as the TypeScript `catchAll(() => defaultStats)`
/// does — a stats banner showing 0 is better than a broken page.
async fn get_global_stats(state: web::Data<AppState>) -> XrpcResult<HttpResponse> {
    match load_global_stats(state.db()).await {
        Ok(view) => json(view),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve global stats");
            json(GlobalStatsView::default())
        }
    }
}

async fn load_global_stats(db: &Backend) -> Result<GlobalStatsView, sqlx::Error> {
    Ok(GlobalStatsView {
        scrobbles: db.count(&db.sql("SELECT count(*) FROM scrobbles")).await?,
        users: db.count(&db.sql("SELECT count(*) FROM users")).await?,
        artists: db.count(&db.sql("SELECT count(*) FROM artists")).await?,
        albums: db.count(&db.sql("SELECT count(*) FROM albums")).await?,
        tracks: db.count(&db.sql("SELECT count(*) FROM tracks")).await?,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetStatsParams {
    /// A DID or a handle; see [`crate::actors`].
    pub did: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatsView {
    pub scrobbles: i64,
    pub artists: i64,
    pub loved_tracks: i64,
    pub albums: i64,
    pub tracks: i64,
}

/// `app.rocksky.stats.getStats`
///
/// One listener's totals. An unknown actor answers zeroes rather than 404,
/// matching the TypeScript handler's early return.
async fn get_stats(
    state: web::Data<AppState>,
    params: web::Query<GetStatsParams>,
) -> XrpcResult<HttpResponse> {
    match load_stats(state.db(), &params.did).await {
        Ok(view) => json(view),
        Err(err) => {
            tracing::error!(error = %err, did = %params.did, "failed to retrieve stats");
            json(StatsView::default())
        }
    }
}

async fn load_stats(db: &Backend, did_or_handle: &str) -> Result<StatsView, sqlx::Error> {
    let Some(user_id) = actors::find_user_id(db, did_or_handle).await? else {
        return Ok(StatsView::default());
    };

    // `artists`, `albums` and `tracks` are distinct counts over the user's
    // scrobbles — not row counts of those tables.
    let scoped = |what: &str| {
        let mut sql = db.sql(format!("SELECT {what} FROM scrobbles WHERE user_id = "));
        sql.bind(&user_id);
        sql
    };

    let mut loved = db.sql("SELECT count(*) FROM loved_tracks WHERE user_id = ");
    loved.bind(&user_id);

    Ok(StatsView {
        scrobbles: db.count(&scoped("count(*)")).await?,
        artists: db.count(&scoped("count(DISTINCT artist_id)")).await?,
        loved_tracks: db.count(&loved).await?,
        albums: db.count(&scoped("count(DISTINCT album_id)")).await?,
        tracks: db.count(&scoped("count(DISTINCT track_id)")).await?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Alice scrobbles three plays across two tracks by one artist on one
    /// album, and loves one track. Bob scrobbles once, so the per-user counts
    /// have something to exclude.
    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            "INSERT INTO artists (xata_id, name, sha256) VALUES \
             ('rec_artist', 'Boards of Canada', 'sha-artist')",
            "INSERT INTO albums (xata_id, title, artist, sha256) VALUES \
             ('rec_album', 'MHTRTC', 'Boards of Canada', 'sha-album')",
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t1'), \
             ('rec_t2', 'Olson', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t2')",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) \
             VALUES \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_album', 'rec_artist', 'at://1', '2026-01-01T00:00:00.000Z'), \
             ('rec_s2', 'rec_alice', 'rec_t1', 'rec_album', 'rec_artist', 'at://2', '2026-01-02T00:00:00.000Z'), \
             ('rec_s3', 'rec_alice', 'rec_t2', 'rec_album', 'rec_artist', 'at://3', '2026-01-03T00:00:00.000Z'), \
             ('rec_s4', 'rec_bob',   'rec_t1', 'rec_album', 'rec_artist', 'at://4', '2026-01-04T00:00:00.000Z')",
            "INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES \
             ('rec_l1', 'rec_alice', 'rec_t1')",
        ];

        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    #[tokio::test]
    async fn global_stats_count_whole_tables() {
        let db = fixture().await;
        let view = load_global_stats(&db).await.unwrap();
        assert_eq!(
            view,
            GlobalStatsView {
                scrobbles: 4,
                users: 2,
                artists: 1,
                albums: 1,
                tracks: 2,
            }
        );
    }

    #[tokio::test]
    async fn global_stats_on_an_empty_instance_are_zero() {
        let db = db::connect_in_memory().await.unwrap();
        assert_eq!(
            load_global_stats(&db).await.unwrap(),
            GlobalStatsView::default()
        );
    }

    #[tokio::test]
    async fn per_user_stats_count_distinctly_and_exclude_other_users() {
        let db = fixture().await;
        let view = load_stats(&db, "did:plc:alice").await.unwrap();
        assert_eq!(
            view,
            StatsView {
                // Three plays, but two distinct tracks and one distinct artist
                // and album. Bob's play is not counted.
                scrobbles: 3,
                artists: 1,
                loved_tracks: 1,
                albums: 1,
                tracks: 2,
            }
        );
    }

    #[tokio::test]
    async fn per_user_stats_accept_a_handle() {
        let db = fixture().await;
        assert_eq!(
            load_stats(&db, "alice.test").await.unwrap(),
            load_stats(&db, "did:plc:alice").await.unwrap()
        );
    }

    #[tokio::test]
    async fn an_unknown_actor_gets_zeroes_not_an_error() {
        let db = fixture().await;
        assert_eq!(
            load_stats(&db, "did:plc:nobody").await.unwrap(),
            StatsView::default()
        );
    }

    #[test]
    fn loved_tracks_is_camel_cased_on_the_wire() {
        // The Rust field is snake_case but the lexicon key is `lovedTracks`.
        let json = serde_json::to_string(&StatsView::default()).unwrap();
        assert!(json.contains("\"lovedTracks\":0"), "{json}");
        assert!(!json.contains("loved_tracks"), "{json}");
    }
}
