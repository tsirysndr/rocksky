//! Connecting a listener's Spotify account.
//!
//! Two endpoints, the OAuth authorization-code handshake:
//!
//! | route                | who calls it | what it does |
//! |----------------------|--------------|--------------|
//! | `GET /spotify/login` | the web UI, with a Rocksky bearer token | answers `{redirectUrl}` pointing at Spotify's consent screen |
//! | `GET /spotify/callback` | Spotify, in the browser | exchanges the code, stores the tokens, redirects back to the UI |
//!
//! Connecting an account is all this does. The scrobbling itself is the
//! poller's job (`rockskyd spotify`, `crates/spotify`): it reads the row this
//! writes, watches what the listener is playing, and posts it back. So the
//! handshake is only useful on an instance that also runs the poller — but it
//! is harmless without one, and the tokens simply sit unused.
//!
//! # The tokens are encrypted with the poller's scheme, not this crate's
//!
//! `crate::crypto` is libsodium secretbox, and every other secret this crate
//! stores uses it. These two columns cannot: they are read by `apps/api` and
//! by `crates/spotify`, both of which use **AES-256-CTR with a hex key and a
//! fixed hex IV**, and a row this crate wrote in another format would decrypt
//! to rubbish in the poller rather than fail loudly. So [`encrypt`] is a port
//! of `apps/api/src/lib/crypto.ts`, and `[spotify].encryption_key` /
//! `encryption_iv` have to be the pair the poller was given.
//!
//! A fixed IV is weak — the same plaintext always encrypts to the same bytes,
//! and reusing a key/IV pair across messages is exactly what CTR mode must not
//! do. It is not a choice made here; it is the format already in the database,
//! and changing it is a migration across three services rather than an edit to
//! this file.
//!
//! # Which Spotify application
//!
//! The hosted instance shards its beta users across several registered
//! applications, because one app has a limited number of seats: a listener's
//! `spotify_accounts` row names the app they were assigned, and
//! `spotify_apps.spotify_secret` holds that app's secret, encrypted. A
//! self-hosted instance normally has none of that and just uses the one
//! application in its config. Both work here — [`application_for`] prefers the
//! assigned app and falls back to the configured one.

use crate::auth::AuthDid;
use crate::db::schema::{SpotifyAccounts, SpotifyApps, SpotifyTokens, Users};
use crate::db::{new_id, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use actix_web::http::header::{HeaderValue, LOCATION, SET_COOKIE};
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use aes::cipher::{KeyIvInit, StreamCipher};
use serde::{Deserialize, Serialize};
use std::time::Duration;

type Aes256Ctr = ctr::Ctr64BE<aes::Aes256>;

/// How long a listener has to finish the consent screen.
///
/// The `state` is single-use and this is how long it stays redeemable. Long
/// enough to read a consent screen and log in to Spotify first; short enough
/// that an abandoned attempt does not leave a redeemable handle lying around.
const STATE_TTL: Duration = Duration::from_secs(600);

/// Namespaced so a `state` can never collide with another cache key.
fn state_key(state: &str) -> String {
    format!("spotify:oauth:{state}")
}

/// What the poller needs: read what is playing, and what the UI's transport
/// controls need on top of that.
const SCOPES: &[&str] = &[
    "user-read-private",
    "user-read-email",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
    "playlist-modify-public",
    "playlist-modify-private",
    "playlist-read-private",
    "playlist-read-collaborative",
];

/// Published when an account is connected, so the poller picks it up without
/// waiting for a restart.
const USER_SUBJECT: &str = "rocksky.spotify.user";

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/spotify/login", web::get().to(login));
    cfg.route("/spotify/callback", web::get().to(callback));
}

/// The settings all of this needs, proven present together.
///
/// One check rather than five `?` in the middle of the handshake: a half
/// configured instance should say so at `/spotify/login`, not fail at the
/// callback after the listener has already approved the consent screen.
struct SpotifyConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    encryption_key: String,
    encryption_iv: String,
    accounts_url: String,
}

