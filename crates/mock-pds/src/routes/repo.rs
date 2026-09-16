//! Repository writes and reads: `putRecord`, `createRecord`, `getRecord`,
//! `listRecords`, `deleteRecord`, `describeRepo`.
//!
//! Writes require a token belonging to the repo being written to, which is the
//! check worth keeping: it catches code that publishes to a repo with the
//! wrong session, and that is a bug a permissive mock would hide.
//!
//! Records are stored exactly as they arrive. No lexicon validation happens —
//! a real PDS with `validate: true` would reject an unknown field or a `null`
//! where the lexicon says optional-absent, and the mock does not, so a test
//! that cares about record shape has to assert on the stored value itself.

use super::{bearer, injected_failure, xrpc_error};
use crate::state::State;
use actix_web::{web, HttpRequest, HttpResponse};

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/xrpc/com.atproto.repo.putRecord",
        web::post().to(put_record),
    )
    .route(
        "/xrpc/com.atproto.repo.createRecord",
        web::post().to(create_record),
    )
    .route(
        "/xrpc/com.atproto.repo.deleteRecord",
        web::post().to(delete_record),
    )
    .route(
        "/xrpc/com.atproto.repo.getRecord",
        web::get().to(get_record),
    )
    .route(
        "/xrpc/com.atproto.repo.listRecords",
        web::get().to(list_records),
    )
    .route(
        "/xrpc/com.atproto.repo.describeRepo",
        web::get().to(describe_repo),
    );
}

#[derive(serde::Deserialize)]
struct Write {
    repo: Option<String>,
    collection: Option<String>,
    rkey: Option<String>,
    record: Option<serde_json::Value>,
}

/// Checks the caller may write to `repo`, returning the DID to write to.
fn writer(
    state: &State,
    request: &HttpRequest,
    repo: Option<&String>,
) -> Result<String, HttpResponse> {
    let Some(repo) = repo else {
        return Err(xrpc_error(400, "InvalidRequest", "repo is required"));
    };

    let Some(account) = bearer(request).and_then(|token| state.account_for_token(&token)) else {
        return Err(xrpc_error(401, "AuthenticationRequired", "Invalid token"));
    };

    // `repo` may be either spelling, so both are compared against the account
    // the token identified.
    if account.did != *repo && account.handle != *repo {
        return Err(xrpc_error(
            403,
            "Forbidden",
            "That token does not own this repository",
        ));
    }

    Ok(account.did)
}

async fn put_record(
    state: web::Data<State>,
    request: HttpRequest,
    body: web::Json<Write>,
) -> HttpResponse {
    state.record_call("POST", "/xrpc/com.atproto.repo.putRecord");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.putRecord") {
        return failure;
    }

    let did = match writer(&state, &request, body.repo.as_ref()) {
        Ok(did) => did,
        Err(response) => return response,
    };

    let (Some(collection), Some(rkey)) = (&body.collection, &body.rkey) else {
        return xrpc_error(400, "InvalidRequest", "collection and rkey are required");
    };
    let Some(record) = &body.record else {
        return xrpc_error(400, "InvalidRequest", "record is required");
    };

    state.put_record(&did, collection, rkey, record.clone());
    let (cid, _) = crate::car::encode_record(record);

    HttpResponse::Ok().json(serde_json::json!({
        "uri": format!("at://{did}/{collection}/{rkey}"),
        "cid": cid.to_string(),
    }))
}

/// Like `putRecord`, but the server picks the rkey.
async fn create_record(
    state: web::Data<State>,
    request: HttpRequest,
    body: web::Json<Write>,
) -> HttpResponse {
    state.record_call("POST", "/xrpc/com.atproto.repo.createRecord");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.createRecord") {
        return failure;
    }

    let did = match writer(&state, &request, body.repo.as_ref()) {
        Ok(did) => did,
        Err(response) => return response,
    };

    let Some(collection) = &body.collection else {
        return xrpc_error(400, "InvalidRequest", "collection is required");
    };
    let Some(record) = &body.record else {
        return xrpc_error(400, "InvalidRequest", "record is required");
    };

    let rkey = body
        .rkey
        .clone()
        .unwrap_or_else(|| crate::tid(state.lock().revision + 1));

    state.put_record(&did, collection, &rkey, record.clone());
    let (cid, _) = crate::car::encode_record(record);

    HttpResponse::Ok().json(serde_json::json!({
        "uri": format!("at://{did}/{collection}/{rkey}"),
        "cid": cid.to_string(),
    }))
}

