//! `/storage/providers` — bring-your-own S3 buckets.
//!
//! A user can attach their own bucket and have their uploads stored there
//! instead of the instance's. The credentials are validated against the live
//! bucket *before* anything is written, because a provider that cannot be
//! reached is worse than no provider: uploads would be accepted and then fail
//! to play.
//!
//! Request and response bodies are snake_case here, unlike the rest of the API
//! — that is the existing contract with the UI.

use crate::auth::AuthDid;
use crate::crypto;
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::state::AppState;
use crate::storage::{self, providers};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/storage/providers", web::post().to(create))
        .route("/storage/providers", web::get().to(list))
        .route("/storage/providers/{id}", web::delete().to(remove));
}

async fn caller_id(db: &Backend, did: &str) -> XrpcResult<String> {
    let mut sql = db.sql("SELECT xata_id FROM users WHERE did = ");
    sql.bind(did).push(" LIMIT 1");
    db.fetch_scalar::<String>(&sql)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProvider {
    pub label: String,
    pub endpoint: String,
    #[serde(default)]
    pub region: Option<String>,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    #[serde(default)]
    pub public_url: Option<String>,
}

/// A provider as the API reports it. Never includes the credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderView {
    pub id: String,
    pub label: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub public_url: Option<String>,
    #[serde(with = "crate::views::timestamp::optional")]
    pub verified_at: Option<DateTime<Utc>>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: DateTime<Utc>,
}

impl From<&providers::StorageProvider> for ProviderView {
    fn from(provider: &providers::StorageProvider) -> Self {
        Self {
            id: provider.id.clone(),
            label: provider.label.clone(),
            endpoint: provider.endpoint.clone(),
            region: provider.region.clone(),
            bucket: provider.bucket.clone(),
            public_url: provider.public_url.clone(),
            verified_at: provider.verified_at,
            created_at: provider.created_at,
        }
    }
}

/// `POST /storage/providers`
///
/// Answers 201 with the provider, or 422 `CONNECTIVITY_FAILED` when the bucket
/// could not be reached with those credentials.
async fn create(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateProvider>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let label = body.label.trim();
    let endpoint = body.endpoint.trim();
    let bucket = body.bucket.trim();
    let access_key = body.access_key.trim();
    let secret_key = body.secret_key.trim();

    if label.is_empty()
        || endpoint.is_empty()
        || bucket.is_empty()
        || access_key.is_empty()
        || secret_key.is_empty()
    {
        return Err(XrpcError::invalid_request(
            "Missing required fields: label, endpoint, bucket, access_key, secret_key",
        ));
    }

    let region = body
        .region
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .unwrap_or("auto");

    // Reached before anything is written: a provider that does not work is
    // worse than none, because uploads would be accepted and then be
    // unplayable.
    let target = storage::StorageTarget {
        bucket: match storage_bucket(endpoint, region, bucket, access_key, secret_key) {
            Ok(bucket) => bucket,
            Err(err) => return Err(connectivity_failed(&err)),
        },
        provider_id: None,
        public_url: None,
    };
    if let Err(err) = storage::probe(&target).await {
        tracing::info!(
            did = %auth.did,
            endpoint,
            bucket,
            error = %err,
            "a storage provider failed its connectivity check"
        );
        return Err(connectivity_failed(&err));
    }

    let key = state.storage_encryption_key();
    let encrypt = |value: &str| {
        crypto::encrypt_credential(key, value)
            .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))
    };
    let encrypted_access = encrypt(access_key)?;
    let encrypted_secret = encrypt(secret_key)?;

    let id = new_id();
    let verified_at = crate::db::now_timestamp();

    let mut sql = db.sql(
        "INSERT INTO user_storage_providers \
         (xata_id, user_id, label, endpoint, region, bucket, access_key, secret_key, \
          public_url, verified_at) VALUES (",
    );
    sql.bind(&id)
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(label)
        .push(", ")
        .bind(endpoint)
        .push(", ")
        .bind(region)
        .push(", ")
        .bind(bucket)
        .push(", ")
        .bind(&encrypted_access)
        .push(", ")
        .bind(&encrypted_secret)
        .push(", ")
        .bind(body.public_url.clone())
        .push(", ")
        .bind(&verified_at)
        .push(")");
    db.execute(&sql).await?;

    let provider = providers::find(db, &user_id, &id)
        .await?
        .ok_or_else(|| XrpcError::internal(anyhow::anyhow!("the provider row vanished")))?;

    tracing::info!(did = %auth.did, label, bucket, "added a storage provider");

    Ok(HttpResponse::Created().json(ProviderView::from(&provider)))
}