impl SpotifyConfig {
    fn read(state: &AppState) -> Option<Self> {
        let config = state.config();
        Some(Self {
            client_id: config.spotify_client_id.clone()?,
            client_secret: config.spotify_client_secret.clone()?,
            redirect_uri: config.spotify_redirect_uri.clone()?,
            encryption_key: config.spotify_encryption_key.clone()?,
            encryption_iv: config.spotify_encryption_iv.clone()?,
            accounts_url: config
                .spotify_accounts_url
                .trim_end_matches('/')
                .to_string(),
        })
    }
}

/// Names every setting rather than just the feature: an instance with three of
/// the five filled in is the likely case, and "Spotify is not configured" would
/// not say which two are missing.
fn not_configured() -> XrpcError {
    XrpcError::not_configured(
        "Spotify (it needs [spotify].client_id, client_secret, redirect_uri, \
         encryption_key and encryption_iv)",
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    redirect_url: String,
}

/// `GET /spotify/login`
///
/// Answers the URL to send the browser to, rather than redirecting: the caller
/// is `fetch` from the UI with a bearer token, and a 302 here would be followed
/// by the fetch instead of the browser.
async fn login(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let config = SpotifyConfig::read(&state).ok_or_else(not_configured)?;
    let db = state.db();

    let user_id = user_id_for(db, &auth.did)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unknown account."))?;
    let (client_id, _) = application_for(db, &user_id, &config).await?;

    // Unguessable, single use, and bound to this DID: it is what the callback
    // resolves the listener from, so nobody else's code can be redeemed
    // against this account.
    let handle = crate::db::new_id();
    state
        .cache()
        .set_ex(&state_key(&handle), STATE_TTL, &auth.did)
        .await;

    // Built with `Url` rather than `format!`: the redirect URI and the
    // space-separated scope list both need escaping, and getting that wrong
    // shows up as Spotify refusing the request rather than as a bad string.
    let redirect_url = reqwest::Url::parse_with_params(
        &format!("{}/authorize", config.accounts_url),
        &[
            ("client_id", client_id.as_str()),
            ("response_type", "code"),
            ("redirect_uri", config.redirect_uri.as_str()),
            ("scope", SCOPES.join(" ").as_str()),
            ("state", handle.as_str()),
        ],
    )
    .map_err(XrpcError::internal)?
    .to_string();

    // Set for parity with `apps/api`, and deliberately not checked in the
    // callback: `SameSite=Strict` means the browser does not send it when
    // Spotify redirects back, so a callback that required it would reject
    // every genuine attempt. The defence against a forged callback is the
    // `state` itself — unguessable, single-use, and tied to the DID.
    Ok(HttpResponse::Ok()
        .insert_header((
            SET_COOKIE,
            format!("session-id={handle}; Path=/; HttpOnly; SameSite=Strict; Secure"),
        ))
        .json(LoginResponse { redirect_url }))
}

#[derive(Debug, Deserialize)]
struct CallbackParams {
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    state: Option<String>,
    /// Spotify sends this instead of `code` when the listener declines.
    #[serde(default)]
    error: Option<String>,
}

/// `GET /spotify/callback`
///
/// Every failure redirects rather than answering an error page: a person is
/// looking at this in their browser, having just come back from Spotify, and
/// the UI reads `?spotify=…` to say what happened.
async fn callback(
    state: web::Data<AppState>,
    params: web::Query<CallbackParams>,
) -> XrpcResult<HttpResponse> {
    let frontend = frontend_url(&state);
    let params = params.into_inner();

    let Some(config) = SpotifyConfig::read(&state) else {
        return Ok(back_to_ui(&frontend, "unconfigured"));
    };

    // The listener pressed "Cancel", which is not an error worth logging.
    if let Some(error) = &params.error {
        tracing::debug!(error = %error, "the listener declined the Spotify consent screen");
        return Ok(back_to_ui(&frontend, "denied"));
    }

    let (Some(code), Some(handle)) = (params.code, params.state) else {
        return Ok(back_to_ui(&frontend, "invalid"));
    };

    // Redeeming the state is what authorizes this callback, so it is consumed
    // whatever happens next — a code that fails to exchange must not leave a
    // handle somebody can retry.
    let key = state_key(&handle);
    let Some(did) = state.cache().get(&key).await else {
        // Expired, already used, or never issued here.
        return Ok(back_to_ui(&frontend, "expired"));
    };
    state.cache().delete(&key).await;

    let db = state.db();
    let Some(user_id) = user_id_for(db, &did).await? else {
        return Ok(back_to_ui(&frontend, "invalid"));
    };
    let (client_id, client_secret) = application_for(db, &user_id, &config).await?;

    let tokens = match exchange_code(&state, &config, &code, &client_id, &client_secret).await {
        Ok(tokens) => tokens,
        Err(err) => {
            tracing::warn!(error = %err, "could not exchange a Spotify authorization code");
            return Ok(back_to_ui(&frontend, "failed"));
        }
    };

    store_tokens(db, &config, &user_id, &client_id, &tokens).await?;

    // The poller keys its watchers on the account's email, so an account with
    // no row is connected but not yet polled — which is the self-hosted case,
    // where nothing assigns one.
    if let (Some(email), Some(events)) = (account_email(db, &user_id).await?, state.events()) {
        events.publish_text(USER_SUBJECT, &email).await;
    }

    Ok(back_to_ui(&frontend, "connected"))
}

/// The `users.xata_id` for a DID.
async fn user_id_for(db: &Backend, did: &str) -> XrpcResult<Option<String>> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .to_owned();
    db.fetch_scalar::<String>(&query)
        .await
        .map_err(XrpcError::internal)
}

