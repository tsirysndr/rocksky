//! The OAuth authorisation server a PDS advertises.
//!
//! Enough of it to exercise a client's plumbing: metadata discovery, pushed
//! authorisation requests, the token endpoint and revocation.
//!
//! What this deliberately does **not** do is verify anything cryptographic. It
//! does not check DPoP proofs, `private_key_jwt` client assertions, PKCE
//! verifiers or the `state` parameter, and the tokens it issues are opaque
//! strings rather than JWTs. So it is the right tool for "does the client
//! reach the token endpoint with the right shape, and does it store what came
//! back" and the wrong tool for "is the DPoP proof correct" — that needs a
//! real authorisation server.
//!
//! The metadata document is the most-used part even so: a client that has
//! stored a session still has to re-read the issuer's `token_endpoint` and
//! `revocation_endpoint` before it can refresh or log out, and a mock that
//! serves those keeps that path in the test.

use super::xrpc_error;
use crate::state::State;
use actix_web::{web, HttpResponse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/.well-known/oauth-authorization-server",
        web::get().to(metadata),
    )
    .route(
        "/.well-known/oauth-protected-resource",
        web::get().to(protected_resource),
    )
    .route("/oauth/par", web::post().to(pushed_authorization))
    .route("/oauth/token", web::post().to(token))
    .route("/oauth/revoke", web::post().to(revoke))
    .route("/oauth/authorize", web::get().to(authorize));
}

async fn metadata(state: web::Data<State>) -> HttpResponse {
    state.record_call("GET", "/.well-known/oauth-authorization-server");
    let base = state.lock().base_url.clone();

    HttpResponse::Ok().json(serde_json::json!({
        "issuer": base,
        "authorization_endpoint": format!("{base}/oauth/authorize"),
        "token_endpoint": format!("{base}/oauth/token"),
        "pushed_authorization_request_endpoint": format!("{base}/oauth/par"),
        "revocation_endpoint": format!("{base}/oauth/revoke"),
        "jwks_uri": format!("{base}/oauth/jwks"),
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"],
        "token_endpoint_auth_signing_alg_values_supported": ["ES256"],
        "scopes_supported": ["atproto", "transition:generic"],
        "dpop_signing_alg_values_supported": ["ES256"],
        "require_pushed_authorization_requests": true,
        "client_id_metadata_document_supported": true,
    }))
}

async fn protected_resource(state: web::Data<State>) -> HttpResponse {
    state.record_call("GET", "/.well-known/oauth-protected-resource");
    let base = state.lock().base_url.clone();

    HttpResponse::Ok().json(serde_json::json!({
        "resource": base,
        "authorization_servers": [base],
        "scopes_supported": ["atproto", "transition:generic"],
        "bearer_methods_supported": ["header"],
    }))
}

/// Issues a `request_uri` for whatever it is sent, without validating it.
async fn pushed_authorization(state: web::Data<State>) -> HttpResponse {
    state.record_call("POST", "/oauth/par");
    if let Some(failure) = super::injected_failure(&state, "oauth.par") {
        return failure;
    }

    let mut inner = state.lock();
    inner.revision += 1;
    let handle = format!("urn:ietf:params:oauth:request_uri:mock-{}", inner.revision);

    HttpResponse::Created().json(serde_json::json!({
        "request_uri": handle,
        "expires_in": 299,
    }))
}

/// Stands in for the consent screen by redirecting straight back with a code.
///
/// A real server would show the user a page; a test only needs the redirect,
/// so the code is handed out immediately.
async fn authorize(state: web::Data<State>, request: actix_web::HttpRequest) -> HttpResponse {
    state.record_call("GET", "/oauth/authorize");

    let query: std::collections::HashMap<String, String> =
        serde_urlencoded::from_str(request.query_string()).unwrap_or_default();

    let Some(redirect) = query.get("redirect_uri") else {
        return xrpc_error(400, "invalid_request", "redirect_uri is required");
    };

    let base = state.lock().base_url.clone();
    let separator = if redirect.contains('?') { '&' } else { '?' };
    let mut location = format!("{redirect}{separator}code=mock-auth-code&iss={base}");
    // `state` has to come back or the client will not match the response to
    // its own request.
    if let Some(value) = query.get("state") {
        location.push_str(&format!("&state={value}"));
    }

    HttpResponse::Found()
        .append_header(("location", location))
        .finish()
}

async fn token(state: web::Data<State>, body: web::Bytes) -> HttpResponse {
    state.record_call("POST", "/oauth/token");
    if let Some(failure) = super::injected_failure(&state, "oauth.token") {
        return failure;
    }

    let form: std::collections::HashMap<String, String> =
        serde_urlencoded::from_bytes(&body).unwrap_or_default();

    // Whichever account is first stands in for "the user who just consented",
    // since the mock has no consent screen to have chosen one.
    let Some(account) = state.lock().accounts.first().cloned() else {
        return xrpc_error(400, "invalid_grant", "no account");
    };

    let grant = form.get("grant_type").map(String::as_str).unwrap_or("");
    if !matches!(grant, "authorization_code" | "refresh_token") {
        return xrpc_error(
            400,
            "unsupported_grant_type",
            "only authorization_code and refresh_token are supported",
        );
    }

    HttpResponse::Ok().json(serde_json::json!({
        "access_token": account.access_jwt,
        "refresh_token": account.refresh_jwt,
        // DPoP, because that is what a real ATProto server issues — a client
        // that assumes Bearer would break against production.
        "token_type": "DPoP",
        "expires_in": 3600,
        "scope": "atproto transition:generic",
        "sub": account.did,
    }))
}

async fn revoke(state: web::Data<State>) -> HttpResponse {
    state.record_call("POST", "/oauth/revoke");
    if let Some(failure) = super::injected_failure(&state, "oauth.revoke") {
        return failure;
    }
    // Revocation answers 200 whether or not the token was known, so a client
    // logging out twice does not see an error.
    HttpResponse::Ok().finish()
}
