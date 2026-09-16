//! `app.rocksky.song.*` — the song page.

use super::ranking::{self, Scope};
use crate::db::models::{Track, TRACK_COLS};
use crate::db::schema::{Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Expr, Func, JoinType, Order, Query};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.song.getSong", get_song);
    xrpc_query!(cfg, "app.rocksky.song.getSongs", get_songs);
    xrpc_query!(
        cfg,
        "app.rocksky.song.getSongRecentListeners",
        get_song_recent_listeners
    );
}

const SONG_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongParams {
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

/// The song page's payload: the full record, its totals and the like state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewDetailed {
    #[serde(flatten)]
    pub track: crate::views::TrackView,
    pub play_count: i64,
    pub unique_listeners: i64,
    pub liked: bool,
    pub likes_count: i64,
}

async fn find_track(db: &Backend, uri: &str) -> Result<Option<Track>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, None);
    query
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(uri))
        .limit(1);

    db.fetch_optional::<Track>(&query).await
}

/// `app.rocksky.song.getSong`
async fn get_song(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
    auth: crate::auth::Auth,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    let db = state.db();
    let result = async {
        let Some(track) = find_track(db, &uri).await? else {
            return Ok(None);
        };
        let totals = ranking::totals_for(db, "track_id", &track.id).await?;
        let likes = crate::likes::for_track_ids(db, &[track.id.clone()], auth.did()).await?;
        let like = likes.get(&track.id).copied().unwrap_or_default();

        Ok::<_, anyhow::Error>(Some(SongViewDetailed {
            track: crate::views::TrackView::from(&track),
            play_count: totals.play_count,
            unique_listeners: totals.unique_listeners,
            liked: like.liked,
            likes_count: like.count,
        }))
    }
    .await;

    match result {
        Ok(Some(song)) => json(song),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving a song");
            json(serde_json::json!({}))
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SongsOutput {
    pub tracks: Vec<super::actor::SongViewBasic>,
}

/// `app.rocksky.song.getSongs`
///
/// The global top songs, ranked by everyone's plays.
async fn get_songs(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();

    // As with the album and artist charts: global, cached, lag-tolerant.
    match top_songs(
        &state.db().reads_may_lag(),
        &Scope::global(),
        clamp_limit_or(params.limit, SONG_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await
    {
        Ok(tracks) => json(SongsOutput { tracks }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving songs");
            json(SongsOutput::default())
        }
    }
}

/// Ranks tracks within `scope` and hydrates the winners.
///
/// Shared with the actor and artist track lists, which pass a user scope and
/// an id restriction respectively.
pub async fn top_songs(
    db: &Backend,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<super::actor::SongViewBasic>> {
    let ranked = ranking::by_plays(db, "track_id", scope, limit, offset).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = ranking::unique_listeners(db, "track_id", &ids, scope).await?;

    let by_id = crate::db::loaders::tracks_by_id(db, ids.iter().cloned().map(Some)).await?;

    Ok(ranked
        .iter()
        .filter_map(|(id, plays)| {
            let track = by_id.get(id.as_str())?;
            Some(super::actor::SongViewBasic {
                id: track.id.clone(),
                uri: track.uri.clone(),
                title: track.title.clone(),
                artist: track.artist.clone(),
                artist_uri: track.artist_uri.clone(),
                album: track.album.clone(),
                album_uri: track.album_uri.clone(),
                album_art: track.album_art.clone(),
                album_artist: track.album_artist.clone(),
                copyright_message: track.copyright_message.clone(),
                disc_number: track.disc_number,
                duration: track.duration,
                sha256: track.sha256.clone(),
                track_number: track.track_number,
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
                created_at: track.created_at,
            })
        })
        .collect())
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct RecentListenersOutput {
    pub listeners: Vec<super::artist::ListenerView>,
}

/// `app.rocksky.song.getSongRecentListeners`
///
/// Who played this song most recently. Shares the listener row with the
/// artist leaderboard, so the UI renders both with one component.
async fn get_song_recent_listeners(
    state: web::Data<AppState>,
    params: web::Query<SongParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(RecentListenersOutput::default());
    };

    let db = state.db();
    let limit = clamp_limit_or(params.limit, SONG_DEFAULT_LIMIT);
    let offset = clamp_offset(params.offset);

    let result = async {
        let Some(track) = find_track(db, &uri).await? else {
            return Ok(Vec::new());
        };

        let mut query = Query::select();
        query
            .expr(Expr::col((Alias::new("u"), Users::XataId)))
            .expr(Expr::col((Alias::new("u"), Users::Did)))
            .expr(Expr::col((Alias::new("u"), Users::Handle)))
            .expr(Expr::col((Alias::new("u"), Users::DisplayName)))
            .expr(Expr::col((Alias::new("u"), Users::Avatar)))
            .expr_as(db.cast_int(Func::count(Expr::val(1))), Alias::new("plays"))
            .from_as(Scrobbles::Table, Alias::new("s"))
            .join_as(
                JoinType::InnerJoin,
                Users::Table,
                Alias::new("u"),
                Expr::col((Alias::new("u"), Users::XataId))
                    .equals((Alias::new("s"), Scrobbles::UserId)),
            )
            .and_where(Expr::col((Alias::new("s"), Scrobbles::TrackId)).eq(track.id.clone()))
            // Every non-aggregated column, because Postgres requires it —
            // SQLite would accept grouping by the id alone.
            .add_group_by([
                Expr::col((Alias::new("u"), Users::XataId)).into(),
                Expr::col((Alias::new("u"), Users::Did)).into(),
                Expr::col((Alias::new("u"), Users::Handle)).into(),
                Expr::col((Alias::new("u"), Users::DisplayName)).into(),
                Expr::col((Alias::new("u"), Users::Avatar)).into(),
            ])
            // Most recent listener first, then by id so the page is stable.
            .order_by_expr(
                Func::max(Expr::col((Alias::new("s"), Scrobbles::Timestamp))).into(),
                Order::Desc,
            )
            .order_by((Alias::new("u"), Users::XataId), Order::Asc)
            .limit(limit as u64)
            .offset(offset as u64);

        type Row = (String, String, String, Option<String>, String, i64);
        let rows: Vec<Row> = db.fetch_all(&query).await?;

        Ok::<_, anyhow::Error>(
            rows.into_iter()
                .enumerate()
                .map(|(index, (id, did, handle, display_name, avatar, plays))| {
                    super::artist::ListenerView {
                        id,
                        did,
                        handle,
                        display_name,
                        avatar,
                        // There is only one song here, so "the song they
                        // played most" is this song — the field carries no
                        // information and is left absent.
                        most_listened_song: None,
                        total_plays: plays,
                        rank: offset + index as i64 + 1,
                    }
                })
                .collect(),
        )
    }
    .await;

    match result {
        Ok(listeners) => json(RecentListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving song listeners");
            json(RecentListenersOutput::default())
        }
    }
}
