//! `app.rocksky.playlist.*` — playlists, which live in repositories.
//!
//! Two record types carry a playlist: one `app.rocksky.playlist` for the
//! playlist itself, and one `app.rocksky.playlist.song` per entry. An entry
//! record lives in the repository of whoever *added* it, not the owner's —
//! which is what lets a collaborator contribute without write access to
//! someone else's repo, and what makes the rules below the shape they are.
//!
//! # Ownership is decided from the URI, not from a row
//!
//! A playlist's AT-URI names the repository that holds it, so
//! `at://did:plc:alice/app.rocksky.playlist/3abc` is Alice's by construction.
//! Every check here reads the URI rather than looking for a row, because
//! immediately after `createPlaylist` there *is* no row yet — the record has
//! been written and the projection has not caught up. Requiring a row would
//! make "create a playlist, then add a song to it" fail for the first few
//! seconds.
//!
//! # Rows are written here as well as published
//!
//! In the deployed system the Postgres rows are written only by the firehose
//! indexer. A self-hosted instance may have no sync source at all, so — as
//! with uploads, likes and shouts — the record is published *and* the row
//! written locally. The projection is keyed on the record URI, so an entry
//! arriving later over Tap updates the row rather than duplicating it.
//!
//! # Entry order
//!
//! Entries sort by `addedAt` then by when they were ingested. `addedAt` is the
//! record's own timestamp; the ingest time only says when this instance saw
//! it, and the two differ whenever entries arrive out of order — which they do
//! whenever a collaborator's repo is read after the owner's.

use crate::atproto::writer::Writer;
use crate::auth::{Auth, AuthDid};
use crate::db::models::{Track, TRACK_COLS};
use crate::db::schema::{PlaylistTracks, Playlists, Tracks, Users};
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::rsql::{Field, FieldMap};
use crate::sea_query::{
    Alias, Asterisk, CaseStatement, Expr, Func, JoinType, Order, Query, SelectStatement, SimpleExpr,
};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json, ok_empty};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.playlist.getPlaylist", get_playlist);
    xrpc_query!(cfg, "app.rocksky.playlist.getPlaylists", get_playlists);
    xrpc_query!(
        cfg,
        "app.rocksky.actor.getActorPlaylists",
        get_actor_playlists
    );
    xrpc_procedure!(cfg, "app.rocksky.playlist.createPlaylist", create_playlist);
    xrpc_procedure!(cfg, "app.rocksky.playlist.updatePlaylist", update_playlist);
    xrpc_procedure!(cfg, "app.rocksky.playlist.removePlaylist", remove_playlist);
    xrpc_procedure!(cfg, "app.rocksky.playlist.addSongs", add_songs);
    xrpc_procedure!(cfg, "app.rocksky.playlist.removeTrack", remove_track);
}

const PLAYLIST_COLLECTION: &str = "app.rocksky.playlist";
const PLAYLIST_SONG_COLLECTION: &str = "app.rocksky.playlist.song";
const PLAYLIST_DEFAULT_LIMIT: i64 = 20;

/// Most songs one call may add. Each is a separate record write, so an
/// unbounded list would be a long-running request nobody cancels.
const MAX_SONGS_PER_CALL: usize = 200;

// -------------------------------------------------------------------- views

/// A playlist as the API presents it.
///
/// The field names follow the live response, including `curatorDId` — a typo
/// for `curatorDid` that the UI already reads, so correcting it here would
/// break the page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistView {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub cid: Option<String>,
    pub cover_image_url: Option<String>,
    /// A JSON array when set; `null` otherwise, as the live response shows.
    pub collaborators: Option<serde_json::Value>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub created_by: String,
    /// Whoever owns it, for the "by …" line.
    #[serde(rename = "curatorDId")]
    pub curator_did: Option<String>,
    pub curator_handle: Option<String>,
    pub curator_name: Option<String>,
    pub curator_avatar_url: Option<String>,
    pub track_count: i64,
    /// Album art from up to four of the playlist's tracks.
    ///
    /// For the cover mosaic the UI renders when a playlist has no picture of
    /// its own (`PlaylistCover.tsx` falls back to this). Always an array, never
    /// `null`: the component filters it, and an absent field and an empty one
    /// would be two ways to say the same thing.
    pub track_arts: Vec<String>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// The detail response: a playlist plus its entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistDetail {
    #[serde(flatten)]
    pub playlist: PlaylistView,
    pub tracks: Vec<crate::views::TrackView>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct PlaylistsOutput {
    pub playlists: Vec<PlaylistView>,
}

/// Adds every column a playlist view needs, aliased to [`PlaylistRow`]'s
/// fields.
fn playlist_columns(db: &Backend, query: &mut SelectStatement) {
    let playlist = |column| Expr::col((Alias::new("p"), column));
    let curator = |column| Expr::col((Alias::new("u"), column));

    query
        .expr_as(playlist(Playlists::XataId), Alias::new("id"))
        .expr_as(playlist(Playlists::Name), Alias::new("title"))
        .expr(playlist(Playlists::Description))
        .expr(playlist(Playlists::Uri))
        .expr(playlist(Playlists::Cid))
        .expr_as(playlist(Playlists::Picture), Alias::new("cover_image_url"))
        .expr(playlist(Playlists::Collaborators))
        .expr(playlist(Playlists::SpotifyLink))
        .expr(playlist(Playlists::TidalLink))
        .expr(playlist(Playlists::AppleMusicLink))
        .expr(playlist(Playlists::CreatedBy))
        .expr_as(curator(Users::Did), Alias::new("curator_did"))
        .expr_as(curator(Users::Handle), Alias::new("curator_handle"))
        .expr_as(curator(Users::DisplayName), Alias::new("curator_name"))
        .expr_as(curator(Users::Avatar), Alias::new("curator_avatar_url"))
        // Both through `cast_timestamp`, because `PlaylistRow` reads them as
        // `DateTime<Utc>` and the Postgres columns are `timestamp without time
        // zone`, which will not decode into one. Every column list built from
        // `models::*_COLS` applies the same cast for `ColKind::Timestamp`.
        .expr_as(
            db.cast_timestamp(playlist(Playlists::XataCreatedat)),
            Alias::new("created_at"),
        )
        .expr_as(
            db.cast_timestamp(playlist(Playlists::XataUpdatedat)),
            Alias::new("updated_at"),
        );
}

