//! `app.rocksky.artist.*` — the artist page.
//!
//! The albums and tracks lists go through the `artist_albums` and
//! `artist_tracks` junctions rather than matching on `tracks.artist`, because
//! the artist column holds the *credited* string — "Kendrick Lamar, Jay Rock"
//! — while the junction points at the album artist's row. Matching on text
//! would miss every collaboration.

use super::ranking::{self, Scope};
use crate::db::models::{Artist, ARTIST_COLS};
use crate::db::schema::{Artists, Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query, SimpleExpr};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.artist.getArtist", get_artist);
    xrpc_query!(cfg, "app.rocksky.artist.getArtists", get_artists);
    xrpc_query!(cfg, "app.rocksky.artist.getArtistAlbums", get_artist_albums);
    xrpc_query!(cfg, "app.rocksky.artist.getArtistTracks", get_artist_tracks);
    xrpc_query!(
        cfg,
        "app.rocksky.artist.getArtistListeners",
        get_artist_listeners
    );
    xrpc_query!(
        cfg,
        "app.rocksky.artist.getArtistRecentListeners",
        get_artist_recent_listeners
    );
}

const ARTIST_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistParams {
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

// ------------------------------------------------------------------- detail

/// The artist page's payload: the full record plus its totals.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistViewDetailed {
    #[serde(flatten)]
    pub artist: crate::views::ArtistView,
    pub play_count: i64,
    pub unique_listeners: i64,
}

async fn find_artist(db: &Backend, uri: &str) -> Result<Option<Artist>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Uri).eq(uri))
        .limit(1);
    db.fetch_optional::<Artist>(&query).await
}

/// `app.rocksky.artist.getArtist`
async fn get_artist(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(None);
        };
        let totals = ranking::totals_for(db, "artist_id", &artist.id).await?;
        Ok::<_, anyhow::Error>(Some(ArtistViewDetailed {
            artist: crate::views::ArtistView::from(&artist),
            play_count: totals.play_count,
            unique_listeners: totals.unique_listeners,
        }))
    }
    .await;

    match result {
        Ok(Some(artist)) => json(artist),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving an artist");
            json(serde_json::json!({}))
        }
    }
}

// -------------------------------------------------------------------- lists

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistsOutput {
    pub artists: Vec<super::actor::ArtistViewBasic>,
}

