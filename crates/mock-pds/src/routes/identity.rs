//! Resolving who someone is: the PLC directory, handle resolution and the
//! profile the Bluesky appview serves.
//!
//! The DID document is the piece that makes the mock self-contained. Its
//! `#atproto_pds` service endpoint points back at the mock itself, so code
//! that resolves a DID to a PDS and then calls that PDS stays inside the test
//! — which is exactly the path worth exercising, and the one a hand-written
//! stub usually hard-codes around.

use super::{injected_failure, xrpc_error};
use crate::state::State;
use actix_web::{web, HttpResponse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/xrpc/com.atproto.identity.resolveHandle",
        web::get().to(resolve_handle),
    )
    .route(
        "/xrpc/app.bsky.actor.getProfile",
        web::get().to(get_profile),
    )
    .route("/.well-known/atproto-did", web::get().to(well_known_did))
    // Last, because `/{did}` would otherwise swallow the paths above.
    .route("/{did}", web::get().to(did_document));
}

/// `GET /{did}` — what `plc.directory` serves.
async fn did_document(state: web::Data<State>, did: web::Path<String>) -> HttpResponse {
    let did = did.into_inner();
    state.record_call("GET", &format!("/{did}"));

    if !did.starts_with("did:") {
        return xrpc_error(404, "NotFound", "not a DID");
    }

    // A document imported from a real repository is served verbatim, except
    // for its service endpoint — see `document_for`.
    if let Some(document) = state.lock().did_documents.get(&did).cloned() {
        return HttpResponse::Ok().json(document);
    }

    let Some(account) = state.account(&did) else {
        return xrpc_error(404, "NotFound", "DID not registered");
    };

    HttpResponse::Ok().json(document_for(
        &account.did,
        &account.handle,
        &state.lock().base_url,
    ))
}

/// The DID document for an account, pointing at this mock.
pub fn document_for(did: &str, handle: &str, base_url: &str) -> serde_json::Value {
    serde_json::json!({
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/multikey/v1",
            "https://w3id.org/security/suites/secp256k1-2019/v1",
        ],
        "id": did,
        // `alsoKnownAs` is where a handle is read back from, and backfill
        // depends on it: a repo with no appview entry still yields a handle.
        "alsoKnownAs": [format!("at://{handle}")],
        "verificationMethod": [{
            "id": format!("{did}#atproto"),
            "type": "Multikey",
            "controller": did,
            // A real key's shape, but not one the mock can sign with.
            "publicKeyMultibase": "zQ3shXbzZABktXGGYiLWYQkjuqmCLQmcBjLepHTGrYPCDjVrg",
        }],
        "service": [{
            "id": "#atproto_pds",
            "type": "AtprotoPersonalDataServer",
            "serviceEndpoint": base_url,
        }],
    })
}

#[derive(serde::Deserialize)]
struct HandleQuery {
    handle: Option<String>,
}

async fn resolve_handle(state: web::Data<State>, query: web::Query<HandleQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.identity.resolveHandle");
    if let Some(failure) = injected_failure(&state, "com.atproto.identity.resolveHandle") {
        return failure;
    }

    let Some(handle) = &query.handle else {
        return xrpc_error(400, "InvalidRequest", "handle is required");
    };

    match state.account(handle) {
        Some(account) => HttpResponse::Ok().json(serde_json::json!({ "did": account.did })),
        None => xrpc_error(400, "InvalidRequest", "Unable to resolve handle"),
    }
}

/// `GET /.well-known/atproto-did` — the DNS-free way to verify a handle.
async fn well_known_did(state: web::Data<State>) -> HttpResponse {
    state.record_call("GET", "/.well-known/atproto-did");

    match state.lock().accounts.first() {
        Some(account) => HttpResponse::Ok()
            .content_type("text/plain")
            .body(account.did.clone()),
        None => xrpc_error(404, "NotFound", "no account"),
    }
}

#[derive(serde::Deserialize)]
struct ActorQuery {
    actor: Option<String>,
}

async fn get_profile(state: web::Data<State>, query: web::Query<ActorQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/app.bsky.actor.getProfile");
    if let Some(failure) = injected_failure(&state, "app.bsky.actor.getProfile") {
        return failure;
    }

    let Some(actor) = &query.actor else {
        return xrpc_error(400, "InvalidRequest", "actor is required");
    };

    match state.account(actor) {
        Some(account) => HttpResponse::Ok().json(account.profile),
        None => xrpc_error(400, "InvalidRequest", "Profile not found"),
    }
}
