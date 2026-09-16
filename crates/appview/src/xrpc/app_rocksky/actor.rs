//! `app.rocksky.actor.*` — everything a profile page reads.
//!
//! All eight of these share one shape: resolve `did` (which accepts a handle
//! too, as the TypeScript handlers do), then answer a list. Two things about
//! that shape are worth stating once rather than in each handler.
//!
//! **An unknown actor is an empty list, not a 404.** The TypeScript handlers
//! return `{ data: [] }` when the user lookup misses, and wrap everything in
//! `Effect.catchAll` so a database problem answers empty too. That is
//! reproduced here — a profile that fails to load should render blank, not
//! break the page.
//!
//! **Top-N lists are ranked by play count, then hydrated.** The count and the
//! detail cannot come from one query without either an expensive join across
//! every scrobble or a `GROUP BY` over every selected column, so the ranking
//! runs first, over `scrobbles` alone, and the rows for the winning ids are
//! fetched after. The order of the ranking query is what the response
//! preserves — re-sorting the hydrated rows would lose ties' ordering.

use crate::db::models::{Scrobble, Track, User, SCROBBLE_COLS, TRACK_COLS, USER_COLS};
use crate::db::schema::{
    Follows, LovedTracks, Scrobbles, Tracks, UserAlbums, UserArtists, UserTracks, Users,
};
use crate::db::{loaders, Backend};
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Asterisk, Expr, Func, JoinType, Order, Query, SelectStatement};
use crate::state::AppState;
use crate::views::TrackView;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.actor.getProfile", get_profile);
    xrpc_query!(
        cfg,
        "app.rocksky.actor.getActorScrobbles",
        get_actor_scrobbles
    );
    xrpc_query!(cfg, "app.rocksky.actor.getActorSongs", get_actor_songs);
    xrpc_query!(cfg, "app.rocksky.actor.getActorAlbums", get_actor_albums);
    xrpc_query!(cfg, "app.rocksky.actor.getActorArtists", get_actor_artists);
    xrpc_query!(
        cfg,
        "app.rocksky.actor.getActorLovedSongs",
        get_actor_loved_songs
    );
}

/// These default to 10 rather than the usual 20 — `params.limit ?? 10` in the
/// TypeScript handlers.
const ACTOR_DEFAULT_LIMIT: i64 = 10;

/// The parameters every one of these takes.
///
/// `did` is misnamed in the lexicon: it accepts a handle as well, and the UI
/// passes whichever it has. The date window is optional and, when given,
/// narrows both the ranking and the listener counts — otherwise a "top songs
/// this month" list would show all-time listener numbers.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorParams {
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
}

impl ActorParams {
    fn limit(&self) -> i64 {
        clamp_limit_or(self.limit, ACTOR_DEFAULT_LIMIT)
    }

    fn offset(&self) -> i64 {
        clamp_offset(self.offset)
    }
}

/// Resolves an actor by DID or handle.
async fn find_user(db: &Backend, did_or_handle: &str) -> Result<Option<User>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, USER_COLS, None);
    query
        .from(Users::Table)
        .and_where(
            Expr::col(Users::Did)
                .eq(did_or_handle)
                .or(Expr::col(Users::Handle).eq(did_or_handle)),
        )
        .limit(1);
    db.fetch_optional::<User>(&query).await
}

/// Narrows a `scrobbles` query to the optional date window.
///
/// Both bounds are applied as given, without parsing: the column is a
/// timestamp and the comparison is against an ISO string, which is what the
/// TypeScript handler's `new Date(...)` produces on the wire anyway.
fn apply_date_window(db: &Backend, query: &mut SelectStatement, params: &ActorParams) {
    if let Some(start) = &params.start_date {
        query.and_where(Expr::col(Scrobbles::Timestamp).gte(db.timestamp_value(start)));
    }
    if let Some(end) = &params.end_date {
        query.and_where(Expr::col(Scrobbles::Timestamp).lte(db.timestamp_value(end)));
    }
}

