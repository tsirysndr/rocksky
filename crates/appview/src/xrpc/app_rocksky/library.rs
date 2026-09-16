//! `app.rocksky.library.*` — a user's uploaded library, served by navidrome.
//!
//! None of this is reimplemented. Navidrome already owns the library's SQL, its
//! S3 access and its search index, so these 41 methods authenticate the caller
//! the usual way (JWT → DID), resolve the DID to a handle, and forward to
//! navidrome's internal endpoint — trusting it with a shared secret so it skips
//! its own Subsonic credential check.
//!
//! # The three shapes
//!
//! | shape          | methods | what happens                                |
//! |----------------|---------|---------------------------------------------|
//! | JSON, params   |      28 | query string forwarded, `subsonic-response` unwrapped |
//! | JSON, body     |       5 | request body becomes the query string       |
//! | a URL          |       3 | navidrome 302s; the `Location` is returned  |
//!
//! The URL ones matter: navidrome never proxies bytes, it redirects to a CDN
//! or a presigned S3 URL. Following the redirect here would stream every song
//! through this process for no reason, so the redirect is read and the URL
//! handed back.
//!
//! # Why a table rather than 36 functions
//!
//! Every one of those is the same handler with a different Subsonic method
//! name, and several names differ from the lexicon's — `getAlbumInfo` calls
//! `getAlbumInfo2`, `search` calls `search3`, `getStreamUrl` calls `stream`.
//! A table makes those mappings checkable at a glance; 36 near-identical
//! functions would hide them.
//!
//! # The five writes, which are not in the table
//!
//! `createPlaylist`, `updatePlaylist` and `deletePlaylist` proxy like the rest
//! and then do a second thing: replay the change onto the caller's repository
//! as `app.rocksky.playlist` records. `deleteSong` and `deleteAlbum` never
//! reach navidrome at all — an uploaded song is a `user_uploads` row and an
//! object in a bucket, and navidrome only reads those. Each has its own
//! handler because the second step differs every time.

use crate::auth::AuthDid;
use crate::db::schema::{NavidromePlaylistTracks, NavidromePlaylists, Tracks, Users};
use crate::db::Backend;
use crate::error::{ResponseType, XrpcError, XrpcResult};
use crate::lexicon::app::rocksky::library::delete_album::Output as DeleteAlbumOutput;
use crate::lexicon::app::rocksky::library::delete_song::Output as DeleteSongOutput;
use crate::sea_query::{Alias, Expr, JoinType, Order, Query};
use crate::state::AppState;
use crate::uploads::{self, Upload};
use crate::xrpc::json;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Where a method's parameters come from, and what it answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Shape {
    /// Query string in, JSON out.
    Query,
    /// JSON body in, JSON out — the Subsonic write operations.
    Body,
    /// Query string in, a redirect URL out.
    Url,
}

/// One lexicon method, and the Subsonic method it forwards to.
struct Proxied {
    /// The last segment of the NSID.
    method: &'static str,
    /// The Subsonic method name. Often the same, sometimes versioned.
    subsonic: &'static str,
    shape: Shape,
}

const fn query(method: &'static str, subsonic: &'static str) -> Proxied {
    Proxied {
        method,
        subsonic,
        shape: Shape::Query,
    }
}

const fn body(method: &'static str, subsonic: &'static str) -> Proxied {
    Proxied {
        method,
        subsonic,
        shape: Shape::Body,
    }
}

const fn url(method: &'static str, subsonic: &'static str) -> Proxied {
    Proxied {
        method,
        subsonic,
        shape: Shape::Url,
    }
}

/// Every library method, and how it maps.
///
/// The names that differ are the whole reason this is a table: a Subsonic
/// method with a `2` or `3` suffix is a different, later version of the
/// endpoint, and calling the unsuffixed one returns a different shape.
const PROXIED: &[Proxied] = &[
    // Browsing.
    query("getAlbum", "getAlbum"),
    query("getAlbumInfo", "getAlbumInfo2"),
    query("getAlbumList", "getAlbumList2"),
    query("getArtist", "getArtist"),
    query("getArtistInfo", "getArtistInfo2"),
    query("getArtists", "getArtists"),
    query("getGenres", "getGenres"),
    query("getIndexes", "getIndexes"),
    query("getMusicDirectory", "getMusicDirectory"),
    query("getMusicFolders", "getMusicFolders"),
    query("getSong", "getSong"),
    query("getSongsByGenre", "getSongsByGenre"),
    query("getRandomSongs", "getRandomSongs"),
    query("getSimilarSongs", "getSimilarSongs2"),
    query("getTopSongs", "getTopSongs"),
    query("getStarred", "getStarred2"),
    query("getLyrics", "getLyrics"),
    query("search", "search3"),
    // Playlists, as navidrome holds them.
    query("getPlaylist", "getPlaylist"),
    query("getPlaylists", "getPlaylists"),
    // The play queue and now-playing.
    query("getPlayQueue", "getPlayQueue"),
    query("getNowPlaying", "getNowPlaying"),
    // Server state.
    query("ping", "ping"),
    query("getLicense", "getLicense"),
    query("getUser", "getUser"),
    query("getScanStatus", "getScanStatus"),
    query("startScan", "startScan"),
    query("getInternetRadioStations", "getInternetRadioStations"),
    // Writes, which carry a body.
    body("star", "star"),
    body("unstar", "unstar"),
    body("scrobble", "scrobble"),
    body("updateNowPlaying", "updateNowPlaying"),
    body("savePlayQueue", "savePlayQueue"),
    // These three answer a redirect rather than JSON.
    url("getStreamUrl", "stream"),
    url("getDownloadUrl", "download"),
    url("getCoverArtUrl", "getCoverArt"),
];

