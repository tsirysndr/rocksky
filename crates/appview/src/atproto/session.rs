//! App-password sessions against a user's PDS.
//!
//! This is the login path that needs no public URL and no key material: the
//! user pastes an app password, this server calls
//! `com.atproto.server.createSession` on their PDS and keeps the resulting
//! token pair. For a self-hosted instance on `localhost` or a LAN address —
//! where an OAuth client metadata document cannot be fetched by the PDS —
//! it is the only login that works at all.
//!
//! Sessions are stored under `atp:<did>` with the same JSON shape
//! `@atproto/api` persists (`AtpSessionData`), matching
//! `apps/api/src/bsky/app.ts`. That is deliberate: the two servers can share
//! an `auth.db`, and a session created by either is usable by the other.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

/// The stored session, in `AtpSessionData` shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtpSession {
    pub did: String,
    pub handle: String,
    pub access_jwt: String,
    pub refresh_jwt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default = "default_true")]
    pub active: bool,
    /// Kept so a session written here round-trips through `@atproto/api`
    /// without losing fields it cares about.
    #[serde(flatten, default)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
}

impl AtpSession {
    /// Just the parts a repository write needs.
    ///
    /// The protocol crate deliberately does not know about handles, emails or
    /// refresh tokens — a `putRecord` needs a DID and a bearer token and
    /// nothing else.
    pub fn credentials(&self) -> rocksky_atproto::AtpSession {
        rocksky_atproto::AtpSession {
            did: self.did.clone(),
            access_jwt: self.access_jwt.clone(),
        }
    }
}

fn default_true() -> bool {
    true
}

/// What `com.atproto.server.createSession` answers.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResponse {
    did: String,
    handle: String,
    access_jwt: String,
    refresh_jwt: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default = "default_true")]
    active: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("{0:?} is not a handle or DID")]
    InvalidIdentifier(String),
    #[error("could not resolve {0}")]
    Unresolvable(String),
    #[error("your PDS rejected those credentials")]
    Rejected,
    #[error("your PDS answered {status}: {body}")]
    Upstream {
        status: reqwest::StatusCode,
        body: String,
    },
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Resolve(#[from] super::ResolveError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serialize(#[from] serde_json::Error),
}

/// Whether `identifier` looks like a handle rather than a DID.
fn is_handle(identifier: &str) -> bool {
    !identifier.starts_with("did:")
        && identifier.contains('.')
        && !identifier.contains(' ')
        && !identifier.contains('/')
}

/// Resolves a handle to a DID.
///
/// Tries the account's own domain first (`https://<handle>/.well-known/
/// atproto-did`, which is how a self-hosted PDS publishes it), then falls back
/// to a resolver service. Doing it in that order means a handle hosted
/// somewhere the public resolvers do not know about still works — which is
/// exactly the self-hosted case.
pub async fn resolve_handle(
    http: &reqwest::Client,
    resolver_url: &str,
    handle: &str,
) -> Result<String, SessionError> {
    let well_known = format!("https://{handle}/.well-known/atproto-did");
    if let Ok(response) = http.get(&well_known).send().await {
        if response.status().is_success() {
            if let Ok(body) = response.text().await {
                let did = body.trim();
                if did.starts_with("did:") {
                    return Ok(did.to_string());
                }
            }
        }
    }

    #[derive(Deserialize)]
    struct Resolved {
        did: String,
    }

    let url = format!(
        "{}/xrpc/com.atproto.identity.resolveHandle?handle={}",
        resolver_url.trim_end_matches('/'),
        handle
    );
    let response = http.get(&url).send().await?;
    if !response.status().is_success() {
        return Err(SessionError::Unresolvable(handle.to_string()));
    }
    Ok(response.json::<Resolved>().await?.did)
}

/// Logs in with an app password and stores the session.
///
/// Returns the DID and handle the PDS confirmed, which are what the caller
/// mints a token for — never the identifier the user typed, since a handle can
/// be an alias.
pub async fn create(
    http: &reqwest::Client,
    auth_db: &SqlitePool,
    plc_directory_url: &str,
    resolver_url: &str,
    identifier: &str,
    password: &str,
) -> Result<AtpSession, SessionError> {
    let identifier = identifier.trim();
    if identifier.is_empty() || password.is_empty() {
        return Err(SessionError::InvalidIdentifier(identifier.to_string()));
    }

    let did = if identifier.starts_with("did:") {
        identifier.to_string()
    } else if is_handle(identifier) {
        resolve_handle(http, resolver_url, identifier).await?
    } else {
        return Err(SessionError::InvalidIdentifier(identifier.to_string()));
    };

    let pds = super::resolve_pds(http, plc_directory_url, &did).await?;

    let response = http
        .post(format!("{pds}/xrpc/com.atproto.server.createSession"))
        .json(&serde_json::json!({
            "identifier": identifier,
            "password": password,
        }))
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        // 400/401 from createSession is a wrong password or a revoked app
        // password; anything else is the PDS having a problem.
        return Err(if status.as_u16() == 400 || status.as_u16() == 401 {
            SessionError::Rejected
        } else {
            SessionError::Upstream { status, body }
        });
    }

    let created: CreateSessionResponse = response.json().await?;
    let session = AtpSession {
        did: created.did,
        handle: created.handle,
        access_jwt: created.access_jwt,
        refresh_jwt: created.refresh_jwt,
        email: created.email,
        active: created.active,
        extra: Default::default(),
    };

    store(auth_db, &session).await?;
    Ok(session)
}

