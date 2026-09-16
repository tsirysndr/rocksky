//! A [`ClientAuthStore`] over the same SQLite tables `apps/api` uses.
//!
//! The point of this module is that **an existing `auth.db` keeps working**:
//! point this binary at the file the TypeScript API has been writing and every
//! signed-in user stays signed in. That means storing sessions in the exact
//! JSON `@atproto/oauth-client-node` persists, not in jacquard's own shape.
//!
//! `auth_session` rows, keyed by the bare DID:
//!
//! ```json
//! { "dpopJwk": { "kty": "EC", "crv": "P-256", "x": …, "y": …, "d": … },
//!   "authMethod": "private_key_jwt",
//!   "tokenSet": { "iss": …, "sub": …, "aud": …, "scope": …,
//!                 "access_token": …, "refresh_token": …,
//!                 "token_type": "DPoP", "expires_at": "…Z" } }
//! ```
//!
//! jacquard's `ClientSessionData` carries three things that JSON does not:
//! the authorization server's token and revocation endpoints, and a session
//! id. All are recoverable — the endpoints by fetching the issuer's metadata
//! (cached per issuer), and the session id by using a fixed one, since the
//! store assumes a single active session per account. Nothing is invented and
//! nothing is lost in either direction.
//!
//! `auth_state` rows are jacquard's own JSON rather than Node's, because
//! jacquard needs a PAR `request_uri` that Node never stores. That is safe:
//! rows live for the seconds between `/login` and `/oauth/callback`, are keyed
//! by a random `state`, and a flow always completes on the server that started
//! it — the `redirect_uri` names one host.

use jacquard_common::session::{SessionKey, SessionStoreError};
use jacquard_common::types::string::Did;
use jacquard_oauth::authstore::ClientAuthStore;
use jacquard_oauth::session::{AuthRequestData, ClientSessionData, DpopClientData};
use jose_jwk::{Jwk, Key};
use serde::{Deserialize, Serialize};
use smol_str::SmolStr;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// The session id used for sessions restored from a Node-written row, which
/// carries none. The store assumes one active session per account, so a
/// constant is sufficient and keeps the key stable across restarts.
pub const DEFAULT_SESSION_ID: &str = "oauth";

/// A row of `auth_session`, in `@atproto/oauth-client-node`'s shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct NodeSavedSession {
    /// The DPoP private key as a full JWK.
    #[serde(rename = "dpopJwk")]
    dpop_jwk: serde_json::Value,
    /// Optional in the TypeScript type "for legacy reasons".
    #[serde(
        rename = "authMethod",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    auth_method: Option<String>,
    #[serde(rename = "tokenSet")]
    token_set: NodeTokenSet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NodeTokenSet {
    iss: String,
    sub: String,
    aud: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    refresh_token: Option<String>,
    access_token: String,
    token_type: String,
    /// ISO date.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expires_at: Option<String>,
}

/// What a stored row yields without touching the network.
///
/// Building a full session needs the issuer's metadata, so it cannot be done
/// offline. Everything that can fail *locally* — the JSON shape and the DPoP
/// key — is checkable without it, which is what lets a real database be
/// verified row by row in a test.
#[derive(Debug)]
pub struct ParsedSession {
    pub did: String,
    pub issuer: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<String>,
    pub dpop_key: jose_jwk::Key,
}

/// Parses one `auth_session` row as `@atproto/oauth-client-node` wrote it.
pub fn parse_node_session(raw: &str) -> Result<ParsedSession, anyhow::Error> {
    let saved: NodeSavedSession = serde_json::from_str(raw)
        .map_err(|err| anyhow::anyhow!("the row is not a Node session: {err}"))?;

    // The full JWK carries kid/alg alongside the key material. Real rows have
    // neither, so requiring them would reject every live session.
    let jwk: Jwk = serde_json::from_value(saved.dpop_jwk)
        .map_err(|err| anyhow::anyhow!("the DPoP key is unusable: {err}"))?;

    Ok(ParsedSession {
        did: saved.token_set.sub,
        issuer: saved.token_set.iss,
        access_token: saved.token_set.access_token,
        refresh_token: saved.token_set.refresh_token,
        expires_at: saved.token_set.expires_at,
        dpop_key: jwk.key,
    })
}

/// The authorization server endpoints that the Node JSON does not record.
#[derive(Debug, Clone)]
struct AuthServerEndpoints {
    token_endpoint: SmolStr,
    revocation_endpoint: Option<SmolStr>,
}