pub fn configure(cfg: &mut ServiceConfig) {
    for proxied in PROXIED {
        let path = format!("/xrpc/app.rocksky.library.{}", proxied.method);
        match proxied.shape {
            // A body-carrying method is a procedure, so POST.
            Shape::Body => {
                cfg.route(&path, web::post().to(handle_body));
            }
            Shape::Query | Shape::Url => {
                cfg.route(&path, web::get().to(handle_query));
            }
        }
    }

    cfg.route(
        "/xrpc/app.rocksky.library.createPlaylist",
        web::post().to(create_playlist),
    );
    cfg.route(
        "/xrpc/app.rocksky.library.updatePlaylist",
        web::post().to(update_playlist),
    );
    cfg.route(
        "/xrpc/app.rocksky.library.deletePlaylist",
        web::post().to(delete_playlist),
    );
    cfg.route(
        "/xrpc/app.rocksky.library.deleteSong",
        web::post().to(delete_song),
    );
    cfg.route(
        "/xrpc/app.rocksky.library.deleteAlbum",
        web::post().to(delete_album),
    );
}

/// The parameters navidrome must never take from a caller.
///
/// `u` is the user, which is resolved from the JWT — accepting it would let
/// anyone read anyone's library. `p`, `t` and `s` are Subsonic's own
/// credential parameters, which the internal secret replaces. No library
/// lexicon declares any of them, so a caller sending one is either confused
/// or probing.
const RESERVED: &[&str] = &["u", "p", "t", "s", "c", "f"];

/// Builds the Subsonic query string.
fn subsonic_query(params: &BTreeMap<String, String>, handle: &str) -> Vec<(String, String)> {
    let mut query: Vec<(String, String)> = params
        .iter()
        .filter(|(key, value)| !RESERVED.contains(&key.as_str()) && !value.is_empty())
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    query.push(("u".to_string(), handle.to_string()));
    query.push(("f".to_string(), "json".to_string()));
    query
}

async fn handle_query(
    state: web::Data<AppState>,
    auth: AuthDid,
    request: actix_web::HttpRequest,
) -> XrpcResult<HttpResponse> {
    let proxied = lookup(request.path())?;
    let params: BTreeMap<String, String> =
        serde_urlencoded::from_str(request.query_string()).unwrap_or_default();

    match proxied.shape {
        Shape::Url => {
            let location = call_for_url(&state, proxied.subsonic, &auth.did, &params).await?;
            json(UrlOutput { url: location })
        }
        _ => {
            let payload = call(&state, proxied.subsonic, &auth.did, &params).await?;
            Ok(HttpResponse::Ok().json(payload))
        }
    }
}

async fn handle_body(
    state: web::Data<AppState>,
    auth: AuthDid,
    request: actix_web::HttpRequest,
    body: Option<web::Json<serde_json::Value>>,
) -> XrpcResult<HttpResponse> {
    let proxied = lookup(request.path())?;
    let params = body_params(body);

    let payload = call(&state, proxied.subsonic, &auth.did, &params).await?;
    Ok(HttpResponse::Ok().json(payload))
}

/// Flattens a JSON request body into Subsonic parameters.
///
/// The body's fields become the query string, which is what Subsonic expects
/// even for its write operations. Values are stringified because that is all a
/// query string carries; `null` is dropped, matching an absent field.
fn body_params(body: Option<web::Json<serde_json::Value>>) -> BTreeMap<String, String> {
    body.and_then(|body| body.into_inner().as_object().cloned())
        .map(|object| {
            object
                .into_iter()
                .filter_map(|(key, value)| {
                    let text = match value {
                        serde_json::Value::String(text) => text,
                        serde_json::Value::Null => return None,
                        other => other.to_string(),
                    };
                    Some((key, text))
                })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Serialize)]
struct UrlOutput {
    url: String,
}

/// Finds the table entry for a request path.
fn lookup(path: &str) -> Result<&'static Proxied, XrpcError> {
    let method = path.rsplit('.').next().unwrap_or_default();
    PROXIED
        .iter()
        .find(|proxied| proxied.method == method)
        // Unreachable through the router, which only registers what the table
        // holds — but an internal error is the honest answer if it happens.
        .ok_or_else(|| {
            XrpcError::internal(anyhow::anyhow!(
                "no navidrome mapping for {path}, which should not be routed"
            ))
        })
}

/// The caller's handle, which is what navidrome identifies a library by.
async fn resolve_handle(db: &Backend, did: &str) -> Result<String, XrpcError> {
    let query = Query::select()
        .column(Users::Handle)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query).await?.ok_or_else(|| {
        // Authenticated to this instance, but with no account here — so there
        // is no library to serve.
        XrpcError::auth_required(format!("No account on this instance for {did}"))
    })
}

/// Where navidrome is, and the secret it trusts.
fn upstream(state: &AppState) -> Result<(&str, &str), XrpcError> {
    let config = state.config();
    match (
        config.navidrome_internal_url.as_deref(),
        config.navidrome_internal_secret.as_deref(),
    ) {
        (Some(url), Some(secret)) if !url.is_empty() && !secret.is_empty() => Ok((url, secret)),
        // A self-hosted instance without navidrome has no uploaded library,
        // which is a configuration state rather than a failure — so it is
        // reported as one.
        _ => Err(XrpcError::not_configured("The music library (navidrome)")),
    }
}

