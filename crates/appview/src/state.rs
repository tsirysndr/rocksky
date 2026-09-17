//! The shared handler context — the Rust counterpart of
//! `apps/api/src/context.ts`.
//!
//! The difference from the TypeScript `ctx` is the database: SQLite by default
//! rather than a mandatory Postgres, so a zero-config instance boots with
//! nothing but a file. Redis is a genuine accelerator ([`crate::cache`]) with
//! an in-process fallback. NATS ([`crate::events`]) and Typesense
//! ([`crate::search`]) are not — both are required, because neither has a
//! substitute and an instance without them would look healthy while its search
//! box and its scrobble mirrors did nothing.

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
    /// The event bus.
    ///
    /// `Option` only so tests can run without a broker. [`AppState::new`]
    /// *requires* a connection and fails without one, so on the real path this
    /// is always `Some` — see `crate::events` for why a fallback would be
    /// worse than a hard failure.
    pub events: Option<crate::events::Events>,
    /// The search index.
    ///
    /// `Option` for the same reason as `events`, and with the same guarantee:
    /// [`AppState::new`] requires it, so it is `None` only under test.
    pub search: Option<crate::search::Search>,
}

/// Cheap to clone; every actix worker thread shares one.
#[derive(Clone)]
pub struct AppState(Arc<AppStateInner>);

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let db = Backend::connect_split(&config.database_url, config.read_database_url.as_deref())
            .await?;
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

        // Required. Unlike OAuth, a missing bus is not survivable: the other
        // services learn about every like, every new account and every
        // scrobble through it, so publishing nowhere would leave a
        // healthy-looking instance with half the system stopped.
        let events = crate::events::Events::connect(&config.nats_url).await?;

        // Also required, and for the same reason.
        //
        // The collections are created here; *filling* them is not done here,
        // deliberately. Building the index for an existing database is
        // hundreds of thousands of documents, and doing it before the server
        // binds means a container that looks hung for several minutes while
        // flooding Typesense's write queue — at which point `GET /health`
        // answers `{"ok":false}`, the healthcheck fails, the container is
        // killed mid-import, and the next boot starts the same import again.
        // See `crate::search::spawn_backfill`.
        let search =
            crate::search::Search::connect(&config.typesense_url, &config.typesense_api_key)
                .await?;
        search.ensure_collections().await?;

        Ok(Self(Arc::new(AppStateInner {
            config,
            db,
            auth_db,
            http,
            cache,
            oauth,
            events: Some(events),
            search: Some(search),
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
            // No broker and no index in a test; both call sites check.
            events: None,
            search: None,
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
            events: None,
            search: None,
        })))
    }

    /// The event bus, when there is one.
    ///
    /// Always present outside tests — see [`AppStateInner::events`].
    pub fn events(&self) -> Option<&crate::events::Events> {
        self.0.events.as_ref()
    }

    /// The search index, when there is one.
    ///
    /// Always present outside tests — see [`AppStateInner::search`].
    pub fn search(&self) -> Option<&crate::search::Search> {
        self.0.search.as_ref()
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