/// The `auth_session` key for an app-password session.
pub fn session_key(did: &str) -> String {
    format!("atp:{did}")
}

/// Persists a session, replacing any previous one for that DID.
pub async fn store(auth_db: &SqlitePool, session: &AtpSession) -> Result<(), SessionError> {
    let json = serde_json::to_string(session)?;
    sqlx::query(
        "INSERT INTO auth_session (key, session) VALUES (?, ?) \
         ON CONFLICT (key) DO UPDATE SET session = excluded.session",
    )
    .bind(session_key(&session.did))
    .bind(&json)
    .execute(auth_db)
    .await?;
    Ok(())
}

/// Reads a stored session, if there is one.
pub async fn load(auth_db: &SqlitePool, did: &str) -> Result<Option<AtpSession>, SessionError> {
    let raw: Option<String> = sqlx::query_scalar("SELECT session FROM auth_session WHERE key = ?")
        .bind(session_key(did))
        .fetch_optional(auth_db)
        .await?;

    match raw {
        None => Ok(None),
        // A row that no longer parses is treated as absent rather than fatal:
        // the user can simply log in again.
        Some(raw) => Ok(serde_json::from_str(&raw).ok()),
    }
}

/// Forgets a session, so the user is signed out of this instance.
pub async fn delete(auth_db: &SqlitePool, did: &str) -> Result<(), SessionError> {
    sqlx::query("DELETE FROM auth_session WHERE key = ?")
        .bind(session_key(did))
        .execute(auth_db)
        .await?;
    Ok(())
}

/// A public Bluesky profile, for the display name and avatar that records do
/// not carry.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BskyProfile {
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
}