/// Calls navidrome and unwraps its `subsonic-response`.
async fn call(
    state: &AppState,
    subsonic: &str,
    did: &str,
    params: &BTreeMap<String, String>,
) -> Result<serde_json::Value, XrpcError> {
    let (base, secret) = upstream(state)?;
    let handle = resolve_handle(state.db(), did).await?;

    let response = state
        .http()
        .get(format!("{base}/rest/{subsonic}"))
        .query(&subsonic_query(params, &handle))
        .header("X-Rocksky-Internal", secret)
        .send()
        .await
        .map_err(|err| {
            tracing::warn!(subsonic, error = %err, "could not reach navidrome");
            XrpcError::with_message(
                ResponseType::UpstreamFailure,
                "Could not reach the music library",
            )
        })?;

    let body: serde_json::Value = response.json().await.map_err(|err| {
        tracing::warn!(subsonic, error = %err, "navidrome answered unreadable JSON");
        XrpcError::with_message(
            ResponseType::UpstreamFailure,
            "The music library answered something unreadable",
        )
    })?;

    let payload = body.get("subsonic-response").ok_or_else(|| {
        XrpcError::with_message(
            ResponseType::UpstreamFailure,
            format!("Malformed library response for {subsonic}"),
        )
    })?;

    if payload.get("status").and_then(|s| s.as_str()) == Some("failed") {
        return Err(subsonic_error(subsonic, payload));
    }

    tracing::debug!(subsonic, handle = %handle, "proxied a library call");
    Ok(payload.clone())
}

/// Calls a method that answers a redirect, and returns the target.
async fn call_for_url(
    state: &AppState,
    subsonic: &str,
    did: &str,
    params: &BTreeMap<String, String>,
) -> Result<String, XrpcError> {
    let (base, secret) = upstream(state)?;
    let handle = resolve_handle(state.db(), did).await?;

    // Built without redirect following, because the redirect *is* the answer.
    // The shared client follows them, so a one-off is used here.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    let response = client
        .get(format!("{base}/rest/{subsonic}"))
        .query(&subsonic_query(params, &handle))
        .header("X-Rocksky-Internal", secret)
        .send()
        .await
        .map_err(|err| {
            tracing::warn!(subsonic, error = %err, "could not reach navidrome");
            XrpcError::with_message(
                ResponseType::UpstreamFailure,
                "Could not reach the music library",
            )
        })?;

    if let Some(location) = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|value| value.to_str().ok())
    {
        tracing::debug!(subsonic, handle = %handle, "proxied a library URL");
        return Ok(location.to_string());
    }

    // No redirect means navidrome answered an error envelope instead.
    let body: serde_json::Value = response.json().await.unwrap_or(serde_json::Value::Null);
    if let Some(payload) = body.get("subsonic-response") {
        if payload.get("status").and_then(|s| s.as_str()) == Some("failed") {
            return Err(subsonic_error(subsonic, payload));
        }
    }

    Err(XrpcError::with_message(
        ResponseType::UpstreamFailure,
        format!("The library returned no URL for {subsonic}"),
    ))
}

/// Maps a Subsonic error onto the closest HTTP status.
///
/// | Subsonic code | meaning                    | status |
/// |---------------|----------------------------|--------|
/// | 10            | a required parameter missing |    400 |
/// | 40, 41        | authentication failed      |    401 |
/// | 50            | not authorized             |    403 |
/// | 70            | not found                  |    404 |
/// | anything else | navidrome's problem        |    502 |
///
/// Collapsing these to 500 would make "you asked for a song that does not
/// exist" indistinguishable from "the library is broken".
fn subsonic_error(subsonic: &str, payload: &serde_json::Value) -> XrpcError {
    let error = payload.get("error");
    let code = error
        .and_then(|error| error.get("code"))
        .and_then(|code| code.as_i64())
        .unwrap_or(0);
    let message = error
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
        .unwrap_or("The music library reported an error")
        .to_string();

    tracing::debug!(subsonic, code, message = %message, "navidrome refused a call");

    let kind = match code {
        10 => ResponseType::InvalidRequest,
        40 | 41 => ResponseType::AuthRequired,
        50 => ResponseType::Forbidden,
        70 => ResponseType::NotFound,
        _ => ResponseType::UpstreamFailure,
    };
    XrpcError::with_message(kind, message)
}

// -------------------------------------------------------------- the writes

/// `app.rocksky.library.createPlaylist`
async fn create_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: Option<web::Json<serde_json::Value>>,
) -> XrpcResult<HttpResponse> {
    let params = body_params(body);
    let mut payload = call(&state, "createPlaylist", &auth.did, &params).await?;

    let playlist_id = payload
        .pointer("/playlist/id")
        .and_then(|id| id.as_str())
        .map(str::to_string);

    if let Some(playlist_id) = playlist_id {
        match mirror_create(&state, &auth.did, &playlist_id).await {
            Ok(uri) => {
                if let Some(playlist) = payload.get_mut("playlist").and_then(|p| p.as_object_mut())
                {
                    playlist.insert("uri".to_string(), serde_json::Value::String(uri));
                }
            }
            Err(err) => report_mirror(&mut payload, "createPlaylist", err),
        }
    }

    Ok(HttpResponse::Ok().json(payload))
}

/// `app.rocksky.library.updatePlaylist`
async fn update_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: Option<web::Json<serde_json::Value>>,
) -> XrpcResult<HttpResponse> {
    // Checked before anything is read, so an instance without navidrome
    // answers the same 501 the read methods do rather than working through a
    // library it does not have.
    upstream(&state)?;

    let params = body_params(body);
    let playlist_id = params.get("playlistId").cloned();

    // A track index only means something while the row is still there, so the
    // song it points at is resolved before navidrome drops it.
    let removed_song_uri = match (
        playlist_id.as_deref(),
        params
            .get("songIndexToRemove")
            .and_then(|index| index.parse::<i64>().ok()),
    ) {
        (Some(id), Some(index)) => song_uri_at_index(state.db(), id, index).await?,
        _ => None,
    };

    let mut payload = call(&state, "updatePlaylist", &auth.did, &params).await?;

    if let Some(playlist_id) = &playlist_id {
        let changes = Changes {
            name: params.get("name").cloned(),
            comment: params.get("comment").cloned(),
            song_id_to_add: params.get("songIdToAdd").cloned(),
            removed_song_uri,
        };
        match mirror_update(&state, &auth.did, playlist_id, &changes).await {
            Ok(uri) => {
                if let Some(object) = payload.as_object_mut() {
                    object.insert("uri".to_string(), serde_json::Value::String(uri));
                }
            }
            Err(err) => report_mirror(&mut payload, "updatePlaylist", err),
        }
    }

    Ok(HttpResponse::Ok().json(payload))
}