/// `app.rocksky.artist.getArtists`
///
/// The global top artists, ranked by everyone's plays.
async fn get_artists(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();

    // Cached, global, and nobody expects it to reflect a scrobble from a
    // second ago — so the replica is safe here.
    match top_artists(
        &state.db().reads_may_lag(),
        &Scope::global(),
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await
    {
        Ok(artists) => json(ArtistsOutput { artists }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving artists");
            json(ArtistsOutput::default())
        }
    }
}

/// Ranks artists within `scope` and hydrates the winners.
pub async fn top_artists(
    db: &Backend,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<super::actor::ArtistViewBasic>> {
    let ranked = ranking::by_plays(db, "artist_id", scope, limit, offset).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = ranking::unique_listeners(db, "artist_id", &ids, scope).await?;

    let by_id = crate::db::loaders::artists_by_id(db, ids.iter().cloned().map(Some)).await?;

    Ok(ranked
        .iter()
        .filter_map(|(id, plays)| {
            let artist = by_id.get(id.as_str())?;
            Some(super::actor::ArtistViewBasic {
                id: artist.id.clone(),
                name: artist.name.clone(),
                picture: artist.picture.clone(),
                sha256: artist.sha256.clone(),
                uri: artist.uri.clone(),
                tags: artist.genres.as_deref().map(|_| artist.genres()),
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
            })
        })
        .collect())
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistAlbumsOutput {
    pub albums: Vec<super::actor::AlbumViewBasic>,
}

/// `app.rocksky.artist.getArtistAlbums`
///
/// This artist's albums, most-played first. Restricted through the junction:
/// an artist's albums are the ones credited to them as album artist, which is
/// not the same as every album their name appears on.
async fn get_artist_albums(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ArtistAlbumsOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(Vec::new());
        };
        let album_ids =
            ranking::junction_ids(db, "artist_albums", "artist_id", "album_id", &artist.id).await?;

        super::album::top_albums(
            db,
            &Scope::global().restricted_to(album_ids),
            clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
            clamp_offset(params.offset),
        )
        .await
    }
    .await;

    match result {
        Ok(albums) => json(ArtistAlbumsOutput { albums }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist albums");
            json(ArtistAlbumsOutput::default())
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistTracksOutput {
    pub tracks: Vec<super::actor::SongViewBasic>,
}

/// `app.rocksky.artist.getArtistTracks`
async fn get_artist_tracks(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ArtistTracksOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(artist) = find_artist(db, &uri).await? else {
            return Ok(Vec::new());
        };
        let track_ids =
            ranking::junction_ids(db, "artist_tracks", "artist_id", "track_id", &artist.id).await?;

        super::song::top_songs(
            db,
            &Scope::global().restricted_to(track_ids),
            clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
            clamp_offset(params.offset),
        )
        .await
    }
    .await;

    match result {
        Ok(tracks) => json(ArtistTracksOutput { tracks }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist tracks");
            json(ArtistTracksOutput::default())
        }
    }
}

// ---------------------------------------------------------------- listeners

/// The track a listener played most of this artist's.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MostListenedSong {
    pub title: String,
    pub uri: Option<String>,
    pub play_count: i64,
}

/// One row of an artist's listener leaderboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenerView {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    /// `None` when the listener's most-played track row has gone.
    pub most_listened_song: Option<MostListenedSong>,
    pub total_plays: i64,
    /// Position in the leaderboard, 1-based. Sent by the server because the
    /// UI pages the list and cannot derive it from the index alone.
    pub rank: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ListenersOutput {
    pub listeners: Vec<ListenerView>,
}

/// `app.rocksky.artist.getArtistListeners`
///
/// Who has played this artist most, with each listener's own top track.
async fn get_artist_listeners(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ListenersOutput::default());
    };

    match load_listeners(
        state.db(),
        &uri,
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
        false,
    )
    .await
    {
        Ok(listeners) => json(ListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving artist listeners");
            json(ListenersOutput::default())
        }
    }
}

/// `app.rocksky.artist.getArtistRecentListeners`
///
/// The same rows ordered by when they last played the artist rather than by
/// how much — "who is listening now" against "who listens most".
async fn get_artist_recent_listeners(
    state: web::Data<AppState>,
    params: web::Query<ArtistParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(ListenersOutput::default());
    };

    match load_listeners(
        state.db(),
        &uri,
        clamp_limit_or(params.limit, ARTIST_DEFAULT_LIMIT),
        clamp_offset(params.offset),
        true,
    )
    .await
    {
        Ok(listeners) => json(ListenersOutput { listeners }),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving recent listeners");
            json(ListenersOutput::default())
        }
    }
}

async fn load_listeners(
    db: &Backend,
    uri: &str,
    limit: i64,
    offset: i64,
    by_recency: bool,
) -> anyhow::Result<Vec<ListenerView>> {
    let Some(artist) = find_artist(db, uri).await? else {
        return Ok(Vec::new());
    };

    // The leaderboard itself: one row per user who has played this artist.
    let ranked_by: SimpleExpr = if by_recency {
        Func::max(Expr::col((Alias::new("s"), Scrobbles::Timestamp))).into()
    } else {
        Expr::col(Alias::new("plays")).into()
    };

    let mut query = Query::select();
    query
        .expr(Expr::col((Alias::new("u"), Users::XataId)))
        .expr(Expr::col((Alias::new("u"), Users::Did)))
        .expr(Expr::col((Alias::new("u"), Users::Handle)))
        .expr(Expr::col((Alias::new("u"), Users::DisplayName)))
        .expr(Expr::col((Alias::new("u"), Users::Avatar)))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::InnerJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId))
                .equals((Alias::new("s"), Scrobbles::UserId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::ArtistId)).eq(&artist.id))
        // Every non-aggregated column, because Postgres requires it — SQLite
        // would accept grouping by the id alone.
        .add_group_by([
            Expr::col((Alias::new("u"), Users::XataId)).into(),
            Expr::col((Alias::new("u"), Users::Did)).into(),
            Expr::col((Alias::new("u"), Users::Handle)).into(),
            Expr::col((Alias::new("u"), Users::DisplayName)).into(),
            Expr::col((Alias::new("u"), Users::Avatar)).into(),
        ])
        .order_by_expr(ranked_by, Order::Desc)
        .order_by((Alias::new("u"), Users::XataId), Order::Asc)
        .limit(limit as u64)
        .offset(offset as u64);

    type Row = (String, String, String, Option<String>, String, i64);
    let rows: Vec<Row> = db.fetch_all(&query).await?;
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let user_ids: Vec<String> = rows.iter().map(|row| row.0.clone()).collect();
    let top = most_listened(db, &artist.id, &user_ids).await?;

    Ok(rows
        .into_iter()
        .enumerate()
        .map(
            |(index, (id, did, handle, display_name, avatar, plays))| ListenerView {
                most_listened_song: top.get(&id).cloned(),
                id,
                did,
                handle,
                display_name,
                avatar,
                total_plays: plays,
                // 1-based, and continuing across pages.
                rank: offset + index as i64 + 1,
            },
        )
        .collect())
}