/// A row of [`playlist_columns`].
///
/// A struct rather than a tuple because there are seventeen of them, and sqlx
/// only derives `FromRow` for tuples up to sixteen — and because a positional
/// tuple that wide is a liability anyway: swapping two `Option<String>` fields
/// would compile and silently mislabel the data.
#[derive(Debug, Clone, sqlx::FromRow)]
struct PlaylistRow {
    id: String,
    title: String,
    description: Option<String>,
    uri: Option<String>,
    cid: Option<String>,
    cover_image_url: Option<String>,
    collaborators: Option<String>,
    spotify_link: Option<String>,
    tidal_link: Option<String>,
    apple_music_link: Option<String>,
    created_by: String,
    curator_did: Option<String>,
    curator_handle: Option<String>,
    curator_name: Option<String>,
    curator_avatar_url: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

/// Turns rows into views, counting each playlist's entries.
async fn hydrate(db: &Backend, rows: Vec<PlaylistRow>) -> anyhow::Result<Vec<PlaylistView>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    // One grouped count rather than one per playlist, since a listing can hold
    // twenty.
    let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
    let query = Query::select()
        .column(PlaylistTracks::PlaylistId)
        .expr(Func::count(Expr::col(Asterisk)))
        .from(PlaylistTracks::Table)
        .and_where(Expr::col(PlaylistTracks::PlaylistId).is_in(ids.iter().map(|id| id.as_str())))
        .group_by_col(PlaylistTracks::PlaylistId)
        .to_owned();

    let counts: std::collections::HashMap<String, i64> = db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .collect();

    let mut arts = cover_mosaics(db, &ids).await?;