/// `app.rocksky.library.deletePlaylist`
async fn delete_playlist(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: Option<web::Json<serde_json::Value>>,
) -> XrpcResult<HttpResponse> {
    upstream(&state)?;

    let params = body_params(body);

    // Deleting the playlist takes the link to its record with it, so the
    // AT-URI is read while the row still exists. navidrome refuses non-owners
    // and this is only a read, so doing it first is safe.
    let uri = match params.get("id") {
        Some(playlist_id) => playlist_uri_of(state.db(), playlist_id).await?,
        None => None,
    };

    let mut payload = call(&state, "deletePlaylist", &auth.did, &params).await?;

    if let Some(uri) = uri {
        if let Err(err) = mirror_delete(&state, &auth.did, &uri).await {
            report_mirror(&mut payload, "deletePlaylist", err);
        }
    }

    Ok(HttpResponse::Ok().json(payload))
}

#[derive(Debug, Clone, Deserialize)]
struct DeleteById {
    #[serde(default)]
    id: Option<String>,
}

/// `app.rocksky.library.deleteSong`
///
/// The caller's *upload* goes; the shared `tracks` row and the scrobbles that
/// point at it stay — see [`crate::uploads`].
async fn delete_song(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: Option<web::Json<DeleteById>>,
) -> XrpcResult<HttpResponse> {
    let id = required_id(&body, "song")?;
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let found = uploads::find_by_track(db, &user_id, &id).await?;
    if found.is_empty() {
        return Err(XrpcError::with_message(
            ResponseType::NotFound,
            "No uploaded song found for the user.",
        ));
    }
    let deleted = purge(&state, &user_id, &found).await?;

    tracing::info!(did = %auth.did, song = %id, deleted, "deleted an uploaded song");
    json(DeleteSongOutput {
        status: "ok".to_string(),
        deleted: deleted as i64,
    })
}

/// `app.rocksky.library.deleteAlbum`
async fn delete_album(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: Option<web::Json<DeleteById>>,
) -> XrpcResult<HttpResponse> {
    let id = required_id(&body, "album")?;
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let found = uploads::find_by_album_id(db, &user_id, &id).await?;
    if found.is_empty() {
        return Err(XrpcError::with_message(
            ResponseType::NotFound,
            "No uploaded songs found for the album.",
        ));
    }
    let deleted = purge(&state, &user_id, &found).await?;

    tracing::info!(did = %auth.did, album = %id, deleted, "deleted an uploaded album");
    json(DeleteAlbumOutput {
        status: "ok".to_string(),
        deleted: deleted as i64,
    })
}

fn required_id(body: &Option<web::Json<DeleteById>>, what: &str) -> Result<String, XrpcError> {
    body.as_ref()
        .and_then(|body| body.id.as_deref())
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .ok_or_else(|| XrpcError::invalid_request(format!("Missing {what} id.")))
}

/// Deletes the objects and the rows, then drops the search documents.
///
/// The same two steps as `rest::uploads`, in the same order — which is not
/// arbitrary. A document outliving its row is a search hit the listing filters
/// away; a row deleted before its document would be a track missing from
/// search while it is still playable.
async fn purge(state: &AppState, user_id: &str, found: &[Upload]) -> Result<u64, XrpcError> {
    let deleted = uploads::purge(
        state.db(),
        state.config().s3.as_ref(),
        state.storage_encryption_key(),
        user_id,
        found,
    )
    .await?;

    let ids: Vec<String> = found.iter().map(|upload| upload.id.clone()).collect();
    crate::search::remove_uploads(state, &ids).await;

    Ok(deleted)
}

// ------------------------------------------------------------- the mirror

/// Why a mirror step could not finish.
///
/// Its message is written for a person, because that is where it ends up: the
/// reply body, as `atprotoError`.
#[derive(Debug)]
struct MirrorError(String);

impl MirrorError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl From<XrpcError> for MirrorError {
    fn from(err: XrpcError) -> Self {
        Self(err.body().message)
    }
}

impl From<sqlx::Error> for MirrorError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(error = ?err, "a mirror step could not read the database");
        Self::new("The playlist could not be synced to your PDS.")
    }
}

/// Reports a mirror failure in the reply body rather than raising it.
///
/// The library mutation has already committed by the time a mirror runs, so
/// the reply is a success however the mirror went. A dead PDS session says
/// nothing about whether the playlist exists, and failing here would report
/// one that visibly does as not created.
fn report_mirror(payload: &mut serde_json::Value, method: &str, err: MirrorError) {
    tracing::error!(method, error = %err.0, "the atproto mirror failed");
    if let Some(object) = payload.as_object_mut() {
        object.insert("atprotoError".to_string(), serde_json::Value::String(err.0));
    }
}

/// Publishes the record for a freshly created library playlist.
async fn mirror_create(
    state: &AppState,
    did: &str,
    playlist_id: &str,
) -> Result<String, MirrorError> {
    let (uri, _) = ensure_playlist_record(state, did, playlist_id).await?;
    Ok(uri)
}

/// What a library `updatePlaylist` changed.
struct Changes {
    name: Option<String>,
    comment: Option<String>,
    song_id_to_add: Option<String>,
    /// Resolved before the navidrome delete, since the index does not survive
    /// it.
    removed_song_uri: Option<String>,
}