/// `SELECT count(*)` over one table, matching a single column.
fn count_by(
    table: impl crate::sea_query::IntoTableRef,
    column: impl crate::sea_query::IntoIden + 'static,
    value: &str,
) -> SelectStatement {
    Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(table)
        .and_where(Expr::col(column).eq(value))
        .take()
}

// ------------------------------------------------------------------ profile

/// A profile, as the UI's header reads it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    /// Totals, which the header shows next to the name.
    pub scrobbles_count: i64,
    pub artists_count: i64,
    pub albums_count: i64,
    pub tracks_count: i64,
    pub loved_songs_count: i64,
    pub followers_count: i64,
    pub following_count: i64,
    /// Whether this account has been flagged as a bot. The UI greys out a
    /// flagged profile's charts rather than hiding the account.
    pub is_bot: bool,
}

/// `app.rocksky.actor.getProfile`
///
/// Answers `{}` for an unknown actor, which is what the live API does — the
/// UI treats an empty object as "no such profile" and shows its own message.
async fn get_profile(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
) -> XrpcResult<HttpResponse> {
    let Some(did) = params.did.clone() else {
        return json(serde_json::json!({}));
    };

    match load_profile(state.db(), &did).await {
        Ok(Some(profile)) => json(serde_json::to_value(profile).unwrap_or_default()),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving a profile");
            json(serde_json::json!({}))
        }
    }
}

async fn load_profile(db: &Backend, did: &str) -> Result<Option<ProfileView>, sqlx::Error> {
    let Some(user) = find_user(db, did).await? else {
        return Ok(None);
    };

    // One count per relation. Separate queries rather than a single one with
    // six correlated subselects: on SQLite the planner handles these far
    // better, and a slow profile is the page users notice most.
    let scrobbles = db
        .count(&count_by(Scrobbles::Table, Scrobbles::UserId, &user.id))
        .await?;
    let artists = db
        .count(&count_by(UserArtists::Table, UserArtists::UserId, &user.id))
        .await?;
    let albums = db
        .count(&count_by(UserAlbums::Table, UserAlbums::UserId, &user.id))
        .await?;
    let tracks = db
        .count(&count_by(UserTracks::Table, UserTracks::UserId, &user.id))
        .await?;
    let loved = db
        .count(&count_by(LovedTracks::Table, LovedTracks::UserId, &user.id))
        .await?;

    // `follows` records DIDs rather than row ids — it is written straight from
    // the `app.rocksky.graph.follow` record, which names the subject by DID
    // and may reference an account this instance has never indexed.
    let followers = db
        .count(&count_by(Follows::Table, Follows::SubjectDid, &user.did))
        .await?;
    let following = db
        .count(&count_by(Follows::Table, Follows::FollowerDid, &user.did))
        .await?;

    Ok(Some(ProfileView {
        id: user.id,
        did: user.did,
        handle: user.handle,
        display_name: user.display_name,
        avatar: user.avatar,
        scrobbles_count: scrobbles,
        artists_count: artists,
        albums_count: albums,
        tracks_count: tracks,
        loved_songs_count: loved,
        followers_count: followers,
        following_count: following,
        is_bot: user.is_bot,
    }))
}

// ---------------------------------------------------------------- scrobbles

/// One row of an actor's feed.
///
/// Deliberately not [`ScrobbleViewBasic`], which the global feed uses: the
/// live responses share only 11 of their fields. The global feed carries the
/// whole track (36 fields — lyrics, BPM, the streaming links) and names the
/// listener `user`/`userAvatar`; this one carries 16 and names them
/// `handle`/`did`/`avatar`, because a profile page already knows whose feed it
/// is showing and needs the compact row.
///
/// `trackId` is here and not there, and both carry `uri` (the scrobble's) and
/// `trackUri` (the song's) — liking needs the track, replying needs the
/// scrobble.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorScrobbleView {
    /// The scrobble's id, not the track's.
    pub id: String,
    pub track_id: Option<String>,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub handle: String,
    pub did: String,
    pub avatar: String,
    /// The scrobble's AT-URI.
    pub uri: Option<String>,
    /// The song's AT-URI.
    pub track_uri: Option<String>,
    pub liked: bool,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ScrobblesOutput {
    pub scrobbles: Vec<ActorScrobbleView>,
}

