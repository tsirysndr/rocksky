//! `/apikeys` and `/access-tokens` — the two credential surfaces.
//!
//! Both are REST-only. `app.rocksky.apikey.createApikey` exists as a lexicon
//! method but its handler in `apps/api` is a stub that answers `{}` and writes
//! nothing, so `POST /apikeys` is the only way to mint a key. Access tokens
//! have no lexicon method at all.
//!
//! The difference between them:
//!
//! |              | `/apikeys`                            | `/access-tokens`                   |
//! |--------------|---------------------------------------|------------------------------------|
//! | credential   | an id and a shared secret             | a long-lived JWT                   |
//! | used by      | scrobbler clients (Last.fm-style)     | the CLI and the API directly       |
//! | readable     | yes, listed in full on every GET      | no, shown once at creation         |
//! | revocation   | delete the row, or `enabled = false`  | delete the row — the `jti` is checked |
//!
//! That asymmetry is deliberate: an API key is a credential pair the client
//! must keep and re-present, so it stays readable; an access token is a bearer
//! token, so only its last four characters are ever shown again.

use crate::auth::AuthDid;
use crate::crypto;
use crate::db::{models, new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::state::AppState;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/apikeys", web::get().to(list_api_keys))
        .route("/apikeys", web::post().to(create_api_key))
        .route("/apikeys/{id}", web::put().to(update_api_key))
        .route("/apikeys/{id}", web::delete().to(delete_api_key))
        .route("/access-tokens", web::get().to(list_access_tokens))
        .route("/access-tokens", web::post().to(create_access_token))
        .route("/access-tokens/{id}", web::delete().to(delete_access_token));
}

/// Resolves the caller's `users` row id, or 401.
///
/// A valid token for an account this instance has never indexed is still not
/// authorized to own credentials here, which is why this is a lookup rather
/// than trusting the DID in the token.
async fn caller_id(db: &Backend, did: &str) -> XrpcResult<String> {
    let mut sql = db.sql("SELECT xata_id FROM users WHERE did = ");
    sql.bind(did).push(" LIMIT 1");
    db.fetch_scalar::<String>(&sql)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

// ------------------------------------------------------------------ apikeys

#[derive(Debug, Clone, Deserialize)]
pub struct Paging {
    #[serde(default)]
    pub size: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

impl Paging {
    fn size(&self, default: i64) -> i64 {
        self.size.filter(|v| *v > 0).unwrap_or(default).min(200)
    }

    fn offset(&self) -> i64 {
        self.offset.filter(|v| *v > 0).unwrap_or(0)
    }
}

/// An API key as `GET /apikeys` lists it: the whole row except `userId`.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyRow {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub shared_secret: String,
    pub description: Option<String>,
    pub enabled: bool,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: DateTime<Utc>,
}

/// `POST /apikeys` and `PUT /apikeys/{id}` answer this snake_cased shape,
/// unlike the camelCase used when listing. Faithful to `apps/api`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeySecret {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub api_key: String,
    pub shared_secret: String,
}

