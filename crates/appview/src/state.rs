//! The shared handler context — the Rust counterpart of
//! `apps/api/src/context.ts`.
//!
//! The difference from the TypeScript `ctx` is what is *not* here: no Postgres
//! pool, no mandatory Redis client, no NATS connection, no Typesense client.
//! Those become optional accelerators ([`crate::cache`], [`crate::search`]) so
//! a zero-config instance still boots with nothing but its SQLite file.

use crate::cache::Cache;
use crate::config::Config;
use crate::db::{Backend, Dialect};
use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::Duration;

pub struct AppStateInner {
    pub config: Config,
    /// The appview projections (users, scrobbles, catalogue, …), on SQLite or
    /// an existing Postgres.
    pub db: Backend,
    /// OAuth sessions, OAuth state and the DID document cache. Always a local
    /// SQLite file, and separate from the projections so wiping those to
    /// re-index never logs anyone out — a real operation on a self-hosted box.
    pub auth_db: SqlitePool,
    /// Outbound HTTP for companion services and the ATProto network.
    pub http: reqwest::Client,
    pub cache: Cache,
    /// The OAuth client. `None` when it could not be built, which leaves
    /// app-password login working rather than refusing to start.
    pub oauth: Option<Arc<crate::oauth::OauthService>>,
}

/// Cheap to clone; every actix worker thread shares one.
#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let db = Backend::connect(&config.database_url).await?;
        let auth_db = crate::db::connect_auth(&config.auth_database_url).await?;

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("rocksky-appview/", env!("CARGO_PKG_VERSION")))
            .build()?;

        let cache = Cache::new(config.redis_url.as_deref()).await;

        // A broken OAuth setup must not take the instance down: app-password
        // login and every read endpoint work without it, and the login route
        // reports the reason.
        let oauth = match crate::oauth::OauthService::new(&config, auth_db.clone(), http.clone()) {
            Ok(service) => Some(Arc::new(service)),
            Err(err) => {
                tracing::error!(error = %err, "OAuth login is unavailable");
                None
            }
        };

        Ok(Self(Arc::new(AppStateInner {
            config,
            db,
            auth_db,
            http,
            cache,
            oauth,
        })))
    }

    /// An all-in-memory state for tests.
    pub async fn for_test() -> anyhow::Result<Self> {
        Self::for_test_with(Config::for_test()).await
    }

    /// An all-in-memory state with a caller-supplied config, for tests that
    /// need to point the ATProto URLs at a stub server.
    pub async fn for_test_with(config: Config) -> anyhow::Result<Self> {
        let db = crate::db::connect_in_memory().await?;
        let auth_db = crate::db::connect_auth(&config.auth_database_url).await?;

        Ok(Self(Arc::new(AppStateInner {
            config,
            db,
            auth_db,
            http: reqwest::Client::new(),
            cache: Cache::in_process(),
            // Tests that need OAuth build the service themselves.
            oauth: None,
        })))
    }

    /// A test state with a real OAuth service built from `config`.
    pub async fn for_test_with_oauth(config: Config) -> anyhow::Result<Self> {
        let db = crate::db::connect_in_memory().await?;
        let auth_db = crate::db::connect_auth(&config.auth_database_url).await?;
        let http = reqwest::Client::new();
        let oauth = Some(Arc::new(crate::oauth::OauthService::new(
            &config,
            auth_db.clone(),
            http.clone(),
        )?));

        Ok(Self(Arc::new(AppStateInner {
            config,
            db,
            auth_db,
            http,
            cache: Cache::in_process(),
            oauth,
        })))
    }

    pub fn db(&self) -> &Backend {
        &self.0.db
    }

    pub fn dialect(&self) -> Dialect {
        self.0.db.dialect()
    }

    /// Starts a statement in the active backend's dialect.
    pub fn sql(&self, text: impl Into<String>) -> crate::db::query::Sql {
        self.0.db.sql(text)
    }

    pub fn auth_db(&self) -> &SqlitePool {
        &self.0.auth_db
    }

    pub fn config(&self) -> &Config {
        &self.0.config
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.0.http
    }

    pub fn cache(&self) -> &Cache {
        &self.0.cache
    }

    /// The key credentials are encrypted at rest with.
    pub fn storage_encryption_key(&self) -> &str {
        &self.0.config.storage_encryption_key
    }

    pub fn oauth(&self) -> Option<&crate::oauth::OauthService> {
        self.0.oauth.as_deref()
    }
}

impl std::ops::Deref for AppState {
    type Target = AppStateInner;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
