//! `POST /now-playing` — how a scrobble actually arrives.
//!
//! The XRPC method `app.rocksky.scrobble.createScrobble` does the same thing
//! and is the better-specified door, but nothing uses it: every scrobbling
//! client in this repository posts here.
//!
//! | client                  | what it is                                  |
//! |-------------------------|---------------------------------------------|
//! | `crates/scrobbler`      | the Last.fm-compatible endpoint desktop apps and the `rocksky` CLI submit to |
//! | `crates/webscrobbler`   | the Web Scrobbler browser extension          |
//! | `crates/mirror`         | Last.fm, ListenBrainz and teal.fm mirrors    |
//!
//! All three build `format!("{}/now-playing", ROCKSKY_API)`. Without this
//! route a self-hosted instance answers 404 to all of them, so it indexes the
//! firehose and records nothing of the owner's own listening — which is the
//! one thing it exists to do.
//!
//! # It is a door onto `createScrobble`, not a second implementation
//!
//! The body is the same payload, and it is handed to
//! [`crate::xrpc::app_rocksky::scrobble_write::record_scrobble`] — the same
//! dedupe window, the same put-lock, the same records published to the
//! repository. Only the reply differs: `{"status":"ok"}`, which is what the
//! TypeScript answers and what these clients check for.
//!
//! # Not ported: the bot rate limiter
//!
//! `apps/api` can answer 429 with `account_flagged_as_bot` or
//! `scrobble_rate_exceeded`, from `users.is_bot` and a rate check. The column
//! exists here and is reported by `getProfile`, but nothing blocks on it —
//! that machinery lives in `apps/scrobble-abuse-sweep`, which flags accounts
//! offline rather than in the write path. A self-hosted instance scrobbling
//! its owner's own listening has nobody to rate limit, so this is a gap for a
//! public deployment rather than for the case this binary is built for.

use crate::auth::AuthDid;
use crate::error::XrpcResult;
use crate::state::AppState;
use crate::xrpc::app_rocksky::scrobble_write::{record_scrobble, CreateScrobbleInput};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Serialize;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/now-playing", web::post().to(now_playing));
}

/// What the clients check for. They read the status code and ignore the body,
/// but this is the shape `apps/api` returns and something may yet depend on it.
#[derive(Debug, Serialize)]
struct Accepted {
    status: &'static str,
}

async fn now_playing(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateScrobbleInput>,
) -> XrpcResult<HttpResponse> {
    record_scrobble(&state, &auth.did, body.into_inner()).await?;
    Ok(HttpResponse::Ok().json(Accepted { status: "ok" }))
}
