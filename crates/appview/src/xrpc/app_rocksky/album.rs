//! `app.rocksky.album.*` — the album page.
//!
//! An album is addressed by its AT-URI, not its row id: the UI navigates from
//! a scrobble's `albumUri`, and the row id is an implementation detail that
//! changes if a database is rebuilt.
//!
//! The track list comes from the `album_tracks` junction rather than from
//! `tracks.album`, because the same album title by the same artist can exist
//! as more than one row (different editions), and matching on the text would
//! merge them.

use super::ranking::{self, Scope};
use crate::db::models::{Album, Track, ALBUM_COLS, TRACK_COLS};
use crate::db::schema::{AlbumTracks, Albums, Tracks};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::likes;
use crate::sea_query::{Alias, Expr, JoinType, Order, Query, SimpleExpr};
use crate::state::AppState;
use crate::views::TrackView;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.album.getAlbum", get_album);
    xrpc_query!(cfg, "app.rocksky.album.getAlbums", get_albums);
    xrpc_query!(cfg, "app.rocksky.album.getAlbumTracks", get_album_tracks);
}

/// The compact album row, shared by every album list.
///
/// The same 11 fields the live `getAlbums`, `getArtistAlbums` and
/// `getActorAlbums` all return.
pub use super::actor::AlbumViewBasic;

/// A track as an album page lists it.
///
/// [`TrackView`] minus `lyrics`, which is too large for a list, plus the like
/// state — and the like state is only present on the album *detail* response,
/// not on `getAlbumTracks`, so both are optional and omitted when absent.
/// That reproduces the live field counts exactly: 30 and 28.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTrackView {
    #[serde(flatten)]
    pub track: TrackView,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
}

impl AlbumTrackView {
    fn new(track: &Track, like: Option<likes::Likes>) -> Self {
        let mut view = TrackView::from(track);
        // `lyrics` is dropped rather than left null: the live response omits
        // the key entirely, and a full lyric sheet per track would dominate
        // the payload of a twenty-track album.
        view.lyrics = None;
        Self {
            track: view,
            liked: like.map(|like| like.liked),
            likes_count: like.map(|like| like.count),
        }
    }
}

/// Removes `lyrics` from a serialized track view.
///
/// `TrackView` declares `lyrics` without `skip_serializing_if`, because the
/// endpoints that use it directly do emit `lyrics: null`. Here the key must be
/// absent, so it is removed after the fact rather than by making the field
/// conditional everywhere.
fn without_lyrics(mut value: serde_json::Value) -> serde_json::Value {
    if let Some(object) = value.as_object_mut() {
        object.remove("lyrics");
    }
    value
}

const ALBUM_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

// ------------------------------------------------------------------- detail

/// The album page's payload: the row, its totals, and its tracks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumViewDetailed {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub release_date: Option<String>,
    pub year: Option<i64>,
    pub album_art: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    pub apple_music_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    pub sha256: String,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// The live response serializes this as `{}` — a Drizzle `Date` that was
    /// spread into a plain object and lost its `toJSON`. A real timestamp is
    /// emitted here instead: reproducing the bug would mean the UI could never
    /// start using the field.
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub xata_version: Option<i64>,
    /// An empty array rather than `null` on this view, which is what the live
    /// response shows.
    pub tags: Vec<String>,
    pub play_count: i64,
    pub unique_listeners: i64,
    pub tracks: Vec<serde_json::Value>,
}

/// `app.rocksky.album.getAlbum`
///
/// Answers `{}` for an unknown URI, as the live API does.
async fn get_album(
    state: web::Data<AppState>,
    params: web::Query<AlbumParams>,
    auth: crate::auth::Auth,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    match load_album(state.db(), &uri, auth.did()).await {
        Ok(Some(album)) => json(album),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving an album");
            json(serde_json::json!({}))
        }
    }
}

/// `1` when the column is NULL, `0` otherwise — for ordering NULLs last.
///
/// `ORDER BY col ASC` does not agree across backends: SQLite sorts NULL first,
/// Postgres sorts it last. Sorting on this first makes the answer the same on
/// both, which matters because an album's disc and track numbers are both
/// nullable and the track list is what a person sees.
fn nulls_last(column: (Alias, impl crate::sea_query::IntoIden + 'static)) -> SimpleExpr {
    crate::sea_query::CaseStatement::new()
        .case(Expr::col(column).is_null(), 1)
        .finally(0)
        .into()
}

async fn find_album(db: &Backend, uri: &str) -> Result<Option<Album>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, ALBUM_COLS, None);
    query
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Uri).eq(uri))
        .limit(1);

    db.fetch_optional::<Album>(&query).await
}