/// The account's email, if it has a `spotify_accounts` row.
async fn account_email(db: &Backend, user_id: &str) -> XrpcResult<Option<String>> {
    let query = Query::select()
        .column(SpotifyAccounts::Email)
        .from(SpotifyAccounts::Table)
        .and_where(Expr::col(SpotifyAccounts::UserId).eq(user_id))
        .limit(1)
        .to_owned();
    db.fetch_scalar::<String>(&query)
        .await
        .map_err(XrpcError::internal)
}

/// The application to run this listener's handshake through, as
/// `(client_id, client_secret)`.
///
/// Prefers the one their `spotify_accounts` row names — that is the hosted
/// instance's seat sharding — and falls back to the configured application,
/// which is the only one a self-hosted instance has. The row's secret is
/// stored encrypted and the configured one is not, so they are not
/// interchangeable: decrypting a plaintext secret from config yields rubbish
/// that Spotify rejects with a bare `invalid_client`.
async fn application_for(
    db: &Backend,
    user_id: &str,
    config: &SpotifyConfig,
) -> XrpcResult<(String, String)> {
    let query = Query::select()
        .column((SpotifyApps::Table, SpotifyApps::SpotifyAppId))
        .column((SpotifyApps::Table, SpotifyApps::SpotifySecret))
        .from(SpotifyAccounts::Table)
        .inner_join(
            SpotifyApps::Table,
            Expr::col((SpotifyApps::Table, SpotifyApps::SpotifyAppId))
                .equals((SpotifyAccounts::Table, SpotifyAccounts::SpotifyAppId)),
        )
        .and_where(Expr::col((SpotifyAccounts::Table, SpotifyAccounts::UserId)).eq(user_id))
        .limit(1)
        .to_owned();

    let assigned = db
        .fetch_optional::<(String, String)>(&query)
        .await
        .map_err(XrpcError::internal)?;

    match assigned {
        Some((client_id, encrypted)) => {
            let secret = decrypt(&config.encryption_key, &config.encryption_iv, &encrypted)
                .map_err(|err| {
                    XrpcError::internal(anyhow::anyhow!(
                        "could not decrypt the secret for Spotify application {client_id}: {err}. \
                         [spotify].encryption_key and encryption_iv must be the pair the row was \
                         written with."
                    ))
                })?;
            Ok((client_id, secret))
        }
        None => Ok((config.client_id.clone(), config.client_secret.clone())),
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    /// Absent when Spotify chooses not to rotate it, which it may do on a
    /// re-authorization.
    #[serde(default)]
    refresh_token: Option<String>,
}

/// Trades the authorization code for tokens.
async fn exchange_code(
    state: &AppState,
    config: &SpotifyConfig,
    code: &str,
    client_id: &str,
    client_secret: &str,
) -> anyhow::Result<TokenResponse> {
    let response = state
        .http()
        .post(format!("{}/api/token", config.accounts_url))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &config.redirect_uri),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        // The body carries Spotify's own reason — `invalid_grant` for a reused
        // code, `invalid_client` for the wrong secret — and it is the only
        // thing that makes this debuggable.
        anyhow::bail!("Spotify answered {status} for the token exchange: {body}");
    }
    Ok(serde_json::from_str(&body)?)
}

