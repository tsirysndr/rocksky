//! Jellyfin authentication over Rocksky credentials.
//!
//! The credentials are exactly the ones the Subsonic service takes: the
//! username is the user's handle and the password is one of their enabled API
//! keys. `POST /Users/AuthenticateByName` verifies that pair through
//! `rocksky_navidrome::auth` and mints an opaque access token, which clients
//! then send back as `X-Emby-Token`, inside the `MediaBrowser …` authorization
//! header, or as `?api_key=` on streaming URLs.

use actix_web::{dev::Payload, error::ErrorUnauthorized, web, FromRequest, HttpRequest};
use anyhow::Error;
use futures::future::LocalBoxFuture;
use rand::RngCore;
use sqlx::{Pool, Postgres};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use crate::state::AppState;

/// The authenticated Rocksky user behind a request. `id` is the `users.xata_id`
/// every repo query is scoped by.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AuthedUser {
    #[sqlx(rename = "xata_id")]
    pub id: String,
    pub handle: String,
    pub display_name: String,
    pub avatar: Option<String>,
}

/// Parsed `X-Emby-Authorization` / `Authorization: MediaBrowser …` header.
/// Clients send a comma-separated list of `Key="Value"` pairs.
#[derive(Debug, Default, Clone)]
pub struct EmbyAuth {
    pub client: Option<String>,
    pub device: Option<String>,
    pub device_id: Option<String>,
    pub version: Option<String>,
    pub token: Option<String>,
}

pub fn parse_emby_auth_header(value: &str) -> EmbyAuth {
    let body = value
        .strip_prefix("MediaBrowser ")
        .or_else(|| value.strip_prefix("Emby "))
        .unwrap_or(value);

    // Split on commas that are not inside a quoted value — device names like
    // `Device="My iPhone, Pro"` are common and must not split.
    let mut parts: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut in_quotes = false;
    for c in body.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => parts.push(std::mem::take(&mut buf)),
            _ => buf.push(c),
        }
    }
    if !buf.is_empty() {
        parts.push(buf);
    }

    let pairs: HashMap<String, String> = parts
        .into_iter()
        .filter_map(|p| {
            let trimmed = p.trim();
            let eq = trimmed.find('=')?;
            let key = trimmed[..eq].trim().to_string();
            let val = trimmed[eq + 1..].trim().trim_matches('"').to_string();
            (!key.is_empty()).then_some((key, val))
        })
        .collect();

    EmbyAuth {
        client: pairs.get("Client").cloned(),
        device: pairs.get("Device").cloned(),
        device_id: pairs.get("DeviceId").cloned(),
        version: pairs.get("Version").cloned(),
        token: pairs.get("Token").cloned(),
    }
}

pub fn parse_auth(req: &HttpRequest) -> EmbyAuth {
    for name in ["x-emby-authorization", "authorization"] {
        if let Some(v) = req.headers().get(name).and_then(|v| v.to_str().ok()) {
            return parse_emby_auth_header(v);
        }
    }
    EmbyAuth::default()
}