#[derive(Debug, Deserialize)]
struct AuthServerMetadata {
    token_endpoint: String,
    #[serde(default)]
    revocation_endpoint: Option<String>,
}

/// Sessions and pending authorization requests, in `apps/api`'s tables.
pub struct SqliteAuthStore {
    db: SqlitePool,
    http: reqwest::Client,
    /// Issuer → endpoints, so restoring many sessions costs one metadata fetch
    /// per authorization server rather than one per session.
    endpoints: Arc<RwLock<HashMap<String, AuthServerEndpoints>>>,
}

impl SqliteAuthStore {
    pub fn new(db: SqlitePool, http: reqwest::Client) -> Self {
        Self {
            db,
            http,
            endpoints: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Resolves an issuer's token and revocation endpoints, caching the result.
    async fn endpoints(&self, issuer: &str) -> Result<AuthServerEndpoints, SessionStoreError> {
        if let Some(cached) = self.endpoints.read().await.get(issuer) {
            return Ok(cached.clone());
        }

        let url = format!(
            "{}/.well-known/oauth-authorization-server",
            issuer.trim_end_matches('/')
        );
        let metadata: AuthServerMetadata = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(other)?
            .error_for_status()
            .map_err(other)?
            .json()
            .await
            .map_err(other)?;

        let endpoints = AuthServerEndpoints {
            token_endpoint: SmolStr::new(&metadata.token_endpoint),
            revocation_endpoint: metadata.revocation_endpoint.as_deref().map(SmolStr::new),
        };
        self.endpoints
            .write()
            .await
            .insert(issuer.to_string(), endpoints.clone());
        Ok(endpoints)
    }

    /// Builds a jacquard session from a Node row.
    async fn to_client_session(
        &self,
        saved: NodeSavedSession,
        session_id: &str,
    ) -> Result<ClientSessionData, SessionStoreError> {
        let endpoints = self.endpoints(&saved.token_set.iss).await?;

        // The full JWK carries kid/alg alongside the key material; only the
        // key itself is needed to sign DPoP proofs.
        let jwk: Jwk = serde_json::from_value(saved.dpop_jwk).map_err(SessionStoreError::Serde)?;

        let did: Did = saved.token_set.sub.parse().map_err(|err| {
            other(anyhow::anyhow!(
                "stored session has an unusable sub: {err:?}"
            ))
        })?;

        let scopes = jacquard_oauth::scopes::Scopes::new(SmolStr::new(
            saved.token_set.scope.as_deref().unwrap_or("atproto"),
        ))
        .map_err(|err| {
            other(anyhow::anyhow!(
                "stored session has unusable scopes: {err:?}"
            ))
        })?;

        let host_url = saved.token_set.aud.parse().map_err(|err| {
            other(anyhow::anyhow!(
                "stored session has an unusable aud: {err:?}"
            ))
        })?;

        let expires_at = saved
            .token_set
            .expires_at
            .as_deref()
            .and_then(|raw| raw.parse().ok());

        Ok(ClientSessionData {
            account_did: did.clone(),
            session_id: SmolStr::new(session_id),
            host_url,
            authserver_url: SmolStr::new(&saved.token_set.iss),
            authserver_token_endpoint: endpoints.token_endpoint,
            authserver_revocation_endpoint: endpoints.revocation_endpoint,
            scopes,
            dpop_data: DpopClientData {
                dpop_key: jwk.key,
                // Nonces are per-request replay protection, not session state:
                // the server hands out a fresh one on the first 401.
                dpop_authserver_nonce: SmolStr::default(),
                dpop_host_nonce: SmolStr::default(),
            },
            token_set: jacquard_oauth::types::TokenSet {
                iss: SmolStr::new(&saved.token_set.iss),
                sub: did,
                aud: SmolStr::new(&saved.token_set.aud),
                scope: saved.token_set.scope.as_deref().map(SmolStr::new),
                refresh_token: saved.token_set.refresh_token.as_deref().map(SmolStr::new),
                access_token: SmolStr::new(&saved.token_set.access_token),
                token_type: jacquard_oauth::types::OAuthTokenType::DPoP,
                expires_at,
            },
            resolved_scopes: None,
        })
    }

    /// Builds a Node row from a jacquard session.
    fn from_client_session(session: &ClientSessionData) -> NodeSavedSession {
        NodeSavedSession {
            dpop_jwk: jwk_to_json(&session.dpop_data.dpop_key),
            // Recorded so the TypeScript client knows how this session
            // authenticates when it refreshes it.
            auth_method: Some("private_key_jwt".to_string()),
            token_set: NodeTokenSet {
                iss: session.token_set.iss.to_string(),
                sub: session.token_set.sub.to_string(),
                aud: session.token_set.aud.to_string(),
                scope: session.token_set.scope.as_ref().map(|s| s.to_string()),
                refresh_token: session
                    .token_set
                    .refresh_token
                    .as_ref()
                    .map(|t| t.to_string()),
                access_token: session.token_set.access_token.to_string(),
                // Always DPoP for atproto.
                token_type: "DPoP".to_string(),
                expires_at: session
                    .token_set
                    .expires_at
                    .as_ref()
                    .map(|at| at.to_string()),
            },
        }
    }
}

/// Serializes a DPoP key as a JWK the TypeScript client will accept.
///
/// `@atproto/jwk-jose` builds a key from this object, so `alg` and `use` are
/// included: without `alg` it has to guess the signing algorithm, and a guess
/// that differs from ours would invalidate every DPoP proof for the session.
fn jwk_to_json(key: &Key) -> serde_json::Value {
    let mut value = serde_json::to_value(key).unwrap_or(serde_json::Value::Null);
    if let Some(object) = value.as_object_mut() {
        object
            .entry("alg".to_string())
            .or_insert_with(|| serde_json::Value::String("ES256".into()));
        object
            .entry("use".to_string())
            .or_insert_with(|| serde_json::Value::String("sig".into()));
    }
    value
}

fn other<E: Into<anyhow::Error>>(err: E) -> SessionStoreError {
    SessionStoreError::Other(err.into().into())
}

/// `expiresAt` is lifted out of the JSON into its own column so sessions about
/// to lapse can be found without parsing every row — the same reason
/// `apps/api` does it.
fn expires_at_column(session: &NodeSavedSession) -> Option<String> {
    session.token_set.expires_at.clone()
}

impl ClientAuthStore for SqliteAuthStore {
    async fn get_session<D: jacquard_common::BosStr + Send + Sync>(
        &self,
        did: &Did<D>,
        _session_id: &str,
    ) -> Result<Option<ClientSessionData>, SessionStoreError> {
        // Keyed by the bare DID, as the TypeScript session store is. The
        // session id is ignored on read for the same reason it is a constant
        // on write: one active session per account.
        let key = did.to_string();
        let raw: Option<String> =
            sqlx::query_scalar("SELECT session FROM auth_session WHERE key = ?")
                .bind(&key)
                .fetch_optional(&self.db)
                .await
                .map_err(other)?;

        let Some(raw) = raw else {
            return Ok(None);
        };

        // A row this build cannot read is treated as absent so the user is
        // asked to sign in again, rather than the request failing.
        let saved: NodeSavedSession = match serde_json::from_str(&raw) {
            Ok(saved) => saved,
            Err(err) => {
                tracing::warn!(did = %key, error = %err, "ignoring an unreadable stored session");
                return Ok(None);
            }
        };

        match self.to_client_session(saved, DEFAULT_SESSION_ID).await {
            Ok(session) => Ok(Some(session)),
            Err(err) => {
                // Most likely the issuer's metadata could not be fetched. That
                // is transient, so it is reported rather than swallowed —
                // silently answering "no session" would log the user out.
                tracing::warn!(did = %key, error = %err, "could not restore a stored session");
                Err(err)
            }
        }
    }

    async fn upsert_session(&self, session: ClientSessionData) -> Result<(), SessionStoreError> {
        let saved = Self::from_client_session(&session);
        let json = serde_json::to_string(&saved).map_err(SessionStoreError::Serde)?;

        sqlx::query(
            "INSERT INTO auth_session (key, session, \"expiresAt\") VALUES (?, ?, ?) \
             ON CONFLICT (key) DO UPDATE SET \
               session = excluded.session, \"expiresAt\" = excluded.\"expiresAt\"",
        )
        .bind(session.account_did.to_string())
        .bind(&json)
        .bind(expires_at_column(&saved))
        .execute(&self.db)
        .await
        .map_err(other)?;
        Ok(())
    }

    async fn delete_session<D: jacquard_common::BosStr + Send + Sync>(
        &self,
        did: &Did<D>,
        _session_id: &str,
    ) -> Result<(), SessionStoreError> {
        sqlx::query("DELETE FROM auth_session WHERE key = ?")
            .bind(did.to_string())
            .execute(&self.db)
            .await
            .map_err(other)?;
        Ok(())
    }

    async fn get_auth_req_info(
        &self,
        state: &str,
    ) -> Result<Option<AuthRequestData>, SessionStoreError> {
        let raw: Option<String> = sqlx::query_scalar("SELECT state FROM auth_state WHERE key = ?")
            .bind(state)
            .fetch_optional(&self.db)
            .await
            .map_err(other)?;

        let Some(raw) = raw else {
            return Ok(None);
        };

        // A row written by the TypeScript API has a different shape and is not
        // ours to complete; treating it as absent fails the callback cleanly.
        Ok(serde_json::from_str(&raw).ok())
    }

    async fn save_auth_req_info(
        &self,
        auth_req_info: &AuthRequestData,
    ) -> Result<(), SessionStoreError> {
        let json = serde_json::to_string(auth_req_info).map_err(SessionStoreError::Serde)?;
        sqlx::query(
            "INSERT INTO auth_state (key, state) VALUES (?, ?) \
             ON CONFLICT (key) DO UPDATE SET state = excluded.state",
        )
        .bind(auth_req_info.state.as_str())
        .bind(&json)
        .execute(&self.db)
        .await
        .map_err(other)?;
        Ok(())
    }

    async fn delete_auth_req_info(&self, state: &str) -> Result<(), SessionStoreError> {
        sqlx::query("DELETE FROM auth_state WHERE key = ?")
            .bind(state)
            .execute(&self.db)
            .await
            .map_err(other)?;
        Ok(())
    }

    async fn list_session_keys(&self) -> Result<Vec<SessionKey>, SessionStoreError> {
        let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM auth_session")
            .fetch_all(&self.db)
            .await
            .map_err(other)?;

        Ok(keys
            .into_iter()
            // `atp:`-prefixed rows are app-password sessions, not OAuth ones.
            .filter(|key| !key.starts_with("atp:"))
            .filter_map(|key| key.parse::<Did>().ok())
            .map(|did| SessionKey::new(did, DEFAULT_SESSION_ID))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn store() -> SqliteAuthStore {
        let db = crate::db::connect_auth("sqlite::memory:").await.unwrap();
        SqliteAuthStore::new(db, reqwest::Client::new())
    }

    /// A row exactly as `@atproto/oauth-client-node` writes it.
    fn node_row() -> String {
        serde_json::json!({
            "dpopJwk": {
                "kty": "EC",
                "crv": "P-256",
                "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
                "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
                "d": "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
                "alg": "ES256",
                "use": "sig"
            },
            "authMethod": "private_key_jwt",
            "tokenSet": {
                "iss": "https://bsky.social",
                "sub": "did:plc:alice",
                "aud": "https://shimeji.us-east.host.bsky.network",
                "scope": "atproto repo:app.rocksky.scrobble",
                "refresh_token": "the-refresh-token",
                "access_token": "the-access-token",
                "token_type": "DPoP",
                "expires_at": "2026-09-16T12:00:00.000Z"
            }
        })
        .to_string()
    }

    #[tokio::test]
    async fn a_node_written_session_row_parses() {
        // The interop that matters: this is what an existing auth.db contains.
        let saved: NodeSavedSession = serde_json::from_str(&node_row()).expect("must parse");
        assert_eq!(saved.token_set.sub, "did:plc:alice");
        assert_eq!(saved.token_set.access_token, "the-access-token");
        assert_eq!(saved.auth_method.as_deref(), Some("private_key_jwt"));
        // And the DPoP key is usable, which is what signs every request.
        let jwk: Jwk = serde_json::from_value(saved.dpop_jwk).expect("the key must be readable");
        assert!(matches!(jwk.key, Key::Ec(_)));
    }

    #[tokio::test]
    async fn a_session_row_round_trips_without_losing_fields() {
        let original: NodeSavedSession = serde_json::from_str(&node_row()).unwrap();
        let rewritten = serde_json::to_value(&original).unwrap();

        // Every key the TypeScript client reads must still be there.
        for key in ["dpopJwk", "authMethod", "tokenSet"] {
            assert!(rewritten.get(key).is_some(), "{key} missing: {rewritten}");
        }
        for key in [
            "iss",
            "sub",
            "aud",
            "scope",
            "refresh_token",
            "access_token",
            "token_type",
            "expires_at",
        ] {
            assert!(
                rewritten["tokenSet"].get(key).is_some(),
                "tokenSet.{key} missing: {rewritten}"
            );
        }
        assert_eq!(rewritten["tokenSet"]["token_type"], "DPoP");
    }

    #[tokio::test]
    async fn sessions_are_keyed_by_the_bare_did() {
        // `apps/api` keys OAuth sessions by the DID and app-password sessions
        // by `atp:<did>`; writing to the wrong key would strand the session.
        let store = store().await;
        sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
            .bind("did:plc:alice")
            .bind(node_row())
            .execute(&store.db)
            .await
            .unwrap();

        let raw: Option<String> =
            sqlx::query_scalar("SELECT session FROM auth_session WHERE key = 'did:plc:alice'")
                .fetch_optional(&store.db)
                .await
                .unwrap();
        assert!(raw.is_some());
    }

    #[tokio::test]
    async fn an_unreadable_session_reads_as_absent_rather_than_failing() {
        let store = store().await;
        sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
            .bind("did:plc:alice")
            .bind("{not json")
            .execute(&store.db)
            .await
            .unwrap();

        let did: Did = "did:plc:alice".parse().unwrap();
        let session = store.get_session(&did, DEFAULT_SESSION_ID).await.unwrap();
        assert!(session.is_none(), "the user is asked to sign in again");
    }

    #[tokio::test]
    async fn an_absent_session_is_none() {
        let store = store().await;
        let did: Did = "did:plc:nobody".parse().unwrap();
        assert!(store
            .get_session(&did, DEFAULT_SESSION_ID)
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn app_password_sessions_are_not_listed_as_oauth_sessions() {
        let store = store().await;
        for key in ["did:plc:alice", "atp:did:plc:bob"] {
            sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
                .bind(key)
                .bind(node_row())
                .execute(&store.db)
                .await
                .unwrap();
        }

        let keys = store.list_session_keys().await.unwrap();
        assert_eq!(keys.len(), 1, "{keys:?}");
        assert_eq!(keys[0].did.to_string(), "did:plc:alice");
    }

    #[tokio::test]
    async fn deleting_a_session_removes_the_row() {
        let store = store().await;
        sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
            .bind("did:plc:alice")
            .bind(node_row())
            .execute(&store.db)
            .await
            .unwrap();

        let did: Did = "did:plc:alice".parse().unwrap();
        store
            .delete_session(&did, DEFAULT_SESSION_ID)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_session")
            .fetch_one(&store.db)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn a_foreign_auth_state_row_is_not_claimed() {
        let store = store().await;
        // A pending login started by the TypeScript API. Its shape is
        // different, and completing it here is not possible.
        sqlx::query("INSERT INTO auth_state (key, state) VALUES (?, ?)")
            .bind("some-state")
            .bind(r#"{"iss":"https://bsky.social","dpopJwk":{},"verifier":"v"}"#)
            .execute(&store.db)
            .await
            .unwrap();

        assert!(store
            .get_auth_req_info("some-state")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn auth_state_rows_can_be_deleted() {
        let store = store().await;
        sqlx::query("INSERT INTO auth_state (key, state) VALUES (?, ?)")
            .bind("some-state")
            .bind("{}")
            .execute(&store.db)
            .await
            .unwrap();

        store.delete_auth_req_info("some-state").await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_state")
            .fetch_one(&store.db)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn the_expiry_is_mirrored_into_its_own_column() {
        let saved: NodeSavedSession = serde_json::from_str(&node_row()).unwrap();
        assert_eq!(
            expires_at_column(&saved).as_deref(),
            Some("2026-09-16T12:00:00.000Z")
        );
    }

    #[test]
    fn a_written_jwk_carries_the_algorithm() {
        // Without `alg`, the TypeScript side has to infer the signing
        // algorithm, and a different guess breaks every DPoP proof.
        let jwk: Jwk = serde_json::from_value(serde_json::json!({
            "kty": "EC",
            "crv": "P-256",
            "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
            "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
            "d": "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
        }))
        .unwrap();

        let written = jwk_to_json(&jwk.key);
        assert_eq!(written["alg"], "ES256");
        assert_eq!(written["use"], "sig");
        assert_eq!(written["kty"], "EC");
        assert_eq!(written["crv"], "P-256");
        // The private component must survive, or the session cannot sign.
        assert!(written.get("d").is_some(), "{written}");
    }
}