async fn list_api_keys(
    state: web::Data<AppState>,
    auth: AuthDid,
    paging: web::Query<Paging>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(
        models::API_KEY_COLS,
        db.dialect(),
        None,
    ))
    .push(" FROM api_keys WHERE user_id = ")
    .bind(&user_id)
    .push(" ORDER BY xata_createdat DESC LIMIT ")
    .bind(paging.size(20))
    .push(" OFFSET ")
    .bind(paging.offset());

    let keys: Vec<ApiKeyRow> = db.fetch_all(&sql).await?;
    Ok(HttpResponse::Ok().json(keys))
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateApiKey {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

async fn create_api_key(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateApiKey>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let name = body.name.trim();
    if name.is_empty() {
        return Err(XrpcError::invalid_request("Missing required field: name"));
    }

    // 16 random bytes as hex each, matching `crypto.randomBytes(16)`.
    let api_key = random_hex(16);
    let shared_secret = random_hex(16);
    let id = new_id();

    let mut sql = db.sql(
        "INSERT INTO api_keys \
         (xata_id, name, description, enabled, api_key, shared_secret, user_id) VALUES (",
    );
    sql.bind(&id)
        .push(", ")
        .bind(name)
        // The TypeScript coerces a missing description to "", not NULL.
        .push(", ")
        .bind(body.description.clone().unwrap_or_default())
        .push(", ")
        .bind(body.enabled.unwrap_or(true))
        .push(", ")
        .bind(&api_key)
        .push(", ")
        .bind(&shared_secret)
        .push(", ")
        .bind(&user_id)
        .push(")");
    db.execute(&sql).await?;

    tracing::info!(did = %auth.did, name, "minted an API key");

    Ok(HttpResponse::Ok().json(ApiKeySecret {
        id,
        name: name.to_string(),
        description: Some(body.description.clone().unwrap_or_default()),
        api_key,
        shared_secret,
    }))
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateApiKey {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

async fn update_api_key(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
    body: web::Json<UpdateApiKey>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let id = path.into_inner();

    // Only the three editable fields, rather than whatever the caller sent:
    // `apps/api` passes the request body straight into `set(data)`, which
    // would let a caller rewrite `api_key`, `user_id` or the timestamps.
    let mut assignments: Vec<(&str, crate::db::query::Arg)> = Vec::new();
    if let Some(name) = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        assignments.push(("name", name.into()));
    }
    if let Some(description) = body.description.clone() {
        assignments.push(("description", description.into()));
    }
    if let Some(enabled) = body.enabled {
        assignments.push(("enabled", enabled.into()));
    }

    if !assignments.is_empty() {
        let mut sql = db.sql("UPDATE api_keys SET ");
        for (index, (column, value)) in assignments.into_iter().enumerate() {
            if index > 0 {
                sql.push(", ");
            }
            sql.push(format!("{column} = ")).bind(value);
        }
        sql.push(", xata_updatedat = ")
            .bind(crate::db::now_timestamp())
            .push(" WHERE xata_id = ")
            .bind(&id)
            .push(" AND user_id = ")
            .bind(&user_id);
        db.execute(&sql).await?;
    }

    // Read back so the response reflects the row, and so a key belonging to
    // someone else is a 404 rather than a silent no-op.
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(
        models::API_KEY_COLS,
        db.dialect(),
        None,
    ))
    .push(" FROM api_keys WHERE xata_id = ")
    .bind(&id)
    .push(" AND user_id = ")
    .bind(&user_id)
    .push(" LIMIT 1");

    let key: Option<ApiKeyRow> = db.fetch_optional(&sql).await?;
    let key = key.ok_or_else(|| XrpcError::not_found("API key not found"))?;

    Ok(HttpResponse::Ok().json(ApiKeySecret {
        id: key.id,
        name: key.name,
        description: key.description,
        api_key: key.api_key,
        shared_secret: key.shared_secret,
    }))
}

async fn delete_api_key(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let id = path.into_inner();

    // Scoped to the caller, so one user cannot delete another's key.
    let mut sql = db.sql("DELETE FROM api_keys WHERE xata_id = ");
    sql.bind(&id).push(" AND user_id = ").bind(&user_id);

    if db.execute(&sql).await? == 0 {
        return Err(XrpcError::not_found("API key not found"));
    }
    tracing::info!(did = %auth.did, id = %id, "deleted an API key");
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    hex::encode(buffer)
}

// ------------------------------------------------------------ access tokens

/// An access token's metadata. Never includes the token.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AccessTokenRow {
    pub id: String,
    pub name: String,
    pub last_four: String,
    #[serde(with = "crate::views::timestamp::optional")]
    pub last_used_at: Option<DateTime<Utc>>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: DateTime<Utc>,
}

