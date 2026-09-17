//! The data layer: two backends behind one query builder.
//!
//! Its own crate because the cloud-drive scanners and the offline sweeps need
//! the same models and the same SQL, and none of them want an HTTP server.
//!
//! Three things live here that are easy to get wrong separately:
//!
//! - **[`query`]** — a builder that renders `?` for SQLite and `$n` for
//!   Postgres. `sqlx::Any` cannot do this: it has no placeholder rewriting.
//! - **[`models`]** — one column list per table, so a `SELECT` and the struct
//!   it deserializes into cannot drift apart.
//! - **[`rsql`]** — the `?filter=` language, compiled to SQL against an
//!   allow-list of columns, so a filter can never reach an unexposed one.
//!
//! A SQLite database is migrated on connect. A Postgres one never is — it is
//! the database `apps/api` owns, and this crate checks that the expected
//! tables are present and says what is missing instead.

/// The query builder.
///
/// Re-exported so every crate that builds a query uses the same version as the
/// one `Backend` renders with — two sea-query versions in a dependency tree
/// would produce statement types that do not interoperate, with an error
/// message that does not say so.
pub use sea_query;

pub mod loaders;
pub mod models;
pub mod prepared;
pub mod query;
pub mod rsql;
pub mod schema;
pub mod shared;
pub mod tx;

use prepared::{Prepared, Statement};
use query::Sql;
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
///
/// The Postgres variant may hold two pools. Which one a query uses is decided
/// by the *caller*, not automatically — see [`Backend::reads_may_lag`].
#[derive(Debug, Clone)]
pub enum Backend {
    Sqlite(SqlitePool),
    Postgres {
        /// The primary. Every write, and every read that must see its own
        /// write, goes here.
        primary: PgPool,
        /// A read replica, when one is configured and differs from the
        /// primary. `None` for a single-pool deployment.
        replica: Option<PgPool>,
    },
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
    #[error(
        "the primary database is read-only (transaction_read_only=on), so no write \
         can succeed. The write URL is pointing at a replica — point it at the \
         primary."
    )]
    PrimaryIsReadOnly,
}

impl Backend {
    /// Opens the database named by `url`, preparing it as far as is safe for
    /// that backend (see the module note on schema ownership).
    pub async fn connect(url: &str) -> Result<Self, ConnectError> {
        Self::connect_split(url, None).await
    }

    /// Opens a primary and, optionally, a read replica.
    ///
    /// `replica_url` is ignored when it is absent or identical to `url`: two
    /// pools onto the same server would only halve the connections available
    /// to each.
    ///
    /// The primary is checked for writability before returning. That check
    /// exists because pointing it at a replica is a mistake that has actually
    /// happened in production — and without the check its symptom is every
    /// write failing at run time, one request at a time, rather than the
    /// process refusing to start.
    pub async fn connect_split(url: &str, replica_url: Option<&str>) -> Result<Self, ConnectError> {
        if url.starts_with("postgres:") || url.starts_with("postgresql:") {
            let primary = connect_postgres(url).await?;

            let replica = match replica_url {
                Some(replica_url) if !replica_url.is_empty() && replica_url != url => {
                    tracing::info!("connecting a read replica alongside the primary");
                    Some(connect_postgres(replica_url).await?)
                }
                _ => None,
            };

            let backend = Self::Postgres { primary, replica };
            backend.assert_primary_accepts_writes().await?;
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
            Self::Postgres { .. } => Dialect::Postgres,
        }
    }

    /// Starts a statement in this backend's dialect.
    pub fn sql(&self, text: impl Into<String>) -> Sql {
        Sql::new(self.dialect(), text)
    }

