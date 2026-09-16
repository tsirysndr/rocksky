//! `app.rocksky.apikey.*` — API keys for third-party scrobblers.
//!
//! All four of these are **stubs upstream**: `apps/api`'s handlers answer `{}`
//! and `{ apikeys: [] }` from helpers whose bodies are comments. The working
//! implementation is the REST surface (`GET/POST/PUT/DELETE /apikeys`), which
//! is what the settings page actually calls.
//!
//! So these do not port the XRPC handlers — there is nothing in them to port.
//! They call the same functions the REST routes do, in
//! [`crate::rest::keys`], so the two surfaces cannot drift.
//!
//! One consequence worth stating: `apps/api`'s `apikey/defs.json` declares no
//! defs at all, while four of its own documents reference
//! `app.rocksky.apikey.defs#apiKey`. Those refs are dangling — the codegen
//! reports them — so the output shape below is taken from what the REST route
//! returns rather than from the lexicon, which describes nothing.

use crate::auth::AuthDid;
use crate::db::schema::ApiKeys;
use crate::error::{XrpcError, XrpcResult};
use crate::rest::keys::{list_keys, mint_key, ApiKeyRow, ApiKeySecret, CreateApiKey};
use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::{xrpc_procedure, xrpc_query};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.apikey.getApikeys", get_apikeys);
    xrpc_procedure!(cfg, "app.rocksky.apikey.createApikey", create_apikey);
    xrpc_procedure!(cfg, "app.rocksky.apikey.updateApikey", update_apikey);
    xrpc_procedure!(cfg, "app.rocksky.apikey.removeApikey", remove_apikey);
}

const APIKEY_DEFAULT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Deserialize)]
pub struct ListParams {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeysOutput {
    /// `apiKeys`, as the lexicon's output schema names it — note the upstream
    /// stub answers `apikeys` (all lowercase), which does not match its own
    /// lexicon. The lexicon's spelling is used here.
    pub api_keys: Vec<ApiKeyRow>,
}

/// `app.rocksky.apikey.getApikeys`
async fn get_apikeys(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<ListParams>,
) -> XrpcResult<HttpResponse> {
    let api_keys = list_keys(
        state.db(),
        &auth.did,
        clamp_limit_or(params.limit, APIKEY_DEFAULT_LIMIT),
        clamp_offset(params.offset),
    )
    .await?;

    json(ApiKeysOutput { api_keys })
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInput {
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

/// `app.rocksky.apikey.createApikey`
///
/// Answers the key *and its shared secret*, which is the only time either is
/// readable — the listing shows them too, matching the REST route, but a
/// caller that loses this reply has to mint a new key.
async fn create_apikey(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateInput>,
) -> XrpcResult<HttpResponse> {
    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("name is required"))?
        .to_string();

    let created = mint_key(
        state.db(),
        &auth.did,
        &CreateApiKey {
            name,
            description: body.description.clone(),
            enabled: Some(true),
        },
    )
    .await?;

    json(created)
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateInput {
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

/// `app.rocksky.apikey.updateApikey`
///
/// Only the name, description and enabled flag can change. The key and its
/// secret cannot — `apps/api`'s REST route passes the request body to a raw
/// `set(data)`, which lets a caller rewrite either of them; that is a bug this
/// does not reproduce.
async fn update_apikey(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<UpdateInput>,
) -> XrpcResult<HttpResponse> {
    let id = body
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("id is required"))?;

    let db = state.db();
    let user_id = crate::rest::keys::owner_id(db, &auth.did).await?;

    // Scoped to the owner in the `WHERE`, so another account's key cannot be
    // renamed even with its id.
    let mut update = Query::update();
    update.table(ApiKeys::Table).value(
        ApiKeys::XataUpdatedat,
        crate::views::timestamp::to_iso8601(&chrono::Utc::now()),
    );

    // Only the fields the request carried. Notably *not* `api_key` or
    // `shared_secret`: `apps/api` passes the whole body to `set()`, which lets
    // a caller rewrite their own credentials through this endpoint.
    if let Some(name) = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        update.value(ApiKeys::Name, name);
    }
    if let Some(description) = &body.description {
        update.value(ApiKeys::Description, description.clone());
    }
    if let Some(enabled) = body.enabled {
        update.value(ApiKeys::Enabled, enabled);
    }

    update
        .and_where(Expr::col(ApiKeys::XataId).eq(id))
        .and_where(Expr::col(ApiKeys::UserId).eq(&user_id));

    if db.execute(&update).await? == 0 {
        return Err(XrpcError::forbidden("That API key is not yours to change"));
    }

    tracing::info!(did = %auth.did, id, "updated an API key");
    answer_key(state.db(), &user_id, id).await
}

#[derive(Debug, Clone, Deserialize)]
pub struct RemoveParams {
    #[serde(default)]
    pub id: Option<String>,
}

/// `app.rocksky.apikey.removeApikey`
///
/// Answers the key it removed, which is what the lexicon's output declares —
/// so the row is read before the delete.
async fn remove_apikey(
    state: web::Data<AppState>,
    auth: AuthDid,
    params: web::Query<RemoveParams>,
) -> XrpcResult<HttpResponse> {
    let id = params
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| XrpcError::invalid_request("id is required"))?;

    let db = state.db();
    let user_id = crate::rest::keys::owner_id(db, &auth.did).await?;

    let removed = read_key(db, &user_id, id).await?.ok_or_else(|| {
        // Not distinguished from "belongs to someone else": saying which would
        // confirm that another account's key exists.
        XrpcError::forbidden("That API key is not yours to remove")
    })?;

    let delete = Query::delete()
        .from_table(ApiKeys::Table)
        .and_where(Expr::col(ApiKeys::XataId).eq(id))
        // Scoped to the owner in the same statement, so another account's key
        // cannot be deleted even with its id.
        .and_where(Expr::col(ApiKeys::UserId).eq(&user_id))
        .to_owned();
    db.execute(&delete).await?;

    tracing::info!(did = %auth.did, id, "removed an API key");
    json(removed)
}

/// Reads one of an account's keys.
async fn read_key(
    db: &crate::db::Backend,
    user_id: &str,
    id: &str,
) -> XrpcResult<Option<ApiKeyRow>> {
    let mut query = Query::select();
    db.select_model(&mut query, crate::db::models::API_KEY_COLS, None);
    query
        .from(ApiKeys::Table)
        .and_where(Expr::col(ApiKeys::XataId).eq(id))
        .and_where(Expr::col(ApiKeys::UserId).eq(user_id))
        .limit(1);

    Ok(db.fetch_optional(&query).await?)
}

async fn answer_key(db: &crate::db::Backend, user_id: &str, id: &str) -> XrpcResult<HttpResponse> {
    match read_key(db, user_id, id).await? {
        Some(key) => json(key),
        // Just updated, so this should not happen; an empty object is a kinder
        // answer than a 500 for a UI that only needs to refresh.
        None => json(serde_json::json!({})),
    }
}

/// The secret-bearing reply, re-exported so the type is nameable from here.
pub type CreatedApiKey = ApiKeySecret;

#[cfg(test)]
mod tests {
    use super::*;