    Ok(rows
        .into_iter()
        .map(|row| PlaylistView {
            track_count: counts.get(&row.id).copied().unwrap_or(0),
            track_arts: arts.remove(&row.id).unwrap_or_default(),
            id: row.id,
            title: row.title,
            description: row.description,
            uri: row.uri,
            cid: row.cid,
            cover_image_url: row.cover_image_url,
            // Stored as a JSON string; passed through as parsed JSON so a
            // client sees an array rather than a string containing one.
            collaborators: row
                .collaborators
                .as_deref()
                .and_then(|raw| serde_json::from_str(raw).ok()),
            spotify_link: row.spotify_link,
            tidal_link: row.tidal_link,
            apple_music_link: row.apple_music_link,
            created_by: row.created_by,
            curator_did: row.curator_did,
            curator_handle: row.curator_handle,
            curator_name: row.curator_name,
            curator_avatar_url: row.curator_avatar_url,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}

/// Distinct album-art URLs per playlist, oldest entry first, at most four.
///
/// `apps/api` does this inside the listing query with `array_agg` over a
/// lateral subquery. A second query instead, because that form is
/// Postgres-only and this has to run on SQLite too — and one grouped query for
/// the whole page costs no more round trips than the subquery did.
///
/// Grouped by art rather than by track: one album's twelve tracks would
/// otherwise fill all four tiles with the same picture, which is not a mosaic.
async fn cover_mosaics(
    db: &Backend,
    playlist_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<String>>, sqlx::Error> {
    if playlist_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let entry = |column| Expr::col((Alias::new("pt"), column));
    let art = Expr::col((Alias::new("t"), Tracks::AlbumArt));

    let mut query = Query::select();
    query
        .expr(entry(PlaylistTracks::PlaylistId))
        .expr(art.clone())
        // Ordered on, never read — so it is selected as text rather than as a
        // timestamp. On Postgres `min(xata_createdat)` is a `timestamp`, which
        // sqlx will not decode into the `String` this row type uses.
        .expr_as(
            Func::cast_as(
                Func::min(entry(PlaylistTracks::XataCreatedat)),
                Alias::new("text"),
            ),
            Alias::new("first_added"),
        )
        .from_as(PlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::TrackId)),
        )
        .and_where(art.clone().is_not_null())
        .and_where(art.ne(""))
        .and_where(
            entry(PlaylistTracks::PlaylistId).is_in(playlist_ids.iter().map(|id| id.as_str())),
        )
        .add_group_by([
            entry(PlaylistTracks::PlaylistId).into(),
            Expr::col((Alias::new("t"), Tracks::AlbumArt)).into(),
        ])
        // Ordering here rather than in Rust so the four kept are the four
        // first added, which is what makes the mosaic stable as a playlist grows.
        .order_by((Alias::new("pt"), PlaylistTracks::PlaylistId), Order::Asc)
        .order_by(Alias::new("first_added"), Order::Asc);

    let rows: Vec<(String, String, String)> = db.fetch_all(&query).await?;

    let mut mosaics: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for (playlist_id, art, _) in rows {
        let tiles = mosaics.entry(playlist_id).or_default();
        if tiles.len() < MOSAIC_TILES {
            tiles.push(art);
        }
    }
    Ok(mosaics)
}

/// Tiles in the cover mosaic. Four, because the UI renders a 2×2 grid.
const MOSAIC_TILES: usize = 4;

/// The columns a playlist filter may name.
///
/// `title` and `name` both map to the column, since the record calls it `name`
/// and every view calls it `title`.
const PLAYLIST_FILTER_FIELDS: FieldMap = &[
    ("name", Field::text("p.name")),
    ("title", Field::text("p.name")),
    ("description", Field::text("p.description")),
    ("uri", Field::text("p.uri")),
    ("spotifyLink", Field::text("p.spotify_link")),
    ("tidalLink", Field::text("p.tidal_link")),
    ("appleMusicLink", Field::text("p.apple_music_link")),
    ("createdAt", Field::date("p.xata_createdat")),
    ("updatedAt", Field::date("p.xata_updatedat")),
    // A `track.*` selector matches against the playlist's *contents*, so
    // `track.artist=="Daft Punk"` finds playlists containing a Daft Punk
    // track. Naming them here is not enough — the query has to join the
    // contents in, which is what `filters_on_tracks` decides.
    ("track.title", Field::text("t.title")),
    ("track.artist", Field::text("t.artist")),
    ("track.album", Field::text("t.album")),
    ("track.albumArtist", Field::text("t.album_artist")),
];

/// Whether a filter names any `track.*` selector.
fn filters_on_tracks(filter: Option<&str>) -> bool {
    crate::rsql::selectors(filter)
        .iter()
        .any(|selector| selector.starts_with("track."))
}

/// A playlist listing, without its conditions, ordering or page.
///
/// Joining the contents fans a playlist out to one row per matching track, so
/// it is only done when the filter needs it, and `DISTINCT` folds the
/// duplicates back. Not `GROUP BY`: Postgres only treats the other selected
/// columns as functionally dependent on a grouped column when that column is a
/// PRIMARY KEY, and `xata_id` is UNIQUE instead — which is why `apps/api` hit
/// "column must appear in the GROUP BY clause" here and swallowed it as an
/// empty list.
fn playlist_from(db: &Backend, with_tracks: bool) -> SelectStatement {
    let mut query = Query::select();
    if with_tracks {
        query.distinct();
    }
    playlist_columns(db, &mut query);

    query.from_as(Playlists::Table, Alias::new("p")).join_as(
        JoinType::LeftJoin,
        Users::Table,
        Alias::new("u"),
        Expr::col((Alias::new("u"), Users::XataId)).equals((Alias::new("p"), Playlists::CreatedBy)),
    );

    if with_tracks {
        query
            .join_as(
                JoinType::InnerJoin,
                PlaylistTracks::Table,
                Alias::new("pt"),
                Expr::col((Alias::new("pt"), PlaylistTracks::PlaylistId))
                    .equals((Alias::new("p"), Playlists::XataId)),
            )
            .join_as(
                JoinType::InnerJoin,
                Tracks::Table,
                Alias::new("t"),
                Expr::col((Alias::new("t"), Tracks::XataId))
                    .equals((Alias::new("pt"), PlaylistTracks::TrackId)),
            );
    }

    query
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListParams {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub filter: Option<String>,
}

/// `app.rocksky.playlist.getPlaylists`
///
/// `filter` is compiled before anything else, so a malformed expression is a
/// 400 rather than an empty list — an unparseable filter that answers "no
/// playlists" is indistinguishable from a correct filter that matches nothing.
async fn get_playlists(
    state: web::Data<AppState>,
    params: web::Query<ListParams>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let filter = db.filter(params.filter.as_deref(), PLAYLIST_FILTER_FIELDS)?;

    let result = async {
        let mut query = playlist_from(db, filters_on_tracks(params.filter.as_deref()));
        if let Some(filter) = filter {
            query.and_where(filter);
        }
        query
            .order_by((Alias::new("p"), Playlists::XataCreatedat), Order::Desc)
            .limit(clamp_limit_or(params.limit, PLAYLIST_DEFAULT_LIMIT) as u64)
            .offset(clamp_offset(params.offset) as u64);

        hydrate(db, db.fetch_all(&query).await?).await
    }
    .await;

    match result {
        Ok(playlists) => json(PlaylistsOutput { playlists }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving playlists");
            json(PlaylistsOutput::default())
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorPlaylistsParams {
    /// A DID or a handle — both are accepted, as everywhere else.
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub filter: Option<String>,
}

/// `app.rocksky.actor.getActorPlaylists`
///
/// Lives here rather than in `actor.rs` because it is the playlist listing with
/// one more condition, and every view type, column list and hydration step it
/// needs is in this module.
async fn get_actor_playlists(
    state: web::Data<AppState>,
    params: web::Query<ActorPlaylistsParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let filter = db.filter(params.filter.as_deref(), PLAYLIST_FILTER_FIELDS)?;

    // Falls back to the caller, so the signed-in case needs no parameter.
    let Some(actor) = params
        .did
        .clone()
        .or_else(|| auth.did().map(str::to_string))
    else {
        return json(PlaylistsOutput::default());
    };

    let result = async {
        let mut query = playlist_from(db, filters_on_tracks(params.filter.as_deref()));
        query.and_where(
            Expr::col((Alias::new("u"), Users::Did))
                .eq(&actor)
                .or(Expr::col((Alias::new("u"), Users::Handle)).eq(&actor)),
        );
        if let Some(filter) = filter {
            query.and_where(filter);
        }
        query
            .order_by((Alias::new("p"), Playlists::XataCreatedat), Order::Desc)
            .limit(clamp_limit_or(params.limit, PLAYLIST_DEFAULT_LIMIT) as u64)
            .offset(clamp_offset(params.offset) as u64);

        hydrate(db, db.fetch_all(&query).await?).await
    }
    .await;

    match result {
        Ok(playlists) => json(PlaylistsOutput { playlists }),
        Err(err) => {
            tracing::error!(error = ?err, actor = %actor, "error retrieving actor playlists");
            json(PlaylistsOutput::default())
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UriParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
}

/// `app.rocksky.playlist.getPlaylist`
async fn get_playlist(
    state: web::Data<AppState>,
    params: web::Query<UriParams>,
) -> XrpcResult<HttpResponse> {
    let Some(uri) = params.uri.clone() else {
        return json(serde_json::json!({}));
    };

    let db = state.db();
    let result = async {
        let mut query = playlist_from(db, false);
        query
            .and_where(Expr::col((Alias::new("p"), Playlists::Uri)).eq(&uri))
            .limit(1);

        let Some(playlist) = hydrate(db, db.fetch_all(&query).await?).await?.pop() else {
            return Ok(None);
        };

        let tracks = entries(db, &playlist.id).await?;
        Ok::<_, anyhow::Error>(Some(PlaylistDetail { playlist, tracks }))
    }
    .await;

    match result {
        Ok(Some(detail)) => json(detail),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %uri, "error retrieving a playlist");
            json(serde_json::json!({}))
        }
    }
}

/// A playlist's tracks, in the order it presents them.
///
/// `added_at` then the ingest time — see the module note on entry order.
async fn entries(
    db: &Backend,
    playlist_id: &str,
) -> Result<Vec<crate::views::TrackView>, sqlx::Error> {
    let mut query = Query::select();
    db.select_model(&mut query, TRACK_COLS, Some("t"));
    query
        .from_as(PlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::TrackId)),
        )
        .and_where(Expr::col((Alias::new("pt"), PlaylistTracks::PlaylistId)).eq(playlist_id))
        .order_by_expr(added_at_nulls_last(), Order::Asc)
        .order_by((Alias::new("pt"), PlaylistTracks::AddedAt), Order::Asc)
        .order_by(
            (Alias::new("pt"), PlaylistTracks::XataCreatedat),
            Order::Asc,
        );

    let tracks: Vec<Track> = db.fetch_all(&query).await?;
    Ok(tracks.iter().map(crate::views::TrackView::from).collect())
}

/// Sorts entries with no `added_at` last on both backends.
///
/// `ORDER BY pt.added_at ASC` does not agree across them: SQLite sorts NULL
/// first, Postgres sorts it last. Ordering on this first makes the entry list —
/// which is what a person sees — the same either way.
fn added_at_nulls_last() -> SimpleExpr {
    CaseStatement::new()
        .case(
            Expr::col((Alias::new("pt"), PlaylistTracks::AddedAt)).is_null(),
            1,
        )
        .finally(0)
        .into()
}

// ------------------------------------------------------------------- writes

/// An `app.rocksky.playlist` record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistRecord {
    #[serde(rename = "$type")]
    record_type: &'static str,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    picture_url: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateParams {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub picture_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrittenOutput {
    pub uri: String,
    pub cid: String,
}

/// `app.rocksky.playlist.createPlaylist`
async fn create_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<CreateParams>,
) -> XrpcResult<HttpResponse> {
    let name = params
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("name is required"))?
        .to_string();

    let written = publish_playlist(
        &state,
        &auth.did,
        &name,
        params.description.as_deref(),
        params.picture_url.as_deref(),
    )
    .await?;

    tracing::info!(did = %auth.did, name = %name, uri = %written.uri, "created a playlist");
    json(written)
}

/// Publishes an `app.rocksky.playlist` record and writes the local row.
///
/// Shared with the navidrome mirror in [`super::library`], which publishes one
/// of these for a playlist the uploaded library already holds.
pub(super) async fn publish_playlist(
    state: &AppState,
    did: &str,
    name: &str,
    description: Option<&str>,
    picture_url: Option<&str>,
) -> Result<WrittenOutput, XrpcError> {
    let writer = Writer::for_did(state, did).await?;
    let rkey = crate::atproto::records::next_tid();
    let written = writer
        .create(
            PLAYLIST_COLLECTION,
            &rkey,
            &PlaylistRecord {
                record_type: PLAYLIST_COLLECTION,
                name: name.to_string(),
                description: description
                    .filter(|text| !text.is_empty())
                    .map(str::to_string),
                picture_url: picture_url
                    .filter(|url| !url.is_empty())
                    .map(str::to_string),
                created_at: crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
            },
        )
        .await?;

    // Written locally as well as published — see the module note.
    let db = state.db();
    let owner = caller_id(db, did).await?;
    let insert = Query::insert()
        .into_table(Playlists::Table)
        .columns([
            Playlists::XataId,
            Playlists::Name,
            Playlists::Description,
            Playlists::Picture,
            Playlists::Uri,
            Playlists::Cid,
            Playlists::CreatedBy,
        ])
        .values_panic([
            new_id().into(),
            name.to_string().into(),
            description.map(str::to_string).into(),
            picture_url.map(str::to_string).into(),
            written.uri.clone().into(),
            written.cid.clone().into(),
            owner.into(),
        ])
        .to_owned();
    db.execute(&insert).await?;

    Ok(WrittenOutput {
        uri: written.uri,
        cid: written.cid,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub picture_url: Option<String>,
}

/// `app.rocksky.playlist.updatePlaylist`
///
/// A patch, not a replace: the record is read, the named fields overwritten,
/// and the whole thing written back to the *same rkey* so the AT-URI is stable
/// and the projection updates the existing row rather than making a second.
async fn update_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<UpdateParams>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&params.uri)?;
    let written = patch_playlist(
        &state,
        &auth.did,
        &uri,
        params.name.as_deref(),
        params.description.as_deref(),
        params.picture_url.as_deref(),
    )
    .await?;

    tracing::info!(did = %auth.did, uri = %uri, "updated a playlist");
    json(written)
}

/// Patches a playlist record's named fields, and the local row with them.
///
/// Shared with the navidrome mirror, which replays a library rename here.
pub(super) async fn patch_playlist(
    state: &AppState,
    did: &str,
    uri: &str,
    name: Option<&str>,
    description: Option<&str>,
    picture_url: Option<&str>,
) -> Result<WrittenOutput, XrpcError> {
    let rkey = own_playlist_rkey(uri, did)?;

    // The current record, so fields the caller omitted keep their values.
    let pds = crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, did)
        .await
        .map_err(|err| {
            tracing::warn!(did, error = %err, "could not resolve a PDS");
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "Could not reach your PDS",
            )
        })?;

    let existing =
        rocksky_atproto::records::get_record(state.http(), &pds, did, PLAYLIST_COLLECTION, &rkey)
            .await
            .map_err(|err| {
                tracing::warn!(uri, error = %err, "could not read the playlist record");
                XrpcError::with_message(
                    crate::error::ResponseType::UpstreamFailure,
                    "Could not read that playlist from your PDS",
                )
            })?
            .ok_or_else(|| XrpcError::invalid_request("No playlist at that URI"))?;

    let mut record = existing.value.as_object().cloned().unwrap_or_default();
    record.insert(
        "$type".to_string(),
        serde_json::Value::String(PLAYLIST_COLLECTION.to_string()),
    );
    for (key, value) in [
        ("name", name),
        ("description", description),
        ("pictureUrl", picture_url),
    ] {
        if let Some(value) = value {
            record.insert(
                key.to_string(),
                serde_json::Value::String(value.to_string()),
            );
        }
    }

    let record = serde_json::Value::Object(record);
    let writer = Writer::for_did(state, did).await?;
    let written = writer.put(PLAYLIST_COLLECTION, &rkey, &record).await?;

    // Mirror the patch onto the local row.
    let db = state.db();
    let mut update = Query::update();
    update.table(Playlists::Table).value(
        Playlists::XataUpdatedat,
        crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
    );
    if let Some(name) = name {
        update.value(Playlists::Name, name);
    }
    if let Some(description) = description {
        update.value(Playlists::Description, description);
    }
    if let Some(picture) = picture_url {
        update.value(Playlists::Picture, picture);
    }
    update
        .value(Playlists::Cid, written.cid.clone())
        .and_where(Expr::col(Playlists::Uri).eq(uri));
    db.execute(&update).await?;

    Ok(WrittenOutput {
        uri: written.uri,
        cid: written.cid,
    })
}

