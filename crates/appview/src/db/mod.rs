//! Database access, over SQLite or Postgres.
//!
//! SQLite is the default and the point of this crate: a self-hosted instance
//! creates its own file and needs nothing else. Pointing `APPVIEW_DB_URL` at a
//! `postgres://` URL instead runs the same handlers against an existing Rocksky
//! database — which is how this binary can take over from `apps/api` without a
//! migration.
//!
//! **Schema ownership differs by backend, deliberately.** On SQLite the bundled
//! migrations create everything. On Postgres nothing is migrated from here:
//! drizzle in `apps/api` owns that schema, and a second migration runner
//! against a live database is how you corrupt one. [`Backend::connect`] checks
//! the expected tables are present and says what is missing instead.

pub mod loaders;
pub mod models;
pub mod query;

use query::{Arg, Sql};
use sqlx::postgres::{PgPool, PgPoolOptions, PgRow};
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteRow,
    SqliteSynchronous,
};
use sqlx::{Decode, FromRow, Postgres, Row, Sqlite, Type};
use std::str::FromStr;
use std::time::Duration;

/// Which SQL flavour the handlers should generate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Sqlite,
    Postgres,
}

/// A connection pool to whichever backend was configured.
#[derive(Debug, Clone)]
pub enum Backend {
    Sqlite(SqlitePool),
    Postgres(PgPool),
}

/// Rows the appview cannot run without. Checked on Postgres, where the schema
/// is someone else's to create.
const REQUIRED_TABLES: &[&str] = &[
    "users",
    "artists",
    "albums",
    "tracks",
    "scrobbles",
    "loved_tracks",
    "follows",
    "shouts",
    "notifications",
    "playlists",
    "playlist_tracks",
    "access_tokens",
    "api_keys",
];

#[derive(Debug, thiserror::Error)]
pub enum ConnectError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error(
        "the Postgres database is missing tables the appview needs: {0}. \
         Run the apps/api drizzle migrations against it first — this binary \
         does not migrate Postgres, so it cannot create them for you."
    )]
    IncompleteSchema(String),
    #[error("unrecognized database url {0:?}; expected a sqlite: or postgres: URL")]
    UnknownScheme(String),
}

impl Backend {
    /// Opens the database named by `url`, preparing it as far as is safe for
    /// that backend (see the module note on schema ownership).
    pub async fn connect(url: &str) -> Result<Self, ConnectError> {
        if url.starts_with("postgres:") || url.starts_with("postgresql:") {
            let backend = Self::Postgres(connect_postgres(url).await?);
            backend.verify_schema().await?;
            Ok(backend)
        } else if url.starts_with("sqlite:") || url.contains(":memory:") {
            let pool = connect_sqlite(url).await?;
            sqlx::migrate!("./migrations").run(&pool).await?;
            Ok(Self::Sqlite(pool))
        } else {
            Err(ConnectError::UnknownScheme(url.to_string()))
        }
    }

    pub fn dialect(&self) -> Dialect {
        match self {
            Self::Sqlite(_) => Dialect::Sqlite,
            Self::Postgres(_) => Dialect::Postgres,
        }
    }

    /// Starts a statement in this backend's dialect.
    pub fn sql(&self, text: impl Into<String>) -> Sql {
        Sql::new(self.dialect(), text)
    }

    /// Confirms the tables the handlers read actually exist. Only meaningful on
    /// Postgres; SQLite has just been migrated.
    async fn verify_schema(&self) -> Result<(), ConnectError> {
        let Self::Postgres(pool) = self else {
            return Ok(());
        };

        let present: Vec<String> = sqlx::query_scalar(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        )
        .fetch_all(pool)
        .await?;

        let missing: Vec<&str> = REQUIRED_TABLES
            .iter()
            .copied()
            .filter(|table| !present.iter().any(|p| p == table))
            .collect();

        if missing.is_empty() {
            Ok(())
        } else {
            Err(ConnectError::IncompleteSchema(missing.join(", ")))
        }
    }