    /// The lexicon's output names the list `apiKeys`; the upstream stub
    /// answers `apikeys`. The lexicon wins, and this pins which.
    #[test]
    fn the_list_is_keyed_as_the_lexicon_declares() {
        let value = serde_json::to_value(ApiKeysOutput::default()).unwrap();
        assert!(value.get("apiKeys").is_some(), "{value}");
        assert!(
            value.get("apikeys").is_none(),
            "the upstream stub's spelling must not be used: {value}"
        );
    }

    #[test]
    fn an_update_needs_an_id() {
        // Deserialization allows it absent, and the handler rejects it — so a
        // missing id is a 400 rather than a panic.
        let input: UpdateInput = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(input.id.is_none());

        let input: UpdateInput = serde_json::from_value(serde_json::json!({ "id": "  " })).unwrap();
        assert_eq!(
            input
                .id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty()),
            None
        );
    }

    /// The fields an update may touch are exactly three. A caller must not be
    /// able to rewrite the key or its secret, which is what `apps/api`'s raw
    /// `set(data)` allows.
    #[test]
    fn an_update_cannot_rewrite_the_credentials() {
        let input: UpdateInput = serde_json::from_value(serde_json::json!({
            "id": "k1",
            "name": "renamed",
            "apiKey": "attacker-chosen",
            "sharedSecret": "attacker-chosen",
            "userId": "someone-else",
        }))
        .unwrap();

        // The extra fields are simply not part of the type, so they cannot
        // reach the statement.
        assert_eq!(input.id.as_deref(), Some("k1"));
        assert_eq!(input.name.as_deref(), Some("renamed"));
        assert!(input.description.is_none());
        assert!(input.enabled.is_none());
    }
}