/// `app.rocksky.playlist.removePlaylist`
///
/// Removes this account's entry records and then the playlist. Entries a
/// *collaborator* added live in their repository and cannot be deleted from
/// here — the projection drops those rows when it sees the playlist go.
async fn remove_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<UriParams>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&params.uri)?;
    retract_playlist(&state, &auth.did, &uri).await?;

    tracing::info!(did = %auth.did, uri = %uri, "removed a playlist");
    ok_empty()
}

/// Retracts a playlist record, this repo's entries, and the local rows.
///
/// Shared with the navidrome mirror, which retracts the record when the
/// library playlist behind it is deleted.
pub(super) async fn retract_playlist(
    state: &AppState,
    did: &str,
    uri: &str,
) -> Result<(), XrpcError> {
    let rkey = own_playlist_rkey(uri, did)?;

    let db = state.db();
    let writer = Writer::for_did(state, did).await?;

    // This account's own entries, by the repo their URI names.
    let query = Query::select()
        .expr(Expr::col((Alias::new("pt"), PlaylistTracks::Uri)))
        .from_as(PlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Playlists::Table,
            Alias::new("p"),
            Expr::col((Alias::new("p"), Playlists::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::PlaylistId)),
        )
        .and_where(Expr::col((Alias::new("p"), Playlists::Uri)).eq(uri))
        .and_where(Expr::col((Alias::new("pt"), PlaylistTracks::Uri)).is_not_null())
        .to_owned();

    for entry_uri in db.fetch_scalars::<String>(&query).await? {
        if repo_of(&entry_uri).as_deref() != Some(did) {
            continue;
        }
        if let Some(entry_rkey) = rkey_of(&entry_uri) {
            // Best effort: one entry that will not delete must not stop the
            // playlist itself from going.
            if let Err(err) = writer.delete(PLAYLIST_SONG_COLLECTION, &entry_rkey).await {
                tracing::warn!(uri = %entry_uri, error = %err, "could not remove an entry record");
            }
        }
    }

    writer.delete(PLAYLIST_COLLECTION, &rkey).await?;

    let delete_entries = Query::delete()
        .from_table(PlaylistTracks::Table)
        .and_where(
            Expr::col(PlaylistTracks::PlaylistId).in_subquery(
                Query::select()
                    .column(Playlists::XataId)
                    .from(Playlists::Table)
                    .and_where(Expr::col(Playlists::Uri).eq(uri))
                    .take(),
            ),
        )
        .to_owned();
    db.execute(&delete_entries).await?;

    let delete = Query::delete()
        .from_table(Playlists::Table)
        .and_where(Expr::col(Playlists::Uri).eq(uri))
        .to_owned();
    db.execute(&delete).await?;

    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddSongsParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    /// Song AT-URIs. actix parses a repeated `songs=` parameter into this.
    #[serde(default)]
    pub songs: Option<Vec<String>>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AddSongsOutput {
    pub uris: Vec<String>,
}

/// An `app.rocksky.playlist.song` record.
///
/// Carries the title, artist, album and duration as well as the strong refs.
/// That denormalisation is deliberate: a client reading a playlist from a repo
/// directly — with no appview — can render it without resolving every song.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntryRecord {
    #[serde(rename = "$type")]
    record_type: &'static str,
    playlist: super::like::StrongRef,
    song: super::like::StrongRef,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    duration: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_art_url: Option<String>,
    added_at: String,
}