/// `app.rocksky.actor.getActorScrobbles`
///
/// One actor's feed, newest first. Shares the row view with
/// `app.rocksky.scrobble.getScrobbles` so the UI renders both with one
/// component.
async fn get_actor_scrobbles(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
    auth: crate::auth::Auth,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone() else {
        return json(ScrobblesOutput::default());
    };

    match load_actor_scrobbles(&state, &did, &params, auth.did()).await {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving actor scrobbles");
            json(ScrobblesOutput::default())
        }
    }
}

async fn load_actor_scrobbles(
    state: &AppState,
    did: &str,
    params: &ActorParams,
    viewer: Option<&str>,
) -> anyhow::Result<ScrobblesOutput> {
    let db = state.db();
    let Some(user) = find_user(db, did).await? else {
        return Ok(ScrobblesOutput::default());
    };

    // Only the scrobble columns are selected; the related rows are batched in
    // afterwards. Selecting the joined tables too would produce several
    // columns aliased `id` — see `crate::db::loaders`.
    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, None);
    query
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(&user.id));
    apply_date_window(db, &mut query, params);
    query
        .order_by(Scrobbles::Timestamp, Order::Desc)
        .limit(params.limit() as u64)
        .offset(params.offset() as u64);

    let scrobbles: Vec<Scrobble> = db.fetch_all(&query).await?;
    if scrobbles.is_empty() {
        return Ok(ScrobblesOutput::default());
    }

    let tracks = loaders::tracks_by_id(db, scrobbles.iter().map(|s| s.track_id.clone())).await?;
    let users = loaders::users_by_id(db, scrobbles.iter().map(|s| s.user_id.clone())).await?;
    let artists = loaders::artists_by_id(db, scrobbles.iter().map(|s| s.artist_id.clone())).await?;

    let track_ids: Vec<String> = tracks.keys().cloned().collect();
    let likes = crate::likes::for_track_ids(db, &track_ids, viewer).await?;

    Ok(ScrobblesOutput {
        scrobbles: scrobbles
            .iter()
            .filter_map(|scrobble| {
                // A row whose track or user is missing cannot be rendered.
                // Skipping it keeps the rest of the page usable, which is what
                // the TypeScript handler's catch-all effectively does.
                let track = tracks.get(scrobble.track_id.as_deref()?)?;
                let user = users.get(scrobble.user_id.as_deref()?)?;
                let artist = scrobble.artist_id.as_deref().and_then(|id| artists.get(id));
                Some(ActorScrobbleView {
                    id: scrobble.id.clone(),
                    track_id: scrobble.track_id.clone(),
                    title: track.title.clone(),
                    artist: track.artist.clone(),
                    album_artist: track.album_artist.clone(),
                    album_art: track.album_art.clone(),
                    album: track.album.clone(),
                    handle: user.handle.clone(),
                    did: user.did.clone(),
                    avatar: user.avatar.clone(),
                    uri: scrobble.uri.clone(),
                    track_uri: track.uri.clone(),
                    liked: likes.get(&track.id).copied().unwrap_or_default().liked,
                    // The artist row's URI when the scrobble named one,
                    // falling back to whatever the track recorded.
                    artist_uri: artist
                        .and_then(|artist| artist.uri.clone())
                        .or_else(|| track.artist_uri.clone()),
                    album_uri: track.album_uri.clone(),
                    created_at: scrobble.created_at,
                })
            })
            .collect(),
    })
}

// -------------------------------------------------------------------- songs

/// A track with its play count, as the top-songs lists return it.
///
/// `playCount` is this actor's; `uniqueListeners` is everyone's. Both are
/// computed over the same date window so a monthly list is internally
/// consistent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewBasic {
    pub id: String,
    pub uri: Option<String>,
    pub title: String,
    pub artist: String,
    pub artist_uri: Option<String>,
    pub album: String,
    pub album_uri: Option<String>,
    pub album_art: Option<String>,
    pub album_artist: String,
    pub copyright_message: Option<String>,
    pub disc_number: Option<i64>,
    pub duration: i64,
    pub sha256: String,
    pub track_number: Option<i64>,
    pub play_count: i64,
    pub unique_listeners: i64,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SongsOutput {
    pub tracks: Vec<SongViewBasic>,
}