/// Each user's most-played track by this artist.
///
/// One query for the whole page rather than one per listener: a window
/// function would be tidier, but SQLite's support for them is recent enough
/// that a self-hoster on an older build would break, and the result set here
/// is bounded by the page size times an artist's track count.
async fn most_listened(
    db: &Backend,
    artist_id: &str,
    user_ids: &[String],
) -> anyhow::Result<std::collections::HashMap<String, MostListenedSong>> {
    if user_ids.is_empty() {
        return Ok(Default::default());
    }

    let query = Query::select()
        .expr(Expr::col((Alias::new("s"), Scrobbles::UserId)))
        .expr(Expr::col((Alias::new("t"), Tracks::Title)))
        .expr(Expr::col((Alias::new("t"), Tracks::Uri)))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("s"), Scrobbles::TrackId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::ArtistId)).eq(artist_id))
        .and_where(
            Expr::col((Alias::new("s"), Scrobbles::UserId))
                .is_in(user_ids.iter().map(String::as_str)),
        )
        .add_group_by([
            Expr::col((Alias::new("s"), Scrobbles::UserId)).into(),
            Expr::col((Alias::new("t"), Tracks::Title)).into(),
            Expr::col((Alias::new("t"), Tracks::Uri)).into(),
        ])
        .order_by(Alias::new("plays"), Order::Desc)
        .order_by((Alias::new("t"), Tracks::Title), Order::Asc)
        .take();

    type Row = (String, String, Option<String>, i64);
    let rows: Vec<Row> = db.fetch_all(&query).await?;

    // Ordered by plays, so the first row seen for a user is their top track.
    let mut top = std::collections::HashMap::new();
    for (user_id, title, uri, plays) in rows {
        top.entry(user_id).or_insert(MostListenedSong {
            title,
            uri,
            play_count: plays,
        });
    }
    Ok(top)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The rank continues across pages: the first row of page two is rank 21,
    /// not rank 1.
    #[test]
    fn ranks_continue_across_pages() {
        let rank_for = |offset: i64, index: usize| offset + index as i64 + 1;

        assert_eq!(rank_for(0, 0), 1, "the leaderboard is 1-based");
        assert_eq!(rank_for(0, 19), 20);
        assert_eq!(rank_for(20, 0), 21, "page two continues the numbering");
    }

    /// The top track is the first row for a user in a plays-descending
    /// result, so later rows must not overwrite it.
    #[test]
    fn the_first_row_per_user_wins() {
        let rows: Vec<(String, String, Option<String>, i64)> = vec![
            ("u1".into(), "Most played".into(), None, 27),
            ("u1".into(), "Less played".into(), None, 3),
            ("u2".into(), "Theirs".into(), None, 5),
        ];

        let mut top = std::collections::HashMap::new();
        for (user_id, title, uri, plays) in rows {
            top.entry(user_id).or_insert(MostListenedSong {
                title,
                uri,
                play_count: plays,
            });
        }

        assert_eq!(top["u1"].title, "Most played");
        assert_eq!(top["u1"].play_count, 27);
        assert_eq!(top["u2"].title, "Theirs");
    }
}