/// `app.rocksky.playlist.addSongs`
async fn add_songs(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<AddSongsParams>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&params.uri)?;

    let songs = params
        .songs
        .clone()
        .filter(|songs| !songs.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("songs is required"))?;

    if songs.len() > MAX_SONGS_PER_CALL {
        return Err(XrpcError::invalid_request(format!(
            "At most {MAX_SONGS_PER_CALL} songs may be added at once; that call had {}",
            songs.len()
        )));
    }

    let uris = add_song_records(&state, &auth.did, &uri, &songs).await?;

    tracing::info!(
        did = %auth.did,
        uri = %uri,
        songs = uris.len(),
        "added songs to a playlist"
    );
    json(AddSongsOutput { uris })
}

/// Publishes one entry record per song, and the local rows behind them.
///
/// Shared with the navidrome mirror, which replays a library "add song" here.
pub(super) async fn add_song_records(
    state: &AppState,
    did: &str,
    uri: &str,
    songs: &[String],
) -> Result<Vec<String>, XrpcError> {
    // Ownership from the URI alone — see the module note.
    own_playlist_rkey(uri, did)?;

    let db = state.db();
    let playlist_ref = strong_ref(state, uri).await?;
    let writer = Writer::for_did(state, did).await?;
    let added_by = caller_id(db, did).await?;

    // The local playlist row, if the projection has produced one yet. Absent
    // right after createPlaylist on an instance with no sync, in which case
    // the entry rows are skipped and Tap fills them in later.
    let lookup = Query::select()
        .column(Playlists::XataId)
        .from(Playlists::Table)
        .and_where(Expr::col(Playlists::Uri).eq(uri))
        .limit(1)
        .take();
    let playlist_id = db.fetch_scalar::<String>(&lookup).await?;

    let mut uris = Vec::with_capacity(songs.len());
    for song_uri in songs {
        let track = find_track(db, song_uri).await?.ok_or_else(|| {
            XrpcError::invalid_request(format!("Song not found: {song_uri}")).named("NotFound")
        })?;

        let added_at = crate::views::timestamp::to_iso8601(&chrono::Utc::now());
        let written = writer
            .create(
                PLAYLIST_SONG_COLLECTION,
                &crate::atproto::records::next_tid(),
                &EntryRecord {
                    record_type: PLAYLIST_SONG_COLLECTION,
                    playlist: playlist_ref.clone(),
                    song: strong_ref(state, song_uri).await?,
                    title: track.title.clone(),
                    artist: track.artist.clone(),
                    album: track.album.clone(),
                    album_artist: track.album_artist.clone(),
                    duration: track.duration,
                    album_art_url: track.album_art.clone(),
                    added_at: added_at.clone(),
                },
            )
            .await?;

        if let Some(playlist_id) = &playlist_id {
            let insert = Query::insert()
                .into_table(PlaylistTracks::Table)
                .columns([
                    PlaylistTracks::XataId,
                    PlaylistTracks::PlaylistId,
                    PlaylistTracks::TrackId,
                    PlaylistTracks::Uri,
                    PlaylistTracks::Cid,
                    PlaylistTracks::AddedBy,
                    PlaylistTracks::AddedAt,
                ])
                .values_panic([
                    new_id().into(),
                    playlist_id.as_str().into(),
                    track.id.clone().into(),
                    written.uri.clone().into(),
                    written.cid.clone().into(),
                    added_by.clone().into(),
                    added_at.clone().into(),
                ])
                .to_owned();
            db.execute(&insert).await?;
        }

        uris.push(written.uri);
    }

    Ok(uris)
}