/// `app.rocksky.actor.getActorSongs`
async fn get_actor_songs(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone() else {
        return json(SongsOutput::default());
    };

    match load_actor_songs(state.db(), &did, &params).await {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving actor songs");
            json(SongsOutput::default())
        }
    }
}

async fn load_actor_songs(
    db: &Backend,
    did: &str,
    params: &ActorParams,
) -> anyhow::Result<SongsOutput> {
    let Some(user) = find_user(db, did).await? else {
        return Ok(SongsOutput::default());
    };

    let ranked = rank_by_plays(db, &user.id, Scrobbles::TrackId, params).await?;
    if ranked.is_empty() {
        return Ok(SongsOutput::default());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = unique_listeners(db, Scrobbles::TrackId, &ids, params).await?;

    let by_id = loaders::tracks_by_id(db, ids.iter().cloned().map(Some)).await?;

    // Walked in ranking order, so the response is ordered by play count. A row
    // that vanished between the two queries is skipped rather than faked.
    let tracks = ranked
        .iter()
        .filter_map(|(id, plays)| {
            let track = by_id.get(id.as_str())?;
            Some(SongViewBasic {
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
        .collect();

    Ok(SongsOutput { tracks })
}

// ------------------------------------------------------------------- albums

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumViewBasic {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_art: Option<String>,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub sha256: String,
    pub year: Option<i64>,
    pub release_date: Option<String>,
    pub play_count: i64,
    pub unique_listeners: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AlbumsOutput {
    pub albums: Vec<AlbumViewBasic>,
}

/// `app.rocksky.actor.getActorAlbums`
async fn get_actor_albums(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone() else {
        return json(AlbumsOutput::default());
    };

    match load_actor_albums(state.db(), &did, &params).await {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving actor albums");
            json(AlbumsOutput::default())
        }
    }
}

async fn load_actor_albums(
    db: &Backend,
    did: &str,
    params: &ActorParams,
) -> anyhow::Result<AlbumsOutput> {
    let Some(user) = find_user(db, did).await? else {
        return Ok(AlbumsOutput::default());
    };

    let ranked = rank_by_plays(db, &user.id, Scrobbles::AlbumId, params).await?;
    if ranked.is_empty() {
        return Ok(AlbumsOutput::default());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = unique_listeners(db, Scrobbles::AlbumId, &ids, params).await?;

    let by_id = loaders::albums_by_id(db, ids.iter().cloned().map(Some)).await?;

    let albums = ranked
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
        .collect();

    Ok(AlbumsOutput { albums })
}

// ------------------------------------------------------------------ artists

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistViewBasic {
    pub id: String,
    pub name: String,
    pub picture: Option<String>,
    pub sha256: String,
    pub uri: Option<String>,
    /// `null` when the column is NULL, matching the live response.
    pub tags: Option<Vec<String>>,
    pub play_count: i64,
    pub unique_listeners: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ArtistsOutput {
    pub artists: Vec<ArtistViewBasic>,
}

/// `app.rocksky.actor.getActorArtists`
async fn get_actor_artists(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone() else {
        return json(ArtistsOutput::default());
    };

    match load_actor_artists(state.db(), &did, &params).await {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving actor artists");
            json(ArtistsOutput::default())
        }
    }
}

async fn load_actor_artists(
    db: &Backend,
    did: &str,
    params: &ActorParams,
) -> anyhow::Result<ArtistsOutput> {
    let Some(user) = find_user(db, did).await? else {
        return Ok(ArtistsOutput::default());
    };

    let ranked = rank_by_plays(db, &user.id, Scrobbles::ArtistId, params).await?;
    if ranked.is_empty() {
        return Ok(ArtistsOutput::default());
    }

    let ids: Vec<String> = ranked.iter().map(|(id, _)| id.clone()).collect();
    let listeners = unique_listeners(db, Scrobbles::ArtistId, &ids, params).await?;

    let by_id = loaders::artists_by_id(db, ids.iter().cloned().map(Some)).await?;

    let artists = ranked
        .iter()
        .filter_map(|(id, plays)| {
            let artist = by_id.get(id.as_str())?;
            Some(ArtistViewBasic {
                id: artist.id.clone(),
                name: artist.name.clone(),
                picture: artist.picture.clone(),
                sha256: artist.sha256.clone(),
                uri: artist.uri.clone(),
                // The live response calls the genres column `tags` here, and
                // keeps a NULL as `null` rather than `[]`.
                tags: artist.genres.as_deref().map(|_| artist.genres()),
                play_count: *plays,
                unique_listeners: listeners.get(id.as_str()).copied().unwrap_or(0),
            })
        })
        .collect();

    Ok(ArtistsOutput { artists })
}

// -------------------------------------------------------------- loved songs

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct LovedSongsOutput {
    pub tracks: Vec<TrackView>,
}

/// `app.rocksky.actor.getActorLovedSongs`
///
/// The full track view rather than the basic one — the live response carries
/// lyrics, ISRC, BPM and the streaming links here, because the loved-songs
/// page shows a detail row per track rather than a compact list.
///
/// Ordered by when the like was recorded, newest first, which is the order the
/// page shows and not the tracks' own order.
async fn get_actor_loved_songs(
    state: web::Data<AppState>,
    params: web::Query<ActorParams>,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let Some(did) = params.did.clone() else {
        return json(LovedSongsOutput::default());
    };

    match load_loved_songs(state.db(), &did, &params).await {
        Ok(output) => json(output),
        Err(err) => {
            tracing::error!(error = ?err, did = %did, "error retrieving loved songs");
            json(LovedSongsOutput::default())
        }
    }
}

async fn load_loved_songs(
    db: &Backend,
    did: &str,
    params: &ActorParams,
) -> anyhow::Result<LovedSongsOutput> {
    let Some(user) = find_user(db, did).await? else {
        return Ok(LovedSongsOutput::default());
    };

    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, Some("t"));
    query
        .from_as(LovedTracks::Table, Alias::new("l"))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("l"), LovedTracks::TrackId)),
        )
        .and_where(Expr::col((Alias::new("l"), LovedTracks::UserId)).eq(&user.id))
        .order_by((Alias::new("l"), LovedTracks::XataCreatedat), Order::Desc)
        .limit(params.limit() as u64)
        .offset(params.offset() as u64);

    let tracks: Vec<Track> = db.fetch_all(&query).await?;
    Ok(LovedSongsOutput {
        tracks: tracks.iter().map(TrackView::from).collect(),
    })
}

// ------------------------------------------------------------------- shared

/// Ranks one actor's `scrobbles` rows by play count on `column`.
///
/// Returns `(id, play_count)` in descending order of plays. NULLs are excluded
/// because a scrobble with no album still counts towards its track — grouping
/// them would produce a phantom entry with no row to hydrate.
async fn rank_by_plays(
    db: &Backend,
    user_id: &str,
    column: Scrobbles,
    params: &ActorParams,
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    db.fetch_all::<(String, i64)>(&ranking_query(db, user_id, column, params))
        .await
}

/// The ranking statement on its own, so the ordering can be asserted without a
/// database.
fn ranking_query(
    db: &Backend,
    user_id: &str,
    column: Scrobbles,
    params: &ActorParams,
) -> SelectStatement {
    let mut query = Query::select();
    query
        .expr_as(Expr::col(column), Alias::new("id"))
        .expr_as(Func::count(Expr::col(Asterisk)), Alias::new("plays"))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(user_id))
        .and_where(Expr::col(column).is_not_null());
    apply_date_window(db, &mut query, params);
    query
        .add_group_by([Expr::col(column).into()])
        .order_by(Alias::new("plays"), Order::Desc)
        // Ties are broken by id so paging is stable: without it, two entries
        // with the same count can swap between pages and one is shown twice.
        .order_by(column, Order::Asc)
        .limit(params.limit() as u64)
        .offset(params.offset() as u64);
    query
}

/// How many distinct users played each of `ids`, over the same date window.
async fn unique_listeners(
    db: &Backend,
    column: Scrobbles,
    ids: &[String],
    params: &ActorParams,
) -> Result<std::collections::HashMap<String, i64>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Default::default());
    }

    let mut query = Query::select();
    query
        .expr_as(Expr::col(column), Alias::new("id"))
        .expr_as(
            Func::count_distinct(Expr::col(Scrobbles::UserId)),
            Alias::new("listeners"),
        )
        .from(Scrobbles::Table)
        .and_where(Expr::col(column).is_in(ids.iter().map(String::as_str)));
    apply_date_window(db, &mut query, params);
    query.add_group_by([Expr::col(column).into()]);

    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sea_query::SqliteQueryBuilder;
    use crate::xrpc::MAX_LIMIT;

    fn params_with(start: Option<&str>, end: Option<&str>) -> ActorParams {
        ActorParams {
            did: None,
            limit: Some(10),
            offset: None,
            start_date: start.map(str::to_string),
            end_date: end.map(str::to_string),
        }
    }

    #[test]
    fn the_actor_limit_defaults_to_ten() {
        // `params.limit ?? 10` in the TypeScript handlers, not the usual 20.
        let params = ActorParams {
            did: None,
            limit: None,
            offset: None,
            start_date: None,
            end_date: None,
        };
        assert_eq!(params.limit(), ACTOR_DEFAULT_LIMIT);
        assert_eq!(params.offset(), 0);
    }

    #[test]
    fn an_actor_limit_is_still_capped() {
        let params = ActorParams {
            did: None,
            limit: Some(10_000),
            offset: Some(-3),
            start_date: None,
            end_date: None,
        };
        assert_eq!(params.limit(), MAX_LIMIT);
        assert_eq!(params.offset(), 0, "a negative offset reads as absent");
    }

    /// An empty window must not narrow the query at all — an all-time list has
    /// no bounds, not bounds that happen to be wide.
    #[tokio::test]
    async fn no_date_window_adds_no_clauses() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = ranking_query(&db, "u", Scrobbles::TrackId, &params_with(None, None))
            .to_string(SqliteQueryBuilder);
        assert!(!sql.contains("timestamp"), "{sql}");
    }

    #[tokio::test]
    async fn a_date_window_bounds_both_ends() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = ranking_query(
            &db,
            "u",
            Scrobbles::TrackId,
            &params_with(Some("2026-01-01"), Some("2026-02-01")),
        )
        .to_string(SqliteQueryBuilder);

        assert!(sql.contains(r#""timestamp" >= '2026-01-01'"#), "{sql}");
        assert!(sql.contains(r#""timestamp" <= '2026-02-01'"#), "{sql}");
    }

    /// The ranking must break ties deterministically, or a tied entry can
    /// appear on two consecutive pages and another never appear at all.
    #[tokio::test]
    async fn the_ranking_breaks_ties_by_id() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = ranking_query(&db, "u", Scrobbles::TrackId, &params_with(None, None))
            .to_string(SqliteQueryBuilder);

        assert!(
            sql.contains(r#"ORDER BY "plays" DESC, "track_id" ASC"#),
            "{sql}"
        );
        // And NULLs are excluded, or the group would have no row to hydrate.
        assert!(sql.contains(r#""track_id" IS NOT NULL"#), "{sql}");
    }

    /// One placeholder per id, rather than an interpolated list.
    #[test]
    fn an_id_list_binds_one_value_per_id() {
        let (sql, values) = Query::select()
            .column(Scrobbles::TrackId)
            .from(Scrobbles::Table)
            .and_where(Expr::col(Scrobbles::TrackId).is_in(["a", "b", "c"]))
            .build(SqliteQueryBuilder);

        assert!(sql.contains(r#""track_id" IN (?, ?, ?)"#), "{sql}");
        assert_eq!(values.0.len(), 3);
    }
}