async fn list_access_tokens(
    state: web::Data<AppState>,
    auth: AuthDid,
    paging: web::Query<Paging>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(
        models::ACCESS_TOKEN_COLS,
        db.dialect(),
        None,
    ))
    .push(" FROM access_tokens WHERE user_id = ")
    .bind(&user_id)
    .push(" ORDER BY xata_createdat DESC LIMIT ")
    .bind(paging.size(50))
    .push(" OFFSET ")
    .bind(paging.offset());

    let tokens: Vec<AccessTokenRow> = db.fetch_all(&sql).await?;
    Ok(HttpResponse::Ok().json(tokens))
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateAccessToken {
    pub name: String,
}

/// The creation response: the metadata plus the token, the only time it is
/// ever returned.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedAccessToken {
    #[serde(flatten)]
    pub row: AccessTokenRow,
    pub token: String,
}

async fn create_access_token(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateAccessToken>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(XrpcError::invalid_request(
            "name is required and must be at most 120 characters",
        ));
    }

    // The `jti` is what makes the token revocable: `verify_token` looks it up
    // on every request, so deleting the row kills the token.
    let jti = uuid::Uuid::new_v4().to_string();
    let token = crate::auth::jwt::mint_access_token(&state.config().jwt_secret, &auth.did, &jti)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    let key = state.storage_encryption_key();
    let token_encrypted = crypto::encrypt_credential(key, &token)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    // `token.slice(-4)` in the TypeScript.
    let last_four: String = {
        let chars: Vec<char> = token.chars().collect();
        chars[chars.len().saturating_sub(4)..].iter().collect()
    };

    let id = new_id();
    let mut sql = db.sql(
        "INSERT INTO access_tokens \
         (xata_id, user_id, name, jti, token_encrypted, last_four) VALUES (",
    );
    sql.bind(&id)
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(name)
        .push(", ")
        .bind(&jti)
        .push(", ")
        .bind(&token_encrypted)
        .push(", ")
        .bind(&last_four)
        .push(")");
    db.execute(&sql).await?;

    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(
        models::ACCESS_TOKEN_COLS,
        db.dialect(),
        None,
    ))
    .push(" FROM access_tokens WHERE xata_id = ")
    .bind(&id)
    .push(" LIMIT 1");
    let row: AccessTokenRow = db
        .fetch_optional(&sql)
        .await?
        .ok_or_else(|| XrpcError::internal(anyhow::anyhow!("the token row vanished")))?;

    tracing::info!(did = %auth.did, name, "issued an access token");

    Ok(HttpResponse::Ok().json(CreatedAccessToken { row, token }))
}