/// Retracts *one* entry record for a song, for the navidrome mirror.
///
/// Not [`remove_track`]'s path, which drops every entry pointing at the song:
/// the uploaded library lets the same song sit in a playlist twice, so removing
/// one copy there must remove exactly one copy here.
pub(super) async fn remove_one_entry(
    state: &AppState,
    did: &str,
    playlist_uri: &str,
    song_uri: &str,
) -> Result<(), XrpcError> {
    let db = state.db();
    let query = Query::select()
        .expr(Expr::col((Alias::new("pt"), PlaylistTracks::XataId)))
        .expr(Expr::col((Alias::new("pt"), PlaylistTracks::Uri)))
        .from_as(PlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Playlists::Table,
            Alias::new("p"),
            Expr::col((Alias::new("p"), Playlists::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::PlaylistId)),
        )
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::TrackId)),
        )
        .and_where(Expr::col((Alias::new("p"), Playlists::Uri)).eq(playlist_uri))
        .and_where(Expr::col((Alias::new("t"), Tracks::Uri)).eq(song_uri))
        .and_where(Expr::col((Alias::new("pt"), PlaylistTracks::Uri)).is_not_null())
        .order_by(
            (Alias::new("pt"), PlaylistTracks::XataCreatedat),
            Order::Asc,
        )
        .to_owned();

    let entries: Vec<(String, Option<String>)> = db.fetch_all(&query).await?;
    let Some((id, entry_uri)) = entries
        .into_iter()
        .find(|(_, uri)| uri.as_deref().and_then(repo_of).as_deref() == Some(did))
    else {
        // The entry record exists on the PDS but no row names it yet — a fast
        // add-then-remove lands here. Nothing retries this, so say so rather
        // than reporting that the two repositories agree.
        return Err(XrpcError::invalid_request(
            "The song was removed from your library playlist, but its record on \
             your PDS is still being indexed and could not be retracted yet.",
        ));
    };

    if let Some(rkey) = entry_uri.as_deref().and_then(rkey_of) {
        let writer = Writer::for_did(state, did).await?;
        writer.delete(PLAYLIST_SONG_COLLECTION, &rkey).await?;
    }

    let delete = Query::delete()
        .from_table(PlaylistTracks::Table)
        .and_where(Expr::col(PlaylistTracks::XataId).eq(id))
        .to_owned();
    db.execute(&delete).await?;

    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveTrackParams {
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub song_uri: Option<String>,
    /// Position in the list as `getPlaylist` presents it.
    #[serde(default)]
    pub index: Option<i64>,
}

/// `app.rocksky.playlist.removeTrack`
///
/// A song may sit in a playlist more than once, so `index` identifies *one*
/// entry where `songUri` identifies a set. The position is preferred when
/// given; `songUri` is the blunter path and removes every copy.
async fn remove_track(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<RemoveTrackParams>,
) -> XrpcResult<HttpResponse> {
    let uri = required_uri(&params.uri)?;
    own_playlist_rkey(&uri, &auth.did)?;

    if params.song_uri.is_none() && params.index.is_none() {
        return Err(XrpcError::invalid_request(
            "either songUri or index is required",
        ));
    }

    let db = state.db();

    // In the same order the playlist is presented, so `index` means the row
    // the user clicked.
    let query = Query::select()
        .expr(Expr::col((Alias::new("pt"), PlaylistTracks::XataId)))
        .expr(Expr::col((Alias::new("pt"), PlaylistTracks::Uri)))
        .expr(Expr::col((Alias::new("t"), Tracks::Uri)))
        .from_as(PlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Playlists::Table,
            Alias::new("p"),
            Expr::col((Alias::new("p"), Playlists::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::PlaylistId)),
        )
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), PlaylistTracks::TrackId)),
        )
        .and_where(Expr::col((Alias::new("p"), Playlists::Uri)).eq(&uri))
        .order_by_expr(added_at_nulls_last(), Order::Asc)
        .order_by((Alias::new("pt"), PlaylistTracks::AddedAt), Order::Asc)
        .order_by(
            (Alias::new("pt"), PlaylistTracks::XataCreatedat),
            Order::Asc,
        )
        .to_owned();

    type EntryRow = (String, Option<String>, Option<String>);
    let entries: Vec<EntryRow> = db.fetch_all(&query).await?;

    let targets: Vec<&EntryRow> = match params.index {
        Some(index) => {
            let at = usize::try_from(index)
                .ok()
                .and_then(|index| entries.get(index))
                .ok_or_else(|| {
                    XrpcError::invalid_request(format!(
                        "No track at position {index} in that playlist"
                    ))
                })?;
            vec![at]
        }
        None => {
            let song_uri = params.song_uri.as_deref().unwrap_or_default();
            let matched: Vec<&EntryRow> = entries
                .iter()
                .filter(|(_, _, track_uri)| track_uri.as_deref() == Some(song_uri))
                .collect();
            if matched.is_empty() {
                return Err(XrpcError::invalid_request(
                    "That song is not in that playlist",
                ));
            }
            matched
        }
    };

    let writer = Writer::for_did(&state, &auth.did).await?;
    for (id, entry_uri, _) in &targets {
        // An entry a collaborator added is in their repo; the row can go but
        // the record cannot be deleted from here.
        if let Some(entry_uri) = entry_uri {
            if repo_of(entry_uri).as_deref() == Some(auth.did.as_str()) {
                if let Some(rkey) = rkey_of(entry_uri) {
                    writer.delete(PLAYLIST_SONG_COLLECTION, &rkey).await?;
                }
            } else {
                tracing::debug!(
                    uri = %entry_uri,
                    "removing an entry another repo owns; only the row goes"
                );
            }
        }

        let delete = Query::delete()
            .from_table(PlaylistTracks::Table)
            .and_where(Expr::col(PlaylistTracks::XataId).eq(id.as_str()))
            .to_owned();
        db.execute(&delete).await?;
    }

    tracing::info!(
        did = %auth.did,
        uri = %uri,
        removed = targets.len(),
        "removed tracks from a playlist"
    );
    ok_empty()
}

