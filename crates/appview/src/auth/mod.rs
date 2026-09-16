//! Request authentication — the port of `apps/api/src/lib/authVerifier.ts`.
//!
//! Most `app.rocksky.*` queries pass `auth: ctx.authVerifier`, which is
//! *optional* auth: no header means `{}` and the method still answers
//! publicly, a valid token just personalises the result (`liked`, `following`).
//! That maps to [`Auth`]. Methods that genuinely need identity use [`AuthDid`],
//! which fails the request with 401 instead.
//!
//! One inherited behaviour worth naming: authVerifier only calls `verifyToken`
//! when a bearer is present, so a *malformed* token is a 401 rather than being
//! silently ignored. Both extractors keep that.

pub mod jwt;

use crate::error::XrpcError;
use crate::state::AppState;
use actix_web::{dev::Payload, FromRequest, HttpRequest};
use jwt::{bearer_from_header, verify_token, Claims, TokenError};
use std::future::Future;
use std::pin::Pin;

/// Optional credentials. `Auth(None)` is an anonymous caller.
#[derive(Debug, Clone)]
pub struct Auth(pub Option<Claims>);

impl Auth {
    /// The authenticated DID, if any.
    pub fn did(&self) -> Option<&str> {
        self.0.as_ref()?.did.as_deref()
    }

    /// The authenticated DID or a 401 — for handlers that are public overall
    /// but have an authenticated-only branch.
    pub fn require_did(&self) -> Result<&str, XrpcError> {
        self.did()
            .ok_or_else(|| XrpcError::auth_required("Missing authenticated DID."))
    }
}

/// Mandatory credentials: the extractor itself rejects anonymous callers.
#[derive(Debug, Clone)]
pub struct AuthDid {
    pub did: String,
    pub claims: Claims,
}

fn map_token_error(err: TokenError) -> XrpcError {
    match err {
        // Revocation is a client-fixable state, so it keeps its message.
        TokenError::Revoked => XrpcError::auth_required("Access token revoked"),
        TokenError::Invalid(_) => XrpcError::auth_required("Invalid token"),
        // A database failure is ours, not the caller's; don't tell them their
        // perfectly good token is bad.
        TokenError::Database(err) => XrpcError::internal(err),
    }
}

async fn claims_from_request(req: HttpRequest) -> Result<Option<Claims>, XrpcError> {
    let header = req
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    let Some(bearer) = bearer_from_header(header.as_deref()) else {
        return Ok(None);
    };

    let state = req
        .app_data::<AppState>()
        .ok_or_else(|| XrpcError::internal(anyhow::anyhow!("AppState missing from app data")))?;

    verify_token(state.db(), &state.config().jwt_secret, bearer)
        .await
        .map(Some)
        .map_err(map_token_error)
}

impl FromRequest for Auth {
    type Error = XrpcError;
    type Future = Pin<Box<dyn Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move { claims_from_request(req).await.map(Auth) })
    }
}

impl FromRequest for AuthDid {
    type Error = XrpcError;
    type Future = Pin<Box<dyn Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let claims = claims_from_request(req)
                .await?
                .ok_or_else(|| XrpcError::auth_required("Authentication Required"))?;
            let did = claims
                .did
                .clone()
                .ok_or_else(|| XrpcError::auth_required("Missing authenticated DID."))?;
            Ok(AuthDid { did, claims })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, web, App, HttpResponse};
    use jsonwebtoken::{Algorithm, EncodingKey, Header};

    fn sign(secret: &str, claims: serde_json::Value) -> String {
        jsonwebtoken::encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    async fn optional(auth: Auth) -> HttpResponse {
        HttpResponse::Ok().json(serde_json::json!({ "did": auth.did() }))
    }

    async fn required(auth: AuthDid) -> HttpResponse {
        HttpResponse::Ok().json(serde_json::json!({ "did": auth.did }))
    }

    /// A macro rather than a function so the test service's request type —
    /// `actix_http::Request`, from a crate this one does not depend on
    /// directly — never has to be named.
    macro_rules! app_with {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state)
                    .route("/optional", web::get().to(optional))
                    .route("/required", web::get().to(required)),
            )
            .await
        };
    }

    #[actix_web::test]
    async fn anonymous_requests_reach_optional_handlers() {
        let state = AppState::for_test().await.unwrap();
        let app = app_with!(state);

        let res =
            test::call_service(&app, test::TestRequest::get().uri("/optional").to_request()).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["did"], serde_json::Value::Null);
    }

    #[actix_web::test]
    async fn anonymous_requests_are_rejected_by_mandatory_auth() {
        let state = AppState::for_test().await.unwrap();
        let app = app_with!(state);

        let res =
            test::call_service(&app, test::TestRequest::get().uri("/required").to_request()).await;
        assert_eq!(res.status(), 401);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "AuthRequired");
    }

    #[actix_web::test]
    async fn a_valid_token_yields_the_did() {
        let state = AppState::for_test().await.unwrap();
        let token = sign(
            &state.config().jwt_secret,
            serde_json::json!({ "did": "did:plc:abc" }),
        );
        let app = app_with!(state);

        for path in ["/optional", "/required"] {
            let res = test::call_service(
                &app,
                test::TestRequest::get()
                    .uri(path)
                    .insert_header(("authorization", format!("Bearer {token}")))
                    .to_request(),
            )
            .await;
            assert_eq!(res.status(), 200, "{path}");
            let body: serde_json::Value = test::read_body_json(res).await;
            assert_eq!(body["did"], "did:plc:abc", "{path}");
        }
    }

    #[actix_web::test]
    async fn a_bad_token_is_a_401_even_on_optional_auth() {
        // authVerifier calls verifyToken whenever a bearer is present, so a
        // forged token fails the request rather than falling back to anonymous.
        let state = AppState::for_test().await.unwrap();
        let token = sign(
            "some-other-secret",
            serde_json::json!({ "did": "did:plc:abc" }),
        );
        let app = app_with!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/optional")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn the_literal_null_token_is_treated_as_anonymous() {
        let state = AppState::for_test().await.unwrap();
        let app = app_with!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/optional")
                .insert_header(("authorization", "Bearer null"))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
    }

    #[actix_web::test]
    async fn a_token_without_a_did_fails_mandatory_auth() {
        let state = AppState::for_test().await.unwrap();
        let token = sign(&state.config().jwt_secret, serde_json::json!({ "iat": 1 }));
        let app = app_with!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/required")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["message"], "Missing authenticated DID.");
    }
}