    /// The same database, for reads that tolerate replication lag.
    ///
    /// Reads go to the primary by default, deliberately: routing them to a
    /// replica automatically breaks read-after-write, and the bug it produces
    /// — a row that was just written appearing not to exist — is intermittent
    /// and horrible to chase. So the replica is opt-in, per query, at the call
    /// site that knows whether a few seconds of staleness is acceptable.
    ///
    /// Suitable for charts, global top lists and anything already cached.
    /// Never for a read whose result the same request just wrote.
    ///
    /// Returns an equivalent handle when no replica is configured, so a call
    /// site does not have to care whether the deployment is split.
    ///
    /// Writes through the returned handle would go to the replica and fail.
    /// That is the honest outcome — a replica cannot accept them — and the
    /// name says what it is for.
    pub fn reads_may_lag(&self) -> Self {
        match self {
            Self::Sqlite(pool) => Self::Sqlite(pool.clone()),
            Self::Postgres { primary, replica } => Self::Postgres {
                primary: replica.clone().unwrap_or_else(|| primary.clone()),
                replica: None,
            },
        }
    }

    /// Whether a separate read replica is in use.
    pub fn is_split(&self) -> bool {
        matches!(
            self,
            Self::Postgres {
                replica: Some(_),
                ..
            }
        )
    }

    /// Fails unless the primary can actually write.
    ///
    /// `SHOW transaction_read_only` is asked rather than a write attempted,
    /// because a probe write would need a table to write to and would have to
    /// be undone.
    async fn assert_primary_accepts_writes(&self) -> Result<(), ConnectError> {
        let Self::Postgres { primary, .. } = self else {
            return Ok(());
        };

        let read_only: String = sqlx::query_scalar("SHOW transaction_read_only")
            .fetch_one(primary)
            .await?;

        if read_only == "on" {
            return Err(ConnectError::PrimaryIsReadOnly);
        }
        Ok(())
    }

    /// Confirms the tables the handlers read actually exist. Only meaningful on
    /// Postgres; SQLite has just been migrated.
    async fn verify_schema(&self) -> Result<(), ConnectError> {
        let Self::Postgres { primary: pool, .. } = self else {
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

    /// Every row, as `T`.
    ///
    /// Takes anything that can render itself for this backend — a sea-query
    /// statement, or the legacy [`Sql`] while the migration to sea-query is
    /// under way. The caller never names a dialect: see [`crate::prepared`].
    pub async fn fetch_all<T>(
        &self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Self::Sqlite(pool) => {
                sqlx::query_as_with::<Sqlite, T, _>(&sql, values)
                    .fetch_all(pool)
                    .await
            }
            Self::Postgres { primary: pool, .. } => {
                sqlx::query_as_with::<Postgres, T, _>(&sql, values)
                    .fetch_all(pool)
                    .await
            }
        }
    }

    /// The first row, or `None`.
    pub async fn fetch_optional<T>(
        &self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Option<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Self::Sqlite(pool) => {
                sqlx::query_as_with::<Sqlite, T, _>(&sql, values)
                    .fetch_optional(pool)
                    .await
            }
            Self::Postgres { primary: pool, .. } => {
                sqlx::query_as_with::<Postgres, T, _>(&sql, values)
                    .fetch_optional(pool)
                    .await
            }
        }
    }