/// Fetches a public profile. Failures yield an empty profile rather than an
/// error: a missing avatar must not block a login.
pub async fn fetch_profile(http: &reqwest::Client, appview_url: &str, did: &str) -> BskyProfile {
    let url = format!(
        "{}/xrpc/app.bsky.actor.getProfile?actor={}",
        appview_url.trim_end_matches('/'),
        did
    );

    match http.get(&url).send().await {
        Ok(response) if response.status().is_success() => response.json().await.unwrap_or_default(),
        Ok(response) => {
            tracing::debug!(did, status = %response.status(), "profile lookup failed");
            BskyProfile::default()
        }
        Err(err) => {
            tracing::debug!(did, error = %err, "profile lookup failed");
            BskyProfile::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn auth_db() -> SqlitePool {
        crate::db::connect_auth("sqlite::memory:").await.unwrap()
    }

    fn session() -> AtpSession {
        AtpSession {
            did: "did:plc:alice".into(),
            handle: "alice.test".into(),
            access_jwt: "access".into(),
            refresh_jwt: "refresh".into(),
            email: None,
            active: true,
            extra: Default::default(),
        }
    }

    #[test]
    fn handles_and_dids_are_told_apart() {
        assert!(is_handle("alice.bsky.social"));
        assert!(is_handle("alice.test"));
        assert!(!is_handle("did:plc:abc"));
        // A bare word is neither — a handle always has a dot.
        assert!(!is_handle("alice"));
        assert!(!is_handle("alice bsky social"));
        assert!(!is_handle("https://alice.test/"));
    }

    #[tokio::test]
    async fn a_session_round_trips() {
        let db = auth_db().await;
        store(&db, &session()).await.unwrap();

        let loaded = load(&db, "did:plc:alice").await.unwrap().unwrap();
        assert_eq!(loaded.did, "did:plc:alice");
        assert_eq!(loaded.handle, "alice.test");
        assert_eq!(loaded.access_jwt, "access");
        assert!(loaded.active);
    }

    /// The key format is shared with `apps/api`, which reads and writes the
    /// same rows.
    #[tokio::test]
    async fn the_key_matches_the_typescript_format() {
        assert_eq!(session_key("did:plc:alice"), "atp:did:plc:alice");

        let db = auth_db().await;
        store(&db, &session()).await.unwrap();
        let key: Option<String> = sqlx::query_scalar("SELECT key FROM auth_session")
            .fetch_optional(&db)
            .await
            .unwrap();
        assert_eq!(key.as_deref(), Some("atp:did:plc:alice"));
    }

    /// And the JSON is what `@atproto/api` persists, so a row written here is
    /// usable by the TypeScript API.
    #[tokio::test]
    async fn the_stored_json_is_camel_cased() {
        let db = auth_db().await;
        store(&db, &session()).await.unwrap();

        let raw: String = sqlx::query_scalar("SELECT session FROM auth_session")
            .fetch_one(&db)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(value["accessJwt"], "access");
        assert_eq!(value["refreshJwt"], "refresh");
        assert_eq!(value["did"], "did:plc:alice");
        assert!(value.get("access_jwt").is_none(), "{raw}");
    }

    #[tokio::test]
    async fn logging_in_again_replaces_the_session() {
        let db = auth_db().await;
        store(&db, &session()).await.unwrap();

        let mut newer = session();
        newer.access_jwt = "fresher".into();
        store(&db, &newer).await.unwrap();

        assert_eq!(
            load(&db, "did:plc:alice")
                .await
                .unwrap()
                .unwrap()
                .access_jwt,
            "fresher"
        );
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_session")
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(count, 1, "not a second row");
    }

    #[tokio::test]
    async fn deleting_signs_the_user_out() {
        let db = auth_db().await;
        store(&db, &session()).await.unwrap();
        delete(&db, "did:plc:alice").await.unwrap();
        assert!(load(&db, "did:plc:alice").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn an_absent_session_is_none_not_an_error() {
        let db = auth_db().await;
        assert!(load(&db, "did:plc:nobody").await.unwrap().is_none());
    }

    /// A row left by an older or newer writer must not break login.
    #[tokio::test]
    async fn an_unparseable_session_reads_as_absent() {
        let db = auth_db().await;
        sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
            .bind("atp:did:plc:alice")
            .bind("{not json")
            .execute(&db)
            .await
            .unwrap();
        assert!(load(&db, "did:plc:alice").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn unknown_session_fields_survive_a_round_trip() {
        let db = auth_db().await;
        sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
            .bind("atp:did:plc:alice")
            .bind(
                r#"{"did":"did:plc:alice","handle":"alice.test","accessJwt":"a",
                    "refreshJwt":"r","active":true,"didDoc":{"id":"did:plc:alice"}}"#,
            )
            .execute(&db)
            .await
            .unwrap();

        let loaded = load(&db, "did:plc:alice").await.unwrap().unwrap();
        // `didDoc` is not a field here, but must not be dropped when rewritten.
        assert!(loaded.extra.contains_key("didDoc"));
        let json = serde_json::to_value(&loaded).unwrap();
        assert_eq!(json["didDoc"]["id"], "did:plc:alice");
    }

    #[tokio::test]
    async fn empty_credentials_are_rejected_before_any_request() {
        let db = auth_db().await;
        let http = reqwest::Client::new();

        for (identifier, password) in [("", "x"), ("alice.test", ""), ("  ", "x")] {
            let err = create(
                &http,
                &db,
                "https://plc.directory",
                "https://bsky.social",
                identifier,
                password,
            )
            .await
            .expect_err("must not attempt a login");
            assert!(matches!(err, SessionError::InvalidIdentifier(_)), "{err:?}");
        }
    }

    #[tokio::test]
    async fn a_nonsense_identifier_is_rejected_before_any_request() {
        let db = auth_db().await;
        let err = create(
            &reqwest::Client::new(),
            &db,
            "https://plc.directory",
            "https://bsky.social",
            "not a handle",
            "password",
        )
        .await
        .expect_err("must not attempt a login");
        assert!(matches!(err, SessionError::InvalidIdentifier(_)), "{err:?}");
    }

    #[test]
    fn a_missing_profile_is_empty_rather_than_an_error() {
        let profile = BskyProfile::default();
        assert!(profile.display_name.is_none());
        assert!(profile.avatar.is_none());
    }

    #[test]
    fn a_profile_parses_from_the_appview_shape() {
        let profile: BskyProfile = serde_json::from_value(serde_json::json!({
            "did": "did:plc:alice",
            "handle": "alice.test",
            "displayName": "Alice",
            "avatar": "https://cdn.example/a.jpg",
            "followersCount": 12,
        }))
        .unwrap();
        assert_eq!(profile.handle.as_deref(), Some("alice.test"));
        assert_eq!(profile.display_name.as_deref(), Some("Alice"));
        assert_eq!(profile.avatar.as_deref(), Some("https://cdn.example/a.jpg"));
    }
}