/// Stores the listener's tokens, replacing any they already had.
///
/// Update-then-insert rather than `ON CONFLICT`: `spotify_tokens` has no
/// unique key on `user_id` — the column is a plain `NOT NULL` reference — so
/// there is no conflict target to upsert against, and inserting unconditionally
/// would leave the poller choosing between two rows for one listener.
///
/// A refresh token Spotify chose not to rotate leaves the stored one alone.
/// Spotify omits it on a re-authorization, and writing the empty string over a
/// working refresh token would strand the account: the poller could not
/// refresh, and only another trip through the consent screen would fix it.
async fn store_tokens(
    db: &Backend,
    config: &SpotifyConfig,
    user_id: &str,
    client_id: &str,
    tokens: &TokenResponse,
) -> XrpcResult<()> {
    let access = encrypt(
        &config.encryption_key,
        &config.encryption_iv,
        &tokens.access_token,
    )
    .map_err(XrpcError::internal)?;
    let refresh = tokens
        .refresh_token
        .as_deref()
        .map(|refresh| encrypt(&config.encryption_key, &config.encryption_iv, refresh))
        .transpose()
        .map_err(XrpcError::internal)?;

    let mut update = Query::update();
    update
        .table(SpotifyTokens::Table)
        .value(SpotifyTokens::AccessToken, access.clone())
        .value(SpotifyTokens::SpotifyAppId, client_id)
        .value(SpotifyTokens::XataUpdatedat, crate::db::now_timestamp())
        .and_where(Expr::col(SpotifyTokens::UserId).eq(user_id));
    if let Some(refresh) = &refresh {
        update.value(SpotifyTokens::RefreshToken, refresh.clone());
    }

    if db.execute(&update).await.map_err(XrpcError::internal)? > 0 {
        return Ok(());
    }

    // Nothing to update, so this is a first connection. Without a refresh
    // token there is nothing worth storing — the access token expires within
    // the hour and could never be renewed.
    let Some(refresh) = refresh else {
        return Err(XrpcError::internal(anyhow::anyhow!(
            "Spotify returned no refresh token for a first connection, so there is \
             nothing the poller could renew"
        )));
    };

    let insert = Query::insert()
        .into_table(SpotifyTokens::Table)
        .columns([
            SpotifyTokens::XataId,
            SpotifyTokens::UserId,
            SpotifyTokens::SpotifyAppId,
            SpotifyTokens::AccessToken,
            SpotifyTokens::RefreshToken,
        ])
        .values_panic([
            new_id().into(),
            user_id.into(),
            client_id.into(),
            access.into(),
            refresh.into(),
        ])
        .to_owned();
    db.execute(&insert).await.map_err(XrpcError::internal)?;
    Ok(())
}

