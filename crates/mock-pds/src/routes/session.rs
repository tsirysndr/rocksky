//! App-password sessions: `createSession`, `refreshSession`, `getSession`.
//!
//! The failure shape matters as much as the success one. A real PDS answers a
//! bad password with `401 { error: "AuthenticationRequired" }` — *not*
//! `AuthRequired`, which is what the XRPC server returns for a missing token
//! on the way in. Code that branches on the string needs the mock to use the
//! one the PDS actually sends.

use super::{bearer, injected_failure, xrpc_error};
use crate::state::State;
use actix_web::{web, HttpRequest, HttpResponse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/xrpc/com.atproto.server.createSession",
        web::post().to(create_session),
    )
    .route(
        "/xrpc/com.atproto.server.refreshSession",
        web::post().to(refresh_session),
    )
    .route(
        "/xrpc/com.atproto.server.getSession",
        web::get().to(get_session),
    );
}

#[derive(serde::Deserialize)]
struct Credentials {
    identifier: Option<String>,
    password: Option<String>,
}

async fn create_session(
    state: web::Data<State>,
    body: web::Json<Credentials>,
) -> HttpResponse {
    state.record_call("POST", "/xrpc/com.atproto.server.createSession");
    if let Some(failure) = injected_failure(&state, "com.atproto.server.createSession") {
        return failure;
    }

    let Some(identifier) = &body.identifier else {
        return xrpc_error(400, "InvalidRequest", "identifier is required");
    };

    // A wrong identifier and a wrong password answer the same way, as a real
    // PDS does — telling them apart would leak which accounts exist.
    let Some(account) = state.account(identifier) else {
        return unauthorized();
    };
    if body.password.as_deref() != Some(account.password.as_str()) {
        return unauthorized();
    }

    HttpResponse::Ok().json(serde_json::json!({
        "did": account.did,
        "handle": account.handle,
        "accessJwt": account.access_jwt,
        "refreshJwt": account.refresh_jwt,
        "active": true,
    }))
}

fn unauthorized() -> HttpResponse {
    xrpc_error(
        401,
        "AuthenticationRequired",
        "Invalid identifier or password",
    )
}

/// Answers with the same tokens rather than rotating them.
///
/// A real PDS issues a fresh refresh token each time and invalidates the old
/// one. Keeping them stable means a test can hold one token for its whole run;
/// a test that specifically wants rotation should assert on its own stored
/// session instead.
async fn refresh_session(state: web::Data<State>, request: HttpRequest) -> HttpResponse {
    state.record_call("POST", "/xrpc/com.atproto.server.refreshSession");
    if let Some(failure) = injected_failure(&state, "com.atproto.server.refreshSession") {
        return failure;
    }

    let Some(account) = bearer(&request).and_then(|token| state.account_for_token(&token)) else {
        return xrpc_error(400, "ExpiredToken", "Token has expired");
    };

    HttpResponse::Ok().json(serde_json::json!({
        "did": account.did,
        "handle": account.handle,
        "accessJwt": account.access_jwt,
        "refreshJwt": account.refresh_jwt,
        "active": true,
    }))
}

async fn get_session(state: web::Data<State>, request: HttpRequest) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.server.getSession");
    if let Some(failure) = injected_failure(&state, "com.atproto.server.getSession") {
        return failure;
    }

    let Some(account) = bearer(&request).and_then(|token| state.account_for_token(&token)) else {
        return xrpc_error(401, "AuthenticationRequired", "Invalid token");
    };

    HttpResponse::Ok().json(serde_json::json!({
        "did": account.did,
        "handle": account.handle,
        "active": true,
    }))
}