fn storage_bucket(
    endpoint: &str,
    region: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
) -> Result<Box<s3::Bucket>, s3::error::S3Error> {
    let region = s3::region::Region::Custom {
        region: region.to_string(),
        endpoint: endpoint.to_string(),
    };
    let credentials =
        s3::creds::Credentials::new(Some(access_key), Some(secret_key), None, None, None)?;
    Ok(s3::Bucket::new(bucket, region, credentials)?.with_path_style())
}

/// The 422 the UI shows verbatim when a bucket cannot be reached.
fn connectivity_failed(err: &s3::error::S3Error) -> XrpcError {
    XrpcError::with_message(
        crate::error::ResponseType::UnprocessableEntity,
        storage::describe_failure(err),
    )
    .named("CONNECTIVITY_FAILED")
}

/// `GET /storage/providers`
async fn list(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let providers = providers::list(db, &user_id).await?;
    Ok(HttpResponse::Ok().json(providers.iter().map(ProviderView::from).collect::<Vec<_>>()))
}

/// `DELETE /storage/providers/{id}`
///
/// Refuses with 409 while uploads still point at the provider: removing it
/// would leave rows naming a bucket whose credentials are gone, with no way to
/// recover the audio.
async fn remove(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let id = path.into_inner();

    if providers::find(db, &user_id, &id).await?.is_none() {
        return Err(XrpcError::not_found("Not found"));
    }

    if providers::is_in_use(db, &id).await? {
        return Err(XrpcError::with_message(
            crate::error::ResponseType::Conflict,
            "Cannot delete a storage provider that has uploads referencing it",
        )
        .named("PROVIDER_IN_USE"));
    }

    providers::delete(db, &user_id, &id).await?;
    tracing::info!(did = %auth.did, id = %id, "removed a storage provider");

    Ok(HttpResponse::NoContent().finish())
}

#[cfg(test)]
mod tests {
    use super::*;
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

    async fn signed_in() -> (AppState, String) {
        let state = AppState::for_test().await.unwrap();
        crate::ingest::upsert_user(state.db(), "did:plc:alice")
            .await
            .unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();
        (state, token)
    }

    /// Inserts a provider directly, skipping the connectivity check.
    async fn insert_provider(state: &AppState, id: &str, user_id: &str) {
        let db = state.db();
        let mut sql = db.sql(
            "INSERT INTO user_storage_providers \
             (xata_id, user_id, label, endpoint, region, bucket, access_key, secret_key, \
              verified_at) VALUES (",
        );
        sql.bind(id)
            .push(", ")
            .bind(user_id)
            .push(", ")
            .bind("My R2")
            .push(", ")
            .bind("https://example.r2.cloudflarestorage.com")
            .push(", ")
            .bind("auto")
            .push(", ")
            .bind("my-music")
            .push(", ")
            .bind(crypto::encrypt_credential(state.storage_encryption_key(), "ak").unwrap())
            .push(", ")
            .bind(crypto::encrypt_credential(state.storage_encryption_key(), "sk").unwrap())
            .push(", ")
            .bind(crate::db::now_timestamp())
            .push(")");
        db.execute(&sql).await.unwrap();
    }

    async fn user_id(state: &AppState) -> String {
        let db = state.db();
        db.fetch_scalar::<String>(&db.sql("SELECT xata_id FROM users LIMIT 1"))
            .await
            .unwrap()
            .unwrap()
    }