// ------------------------------------------------------------------- shared

fn required_uri(uri: &Option<String>) -> Result<String, XrpcError> {
    uri.as_deref()
        .map(str::trim)
        .filter(|uri| !uri.is_empty())
        .map(str::to_string)
        .ok_or_else(|| XrpcError::invalid_request("uri is required"))
}

/// The repository a record URI names.
pub fn repo_of(uri: &str) -> Option<String> {
    uri.strip_prefix("at://")?
        .split('/')
        .next()
        .filter(|repo| !repo.is_empty())
        .map(str::to_string)
}

fn rkey_of(uri: &str) -> Option<String> {
    let rkey = uri.rsplit('/').next()?;
    (!rkey.is_empty() && rkey != uri).then(|| rkey.to_string())
}

/// Checks the caller owns the playlist, and returns its rkey.
///
/// Decided from the URI, which names the repository holding the record — so
/// this works before any row exists. See the module note.
fn own_playlist_rkey(uri: &str, did: &str) -> Result<String, XrpcError> {
    match repo_of(uri) {
        Some(repo) if repo == did => rkey_of(uri)
            .ok_or_else(|| XrpcError::invalid_request(format!("{uri} has no record key"))),
        Some(_) => Err(XrpcError::forbidden(
            "Only the playlist's owner can change it",
        )),
        None => Err(XrpcError::invalid_request(format!(
            "{uri} is not an at:// record URI"
        ))),
    }
}

async fn caller_id(db: &Backend, did: &str) -> Result<String, XrpcError> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();
    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
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

