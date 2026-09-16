//! The HTTP surface, split by the concern each group of endpoints serves.
//!
//! One mock answers for four things a real deployment keeps apart — the PLC
//! directory, the Bluesky appview, the PDS and its OAuth authorisation server
//! — because a test wants one base URL to point every setting at, and the
//! paths do not collide.

pub mod identity;
pub mod oauth;
pub mod repo;
pub mod session;
pub mod sync;

use crate::state::State;
use actix_web::{web, HttpResponse};

/// The error envelope every XRPC endpoint uses: `{error, message}`.
pub fn xrpc_error(status: u16, error: &str, message: &str) -> HttpResponse {
    HttpResponse::build(
        actix_web::http::StatusCode::from_u16(status)
            .unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR),
    )
    .json(serde_json::json!({ "error": error, "message": message }))
}

/// Returns the queued failure for `nsid` as a response, if one is due.
///
/// Every XRPC handler starts with this, so a test can make any single call
/// fail without the mock needing a per-endpoint switch.
pub fn injected_failure(state: &State, nsid: &str) -> Option<HttpResponse> {
    let failure = state.take_failure(nsid)?;
    Some(xrpc_error(
        failure.status,
        &failure.error,
        &failure.message,
    ))
}

/// The bearer token on a request, if there is one.
pub fn bearer(request: &actix_web::HttpRequest) -> Option<String> {
    request
        .headers()
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .map(str::to_string)
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    identity::configure(cfg);
    session::configure(cfg);
    repo::configure(cfg);
    sync::configure(cfg);
    oauth::configure(cfg);
}