async fn delete_access_token(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let id = path.into_inner();

    let mut sql = db.sql("DELETE FROM access_tokens WHERE xata_id = ");
    sql.bind(&id).push(" AND user_id = ").bind(&user_id);

    if db.execute(&sql).await? == 0 {
        return Err(XrpcError::not_found("Not found"));
    }
    // The token itself is stateless, but `verify_token` checks the `jti`
    // against this table, so removing the row revokes it immediately.
    tracing::info!(did = %auth.did, id = %id, "revoked an access token");
    Ok(HttpResponse::Ok().json(serde_json::json!({ "success": true })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::jwt::verify_token;
    use actix_web::{test, App};

    macro_rules! app {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    /// A state with one indexed account, and a token for it.
    async fn signed_in() -> (AppState, String) {
        let state = AppState::for_test().await.unwrap();
        crate::ingest::upsert_user(state.db(), "did:plc:alice")
            .await
            .unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        (state, token)
    }

    #[actix_web::test]
    async fn both_surfaces_require_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for (method, uri) in [
            ("GET", "/apikeys"),
            ("POST", "/apikeys"),
            ("GET", "/access-tokens"),
            ("POST", "/access-tokens"),
        ] {
            let request = match method {
                "GET" => test::TestRequest::get().uri(uri),
                _ => test::TestRequest::post()
                    .uri(uri)
                    .set_json(serde_json::json!({ "name": "x" })),
            };
            let res = test::call_service(&app, request.to_request()).await;
            assert_eq!(res.status(), 401, "{method} {uri}");
        }
    }

    /// A token for an account this instance has never seen is not authorized
    /// to own credentials here.
    #[actix_web::test]
    async fn an_unindexed_account_is_unauthorized() {
        let state = AppState::for_test().await.unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:stranger").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/apikeys")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn an_api_key_is_minted_and_then_listed() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        let auth = ("authorization", format!("Bearer {token}"));

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/apikeys")
                .insert_header(auth.clone())
                .set_json(serde_json::json!({ "name": "my scrobbler" }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let created: serde_json::Value = test::read_body_json(res).await;
        // The creation response is snake_cased, unlike the listing.
        assert_eq!(created["name"], "my scrobbler");
        let api_key = created["api_key"].as_str().expect("api_key").to_string();
        let secret = created["shared_secret"].as_str().expect("shared_secret");
        assert_eq!(api_key.len(), 32, "16 random bytes as hex");
        assert_eq!(secret.len(), 32);
        assert_ne!(api_key, secret, "the key and secret must differ");

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/apikeys")
                .insert_header(auth)
                .to_request(),
        )
        .await;
        let listed: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(listed[0]["name"], "my scrobbler");
        assert_eq!(listed[0]["apiKey"], api_key, "camelCase when listing");
        assert_eq!(listed[0]["enabled"], true);
        // The owner is never disclosed.
        assert!(listed[0].get("userId").is_none(), "{listed}");
    }

    #[actix_web::test]
    async fn an_api_key_needs_a_name() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        for body in [
            serde_json::json!({ "name": "" }),
            serde_json::json!({ "name": "   " }),
        ] {
            let res = test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/apikeys")
                    .insert_header(("authorization", format!("Bearer {token}")))
                    .set_json(body)
                    .to_request(),
            )
            .await;
            assert_eq!(res.status(), 400);
        }
    }

    #[actix_web::test]
    async fn updating_a_key_cannot_rewrite_its_secret() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        let auth = ("authorization", format!("Bearer {token}"));

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/apikeys")
                .insert_header(auth.clone())
                .set_json(serde_json::json!({ "name": "first" }))
                .to_request(),
        )
        .await;
        let created: serde_json::Value = test::read_body_json(res).await;
        let id = created["id"].as_str().unwrap().to_string();
        let original_key = created["api_key"].as_str().unwrap().to_string();

        // `apps/api` passes the request body straight into `set(data)`, so
        // this would overwrite the credential and the owner.
        let res = test::call_service(
            &app,
            test::TestRequest::put()
                .uri(&format!("/apikeys/{id}"))
                .insert_header(auth)
                .set_json(serde_json::json!({
                    "name": "renamed",
                    "enabled": false,
                    "api_key": "attacker-chosen",
                    "user_id": "rec_someone_else",
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let updated: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(updated["name"], "renamed");
        assert_eq!(
            updated["api_key"], original_key,
            "the credential must not be settable by the client"
        );
    }

    #[actix_web::test]
    async fn one_user_cannot_touch_another_users_key() {
        let (state, token) = signed_in().await;
        crate::ingest::upsert_user(state.db(), "did:plc:bob")
            .await
            .unwrap();
        let bob = crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/apikeys")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "name": "alice's" }))
                .to_request(),
        )
        .await;
        let created: serde_json::Value = test::read_body_json(res).await;
        let id = created["id"].as_str().unwrap().to_string();

        for request in [
            test::TestRequest::delete()
                .uri(&format!("/apikeys/{id}"))
                .insert_header(("authorization", format!("Bearer {bob}")))
                .to_request(),
            test::TestRequest::put()
                .uri(&format!("/apikeys/{id}"))
                .insert_header(("authorization", format!("Bearer {bob}")))
                .set_json(serde_json::json!({ "name": "stolen" }))
                .to_request(),
        ] {
            let res = test::call_service(&app, request).await;
            assert_eq!(res.status(), 404, "another user's key must not be visible");
        }
    }

    #[actix_web::test]
    async fn an_access_token_is_returned_once_and_then_only_as_four_digits() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        let auth = ("authorization", format!("Bearer {token}"));

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/access-tokens")
                .insert_header(auth.clone())
                .set_json(serde_json::json!({ "name": "cli" }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let created: serde_json::Value = test::read_body_json(res).await;
        let issued = created["token"]
            .as_str()
            .expect("the token, once")
            .to_string();
        assert_eq!(created["name"], "cli");
        assert_eq!(
            created["lastFour"],
            issued[issued.len() - 4..],
            "lastFour must be the token's own last four characters"
        );

        // The issued token authenticates, and carries the revocable claims.
        let claims = verify_token(state.db(), &state.config().jwt_secret, &issued)
            .await
            .expect("the issued token must verify");
        assert!(claims.is_access_token());
        assert!(claims.jti.is_some(), "without a jti it cannot be revoked");
        assert_eq!(claims.did.as_deref(), Some("did:plc:alice"));

        // Listing never returns the token again.
        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/access-tokens")
                .insert_header(auth)
                .to_request(),
        )
        .await;
        let listed: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(listed[0]["name"], "cli");
        assert!(listed[0].get("token").is_none(), "{listed}");
        assert!(listed[0].get("tokenEncrypted").is_none(), "{listed}");
        assert!(listed[0]["lastUsedAt"].is_null());
    }

    #[actix_web::test]
    async fn deleting_an_access_token_revokes_it() {
        let (state, token) = signed_in().await;
        let app = app!(state);
        let auth = ("authorization", format!("Bearer {token}"));

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/access-tokens")
                .insert_header(auth.clone())
                .set_json(serde_json::json!({ "name": "cli" }))
                .to_request(),
        )
        .await;
        let created: serde_json::Value = test::read_body_json(res).await;
        let id = created["id"].as_str().unwrap().to_string();
        let issued = created["token"].as_str().unwrap().to_string();

        // Valid before...
        assert!(
            verify_token(state.db(), &state.config().jwt_secret, &issued)
                .await
                .is_ok()
        );

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri(&format!("/access-tokens/{id}"))
                .insert_header(auth)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        // ...and rejected after, because the jti no longer has a row.
        let err = verify_token(state.db(), &state.config().jwt_secret, &issued)
            .await
            .expect_err("a deleted token must stop working");
        assert_eq!(err.to_string(), "Access token revoked");
    }

    #[actix_web::test]
    async fn the_stored_token_can_be_decrypted_with_the_instance_key() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/access-tokens")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({ "name": "cli" }))
                .to_request(),
        )
        .await;
        let created: serde_json::Value = test::read_body_json(res).await;
        let issued = created["token"].as_str().unwrap().to_string();

        let db = state.db();
        let stored: Option<String> = db
            .fetch_scalar(&db.sql("SELECT token_encrypted FROM access_tokens"))
            .await
            .unwrap();
        let stored = stored.expect("the encrypted copy is NOT NULL");
        assert_ne!(stored, issued, "it must not be stored in the clear");

        assert_eq!(
            crypto::decrypt_credential(state.storage_encryption_key(), &stored).unwrap(),
            issued
        );
    }

    #[actix_web::test]
    async fn an_access_token_name_is_bounded() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        for name in [String::new(), "x".repeat(121)] {
            let res = test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/access-tokens")
                    .insert_header(("authorization", format!("Bearer {token}")))
                    .set_json(serde_json::json!({ "name": name }))
                    .to_request(),
            )
            .await;
            assert_eq!(res.status(), 400, "{}", name.len());
        }
    }

    // `use actix_web::test` shadows the built-in `#[test]` attribute.
    #[actix_web::test]
    async fn random_credentials_are_hex_and_unique() {
        let first = random_hex(16);
        assert_eq!(first.len(), 32);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, random_hex(16));
    }
}