    pub async fn fetch_all<T>(&self, sql: &Sql) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let text = sql.render();
        match self {
            Self::Sqlite(pool) => {
                bind_all!(sqlx::query_as::<Sqlite, T>(&text), sql.args())
                    .fetch_all(pool)
                    .await
            }
            Self::Postgres(pool) => {
                bind_all!(sqlx::query_as::<Postgres, T>(&text), sql.args())
                    .fetch_all(pool)
                    .await
            }
        }
    }

    pub async fn fetch_optional<T>(&self, sql: &Sql) -> Result<Option<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let text = sql.render();
        match self {
            Self::Sqlite(pool) => {
                bind_all!(sqlx::query_as::<Sqlite, T>(&text), sql.args())
                    .fetch_optional(pool)
                    .await
            }
            Self::Postgres(pool) => {
                bind_all!(sqlx::query_as::<Postgres, T>(&text), sql.args())
                    .fetch_optional(pool)
                    .await
            }
        }
    }

    /// Fetches the first column of the first row, or `None` for no rows.
    pub async fn fetch_scalar<T>(&self, sql: &Sql) -> Result<Option<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> Decode<'r, Sqlite>
            + Type<Sqlite>
            + for<'r> Decode<'r, Postgres>
            + Type<Postgres>,
    {
        let text = sql.render();
        match self {
            Self::Sqlite(pool) => {
                let row = bind_all!(sqlx::query::<Sqlite>(&text), sql.args())
                    .fetch_optional(pool)
                    .await?;
                row.map(|row| row.try_get(0)).transpose()
            }
            Self::Postgres(pool) => {
                let row = bind_all!(sqlx::query::<Postgres>(&text), sql.args())
                    .fetch_optional(pool)
                    .await?;
                row.map(|row| row.try_get(0)).transpose()
            }
        }
    }

    /// Fetches the first column of every row.
    pub async fn fetch_scalars<T>(&self, sql: &Sql) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> Decode<'r, Sqlite>
            + Type<Sqlite>
            + for<'r> Decode<'r, Postgres>
            + Type<Postgres>,
    {
        let text = sql.render();
        match self {
            Self::Sqlite(pool) => {
                let rows = bind_all!(sqlx::query::<Sqlite>(&text), sql.args())
                    .fetch_all(pool)
                    .await?;
                rows.into_iter().map(|row| row.try_get(0)).collect()
            }
            Self::Postgres(pool) => {
                let rows = bind_all!(sqlx::query::<Postgres>(&text), sql.args())
                    .fetch_all(pool)
                    .await?;
                rows.into_iter().map(|row| row.try_get(0)).collect()
            }
        }
    }

    /// Runs a statement, returning the number of rows it affected.
    pub async fn execute(&self, sql: &Sql) -> Result<u64, sqlx::Error> {
        let text = sql.render();
        match self {
            Self::Sqlite(pool) => Ok(bind_all!(sqlx::query::<Sqlite>(&text), sql.args())
                .execute(pool)
                .await?
                .rows_affected()),
            Self::Postgres(pool) => Ok(bind_all!(sqlx::query::<Postgres>(&text), sql.args())
                .execute(pool)
                .await?
                .rows_affected()),
        }
    }

    /// `COUNT(*)`-style helper: a count query always has a row, so the
    /// `Option` from [`Backend::fetch_scalar`] is noise at the call site.
    pub async fn count(&self, sql: &Sql) -> Result<i64, sqlx::Error> {
        Ok(self.fetch_scalar::<i64>(sql).await?.unwrap_or(0))
    }
}

/// Binds every [`Arg`] onto a query in order. A macro rather than a function
/// because the two drivers' query types are unrelated, and the `Null` arm has
/// to name a concrete type for the NULL to be encodable.
macro_rules! bind_all {
    ($query:expr, $args:expr) => {{
        let mut query = $query;
        for arg in $args {
            query = match arg {
                Arg::Text(value) => query.bind(value.clone()),
                Arg::Int(value) => query.bind(*value),
                Arg::Float(value) => query.bind(*value),
                Arg::Bool(value) => query.bind(*value),
                Arg::Null => query.bind(Option::<String>::None),
            };
        }
        query
    }};
}
use bind_all;

