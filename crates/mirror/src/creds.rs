//! Rotation pool for the credentials used by enrichment API calls.
//!
//! Spotify search and Last.fm `track.getInfo` both have per-key rate limits.
//! Instead of pinning enrichment to a single env-var key, we draw a random
//! active credential from the database on each call:
//!
//! * **Spotify** — `(spotify_app_id, spotify_secret)` rows from `spotify_apps`,
//!   used with the Client Credentials flow (no user scope). The secret is
//!   AES-256-CTR encrypted.
//! * **Last.fm** — decrypted `mirror_sources.encrypted_api_key` for rows where
//!   `provider = 'lastfm'` and a key is present. libsodium secretbox.
//!
//! Pools are refreshed in the background every 5 minutes. If a fetch fails
//! the cached snapshot is kept rather than going empty.

use rocksky_db::sea_query::{Expr, Query};
use rocksky_db::Backend;

use crate::schema::{MirrorSources, SpotifyApps};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Error;
use rand::seq::IndexedRandom;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::crypto;

const REFRESH_INTERVAL: Duration = Duration::from_secs(300);

#[derive(Clone, Default)]
pub struct CredentialPool {
    spotify: Arc<RwLock<Vec<SpotifyCred>>>,
    lastfm: Arc<RwLock<Vec<String>>>,
}

#[derive(Clone, Debug)]
pub struct SpotifyCred {
    pub client_id: String,
    pub client_secret: String,
}

impl CredentialPool {
    pub fn new() -> Self {
        Self::default()
    }

    /// Single refresh — used both for the initial load and by the background
    /// timer task. Logs counts; failures are logged but don't clear the cache.
    pub async fn refresh(&self, pool: &Backend) {
        match load_spotify(pool).await {
            Ok(rows) => {
                let n = rows.len();
                *self.spotify.write().await = rows;
                info!(count = n, "creds: refreshed Spotify pool");
            }
            Err(e) => warn!(error = %e, "creds: Spotify pool refresh failed"),
        }
        match load_lastfm(pool).await {
            Ok(rows) => {
                let n = rows.len();
                *self.lastfm.write().await = rows;
                info!(count = n, "creds: refreshed Last.fm pool");
            }
            Err(e) => warn!(error = %e, "creds: Last.fm pool refresh failed"),
        }
    }

    /// Spawn a long-running background task that refreshes the pools every
    /// [`REFRESH_INTERVAL`].
    pub fn spawn_refresher(&self, pool: Backend) {
        let this = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(REFRESH_INTERVAL).await;
                this.refresh(&pool).await;
            }
        });
    }

    pub async fn random_spotify(&self) -> Option<SpotifyCred> {
        let guard = self.spotify.read().await;
        let mut rng = rand::rng();
        guard.choose(&mut rng).cloned()
    }

    pub async fn random_lastfm(&self) -> Option<String> {
        let guard = self.lastfm.read().await;
        let mut rng = rand::rng();
        guard.choose(&mut rng).cloned()
    }
}

async fn load_spotify(pool: &Backend) -> Result<Vec<SpotifyCred>, Error> {
    let stmt = Query::select()
        .columns([SpotifyApps::SpotifyAppId, SpotifyApps::SpotifySecret])
        .from(SpotifyApps::Table)
        .to_owned();
    let rows: Vec<(String, String)> = pool.fetch_all(&stmt).await?;

    let mut out = Vec::with_capacity(rows.len());
    for (client_id, encrypted_secret) in rows {
        match crypto::decrypt_aes_256_ctr(&encrypted_secret) {
            Ok(secret) => out.push(SpotifyCred {
                client_id,
                client_secret: secret,
            }),
            Err(e) => warn!(error = %e, "creds: skipping undecryptable Spotify app secret"),
        }
    }
    Ok(out)
}

async fn load_lastfm(pool: &Backend) -> Result<Vec<String>, Error> {
    let stmt = Query::select()
        .column(MirrorSources::EncryptedApiKey)
        .from(MirrorSources::Table)
        .and_where(Expr::col(MirrorSources::Provider).eq("lastfm"))
        .and_where(Expr::col(MirrorSources::EncryptedApiKey).is_not_null())
        .to_owned();
    let rows: Vec<String> = pool.fetch_scalars(&stmt).await?;

    let mut out = Vec::with_capacity(rows.len());
    for enc in rows {
        match crypto::decrypt(&enc) {
            Ok(key) if !key.trim().is_empty() => out.push(key),
            Ok(_) => {}
            Err(e) => warn!(error = %e, "creds: skipping undecryptable Last.fm key"),
        }
    }
    Ok(out)
}