async fn load_album(
    db: &Backend,
    uri: &str,
    viewer: Option<&str>,
) -> anyhow::Result<Option<AlbumViewDetailed>> {
    let Some(album) = find_album(db, uri).await? else {
        return Ok(None);
    };

    let totals = ranking::totals_for(db, "album_id", &album.id).await?;
    let tracks = album_tracks(db, &album.id, i64::MAX, 0, viewer, true).await?;

    Ok(Some(AlbumViewDetailed {
        id: album.id.clone(),
        title: album.title.clone(),
        artist: album.artist.clone(),
        release_date: album.release_date.clone(),
        year: album.year,
        album_art: album.album_art.clone(),
        uri: album.uri.clone(),
        artist_uri: album.artist_uri.clone(),
        apple_music_link: album.apple_music_link.clone(),
        spotify_link: album.spotify_link.clone(),
        tidal_link: album.tidal_link.clone(),
        youtube_link: album.youtube_link.clone(),
        sha256: album.sha256.clone(),
        created_at: album.created_at,
        updated_at: album.updated_at,
        xata_version: album.xata_version,
        // Albums have no genre column; the live response shows `[]` here.
        tags: Vec::new(),
        play_count: totals.play_count,
        unique_listeners: totals.unique_listeners,
        tracks,
    }))
}

// ------------------------------------------------------------------- tracks

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AlbumTracksOutput {
    pub tracks: Vec<serde_json::Value>,
}

/// `app.rocksky.album.getAlbumTracks`
///
/// The same rows the detail response embeds, minus the like state, and paged.
async fn get_album_tracks(
    state: web::Data<AppState>,
    params: web::Query<AlbumParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(uri) = params.uri.clone() else {
        return json(AlbumTracksOutput::default());
    };

    let db = state.db();
    let result = async {
        let Some(album) = find_album(db, &uri).await? else {
            return Ok(AlbumTracksOutput::default());
        };
        let tracks = album_tracks(
            db,
            &album.id,
            clamp_limit_or(params.limit, ALBUM_DEFAULT_LIMIT),
            clamp_offset(params.offset),
            None,
            false,
        )
        .await?;
        Ok::<_, anyhow::Error>(AlbumTracksOutput { tracks })
    }
    .await;

    match result {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving album tracks");
            json(AlbumTracksOutput::default())
        }
    }
}

/// An album's tracks in disc-and-track order.
///
/// Ordered by the printed running order rather than by popularity, because
/// that is how an album is read. A track with no number sorts last rather
/// than first, which is what `NULLS LAST` would do and what a NULL sorting as
/// zero would not.
async fn album_tracks(
    db: &Backend,
    album_id: &str,
    limit: i64,
    offset: i64,
    viewer: Option<&str>,
    with_likes: bool,
) -> anyhow::Result<Vec<serde_json::Value>> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, Some("t"));
    query
        .from_as(AlbumTracks::Table, Alias::new("at"))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("at"), AlbumTracks::TrackId)),
        )
        .and_where(Expr::col((Alias::new("at"), AlbumTracks::AlbumId)).eq(album_id))
        // NULLs last, then by position. Both columns are nullable, and a
        // plain ASC puts NULL first on SQLite and last on Postgres — the
        // explicit CASE is what makes the order the same on both.
        .order_by_expr(
            nulls_last((Alias::new("t"), Tracks::DiscNumber)),
            Order::Asc,
        )
        .order_by((Alias::new("t"), Tracks::DiscNumber), Order::Asc)
        .order_by_expr(
            nulls_last((Alias::new("t"), Tracks::TrackNumber)),
            Order::Asc,
        )
        .order_by((Alias::new("t"), Tracks::TrackNumber), Order::Asc)
        .order_by((Alias::new("t"), Tracks::Title), Order::Asc)
        .limit(limit as u64)
        .offset(offset as u64);

    let tracks: Vec<Track> = db.fetch_all(&query).await?;
    if tracks.is_empty() {
        return Ok(Vec::new());
    }

    let likes = if with_likes {
        let ids: Vec<String> = tracks.iter().map(|track| track.id.clone()).collect();
        likes::for_track_ids(db, &ids, viewer).await?
    } else {
        Default::default()
    };

    Ok(tracks
        .iter()
        .map(|track| {
            let like = with_likes.then(|| likes.get(&track.id).copied().unwrap_or_default());
            let view = AlbumTrackView::new(track, like);
            without_lyrics(serde_json::to_value(view).unwrap_or_default())
        })
        .collect())
}

