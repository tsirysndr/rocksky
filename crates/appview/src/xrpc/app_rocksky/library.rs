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
//! | JSON, params   |      30 | query string forwarded, `subsonic-response` unwrapped |
//! | JSON, body     |       6 | request body becomes the query string       |
//! | a URL          |       3 | navidrome 302s; the `Location` is returned  |
//!
//! The URL ones matter: navidrome never proxies bytes, it redirects to a CDN
//! or a presigned S3 URL. Following the redirect here would stream every song
//! through this process for no reason, so the redirect is read and the URL
//! handed back.
//!
//! # Why a table rather than 41 functions
//!
//! Every one of these is the same handler with a different Subsonic method
//! name, and several names differ from the lexicon's — `getAlbumInfo` calls
//! `getAlbumInfo2`, `search` calls `search3`, `getStreamUrl` calls `stream`.
//! A table makes those mappings checkable at a glance; 41 near-identical
//! functions would hide them.

use crate::auth::AuthDid;
use crate::db::schema::Users;
use crate::db::Backend;
use crate::error::{ResponseType, XrpcError, XrpcResult};
use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use crate::xrpc::json;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Serialize;
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

    // The body's fields become the query string, which is what Subsonic
    // expects even for its write operations.
    let params = body
        .and_then(|body| body.into_inner().as_object().cloned())
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
                .collect::<BTreeMap<String, String>>()
        })
        .unwrap_or_default();

    let payload = call(&state, proxied.subsonic, &auth.did, &params).await?;
    Ok(HttpResponse::Ok().json(payload))
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
}