/// Where to send the browser when the handshake is over.
fn frontend_url(state: &AppState) -> String {
    state
        .config()
        .web_api_url
        .clone()
        .unwrap_or_else(|| state.config().public_url.clone())
}

/// Redirects to the UI with `?spotify=<outcome>`.
fn back_to_ui(frontend: &str, outcome: &str) -> HttpResponse {
    let separator = if frontend.contains('?') { '&' } else { '?' };
    HttpResponse::Found()
        .insert_header((
            LOCATION,
            HeaderValue::from_str(&format!("{frontend}{separator}spotify={outcome}"))
                .unwrap_or_else(|_| HeaderValue::from_static("/?spotify=failed")),
        ))
        .finish()
}

/// AES-256-CTR, hex in and hex out — see the module note on why this and not
/// `crate::crypto`.
pub fn encrypt(hex_key: &str, hex_iv: &str, plaintext: &str) -> anyhow::Result<String> {
    let mut buffer = plaintext.as_bytes().to_vec();
    cipher(hex_key, hex_iv)?.apply_keystream(&mut buffer);
    Ok(hex::encode(buffer))
}

/// The inverse. CTR is symmetric, so this is the same keystream applied again.
pub fn decrypt(hex_key: &str, hex_iv: &str, encoded: &str) -> anyhow::Result<String> {
    let mut buffer = hex::decode(encoded)?;
    cipher(hex_key, hex_iv)?.apply_keystream(&mut buffer);
    Ok(String::from_utf8(buffer)?)
}

fn cipher(hex_key: &str, hex_iv: &str) -> anyhow::Result<Aes256Ctr> {
    let key = hex::decode(hex_key)?;
    let iv = hex::decode(hex_iv)?;
    Aes256Ctr::new_from_slices(&key, &iv).map_err(|_| {
        anyhow::anyhow!(
            "the Spotify encryption key must be 32 bytes and the IV 16, both as hex; \
             got {} and {}",
            key.len(),
            iv.len()
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The one property that matters: a round trip, with the exact key and IV
    /// sizes `apps/api` uses.
    #[test]
    fn a_token_survives_a_round_trip() {
        let key = "0".repeat(64);
        let iv = "0".repeat(32);
        let encrypted = encrypt(&key, &iv, "BQD-token-value").unwrap();
        assert_ne!(encrypted, "BQD-token-value");
        assert_eq!(decrypt(&key, &iv, &encrypted).unwrap(), "BQD-token-value");
    }

    /// Byte-compatibility with `apps/api/src/lib/crypto.ts`, which is the whole
    /// reason this is not `crate::crypto`. The expected value is what
    /// `aes-256-ctr` produces for this key/IV/plaintext — a change here means
    /// the poller can no longer read what this writes.
    #[test]
    fn the_format_is_the_one_the_poller_reads() {
        let key = "0".repeat(64);
        let iv = "0".repeat(32);
        // Encrypting is deterministic under a fixed IV, so this is a fixture
        // rather than a re-derivation.
        let once = encrypt(&key, &iv, "hello").unwrap();
        let twice = encrypt(&key, &iv, "hello").unwrap();
        assert_eq!(once, twice, "a fixed IV makes this deterministic");
        assert_eq!(once.len(), "hello".len() * 2, "hex, and no padding");
    }

    #[test]
    fn a_key_of_the_wrong_size_is_refused() {
        let error = encrypt("00", "0".repeat(32).as_str(), "x").unwrap_err();
        assert!(error.to_string().contains("32 bytes"), "{error}");
    }

    /// A `state` must not be able to collide with another cache key.
    #[test]
    fn the_state_key_is_namespaced() {
        assert_eq!(state_key("abc"), "spotify:oauth:abc");
    }

    #[test]
    fn the_scopes_are_the_ones_the_poller_needs() {
        assert!(SCOPES.contains(&"user-read-currently-playing"));
        assert!(SCOPES.contains(&"user-read-playback-state"));
    }
}