async fn connect_sqlite(url: &str) -> Result<SqlitePool, sqlx::Error> {
    let in_memory = url.contains(":memory:") || url.contains("mode=memory");

    let mut options = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10));

    if !in_memory {
        // WAL lets the read-heavy XRPC handlers run while the indexer writes;
        // the default journal would serialize them into lock contention.
        options = options
            .journal_mode(SqliteJournalMode::Wal)
            // NORMAL loses at most the last transaction on an OS crash, which
            // for a projection of the firehose is a re-index, not data loss.
            .synchronous(SqliteSynchronous::Normal);
    }

    SqlitePoolOptions::new()
        // A bare `:memory:` database is per-connection, so a larger pool would
        // hand out connections to *different* empty databases.
        .max_connections(if in_memory { 1 } else { 8 })
        .acquire_timeout(Duration::from_secs(30))
        .connect_with(options)
        .await
}

async fn connect_postgres(url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .idle_timeout(Duration::from_secs(30))
        .acquire_timeout(Duration::from_secs(10))
        // Most datetime columns in the Postgres schema are `timestamp without
        // time zone` holding UTC. The column lists cast them with
        // `::timestamptz` so they decode into `DateTime<Utc>`, and that cast
        // interprets the naive value in the *session* zone — so the session has
        // to be UTC or every timestamp shifts by the server's offset.
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET TIME ZONE 'UTC'").execute(conn).await?;
                Ok(())
            })
        })
        .connect(url)
        .await
}

/// Opens an in-memory SQLite database with the schema applied — the fixture
/// every handler test starts from.
pub async fn connect_in_memory() -> Result<Backend, ConnectError> {
    Backend::connect("sqlite::memory:").await
}

/// Mints a row id in the same shape as the `xata_id()` Postgres extension
/// (`rec_` + a 20-character xid), so ids stay portable across both backends.
pub fn new_id() -> String {
    format!("rec_{}", xid::new())
}

/// The timestamp format every SQLite `TEXT` datetime column uses: ISO-8601 UTC
/// with milliseconds and a `Z`. Matches the `strftime` defaults in the
/// migration, round-trips through sqlx's chrono decoder, and is accepted by
/// Postgres as a `timestamptz` literal.
pub const TIMESTAMP_FORMAT: &str = "%Y-%m-%dT%H:%M:%S%.3fZ";

pub fn format_timestamp(value: chrono::DateTime<chrono::Utc>) -> String {
    value.format(TIMESTAMP_FORMAT).to_string()
}

pub fn now_timestamp() -> String {
    format_timestamp(chrono::Utc::now())
}

/// Opens (creating if needed) the OAuth/session database and migrates it. This
/// one is always SQLite: it is this instance's own state, not shared with
/// `apps/api`, and keeping it local is what lets the projections be rebuilt
/// without logging anyone out.
pub async fn connect_auth(url: &str) -> Result<SqlitePool, ConnectError> {
    let pool = connect_sqlite(url).await?;
    migrate_auth(&pool).await?;
    Ok(pool)
}