    #[actix_web::test]
    async fn every_route_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for request in [
            test::TestRequest::get()
                .uri("/storage/providers")
                .to_request(),
            test::TestRequest::post()
                .uri("/storage/providers")
                .set_json(serde_json::json!({}))
                .to_request(),
            test::TestRequest::delete()
                .uri("/storage/providers/rec_x")
                .to_request(),
        ] {
            let res = test::call_service(&app, request).await;
            assert_eq!(res.status(), 401);
        }
    }

    #[actix_web::test]
    async fn the_required_fields_are_checked_before_any_network_call() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/storage/providers")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({
                    "label": "My R2",
                    "endpoint": "",
                    "bucket": "b",
                    "access_key": "k",
                    "secret_key": "s",
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert!(
            body["message"].as_str().unwrap().contains("endpoint"),
            "{body}"
        );
    }

    /// An unreachable bucket must be rejected rather than stored: an accepted
    /// provider that does not work means uploads that cannot be played.
    #[actix_web::test]
    async fn an_unreachable_bucket_is_rejected_and_nothing_is_stored() {
        let (state, token) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/storage/providers")
                .insert_header(("authorization", format!("Bearer {token}")))
                .set_json(serde_json::json!({
                    "label": "Nowhere",
                    // Port 1 refuses connections.
                    "endpoint": "http://127.0.0.1:1",
                    "bucket": "b",
                    "access_key": "k",
                    "secret_key": "s",
                }))
                .to_request(),
        )
        .await;

        assert_eq!(res.status(), 422, "apps/api answers 422 here");
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "CONNECTIVITY_FAILED");
        assert!(!body["message"].as_str().unwrap().is_empty());

        let db = state.db();
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM user_storage_providers"))
                .await
                .unwrap(),
            0,
            "a failed check must not leave a row behind"
        );
    }

    #[actix_web::test]
    async fn providers_are_listed_without_their_credentials() {
        let (state, token) = signed_in().await;
        let id = user_id(&state).await;
        insert_provider(&state, "rec_provider", &id).await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/storage/providers")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body[0]["label"], "My R2");
        assert_eq!(body[0]["bucket"], "my-music");
        assert_eq!(body[0]["region"], "auto");
        assert!(body[0]["verifiedAt"].is_string() || body[0]["verified_at"].is_string());

        // The credentials must never be listed, encrypted or not.
        let serialized = body.to_string();
        assert!(!serialized.contains("access_key"), "{serialized}");
        assert!(!serialized.contains("accessKey"), "{serialized}");
        assert!(!serialized.contains("secretKey"), "{serialized}");
    }

    #[actix_web::test]
    async fn a_provider_is_deleted_and_then_gone() {
        let (state, token) = signed_in().await;
        let id = user_id(&state).await;
        insert_provider(&state, "rec_provider", &id).await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/storage/providers/rec_provider")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 204);

        // And again is a 404, not a second success.
        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/storage/providers/rec_provider")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404);
    }

    #[actix_web::test]
    async fn a_provider_with_uploads_cannot_be_deleted() {
        let (state, token) = signed_in().await;
        let id = user_id(&state).await;
        insert_provider(&state, "rec_provider", &id).await;

        let db = state.db();
        let mut sql = db.sql(
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES (",
        );
        sql.bind("rec_track")
            .push(", ")
            .bind("T")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("A")
            .push(", ")
            .bind("B")
            .push(", ")
            .bind(1i64)
            .push(", ")
            .bind("sha")
            .push(")");
        db.execute(&sql).await.unwrap();

        let mut sql = db.sql(
            "INSERT INTO user_uploads \
             (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename, \
              storage_provider_id) VALUES (",
        );
        sql.bind("rec_upload")
            .push(", ")
            .bind(&id)
            .push(", ")
            .bind("rec_track")
            .push(", ")
            .bind("k")
            .push(", ")
            .bind("audio/flac")
            .push(", ")
            .bind(1i64)
            .push(", ")
            .bind("a.flac")
            .push(", ")
            .bind("rec_provider")
            .push(")");
        db.execute(&sql).await.unwrap();

        let app = app!(state);
        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/storage/providers/rec_provider")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;

        assert_eq!(res.status(), 409, "apps/api answers 409 here");
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "PROVIDER_IN_USE");
    }

    #[actix_web::test]
    async fn one_account_cannot_see_or_delete_anothers_provider() {
        let (state, _token) = signed_in().await;
        let alice = user_id(&state).await;
        insert_provider(&state, "rec_provider", &alice).await;

        crate::ingest::upsert_user(state.db(), "did:plc:bob")
            .await
            .unwrap();
        let bob = crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/storage/providers")
                .insert_header(("authorization", format!("Bearer {bob}")))
                .to_request(),
        )
        .await;
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body, serde_json::json!([]), "Bob sees none of Alice's");

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/storage/providers/rec_provider")
                .insert_header(("authorization", format!("Bearer {bob}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404);
    }

    #[actix_web::test]
    async fn stored_credentials_decrypt_back_to_the_originals() {
        let (state, _token) = signed_in().await;
        let id = user_id(&state).await;
        insert_provider(&state, "rec_provider", &id).await;

        let provider = providers::find(state.db(), &id, "rec_provider")
            .await
            .unwrap()
            .unwrap();

        // Stored encrypted...
        assert_ne!(provider.access_key, "ak");
        // ...and readable with the instance key, which is what lets an upload
        // actually reach the bucket later.
        let key = state.storage_encryption_key();
        assert_eq!(
            crypto::decrypt_credential(key, &provider.access_key).unwrap(),
            "ak"
        );
        assert_eq!(
            crypto::decrypt_credential(key, &provider.secret_key).unwrap(),
            "sk"
        );
    }
}