/// Replays a library playlist update — rename, add song, remove song.
async fn mirror_update(
    state: &AppState,
    did: &str,
    playlist_id: &str,
    changes: &Changes,
) -> Result<String, MirrorError> {
    let (uri, published) = ensure_playlist_record(state, did, playlist_id).await?;

    // A record published just now already carries the new name and
    // description: navidrome applied them before the mirror ran, and
    // `ensure_playlist_record` read the row back afterwards. Patching would be
    // a write that changes nothing.
    let renamed = changes.name.is_some() || changes.comment.is_some();
    if renamed && !published {
        super::playlist::patch_playlist(
            state,
            did,
            &uri,
            changes.name.as_deref(),
            changes.comment.as_deref(),
            None,
        )
        .await?;
    }

    if let Some(song_id) = &changes.song_id_to_add {
        let song_uri = song_uri_of(state.db(), song_id).await?;
        super::playlist::add_song_records(state, did, &uri, &[song_uri]).await?;
    }

    if let Some(song_uri) = &changes.removed_song_uri {
        super::playlist::remove_one_entry(state, did, &uri, song_uri).await?;
    }

    Ok(uri)
}

/// Retracts the record, and this repo's entries, for a deleted library
/// playlist.
async fn mirror_delete(state: &AppState, did: &str, playlist_uri: &str) -> Result<(), MirrorError> {
    super::playlist::retract_playlist(state, did, playlist_uri).await?;
    Ok(())
}

/// The AT-URI of the record mirroring a playlist, publishing one first if it
/// has none yet, and whether it was published just now.
///
/// Playlists made before the mirror existed — and any whose creation-time
/// publish failed — get their record here, on the first mutation that reaches
/// them.
async fn ensure_playlist_record(
    state: &AppState,
    did: &str,
    playlist_id: &str,
) -> Result<(String, bool), MirrorError> {
    let row = load_playlist(state.db(), did, playlist_id).await?;
    if let Some(uri) = row.uri.filter(|uri| !uri.is_empty()) {
        return Ok((uri, false));
    }

    let written =
        super::playlist::publish_playlist(state, did, &row.name, row.description.as_deref(), None)
            .await?;

    let update = Query::update()
        .table(NavidromePlaylists::Table)
        .value(NavidromePlaylists::Uri, written.uri.clone())
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .to_owned();
    state.db().execute(&update).await?;

    Ok((written.uri, true))
}

#[derive(Debug, sqlx::FromRow)]
struct LibraryPlaylist {
    name: String,
    description: Option<String>,
    uri: Option<String>,
}

/// A library playlist the caller owns.
///
/// navidrome has already refused non-owners by the time a mirror runs. Scoping
/// this read to the caller as well is what makes it structurally impossible to
/// stamp their AT-URI onto someone else's row.
async fn load_playlist(
    db: &Backend,
    did: &str,
    playlist_id: &str,
) -> Result<LibraryPlaylist, MirrorError> {
    let user_id = caller_id(db, did).await?;
    let query = Query::select()
        .column(NavidromePlaylists::Name)
        .column(NavidromePlaylists::Description)
        .column(NavidromePlaylists::Uri)
        .from(NavidromePlaylists::Table)
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .and_where(Expr::col(NavidromePlaylists::UserId).eq(&user_id))
        .limit(1)
        .take();

    db.fetch_optional::<LibraryPlaylist>(&query)
        .await?
        .ok_or_else(|| MirrorError::new(format!("Playlist {playlist_id} not found")))
}

/// The AT-URI mirroring a playlist, or `None` when it never got a record.
async fn playlist_uri_of(db: &Backend, playlist_id: &str) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(NavidromePlaylists::Uri)
        .from(NavidromePlaylists::Table)
        .and_where(Expr::col(NavidromePlaylists::XataId).eq(playlist_id))
        .limit(1)
        .take();

    Ok(db
        .fetch_scalar::<Option<String>>(&query)
        .await?
        .flatten()
        .filter(|uri| !uri.is_empty()))
}

/// The `app.rocksky.song` AT-URI of a library track, by its row id.
async fn song_uri_of(db: &Backend, song_id: &str) -> Result<String, MirrorError> {
    let query = Query::select()
        .column(Tracks::Title)
        .column(Tracks::Uri)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::XataId).eq(song_id))
        .limit(1)
        .take();

    let (title, uri) = db
        .fetch_optional::<(String, Option<String>)>(&query)
        .await?
        .ok_or_else(|| MirrorError::new(format!("Song {song_id} not found")))?;

    uri.filter(|uri| !uri.is_empty()).ok_or_else(|| {
        MirrorError::new(format!(
            "“{title}” has no record on your PDS yet, so it could not be added \
             to the playlist there."
        ))
    })
}