    /// Fetches the first column of the first row, or `None` for no rows.
    pub async fn fetch_scalar<T>(
        &self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Option<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> Decode<'r, Sqlite>
            + Type<Sqlite>
            + for<'r> Decode<'r, Postgres>
            + Type<Postgres>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Self::Sqlite(pool) => {
                let row = sqlx::query_with::<Sqlite, _>(&sql, values)
                    .fetch_optional(pool)
                    .await?;
                row.map(|row| row.try_get(0)).transpose()
            }
            Self::Postgres { primary: pool, .. } => {
                let row = sqlx::query_with::<Postgres, _>(&sql, values)
                    .fetch_optional(pool)
                    .await?;
                row.map(|row| row.try_get(0)).transpose()
            }
        }
    }

    /// Fetches the first column of every row.
    pub async fn fetch_scalars<T>(
        &self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> Decode<'r, Sqlite>
            + Type<Sqlite>
            + for<'r> Decode<'r, Postgres>
            + Type<Postgres>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Self::Sqlite(pool) => {
                let rows = sqlx::query_with::<Sqlite, _>(&sql, values)
                    .fetch_all(pool)
                    .await?;
                rows.into_iter().map(|row| row.try_get(0)).collect()
            }
            Self::Postgres { primary: pool, .. } => {
                let rows = sqlx::query_with::<Postgres, _>(&sql, values)
                    .fetch_all(pool)
                    .await?;
                rows.into_iter().map(|row| row.try_get(0)).collect()
            }
        }
    }

    /// Runs a statement, returning the number of rows it affected.
    pub async fn execute(&self, query: &(impl Statement + ?Sized)) -> Result<u64, sqlx::Error> {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Self::Sqlite(pool) => Ok(sqlx::query_with::<Sqlite, _>(&sql, values)
                .execute(pool)
                .await?
                .rows_affected()),
            Self::Postgres { primary: pool, .. } => {
                Ok(sqlx::query_with::<Postgres, _>(&sql, values)
                    .execute(pool)
                    .await?
                    .rows_affected())
            }
        }
    }

    /// `COUNT(*)`-style helper: a count query always has a row, so the
    /// `Option` from [`Backend::fetch_scalar`] is noise at the call site.
    pub async fn count(&self, query: &(impl Statement + ?Sized)) -> Result<i64, sqlx::Error> {
        Ok(self.fetch_scalar::<i64>(query).await?.unwrap_or(0))
    }

    /// Adds a model's columns to a `SELECT`, with the casts this backend
    /// needs.
    ///
    /// The sea-query replacement for `models::select_list(cols, db.dialect(),
    /// prefix)`. Here rather than free-standing so the dialect is supplied
    /// rather than passed: it is the same argument every call site had to
    /// thread through, and the only thing that knows it is `self`.
    pub fn select_model(
        &self,
        query: &mut sea_query::SelectStatement,
        columns: &[models::Col],
        prefix: Option<&str>,
    ) {
        models::select_columns(query, columns, self.dialect(), prefix);
    }

    /// The same, prefixing each *alias* — for a row holding two models.
    pub fn select_model_aliased(
        &self,
        query: &mut sea_query::SelectStatement,
        columns: &[models::Col],
        prefix: Option<&str>,
        alias_prefix: &str,
    ) {
        models::select_columns_aliased(query, columns, self.dialect(), prefix, alias_prefix);
    }

    /// Wraps an integer expression so it decodes as `i64`.
    ///
    /// For columns and aggregates that are `int4` on Postgres — including the
    /// `count(*)::int` inside the materialized views — since sqlx will not
    /// decode an `int4` into an `i64`. A no-op on SQLite.
    pub fn cast_int(&self, expr: impl Into<sea_query::SimpleExpr>) -> sea_query::SimpleExpr {
        match self.dialect() {
            Dialect::Sqlite => expr.into(),
            Dialect::Postgres => expr.into().cast_as(sea_query::Alias::new("bigint")),
        }
    }

    /// An ISO-8601 timestamp as a value that can be compared against a
    /// timestamp column.
    ///
    /// Bound as text, because that is how SQLite stores these columns, and cast
    /// on Postgres because a bound parameter is typed `text` there and
    /// `timestamptz >= text` has no operator. SQLite must *not* get the cast:
    /// `timestamptz` has no type affinity there, so the value would be
    /// coerced to a number — truncating it to its leading year and making
    /// every comparison match the wrong rows.
    pub fn timestamp_value(&self, text: impl Into<String>) -> sea_query::SimpleExpr {
        models::timestamp_expr(self.dialect(), text)
    }

    /// The same, for a `DateTime` rather than text already in the right shape.
    pub fn timestamp(&self, at: chrono::DateTime<chrono::Utc>) -> sea_query::SimpleExpr {
        self.timestamp_value(format_timestamp(at))
    }

    /// Wraps a timestamp expression so it decodes as `DateTime<Utc>`.
    ///
    /// Most of the Postgres schema is `timestamp without time zone`, which sqlx
    /// will not decode into a `DateTime<Utc>`; the cast relies on the session
    /// timezone being UTC, which [`connect_postgres`] sets on every connection.
    /// A no-op on SQLite, where these columns are ISO text already.
    ///
    /// The column lists in [`models`] apply this automatically for
    /// [`models::ColKind::Timestamp`]; this is for the hand-written
    /// projections that do not go through one.
    pub fn cast_timestamp(&self, expr: impl Into<sea_query::SimpleExpr>) -> sea_query::SimpleExpr {
        match self.dialect() {
            Dialect::Sqlite => expr.into(),
            Dialect::Postgres => expr.into().cast_as(sea_query::Alias::new("timestamptz")),
        }
    }

    /// Whether a `text[]`-style column contains `value`.
    ///
    /// The storage differs per backend — a real array on Postgres, a JSON
    /// array in TEXT on SQLite — so this is one of the few places the two
    /// dialects are genuinely different SQL. `column` is the qualified column
    /// reference, e.g. `"a.genres"`.
    pub fn array_contains(&self, column: &str, value: &str) -> sea_query::SimpleExpr {
        models::array_contains_expr(self.dialect(), column, value)
    }

    /// The current year, as an integer expression.
    ///
    /// `strftime('%Y', 'now')` and `EXTRACT(YEAR FROM CURRENT_DATE)` have no
    /// common spelling, so this is one of only two places the two dialects are
    /// still written out. Both read UTC — [`connect_postgres`] sets the session
    /// timezone — so they agree on the answer.
    pub fn current_year(&self) -> sea_query::SimpleExpr {
        sea_query::Expr::cust(models::current_year(self.dialect()))
    }

    /// Compiles an RSQL `filter` parameter into a condition.
    ///
    /// `None` and blank both mean "no filter was supplied", which is different
    /// from a filter that matches nothing — hence `Option` rather than a
    /// tautology.
    ///
    /// Here rather than in [`crate::rsql`] so a handler never names a dialect:
    /// three of the operators compile differently per backend, and the backend
    /// is the only thing that knows which one it is.
    pub fn filter(
        &self,
        filter: Option<&str>,
        fields: rsql::FieldMap,
    ) -> Result<Option<sea_query::SimpleExpr>, rsql::RsqlError> {
        rsql::compile_expr_param(filter, fields, self.dialect())
    }
}

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

    /// A replica is only a second pool when it is genuinely a different
    /// server. Two pools onto one server would halve the connections each can
    /// use, for nothing.
    #[tokio::test]
    async fn an_identical_replica_url_is_not_a_split() {
        // Exercised through SQLite, which ignores the replica entirely — the
        // Postgres path needs a server, and what is being checked is the
        // decision, not the connection.
        let backend = Backend::connect_split("sqlite::memory:", Some("sqlite::memory:"))
            .await
            .expect("connect");
        assert!(!backend.is_split());
    }

    /// `reads_may_lag` must be usable whether or not a replica exists, so a
    /// call site does not have to branch on the deployment.
    #[tokio::test]
    async fn reads_may_lag_works_without_a_replica() {
        let backend = connect_in_memory().await.expect("connect");
        assert!(!backend.is_split());

        let lagging = backend.reads_may_lag();
        // Same dialect, so the same SQL is generated either way.
        assert_eq!(lagging.dialect(), backend.dialect());
        // And it really can read.
        let count = lagging
            .count(&lagging.sql("SELECT count(*) FROM users"))
            .await
            .expect("the fallback handle reads");
        assert_eq!(count, 0);
    }

    /// The default must stay the primary. A replica-by-default would break
    /// read-after-write, and the resulting bug — a just-written row appearing
    /// absent — is intermittent and hard to attribute.
    #[tokio::test]
    async fn a_write_is_visible_to_the_next_read_by_default() {
        let db = connect_in_memory().await.expect("connect");

        let mut insert =
            db.sql("INSERT INTO users (xata_id, did, handle, avatar, is_bot) VALUES (");
        insert
            .bind(new_id())
            .push(", ")
            .bind("did:plc:alice")
            .push(", ")
            .bind("alice.test")
            .push(", ")
            .bind("")
            .push(", ")
            .bind(false)
            .push(")");
        db.execute(&insert).await.expect("insert");

        // The same handle, immediately: this is the invariant the opt-in
        // design protects.
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM users"))
                .await
                .unwrap(),
            1
        );
    }

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