/// The access token a request carries, in the order clients prefer to send it.
pub fn extract_token(req: &HttpRequest) -> Option<String> {
    for name in ["x-emby-token", "x-mediabrowser-token"] {
        if let Some(v) = req.headers().get(name).and_then(|v| v.to_str().ok()) {
            let t = v.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    for name in ["x-emby-authorization", "authorization"] {
        if let Some(v) = req.headers().get(name).and_then(|v| v.to_str().ok()) {
            if let Some(t) = parse_emby_auth_header(v).token.filter(|t| !t.is_empty()) {
                return Some(t);
            }
        }
    }
    // Streaming URLs can't carry headers in every client, so the token also
    // travels as a query parameter there.
    let pairs: Vec<(String, String)> =
        serde_urlencoded::from_str(req.query_string()).unwrap_or_default();
    pairs
        .into_iter()
        .find(|(k, v)| {
            !v.is_empty() && (k.eq_ignore_ascii_case("api_key") || k.eq_ignore_ascii_case("apikey"))
        })
        .map(|(_, v)| v)
}

pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub async fn ensure_tables(pool: &Pool<Postgres>) -> Result<(), Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS jellyfin_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_id TEXT,
            device_name TEXT,
            client TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS jellyfin_tokens_user_id_idx ON jellyfin_tokens (user_id)"#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS jellyfin_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Verify a handle + API key pair. Same check the Subsonic service makes, so a
/// user needs no second credential to add this server to a Jellyfin client.
pub async fn verify_credentials(
    pool: &Pool<Postgres>,
    username: &str,
    password: &str,
) -> Result<AuthedUser, Error> {
    let user =
        rocksky_navidrome::auth::authenticate(pool, username, Some(password), None, None).await?;
    Ok(AuthedUser {
        id: user.xata_id,
        handle: user.handle,
        display_name: user.display_name,
        avatar: user.avatar,
    })
}

pub async fn store_token(
    pool: &Pool<Postgres>,
    token: &str,
    user_id: &str,
    auth: &EmbyAuth,
) -> Result<(), Error> {
    sqlx::query(
        r#"
        INSERT INTO jellyfin_tokens (token, user_id, device_id, device_name, client)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (token) DO NOTHING
        "#,
    )
    .bind(token)
    .bind(user_id)
    .bind(auth.device_id.as_deref())
    .bind(auth.device.as_deref())
    .bind(auth.client.as_deref())
    .execute(pool)
    .await?;
    Ok(())
}

/// Token → user, cached briefly so a client hammering `/Items` doesn't turn
/// every request into two queries. Short enough that a revoked token stops
/// working promptly.
const TOKEN_TTL: Duration = Duration::from_secs(60);

static TOKEN_CACHE: OnceLock<Mutex<HashMap<String, (AuthedUser, Instant)>>> = OnceLock::new();

fn token_cache() -> &'static Mutex<HashMap<String, (AuthedUser, Instant)>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub async fn resolve_token(pool: &Pool<Postgres>, token: &str) -> Option<AuthedUser> {
    {
        let cache = token_cache().lock().unwrap();
        if let Some((user, at)) = cache.get(token) {
            if at.elapsed() < TOKEN_TTL {
                return Some(user.clone());
            }
        }
    }

    let user: Option<AuthedUser> = sqlx::query_as(
        r#"
        SELECT users.xata_id, users.handle, users.display_name, users.avatar
        FROM jellyfin_tokens
        JOIN users ON users.xata_id = jellyfin_tokens.user_id
        WHERE jellyfin_tokens.token = $1
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    if let Some(u) = &user {
        let mut cache = token_cache().lock().unwrap();
        if cache.len() >= 10_000 {
            cache.clear();
        }
        cache.insert(token.to_string(), (u.clone(), Instant::now()));
    }
    user
}

/// Authorize a request that can't use the extractor — the streaming endpoints,
/// which clients call with `?api_key=` and no headers at all.
pub async fn authorize(req: &HttpRequest, state: &AppState) -> Option<AuthedUser> {
    let token = extract_token(req)?;
    resolve_token(&state.pool, &token).await
}

impl FromRequest for AuthedUser {
    type Error = actix_web::Error;
    type Future = LocalBoxFuture<'static, Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let token = extract_token(req);
        let state = req.app_data::<web::Data<AppState>>().cloned();
        Box::pin(async move {
            let token = token.ok_or_else(|| ErrorUnauthorized("missing access token"))?;
            let state = state.ok_or_else(|| {
                actix_web::error::ErrorInternalServerError("jellyfin state missing")
            })?;
            resolve_token(&state.pool, &token)
                .await
                .ok_or_else(|| ErrorUnauthorized("invalid access token"))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::test::TestRequest;

    #[test]
    fn parses_mediabrowser_header() {
        let h = r#"MediaBrowser Client="Finamp", Device="iPhone", DeviceId="abc", Version="1.2", Token="tok""#;
        let a = parse_emby_auth_header(h);
        assert_eq!(a.client.as_deref(), Some("Finamp"));
        assert_eq!(a.device_id.as_deref(), Some("abc"));
        assert_eq!(a.token.as_deref(), Some("tok"));
    }

    #[test]
    fn ignores_commas_inside_quoted_values() {
        let h = r#"MediaBrowser Client="x", Device="My iPhone, Pro", Token="t""#;
        let a = parse_emby_auth_header(h);
        assert_eq!(a.device.as_deref(), Some("My iPhone, Pro"));
        assert_eq!(a.token.as_deref(), Some("t"));
    }

    #[test]
    fn token_header_wins_over_authorization() {
        let req = TestRequest::default()
            .insert_header(("X-Emby-Token", "header-token"))
            .insert_header(("Authorization", r#"MediaBrowser Token="auth-token""#))
            .to_http_request();
        assert_eq!(extract_token(&req).as_deref(), Some("header-token"));
    }

    #[test]
    fn api_key_query_is_url_decoded() {
        let req = TestRequest::default()
            .uri("/Audio/abc/stream?api_key=t%20ok&foo=bar")
            .to_http_request();
        assert_eq!(extract_token(&req).as_deref(), Some("t ok"));
    }

    #[test]
    fn no_credentials_yields_none() {
        let req = TestRequest::default().to_http_request();
        assert!(extract_token(&req).is_none());
    }
}