/// Applies the auth migrations to an existing pool.
///
/// Separate from [`connect_auth`] so a test can apply them over tables
/// apps/api already created, which is what a real deployment does the first
/// time it points this binary at an existing `atproto.sqlite`.
pub async fn migrate_auth(pool: &SqlitePool) -> Result<(), ConnectError> {
    sqlx::migrate!("./migrations-auth").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrations_apply_to_a_fresh_sqlite_database() {
        let Backend::Sqlite(pool) = connect_in_memory().await.expect("migrate") else {
            panic!("expected sqlite");
        };

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .expect("list tables");

        for expected in REQUIRED_TABLES {
            assert!(
                tables.iter().any(|t| t == expected),
                "missing table {expected}; got {tables:?}"
            );
        }

        // Dropbox and Google Drive are deliberately absent — both are unused.
        assert!(
            !tables
                .iter()
                .any(|t| t.starts_with("dropbox") || t.starts_with("google_drive")),
            "cloud-drive tables should not exist: {tables:?}"
        );
    }

    #[tokio::test]
    async fn materialized_view_replacements_are_queryable_views() {
        let backend = connect_in_memory().await.expect("migrate");
        let Backend::Sqlite(pool) = &backend else {
            panic!("expected sqlite");
        };

        let views: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name")
                .fetch_all(pool)
                .await
                .expect("list views");
        assert_eq!(views, vec!["top_scrobblers_mv", "user_artists_mv"]);

        // Empty, but the SQL has to be valid against the real schema.
        let count = backend
            .count(&backend.sql("SELECT count(*) FROM top_scrobblers_mv"))
            .await
            .expect("query view");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn a_non_database_url_is_rejected_with_a_clear_message() {
        let err = Backend::connect("mysql://localhost/rocksky")
            .await
            .expect_err("mysql is not supported");
        assert!(matches!(err, ConnectError::UnknownScheme(_)), "{err:?}");
    }

    #[test]
    fn ids_match_the_postgres_extension_shape() {
        let id = new_id();
        assert!(id.starts_with("rec_"), "{id}");
        assert_eq!(id.len(), 24, "{id}");
        assert!(
            id[4..]
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
            "{id}"
        );
        assert_ne!(new_id(), new_id());
    }

    #[tokio::test]
    async fn timestamps_round_trip_through_chrono() {
        let backend = connect_in_memory().await.expect("migrate");

        let mut insert = backend.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
        insert
            .bind(new_id())
            .push(", ")
            .bind("did:plc:test")
            .push(", ")
            .bind("test.rocksky.app")
            .push(", ")
            .bind("https://example.invalid/a.png")
            .push(")");
        backend.execute(&insert).await.expect("insert");

        // The column default is written by strftime; it must decode as chrono,
        // which is exactly what the handler queries rely on.
        let created: chrono::DateTime<chrono::Utc> = backend
            .fetch_scalar(&backend.sql("SELECT xata_createdat FROM users"))
            .await
            .expect("query")
            .expect("one row");
        assert!(
            (chrono::Utc::now() - created).num_seconds().abs() < 60,
            "default timestamp should be ~now, got {created}"
        );
    }

    #[tokio::test]
    async fn bound_arguments_reach_the_database_in_order() {
        let backend = connect_in_memory().await.expect("migrate");

        for (did, handle) in [("did:plc:a", "a.test"), ("did:plc:b", "b.test")] {
            let mut insert =
                backend.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
            insert
                .bind(new_id())
                .push(", ")
                .bind(did)
                .push(", ")
                .bind(handle)
                .push(", ")
                .bind("x")
                .push(")");
            backend.execute(&insert).await.unwrap();
        }

        let mut select = backend.sql("SELECT handle FROM users WHERE did = ");
        select.bind("did:plc:b");
        let handle: Option<String> = backend.fetch_scalar(&select).await.unwrap();
        assert_eq!(handle.as_deref(), Some("b.test"));

        let mut in_list = backend.sql("SELECT count(*) FROM users WHERE did IN ");
        in_list.bind_list(vec!["did:plc:a", "did:plc:b", "did:plc:missing"]);
        assert_eq!(backend.count(&in_list).await.unwrap(), 2);
    }

    #[tokio::test]
    async fn an_empty_in_list_selects_nothing() {
        let backend = connect_in_memory().await.expect("migrate");
        let mut sql = backend.sql("SELECT count(*) FROM users WHERE did IN ");
        sql.bind_list(Vec::<String>::new());
        assert_eq!(backend.count(&sql).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn the_auth_database_migrates_separately() {
        let pool = connect_auth("sqlite::memory:").await.expect("migrate auth");
        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();
        for expected in ["auth_session", "auth_state", "did_cache"] {
            assert!(tables.iter().any(|t| t == expected), "{tables:?}");
        }
        // The projections must not leak into the session database.
        assert!(!tables.iter().any(|t| t == "scrobbles"), "{tables:?}");
    }
}
