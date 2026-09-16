//! Bearer token verification — the port of `apps/api/src/lib/verifyToken.ts`.
//!
//! Two token shapes exist in the wild and both must keep working, because this
//! binary has to accept tokens the TypeScript API already handed out:
//!
//! - session tokens: `{ did, exp }`, minted on OAuth callback (`bsky/app.ts`)
//! - access tokens:  `{ did, jti, type: "access_token", iat }`, long-lived and
//!   revocable (`access-tokens/app.ts`)
//!
//! Both are HS256 over `JWT_SECRET` with no `aud`/`iss`, and — importantly —
//! `verifyToken` passes `ignoreExpiration: true`, so an expired `exp` is *not*
//! a rejection. Revocation is what actually gates access tokens: a `jti` with
//! no row in `access_tokens` means revoked.

use crate::db::Backend;
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

pub const ACCESS_TOKEN_TYPE: &str = "access_token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// The authenticated repo. Optional only because a malformed token could
    /// omit it; handlers that need identity check for it explicitly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jti: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iat: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exp: Option<i64>,
}

impl Claims {
    pub fn is_access_token(&self) -> bool {
        self.token_type.as_deref() == Some(ACCESS_TOKEN_TYPE)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    #[error("invalid token: {0}")]
    Invalid(#[from] jsonwebtoken::errors::Error),
    /// The `jti` no longer has a row, i.e. the user deleted the token.
    #[error("Access token revoked")]
    Revoked,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// Builds the validation policy. Split out so the "we really do ignore
/// expiry" decision is visible and testable rather than buried in a call.
fn validation() -> Validation {
    let mut validation = Validation::new(Algorithm::HS256);
    // `ignoreExpiration: true` in verifyToken.ts.
    validation.validate_exp = false;
    validation.validate_aud = false;
    // The Rust crate demands `exp` by default; Rocksky's access tokens have
    // none, so require nothing.
    validation.required_spec_claims.clear();
    validation
}

/// Verifies a bearer token's signature and, for access tokens, that it has not
/// been revoked. Mirrors `verifyToken`: throws on any verification failure.
pub async fn verify_token(db: &Backend, secret: &str, bearer: &str) -> Result<Claims, TokenError> {
    let data = jsonwebtoken::decode::<Claims>(
        bearer,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation(),
    )?;
    let claims = data.claims;

    if claims.is_access_token() {
        if let Some(jti) = claims.jti.as_deref() {
            let mut sql = db.sql("SELECT xata_id FROM access_tokens WHERE jti = ");
            sql.bind(jti).push(" LIMIT 1");

            if db.fetch_scalar::<String>(&sql).await?.is_none() {
                return Err(TokenError::Revoked);
            }
        }
    }

    Ok(claims)
}

/// Mints a long-lived, revocable access token.
///
/// Matches `apps/api/src/access-tokens/app.ts`: `{ did, jti, type, iat }` and
/// deliberately **no `exp`**. These do not expire on their own — the `jti`
/// lookup in [`verify_token`] is what ends them, so deleting the row is the
/// only revocation and there is no silent lapse to debug.
pub fn mint_access_token(
    secret: &str,
    did: &str,
    jti: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = Claims {
        did: Some(did.to_string()),
        jti: Some(jti.to_string()),
        token_type: Some(ACCESS_TOKEN_TYPE.to_string()),
        iat: Some(chrono::Utc::now().timestamp()),
        exp: None,
    };
    jsonwebtoken::encode(
        &jsonwebtoken::Header::new(Algorithm::HS256),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(secret.as_bytes()),
    )
}

/// Pulls the token out of an `Authorization` header, matching authVerifier.ts:
/// the second whitespace-separated field, with the literal string `"null"`
/// treated as absent (clients send it when they have no session).
pub fn bearer_from_header(header: Option<&str>) -> Option<&str> {
    let value = header?;
    let token = value.split_whitespace().nth(1)?.trim();
    if token.is_empty() || token == "null" {
        return None;
    }
    Some(token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use jsonwebtoken::{EncodingKey, Header};

    const SECRET: &str = "test-secret";

    fn sign(claims: &serde_json::Value) -> String {
        jsonwebtoken::encode(
            &Header::new(Algorithm::HS256),
            claims,
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn bearer_parsing_matches_the_typescript_verifier() {
        assert_eq!(bearer_from_header(Some("Bearer abc")), Some("abc"));
        assert_eq!(bearer_from_header(Some("bearer  abc ")), Some("abc"));
        // The client literally sends "null" when logged out.
        assert_eq!(bearer_from_header(Some("Bearer null")), None);
        assert_eq!(bearer_from_header(Some("Bearer")), None);
        assert_eq!(bearer_from_header(Some("")), None);
        assert_eq!(bearer_from_header(None), None);
    }

    #[tokio::test]
    async fn session_tokens_verify_and_expose_the_did() {
        let db = db::connect_in_memory().await.unwrap();
        let token = sign(&serde_json::json!({ "did": "did:plc:abc", "exp": 4_102_444_800i64 }));

        let claims = verify_token(&db, SECRET, &token).await.unwrap();
        assert_eq!(claims.did.as_deref(), Some("did:plc:abc"));
        assert!(!claims.is_access_token());
    }

    #[tokio::test]
    async fn expired_tokens_are_still_accepted() {
        // verifyToken.ts passes ignoreExpiration: true. Rejecting here would
        // log out every client the TypeScript API has already issued a token to.
        let db = db::connect_in_memory().await.unwrap();
        let token = sign(&serde_json::json!({ "did": "did:plc:abc", "exp": 1i64 }));

        let claims = verify_token(&db, SECRET, &token).await.unwrap();
        assert_eq!(claims.did.as_deref(), Some("did:plc:abc"));
    }

    #[tokio::test]
    async fn a_wrong_signature_is_rejected() {
        let db = db::connect_in_memory().await.unwrap();
        let token = sign(&serde_json::json!({ "did": "did:plc:abc" }));

        let err = verify_token(&db, "a-different-secret", &token)
            .await
            .expect_err("must not verify under another key");
        assert!(matches!(err, TokenError::Invalid(_)), "{err:?}");
    }

    #[tokio::test]
    async fn access_tokens_without_a_row_are_revoked() {
        let db = db::connect_in_memory().await.unwrap();
        let token = sign(&serde_json::json!({
            "did": "did:plc:abc",
            "jti": "11111111-1111-1111-1111-111111111111",
            "type": "access_token",
            "iat": 1_700_000_000i64,
        }));

        let err = verify_token(&db, SECRET, &token)
            .await
            .expect_err("a deleted jti means revoked");
        assert!(matches!(err, TokenError::Revoked), "{err:?}");
        assert_eq!(err.to_string(), "Access token revoked");
    }

    #[tokio::test]
    async fn access_tokens_with_a_live_row_verify() {
        let db = db::connect_in_memory().await.unwrap();
        let user_id = db::new_id();

        let mut user = db.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
        user.bind(&user_id)
            .push(", ")
            .bind("did:plc:abc")
            .push(", ")
            .bind("someone.rocksky.app")
            .push(", ")
            .bind("https://example.invalid/a.png")
            .push(")");
        db.execute(&user).await.unwrap();

        let mut row = db.sql(
            "INSERT INTO access_tokens \
             (xata_id, user_id, name, jti, token_encrypted, last_four) VALUES (",
        );
        row.bind(db::new_id())
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind("cli")
            .push(", ")
            .bind("22222222-2222-2222-2222-222222222222")
            .push(", ")
            .bind("encrypted")
            .push(", ")
            .bind("cdef")
            .push(")");
        db.execute(&row).await.unwrap();

        let token = sign(&serde_json::json!({
            "did": "did:plc:abc",
            "jti": "22222222-2222-2222-2222-222222222222",
            "type": "access_token",
        }));

        let claims = verify_token(&db, SECRET, &token).await.unwrap();
        assert!(claims.is_access_token());
        assert_eq!(claims.did.as_deref(), Some("did:plc:abc"));
    }

    #[tokio::test]
    async fn tokens_with_no_exp_and_no_type_verify() {
        // The Rust jsonwebtoken crate requires `exp` unless told otherwise.
        let db = db::connect_in_memory().await.unwrap();
        let token = sign(&serde_json::json!({ "did": "did:plc:abc" }));

        let claims = verify_token(&db, SECRET, &token).await.unwrap();
        assert_eq!(claims.exp, None);
    }
}