/// A strong ref to a record, with the CID read from its own repository.
async fn strong_ref(state: &AppState, uri: &str) -> Result<super::like::StrongRef, XrpcError> {
    let (did, collection, rkey) = super::like::split_at_uri(uri)
        .ok_or_else(|| XrpcError::invalid_request(format!("{uri} is not an at:// record URI")))?;

    let pds = crate::atproto::resolve_pds(state.http(), &state.config().plc_directory_url, &did)
        .await
        .map_err(|err| {
            tracing::warn!(did, error = %err, "could not resolve a PDS for a strong ref");
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "Could not reach the PDS holding that record",
            )
        })?;

    let record = rocksky_atproto::records::get_record(state.http(), &pds, &did, &collection, &rkey)
        .await
        .map_err(|err| {
            tracing::warn!(uri, error = %err, "could not read a record for a strong ref");
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "Could not read that record from its PDS",
            )
        })?
        .ok_or_else(|| {
            XrpcError::invalid_request(format!("{uri} no longer exists in its repository"))
        })?;

    let cid = record.cid.ok_or_else(|| {
        XrpcError::with_message(
            crate::error::ResponseType::UpstreamFailure,
            "The PDS did not report that record's CID",
        )
    })?;

    Ok(super::like::StrongRef {
        uri: uri.to_string(),
        cid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ownership comes from the URI, which is what makes it decidable before a
    /// row exists.
    #[test]
    fn ownership_is_read_from_the_uri() {
        let uri = "at://did:plc:alice/app.rocksky.playlist/3abc";

        assert_eq!(own_playlist_rkey(uri, "did:plc:alice").unwrap(), "3abc");

        let refused = own_playlist_rkey(uri, "did:plc:bob").unwrap_err();
        assert_eq!(refused.kind.status(), 403);
    }

    #[test]
    fn a_malformed_uri_is_a_bad_request_not_a_forbidden() {
        for uri in ["", "not-a-uri", "https://example.com/x", "at://"] {
            let error = own_playlist_rkey(uri, "did:plc:alice").unwrap_err();
            assert_eq!(error.kind.status(), 400, "{uri:?}");
        }
    }

    #[test]
    fn the_repo_is_the_first_segment() {
        assert_eq!(
            repo_of("at://did:plc:alice/app.rocksky.playlist.song/3abc").as_deref(),
            Some("did:plc:alice")
        );
        assert_eq!(repo_of("at://"), None);
        assert_eq!(repo_of("did:plc:alice"), None);
    }

    /// The typo is in the live response and the UI reads it, so it has to
    /// survive.
    #[test]
    fn the_curator_did_keeps_its_live_spelling() {
        let view = PlaylistView {
            id: "p1".into(),
            title: "Test".into(),
            description: None,
            uri: None,
            cid: None,
            cover_image_url: None,
            collaborators: None,
            spotify_link: None,
            tidal_link: None,
            apple_music_link: None,
            created_by: "u1".into(),
            curator_did: Some("did:plc:alice".into()),
            curator_handle: None,
            curator_name: None,
            curator_avatar_url: None,
            track_count: 0,
            track_arts: Vec::new(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let value = serde_json::to_value(&view).unwrap();
        assert_eq!(value["curatorDId"], "did:plc:alice");
        assert!(
            value.get("curatorDid").is_none(),
            "correcting the typo would break the UI: {value}"
        );
    }

    /// An entry record carries the song's details as well as its ref, so a
    /// client reading a repo directly can render the playlist.
    #[test]
    fn an_entry_record_denormalises_the_song() {
        let record = EntryRecord {
            record_type: PLAYLIST_SONG_COLLECTION,
            playlist: super::super::like::StrongRef {
                uri: "at://did:plc:alice/app.rocksky.playlist/3abc".into(),
                cid: "bafyreiplaylist".into(),
            },
            song: super::super::like::StrongRef {
                uri: "at://did:plc:alice/app.rocksky.song/3song".into(),
                cid: "bafyreisong".into(),
            },
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album: "Music Has the Right to Children".into(),
            album_artist: "Boards of Canada".into(),
            duration: 151_000,
            album_art_url: None,
            added_at: "2026-01-01T00:00:00.000Z".into(),
        };

        let value = serde_json::to_value(&record).unwrap();
        assert_eq!(value["$type"], "app.rocksky.playlist.song");
        assert_eq!(value["title"], "Roygbiv");
        assert_eq!(value["albumArtist"], "Boards of Canada");
        assert_eq!(value["duration"], 151_000);
        assert_eq!(value["playlist"]["cid"], "bafyreiplaylist");
        assert_eq!(value["song"]["cid"], "bafyreisong");
        assert_eq!(value["addedAt"], "2026-01-01T00:00:00.000Z");
        // Absent rather than null when the song has no art.
        assert!(value.get("albumArtUrl").is_none(), "{value}");
    }

    /// The playlist record omits what it does not have, because the lexicon
    /// declares those fields optional-absent.
    #[test]
    fn a_playlist_record_omits_empty_fields() {
        let record = PlaylistRecord {
            record_type: PLAYLIST_COLLECTION,
            name: "Test".into(),
            description: None,
            picture_url: None,
            created_at: "2026-01-01T00:00:00.000Z".into(),
        };
        let value = serde_json::to_value(&record).unwrap();

        assert_eq!(value["name"], "Test");
        assert!(value.get("description").is_none(), "{value}");
        assert!(value.get("pictureUrl").is_none(), "{value}");
    }

    #[test]
    fn a_uri_is_required_and_trimmed() {
        assert!(required_uri(&None).is_err());
        assert!(required_uri(&Some("  ".into())).is_err());
        assert_eq!(
            required_uri(&Some("  at://x/y/z  ".into())).unwrap(),
            "at://x/y/z"
        );
    }

    // ------------------------------------------------ the mirror's helper

    const PLAYLIST_URI: &str = "at://did:plc:alice/app.rocksky.playlist/3abc";
    const SONG_URI: &str = "at://did:plc:alice/app.rocksky.song/3song";

    /// A playlist with one entry, whose record URI the caller supplies.
    async fn with_entry(entry_uri: Option<&str>) -> AppState {
        let state = AppState::for_test().await.expect("state");
        let db = state.db();
        let owner = crate::ingest::upsert_user(db, "did:plc:alice")
            .await
            .expect("a user row");

        let playlist = Query::insert()
            .into_table(Playlists::Table)
            .columns([
                Playlists::XataId,
                Playlists::Name,
                Playlists::Uri,
                Playlists::CreatedBy,
            ])
            .values_panic([
                "rec_playlist".into(),
                "Mine".into(),
                PLAYLIST_URI.into(),
                owner.as_str().into(),
            ])
            .to_owned();
        db.execute(&playlist).await.unwrap();

        let track = Query::insert()
            .into_table(Tracks::Table)
            .columns([
                Tracks::XataId,
                Tracks::Title,
                Tracks::Artist,
                Tracks::AlbumArtist,
                Tracks::Album,
                Tracks::Duration,
                Tracks::Sha256,
                Tracks::Uri,
            ])
            .values_panic([
                "rec_track".into(),
                "Roygbiv".into(),
                "Boards of Canada".into(),
                "Boards of Canada".into(),
                "MHTRTC".into(),
                151_000.into(),
                "sha-1".into(),
                SONG_URI.into(),
            ])
            .to_owned();
        db.execute(&track).await.unwrap();

        let entry = Query::insert()
            .into_table(PlaylistTracks::Table)
            .columns([
                PlaylistTracks::XataId,
                PlaylistTracks::PlaylistId,
                PlaylistTracks::TrackId,
                PlaylistTracks::Uri,
                PlaylistTracks::AddedBy,
            ])
            .values_panic([
                new_id().into(),
                "rec_playlist".into(),
                "rec_track".into(),
                entry_uri.map(str::to_string).into(),
                owner.as_str().into(),
            ])
            .to_owned();
        db.execute(&entry).await.unwrap();

        state
    }

    /// The row exists but names no record, so the two repositories do not
    /// agree yet — and nothing retries this, so it has to say so.
    #[actix_web::test]
    async fn an_unindexed_entry_is_reported_rather_than_assumed_gone() {
        let state = with_entry(None).await;
        let error = remove_one_entry(&state, "did:plc:alice", PLAYLIST_URI, SONG_URI)
            .await
            .unwrap_err();

        assert_eq!(error.kind.status(), 400);
        assert!(
            error.body().message.contains("still being indexed"),
            "{}",
            error.body().message
        );
    }

    /// An entry a collaborator added lives in *their* repository, so it cannot
    /// be retracted from here.
    #[actix_web::test]
    async fn an_entry_another_repo_owns_is_left_alone() {
        let state = with_entry(Some("at://did:plc:bob/app.rocksky.playlist.song/3e")).await;
        let error = remove_one_entry(&state, "did:plc:alice", PLAYLIST_URI, SONG_URI)
            .await
            .unwrap_err();

        assert_eq!(error.kind.status(), 400);
        // And the row is still there: this instance did not pretend to have
        // removed something it could not.
        let count = state
            .db()
            .count(
                &Query::select()
                    .expr(Func::count(Expr::col(Asterisk)))
                    .from(PlaylistTracks::Table)
                    .take(),
            )
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}