/// The song AT-URI at a 0-based position in a library playlist, in the order
/// `getPlaylist` presents it.
///
/// Must be read *before* the navidrome delete: afterwards the row is gone and
/// the index names a different song.
async fn song_uri_at_index(
    db: &Backend,
    playlist_id: &str,
    index: i64,
) -> Result<Option<String>, sqlx::Error> {
    let Ok(offset) = u64::try_from(index) else {
        return Ok(None);
    };

    let query = Query::select()
        .expr(Expr::col((Alias::new("t"), Tracks::Uri)))
        .from_as(NavidromePlaylistTracks::Table, Alias::new("pt"))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("pt"), NavidromePlaylistTracks::TrackId)),
        )
        .and_where(
            Expr::col((Alias::new("pt"), NavidromePlaylistTracks::PlaylistId)).eq(playlist_id),
        )
        .order_by(
            (Alias::new("pt"), NavidromePlaylistTracks::XataCreatedat),
            Order::Asc,
        )
        .limit(1)
        .offset(offset)
        .take();

    Ok(db.fetch_scalar::<Option<String>>(&query).await?.flatten())
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
        .ok_or_else(|| XrpcError::auth_required(format!("No user found for DID {did}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The table is the contract, so its shape is asserted rather than
    /// assumed.
    #[test]
    fn every_entry_is_distinct_and_named() {
        let methods: std::collections::HashSet<&str> = PROXIED.iter().map(|p| p.method).collect();
        assert_eq!(
            methods.len(),
            PROXIED.len(),
            "a method is mapped twice, so one route would shadow the other"
        );

        for proxied in PROXIED {
            assert!(!proxied.method.is_empty());
            assert!(!proxied.subsonic.is_empty());
            assert!(
                !proxied.method.contains('.'),
                "{} should be a bare method name",
                proxied.method
            );
        }
    }

    /// The versioned Subsonic names are the reason this is a table. A
    /// regression here calls the wrong endpoint and gets a different shape
    /// back, which no type would catch.
    #[test]
    fn the_versioned_subsonic_names_are_preserved() {
        let expected = [
            ("getAlbumInfo", "getAlbumInfo2"),
            ("getAlbumList", "getAlbumList2"),
            ("getArtistInfo", "getArtistInfo2"),
            ("getSimilarSongs", "getSimilarSongs2"),
            ("getStarred", "getStarred2"),
            ("search", "search3"),
            ("getStreamUrl", "stream"),
            ("getDownloadUrl", "download"),
            ("getCoverArtUrl", "getCoverArt"),
        ];

        for (method, subsonic) in expected {
            let found = PROXIED
                .iter()
                .find(|p| p.method == method)
                .unwrap_or_else(|| panic!("{method} is not mapped"));
            assert_eq!(found.subsonic, subsonic, "{method}");
        }
    }

    /// The three URL methods are the ones that must not be followed, or every
    /// stream would pass through this process.
    #[test]
    fn only_the_media_methods_answer_a_url() {
        let url_methods: Vec<&str> = PROXIED
            .iter()
            .filter(|p| p.shape == Shape::Url)
            .map(|p| p.method)
            .collect();
        assert_eq!(
            url_methods,
            ["getStreamUrl", "getDownloadUrl", "getCoverArtUrl"]
        );
    }

    /// A caller must not be able to name the user or supply credentials: `u`
    /// is resolved from the JWT, and accepting it would serve anyone's library
    /// to anyone.
    #[test]
    fn a_caller_cannot_choose_the_user_or_the_credentials() {
        let params = BTreeMap::from([
            ("u".to_string(), "someone.else".to_string()),
            ("p".to_string(), "hunter2".to_string()),
            ("t".to_string(), "token".to_string()),
            ("s".to_string(), "salt".to_string()),
            ("id".to_string(), "song-1".to_string()),
        ]);

        let query = subsonic_query(&params, "alice.test");
        let by_key: BTreeMap<&str, &str> = query
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();

        assert_eq!(by_key["u"], "alice.test", "the JWT's handle must win");
        assert_eq!(by_key["id"], "song-1", "a real parameter passes through");
        for reserved in ["p", "t", "s"] {
            assert!(
                !by_key.contains_key(reserved),
                "{reserved} must be dropped: {query:?}"
            );
        }
        // And JSON is forced, so the response is parseable.
        assert_eq!(by_key["f"], "json");
    }

    /// `u` appearing once matters: two `u` parameters would let navidrome pick
    /// whichever it reads last.
    #[test]
    fn the_user_parameter_appears_exactly_once() {
        let params = BTreeMap::from([("u".to_string(), "attacker".to_string())]);
        let query = subsonic_query(&params, "alice.test");
        assert_eq!(query.iter().filter(|(key, _)| key == "u").count(), 1);
    }

    #[test]
    fn empty_parameters_are_dropped() {
        let params = BTreeMap::from([
            ("id".to_string(), String::new()),
            ("size".to_string(), "10".to_string()),
        ]);
        let query = subsonic_query(&params, "alice.test");
        assert!(!query.iter().any(|(key, _)| key == "id"), "{query:?}");
        assert!(query.iter().any(|(key, _)| key == "size"));
    }

    /// Subsonic's codes carry real distinctions, and flattening them would
    /// make a missing song look like a broken library.
    #[test]
    fn subsonic_codes_map_to_distinct_statuses() {
        let error = |code: i64| {
            let payload = serde_json::json!({
                "status": "failed",
                "error": { "code": code, "message": "nope" },
            });
            subsonic_error("getSong", &payload).kind.status()
        };

        assert_eq!(error(10), 400);
        assert_eq!(error(40), 401);
        assert_eq!(error(41), 401);
        assert_eq!(error(50), 403);
        assert_eq!(error(70), 404);
        assert_eq!(error(0), 502);
        assert_eq!(error(999), 502);
    }

    /// The upstream's own message is kept, since it says what was wrong.
    #[test]
    fn a_refusal_keeps_navidromes_message() {
        let payload = serde_json::json!({
            "status": "failed",
            "error": { "code": 70, "message": "Song not found" },
        });
        let error = subsonic_error("getSong", &payload);
        assert_eq!(error.body().message, "Song not found");
    }

    #[test]
    fn a_refusal_without_a_message_still_reads() {
        let payload = serde_json::json!({ "status": "failed" });
        let error = subsonic_error("getSong", &payload);
        assert!(!error.body().message.is_empty());
        assert_eq!(error.kind.status(), 502);
    }

    #[test]
    fn a_request_path_resolves_to_its_mapping() {
        let found = lookup("/xrpc/app.rocksky.library.getAlbumList").unwrap();
        assert_eq!(found.subsonic, "getAlbumList2");

        assert!(lookup("/xrpc/app.rocksky.library.notAThing").is_err());
    }

    /// The five writes are registered here rather than in the table, so their
    /// absence would not show up in any of the assertions above.
    #[test]
    fn the_writes_are_not_in_the_proxy_table() {
        for method in [
            "createPlaylist",
            "updatePlaylist",
            "deletePlaylist",
            "deleteSong",
            "deleteAlbum",
        ] {
            assert!(
                !PROXIED.iter().any(|proxied| proxied.method == method),
                "{method} has its own handler; a table entry would shadow it"
            );
        }
    }

    /// A body-carrying write goes through the same stripping as a query one:
    /// `body_params` only flattens, and `subsonic_query` is what drops the
    /// credentials.
    #[test]
    fn a_write_body_cannot_carry_credentials_either() {
        let body = serde_json::json!({
            "name": "Mine",
            "u": "someone.else",
            "p": "hunter2",
            "t": "token",
            "s": "salt",
            "songIndexToRemove": 3,
            "comment": serde_json::Value::Null,
        });

        let params = body_params(Some(web::Json(body)));
        // A number survives as text, which is all a query string carries.
        assert_eq!(params["songIndexToRemove"], "3");
        // And a null is absent rather than the string "null".
        assert!(!params.contains_key("comment"), "{params:?}");

        let query = subsonic_query(&params, "alice.test");
        let by_key: BTreeMap<&str, &str> = query
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();

        assert_eq!(by_key["u"], "alice.test");
        assert_eq!(by_key["name"], "Mine");
        for reserved in ["p", "t", "s"] {
            assert!(
                !by_key.contains_key(reserved),
                "{reserved} must be dropped: {query:?}"
            );
        }
    }

    /// The reply stays a success and says why — the whole point of the mirror
    /// being non-transactional with the library.
    #[test]
    fn a_mirror_failure_is_reported_in_the_body() {
        let mut payload = serde_json::json!({ "status": "ok" });
        report_mirror(
            &mut payload,
            "createPlaylist",
            MirrorError::new("Your session with your PDS has expired."),
        );

        assert_eq!(payload["status"], "ok");
        assert_eq!(
            payload["atprotoError"],
            "Your session with your PDS has expired."
        );
    }

    /// An `XrpcError` carries the message a person should read, not its
    /// `Display` form, which prefixes the envelope's error name.
    #[test]
    fn a_mirror_error_keeps_the_readable_message() {
        let error: MirrorError =
            XrpcError::auth_required("Sign in again to publish records.").into();
        assert_eq!(error.0, "Sign in again to publish records.");
    }

    // --------------------------------------------------------- over HTTP

    use crate::config::Config;
    use crate::db::new_id;
    use crate::db::schema::{NavidromePlaylists, UserUploads};
    use crate::state::AppState;

    /// A stand-in navidrome that answers with the query string it was sent.
    ///
    /// Echoing it back is what makes the credential assertions real: they read
    /// what reached the upstream rather than what this module meant to send.
    async fn echo(request: actix_web::HttpRequest) -> HttpResponse {
        HttpResponse::Ok().json(serde_json::json!({
            "subsonic-response": {
                "status": "ok",
                "query": request.query_string(),
                "playlist": { "id": "pl1", "name": "Mine" },
            }
        }))
    }

    fn start_stub_navidrome() -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("a loopback port");
        let port = listener.local_addr().expect("a bound address").port();
        let server =
            actix_web::HttpServer::new(|| actix_web::App::new().default_service(web::to(echo)))
                .workers(1)
                .listen(listener)
                .expect("serve on the bound listener")
                .run();
        tokio::spawn(server);
        format!("http://127.0.0.1:{port}")
    }

    /// An instance with one account, and navidrome pointed wherever `base`
    /// says — `None` for an instance that has none.
    async fn instance(base: Option<String>) -> (AppState, String) {
        let mut config = Config::for_test();
        config.navidrome_internal_url = base;
        config.navidrome_internal_secret = Some("internal-secret".to_string());

        let state = AppState::for_test_with(config).await.expect("state");
        let db = state.db();
        crate::ingest::upsert_user(db, "did:plc:alice")
            .await
            .expect("a user row");
        crate::ingest::set_handle(db, "did:plc:alice", "alice.test")
            .await
            .expect("a handle");

        let token = jsonwebtoken::encode(
            &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
            &serde_json::json!({ "did": "did:plc:alice" }),
            &jsonwebtoken::EncodingKey::from_secret(state.config().jwt_secret.as_bytes()),
        )
        .expect("a signed token");

        (state, token)
    }

    macro_rules! app {
        ($state:expr) => {
            actix_web::test::init_service(
                actix_web::App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    async fn post(
        state: &AppState,
        token: &str,
        method: &str,
        body: serde_json::Value,
    ) -> (u16, serde_json::Value) {
        let app = app!(state);
        let response = actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::post()
                .uri(&format!("/xrpc/app.rocksky.library.{method}"))
                .insert_header(("Authorization", format!("Bearer {token}")))
                .set_json(body)
                .to_request(),
        )
        .await;

        let status = response.status().as_u16();
        (status, actix_web::test::read_body_json(response).await)
    }

    /// The one that matters: a caller naming the navidrome user, or supplying
    /// Subsonic credentials, must not have them reach navidrome — on the
    /// writes as much as on the reads.
    #[actix_web::test]
    async fn a_write_cannot_smuggle_credentials_to_navidrome() {
        let (state, token) = instance(Some(start_stub_navidrome())).await;

        for method in ["createPlaylist", "updatePlaylist", "deletePlaylist"] {
            let (status, body) = post(
                &state,
                &token,
                method,
                serde_json::json!({
                    "id": "pl1",
                    "playlistId": "pl1",
                    "name": "Mine",
                    "u": "someone.else",
                    "p": "hunter2",
                    "t": "token",
                    "s": "salt",
                }),
            )
            .await;

            assert_eq!(status, 200, "{method}: {body}");
            let query = body["query"].as_str().unwrap_or_default();
            assert!(
                query.contains("u=alice.test"),
                "{method} must send the JWT's handle: {query}"
            );
            for smuggled in ["someone.else", "hunter2", "salt"] {
                assert!(
                    !query.contains(smuggled),
                    "{method} leaked {smuggled}: {query}"
                );
            }
            // `t=token` would also match the `f=json` value, so the parameter
            // itself is what is asserted.
            assert!(!query.contains("t=token"), "{method} leaked t: {query}");
        }
    }

    /// An instance without navidrome has no uploaded library, so the playlist
    /// writes report a configuration state rather than inventing a success.
    #[actix_web::test]
    async fn the_playlist_writes_need_navidrome() {
        let (state, token) = instance(None).await;

        for method in ["createPlaylist", "updatePlaylist", "deletePlaylist"] {
            let (status, body) = post(
                &state,
                &token,
                method,
                serde_json::json!({ "id": "pl1", "playlistId": "pl1", "name": "Mine" }),
            )
            .await;

            assert_eq!(status, 501, "{method}: {body}");
            assert_eq!(body["error"], "NotConfigured", "{method}");
            assert!(
                body["message"]
                    .as_str()
                    .unwrap_or_default()
                    .contains("navidrome"),
                "the reason should name what is missing: {body}"
            );
        }
    }

    /// The playlist exists in the library by the time the mirror runs, so a
    /// mirror that cannot publish is reported rather than raised. There is no
    /// PDS session in this instance, so the mirror fails for a real reason.
    #[actix_web::test]
    async fn a_failed_mirror_still_answers_success() {
        let (state, token) = instance(Some(start_stub_navidrome())).await;

        let owner = caller_id(state.db(), "did:plc:alice").await.unwrap();
        let insert = Query::insert()
            .into_table(NavidromePlaylists::Table)
            .columns([
                NavidromePlaylists::XataId,
                NavidromePlaylists::Name,
                NavidromePlaylists::UserId,
            ])
            .values_panic(["pl1".into(), "Mine".into(), owner.into()])
            .to_owned();
        state.db().execute(&insert).await.unwrap();

        let (status, body) = post(
            &state,
            &token,
            "createPlaylist",
            serde_json::json!({ "name": "Mine" }),
        )
        .await;

        assert_eq!(status, 200, "the library call succeeded: {body}");
        assert_eq!(body["playlist"]["id"], "pl1", "navidrome's reply stands");
        assert!(
            body["atprotoError"].is_string(),
            "the mirror failure must be reported, not swallowed: {body}"
        );
        assert!(
            body["playlist"]["uri"].is_null(),
            "and no URI should be claimed: {body}"
        );
    }

    /// `deleteSong` and `deleteAlbum` never touch navidrome, so an instance
    /// without one still answers them.
    #[actix_web::test]
    async fn deleting_an_upload_does_not_need_navidrome() {
        let (state, token) = instance(None).await;
        let db = state.db();
        let owner = caller_id(db, "did:plc:alice").await.unwrap();

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
            ])
            .values_panic([
                "rec_track".into(),
                "Roygbiv".into(),
                "Boards of Canada".into(),
                "Boards of Canada".into(),
                "MHTRTC".into(),
                151_000.into(),
                "sha-1".into(),
            ])
            .to_owned();
        db.execute(&track).await.unwrap();

        let upload = Query::insert()
            .into_table(UserUploads::Table)
            .columns([
                UserUploads::XataId,
                UserUploads::UserId,
                UserUploads::TrackId,
                UserUploads::R2Key,
                UserUploads::MimeType,
                UserUploads::FileSize,
                UserUploads::OriginalFilename,
            ])
            .values_panic([
                new_id().into(),
                owner.as_str().into(),
                "rec_track".into(),
                "music/roygbiv.flac".into(),
                "audio/flac".into(),
                1000.into(),
                "roygbiv.flac".into(),
            ])
            .to_owned();
        db.execute(&upload).await.unwrap();

        let (status, body) = post(
            &state,
            &token,
            "deleteSong",
            serde_json::json!({ "id": "rec_track" }),
        )
        .await;

        assert_eq!(status, 200, "{body}");
        assert_eq!(body["status"], "ok");
        assert_eq!(body["deleted"], 1);
        assert!(
            uploads::find_by_track(db, &owner, "rec_track")
                .await
                .unwrap()
                .is_empty(),
            "the upload row should be gone"
        );
    }

    /// Nothing to delete is a 404 rather than `deleted: 0`, so a mistyped id
    /// is distinguishable from a successful no-op.
    #[actix_web::test]
    async fn deleting_an_upload_nobody_owns_is_a_404() {
        let (state, token) = instance(None).await;

        for method in ["deleteSong", "deleteAlbum"] {
            let (status, _) = post(
                &state,
                &token,
                method,
                serde_json::json!({ "id": "rec_missing" }),
            )
            .await;
            assert_eq!(status, 404, "{method}");
        }
    }

    #[actix_web::test]
    async fn deleting_an_upload_needs_an_id() {
        let (state, token) = instance(None).await;

        for method in ["deleteSong", "deleteAlbum"] {
            let (status, body) =
                post(&state, &token, method, serde_json::json!({ "id": "  " })).await;
            assert_eq!(status, 400, "{method}");
            assert!(
                body["message"].as_str().unwrap_or_default().contains("id"),
                "{method}: {body}"
            );
        }
    }

    /// Identity comes from the token, and only from it.
    #[actix_web::test]
    async fn every_write_needs_a_token() {
        let (state, _) = instance(Some(start_stub_navidrome())).await;
        let app = app!(&state);

        for method in [
            "createPlaylist",
            "updatePlaylist",
            "deletePlaylist",
            "deleteSong",
            "deleteAlbum",
        ] {
            let response = actix_web::test::call_service(
                &app,
                actix_web::test::TestRequest::post()
                    .uri(&format!("/xrpc/app.rocksky.library.{method}"))
                    .set_json(serde_json::json!({ "id": "pl1", "name": "Mine" }))
                    .to_request(),
            )
            .await;
            assert_eq!(response.status().as_u16(), 401, "{method}");
        }
    }
}
