//! `com.atproto.sync.getRepo` — the whole repository as a CAR archive.
//!
//! This is the endpoint the mock exists for. Backfill downloads a CAR, parses
//! its frames, reads the commit, walks the MST for record keys and projects
//! the records; every one of those steps can be wrong in a way that a mock
//! returning JSON would never reveal. So the archive is assembled for real,
//! from the records currently in the repository, with a real tree over them.
//!
//! The commit's `rev` moves with the store's revision counter, so a test that
//! writes and re-syncs gets a different commit rather than a cached-looking
//! identical one.

use super::{injected_failure, xrpc_error};
use crate::state::State;
use actix_web::{web, HttpResponse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/xrpc/com.atproto.sync.getRepo", web::get().to(get_repo))
        .route(
            "/xrpc/com.atproto.sync.getLatestCommit",
            web::get().to(get_latest_commit),
        );
}

#[derive(serde::Deserialize)]
struct RepoQuery {
    did: Option<String>,
}

async fn get_repo(state: web::Data<State>, query: web::Query<RepoQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.sync.getRepo");
    if let Some(failure) = injected_failure(&state, "com.atproto.sync.getRepo") {
        return failure;
    }

    let Some(did) = &query.did else {
        return xrpc_error(400, "InvalidRequest", "did is required");
    };
    let Some(account) = state.account(did) else {
        return xrpc_error(400, "RepoNotFound", "Could not find repo");
    };

    let records = state.records(&account.did, None);
    let revision = state.lock().revision;

    let mut blocks = Vec::with_capacity(records.len() + 8);
    let mut leaves = Vec::with_capacity(records.len());

    for record in &records {
        let (cid, bytes) = crate::car::encode_record(&record.value);
        leaves.push(crate::mst::Leaf {
            key: format!("{}/{}", record.collection, record.rkey),
            cid,
        });
        blocks.push(crate::car::Block { cid, bytes });
    }

    // The tree, then the commit that roots it.
    let (root, nodes) = crate::mst::build(leaves);
    for node in nodes {
        blocks.push(crate::car::Block {
            cid: node.cid,
            bytes: node.bytes,
        });
    }

    let commit = crate::car::commit_block(&account.did, &crate::tid(revision), root);
    let commit_cid = commit.cid;
    blocks.push(commit);

    let archive = crate::car::write(commit_cid, &blocks);

    HttpResponse::Ok()
        .content_type("application/vnd.ipld.car")
        .body(archive)
}

async fn get_latest_commit(state: web::Data<State>, query: web::Query<RepoQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.sync.getLatestCommit");
    if let Some(failure) = injected_failure(&state, "com.atproto.sync.getLatestCommit") {
        return failure;
    }

    let Some(did) = &query.did else {
        return xrpc_error(400, "InvalidRequest", "did is required");
    };
    let Some(account) = state.account(did) else {
        return xrpc_error(400, "RepoNotFound", "Could not find repo");
    };

    // Rebuilt rather than remembered, so the CID always matches what
    // `getRepo` would return right now.
    let leaves: Vec<crate::mst::Leaf> = state
        .records(&account.did, None)
        .iter()
        .map(|record| crate::mst::Leaf {
            key: format!("{}/{}", record.collection, record.rkey),
            cid: crate::car::encode_record(&record.value).0,
        })
        .collect();

    let revision = state.lock().revision;
    let (root, _) = crate::mst::build(leaves);
    let commit = crate::car::commit_block(&account.did, &crate::tid(revision), root);

    HttpResponse::Ok().json(serde_json::json!({
        "cid": commit.cid.to_string(),
        "rev": crate::tid(revision),
    }))
}