// -------------------------------------------------------------------- lists

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AlbumsOutput {
    pub albums: Vec<AlbumViewBasic>,
}

/// `app.rocksky.album.getAlbums`
///
/// The global top albums, ranked by everyone's plays.
async fn get_albums(
    state: web::Data<AppState>,
    params: web::Query<AlbumParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let db = state.db();

    // The global chart is cached and has no read-after-write expectation, so
    // it is one of the few reads that can tolerate a replica's lag.
    match top_albums(
        &db.reads_may_lag(),
        &Scope::global(),
        clamp_limit_or(params.limit, ALBUM_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await
    {
        Ok(albums) => json(AlbumsOutput { albums }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving albums");
            json(AlbumsOutput::default())
        }
    }
}

/// Ranks albums within `scope` and hydrates the winners.
///
/// Shared with `app.rocksky.artist.getArtistAlbums`, which passes a scope
/// restricted to one artist's albums.
pub async fn top_albums(
    db: &Backend,
    scope: &Scope,
    limit: i64,
    offset: i64,
) -> anyhow::Result<Vec<AlbumViewBasic>> {
    let ranked = ranking::by_plays(db, "album_id", scope, limit, offset).await?;
    if ranked.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = ranking::unique_listeners(db, "album_id", &ids, scope).await?;

    // The shared batch loader, which is this exact query.
    let by_id = crate::db::loaders::albums_by_id(db, ids.iter().cloned().map(Some)).await?;

    // Walked in ranking order so the response is ordered by plays.
    Ok(ranked
        .iter()
        .filter_map(|(id, plays)| {
            let album = by_id.get(id.as_str())?;
            Some(AlbumViewBasic {
                id: album.id.clone(),
                title: album.title.clone(),
                artist: album.artist.clone(),
                album_art: album.album_art.clone(),
                uri: album.uri.clone(),
                artist_uri: album.artist_uri.clone(),
                sha256: album.sha256.clone(),
                year: album.year,
                release_date: album.release_date.clone(),
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The live `getAlbumTracks` omits `lyrics` entirely rather than sending
    /// `lyrics: null`, because an album's worth of lyric sheets would dominate
    /// the payload.
    #[test]
    fn a_track_view_for_an_album_drops_lyrics() {
        let value = serde_json::json!({ "title": "Roygbiv", "lyrics": null });
        let stripped = without_lyrics(value);
        assert!(stripped.get("lyrics").is_none(), "{stripped}");
        assert_eq!(stripped["title"], "Roygbiv");
    }

    /// The like state is only on the detail response. `getAlbumTracks` must
    /// not carry it, which is the difference between the live 30-field and
    /// 28-field shapes.
    #[test]
    fn the_like_state_is_omitted_when_absent() {
        let track = crate::db::models::Track {
            id: "t1".into(),
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album_artist: "Boards of Canada".into(),
            album_art: None,
            album: "Music Has the Right to Children".into(),
            track_number: Some(4),
            duration: 151_000,
            mb_id: None,
            isrc: None,
            youtube_link: None,
            spotify_link: None,
            apple_music_link: None,
            tidal_link: None,
            sha256: "abc".into(),
            disc_number: Some(1),
            lyrics: Some("a lyric sheet".into()),
            composer: None,
            genre: None,
            label: None,
            copyright_message: None,
            key: None,
            bpm: None,
            uri: None,
            album_uri: None,
            artist_uri: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            xata_version: None,
        };

        let without = serde_json::to_value(AlbumTrackView::new(&track, None)).unwrap();
        assert!(without.get("liked").is_none(), "{without}");
        assert!(without.get("likesCount").is_none(), "{without}");

        let with = serde_json::to_value(AlbumTrackView::new(
            &track,
            Some(likes::Likes {
                count: 3,
                liked: true,
            }),
        ))
        .unwrap();
        assert_eq!(with["liked"], true);
        assert_eq!(with["likesCount"], 3);

        // And the lyric sheet is cleared either way.
        assert!(with["lyrics"].is_null(), "{with}");
    }
}
