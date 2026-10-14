//! Spotify application tokens, cached in memory and renewed before expiry.
//! Credentials and token responses are never logged or included in errors.
use anyhow::{ensure, Result};
use serde::Deserialize;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Clone)]
pub enum SpotifyAuth {
    Static(String),
    ClientCredentials(Arc<Credentials>),
}
pub struct Credentials {
    client_id: String,
    client_secret: String,
    endpoint: String,
    cached: Mutex<Option<(String, Instant)>>,
}
impl SpotifyAuth {
    pub fn client_credentials(
        client_id: String,
        client_secret: String,
        endpoint: String,
    ) -> Result<Self> {
        ensure!(
            !client_id.trim().is_empty() && !client_secret.trim().is_empty(),
            "Spotify client credentials must not be blank"
        );
        let url = reqwest::Url::parse(&endpoint)?;
        ensure!(
            url.scheme() == "https"
                || (url.scheme() == "http"
                    && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))),
            "Spotify token endpoint requires HTTPS (except loopback tests)"
        );
        Ok(Self::ClientCredentials(Arc::new(Credentials {
            client_id,
            client_secret,
            endpoint,
            cached: Mutex::new(None),
        })))
    }
    pub async fn token(&self, client: &reqwest::Client) -> Result<String> {
        let Self::ClientCredentials(credentials) = self else {
            let Self::Static(token) = self else {
                unreachable!()
            };
            return Ok(token.clone());
        };
        // Serialize renewal, so concurrent matching requests share one token.
        let mut cached = credentials.cached.lock().await;
        if let Some((token, expiry)) = &*cached {
            if *expiry > Instant::now() {
                return Ok(token.clone());
            }
        }
        let started = Instant::now();
        let response = client
            .post(&credentials.endpoint)
            .basic_auth(&credentials.client_id, Some(&credentials.client_secret))
            .form(&[("grant_type", "client_credentials")])
            .send()
            .await?;
        ensure!(
            response.status().is_success(),
            "Spotify token endpoint returned HTTP {}",
            response.status().as_u16()
        );
        #[derive(Deserialize)]
        struct Token {
            access_token: String,
            token_type: String,
            expires_in: u64,
        }
        let token: Token = response.json().await?;
        ensure!(
            !token.access_token.is_empty()
                && token.token_type.eq_ignore_ascii_case("bearer")
                && token.expires_in > 0
                && token.expires_in <= 604800,
            "invalid Spotify token response"
        );
        let expiry = started + Duration::from_secs(token.expires_in.saturating_sub(30));
        *cached = Some((token.access_token.clone(), expiry));
        Ok(token.access_token)
    }
    pub async fn invalidate(&self, rejected: &str) {
        if let Self::ClientCredentials(credentials) = self {
            let mut cached = credentials.cached.lock().await;
            if cached.as_ref().is_some_and(|(token, _)| token == rejected) {
                *cached = None;
            }
        }
    }
}