async fn delete_record(
    state: web::Data<State>,
    request: HttpRequest,
    body: web::Json<Write>,
) -> HttpResponse {
    state.record_call("POST", "/xrpc/com.atproto.repo.deleteRecord");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.deleteRecord") {
        return failure;
    }

    let did = match writer(&state, &request, body.repo.as_ref()) {
        Ok(did) => did,
        Err(response) => return response,
    };

    let (Some(collection), Some(rkey)) = (&body.collection, &body.rkey) else {
        return xrpc_error(400, "InvalidRequest", "collection and rkey are required");
    };

    // Deleting something absent is not an error: a real PDS answers the same
    // whether or not the record was there, so a retry is safe.
    state.delete_record(&did, collection, rkey);
    HttpResponse::Ok().json(serde_json::json!({}))
}

#[derive(serde::Deserialize)]
struct RecordQuery {
    repo: Option<String>,
    collection: Option<String>,
    rkey: Option<String>,
}

async fn get_record(state: web::Data<State>, query: web::Query<RecordQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.repo.getRecord");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.getRecord") {
        return failure;
    }

    let (Some(repo), Some(collection), Some(rkey)) = (&query.repo, &query.collection, &query.rkey)
    else {
        return xrpc_error(
            400,
            "InvalidRequest",
            "repo, collection and rkey are required",
        );
    };

    let Some(account) = state.account(repo) else {
        return xrpc_error(400, "InvalidRequest", "Could not find repo");
    };

    match state.get_record(&account.did, collection, rkey) {
        Some(value) => {
            let (cid, _) = crate::car::encode_record(&value);
            HttpResponse::Ok().json(serde_json::json!({
                "uri": format!("at://{}/{collection}/{rkey}", account.did),
                "cid": cid.to_string(),
                "value": value,
            }))
        }
        None => xrpc_error(400, "RecordNotFound", "Could not locate record"),
    }
}

#[derive(serde::Deserialize)]
struct ListQuery {
    repo: Option<String>,
    collection: Option<String>,
    limit: Option<usize>,
    cursor: Option<String>,
}

/// Paginates by rkey, because that is what the cursor means here: a real PDS
/// returns the next page as everything after the last rkey seen.
async fn list_records(state: web::Data<State>, query: web::Query<ListQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.repo.listRecords");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.listRecords") {
        return failure;
    }

    let (Some(repo), Some(collection)) = (&query.repo, &query.collection) else {
        return xrpc_error(400, "InvalidRequest", "repo and collection are required");
    };

    let Some(account) = state.account(repo) else {
        return xrpc_error(400, "InvalidRequest", "Could not find repo");
    };

    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let all = state.records(&account.did, Some(collection));

    let start = match &query.cursor {
        Some(cursor) => all
            .iter()
            .position(|record| record.rkey.as_str() > cursor.as_str())
            .unwrap_or(all.len()),
        None => 0,
    };

    let page: Vec<_> = all
        .iter()
        .skip(start)
        .take(limit)
        .map(|record| {
            let (cid, _) = crate::car::encode_record(&record.value);
            serde_json::json!({
                "uri": format!("at://{}/{}/{}", account.did, record.collection, record.rkey),
                "cid": cid.to_string(),
                "value": record.value,
            })
        })
        .collect();

    // A cursor is only returned when there is more, so a caller looping until
    // it is absent terminates.
    let next = (start + page.len() < all.len()).then(|| all[start + page.len() - 1].rkey.clone());

    let mut response = serde_json::json!({ "records": page });
    if let Some(cursor) = next {
        response["cursor"] = serde_json::Value::String(cursor);
    }
    HttpResponse::Ok().json(response)
}

#[derive(serde::Deserialize)]
struct RepoQuery {
    repo: Option<String>,
}

async fn describe_repo(state: web::Data<State>, query: web::Query<RepoQuery>) -> HttpResponse {
    state.record_call("GET", "/xrpc/com.atproto.repo.describeRepo");
    if let Some(failure) = injected_failure(&state, "com.atproto.repo.describeRepo") {
        return failure;
    }

    let Some(repo) = &query.repo else {
        return xrpc_error(400, "InvalidRequest", "repo is required");
    };
    let Some(account) = state.account(repo) else {
        return xrpc_error(400, "InvalidRequest", "Could not find repo");
    };

    let mut collections: Vec<String> = state
        .records(&account.did, None)
        .iter()
        .map(|record| record.collection.clone())
        .collect();
    collections.dedup();

    let base_url = state.lock().base_url.clone();
    HttpResponse::Ok().json(serde_json::json!({
        "handle": account.handle,
        "did": account.did,
        "didDoc": super::identity::document_for(&account.did, &account.handle, &base_url),
        "collections": collections,
        "handleIsCorrect": true,
    }))
}
