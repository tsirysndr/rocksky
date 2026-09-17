//! Running a statement against whichever database a service got.
//!
//! [`crate::Backend`] already has these methods; this module exists for the
//! *shape* the services were written in — `sql::fetch_all(pool, &stmt)`, with
//! the executor first — so a service can move off Postgres-only `sqlx` calls
//! by changing its imports rather than every call site.
//!
//! # What was here before
//!
//! Each service used to call `sqlx` directly with `PostgresQueryBuilder`, and
//! `rocksky-pgurl::sql` was "the one place that names PostgresQueryBuilder".
//! That is the line this module replaces: the dialect is a property of the
//! connection — `?` on SQLite, `$1` on Postgres — so `Backend` renders each
//! statement for the backend it is about to run on, and nothing above it
//! chooses a builder.
//!
//! # Transactions
//!
//! A transaction is not an executor here. `sqlx`'s transactions are typed by
//! driver, so a transaction that could be either is its own type — [`crate::tx::Tx`]
//! — with the same methods on it. Call those directly: `tx.execute(&stmt)`.

use crate::Backend;
use sqlx::postgres::PgRow;
use sqlx::sqlite::SqliteRow;
use sqlx::FromRow;

/// Anything these functions can run.
///
/// Re-exported from `rocksky-db` rather than redefined: a second trait with
/// the same name and the same five implementations would mean every statement
/// builder had to say which one it satisfied.
pub use crate::prepared::Statement;

/// A row type that decodes from either backend.
///
/// Spelled out once because it is four bounds and appears on every function
/// below. A struct deriving `FromRow` satisfies it when all of its fields do —
/// the exceptions are the Postgres-only types, `Vec<String>` for `text[]`
/// above all, which have to be read differently per backend.
pub trait Row: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow> {}

impl<T> Row for T where T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>
{}

/// A scalar that decodes from either backend.
pub trait Scalar:
    Send
    + Unpin
    + for<'r> sqlx::Decode<'r, sqlx::Sqlite>
    + sqlx::Type<sqlx::Sqlite>
    + for<'r> sqlx::Decode<'r, sqlx::Postgres>
    + sqlx::Type<sqlx::Postgres>
{
}

impl<T> Scalar for T where
    T: Send
        + Unpin
        + for<'r> sqlx::Decode<'r, sqlx::Sqlite>
        + sqlx::Type<sqlx::Sqlite>
        + for<'r> sqlx::Decode<'r, sqlx::Postgres>
        + sqlx::Type<sqlx::Postgres>
{
}

pub async fn fetch_all<T: Row>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<Vec<T>, sqlx::Error> {
    db.fetch_all(stmt).await
}

pub async fn fetch_optional<T: Row>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<Option<T>, sqlx::Error> {
    db.fetch_optional(stmt).await
}

/// The one row a query must return.
///
/// `RowNotFound` when there is none, which is `sqlx`'s own error for it — the
/// callers that use this are the ones for which no row is a bug rather than an
/// outcome.
pub async fn fetch_one<T: Row>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<T, sqlx::Error> {
    db.fetch_optional(stmt)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

/// The single column of a single-column query — `COUNT(*)`, a `RETURNING id`,
/// one `album_art`.
pub async fn fetch_scalar<T: Scalar>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<T, sqlx::Error> {
    db.fetch_scalar(stmt).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn fetch_scalar_optional<T: Scalar>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<Option<T>, sqlx::Error> {
    db.fetch_scalar(stmt).await
}

/// Every value of a single-column query, in row order.
pub async fn fetch_scalars<T: Scalar>(
    db: &Backend,
    stmt: &(impl Statement + ?Sized),
) -> Result<Vec<T>, sqlx::Error> {
    db.fetch_scalars(stmt).await
}

/// Runs a statement, returning how many rows it affected.
///
/// Note the return type: a row count, not a driver's `QueryResult`. A caller
/// that wanted `rows_affected()` now has it directly, and one that ignored the
/// result is unaffected.
pub async fn execute(db: &Backend, stmt: &(impl Statement + ?Sized)) -> Result<u64, sqlx::Error> {
    db.execute(stmt).await
}

/// Run DDL — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
///
/// Schema statements carry no bound values, so they are text alone.
///
/// The text has to be rendered for the right dialect by the caller, which is
/// the one thing this cannot do for them: sea-query's `Table::create()` output
/// differs between backends in more than placeholders — column types, most of
/// all — so [`schema_builder`] hands out the builder that matches.
pub async fn execute_schema(db: &Backend, sql: String) -> Result<u64, sqlx::Error> {
    db.execute(&db.sql(sql)).await
}

/// The schema builder for this connection's dialect.
///
/// For the services that create their own tables — Jellyfin's user and
/// playstate tables, which are its own and not part of the Rocksky schema.
/// `CREATE TABLE` is where the dialects differ most, so this is the one place
/// a service has to think about which it is on.
pub fn schema_builder(db: &Backend) -> SchemaBuilder {
    match db.dialect() {
        crate::Dialect::Sqlite => SchemaBuilder::Sqlite,
        crate::Dialect::Postgres => SchemaBuilder::Postgres,
    }
}

/// Which builder [`schema_builder`] chose, as something a caller can pass to
/// sea-query's `to_string`.
pub enum SchemaBuilder {
    Sqlite,
    Postgres,
}

impl SchemaBuilder {
    /// Renders a schema statement for this dialect.
    pub fn build<T: SchemaStatement>(&self, statement: &T) -> String {
        match self {
            SchemaBuilder::Sqlite => statement.to_sqlite(),
            SchemaBuilder::Postgres => statement.to_postgres(),
        }
    }
}

/// sea-query's schema statements, which have no common trait of their own.
pub trait SchemaStatement {
    fn to_sqlite(&self) -> String;
    fn to_postgres(&self) -> String;
}

macro_rules! schema_statement {
    ($type:ty) => {
        impl SchemaStatement for $type {
            fn to_sqlite(&self) -> String {
                self.to_string(sea_query::SqliteQueryBuilder)
            }
            fn to_postgres(&self) -> String {
                self.to_string(sea_query::PostgresQueryBuilder)
            }
        }
    };
}

schema_statement!(sea_query::TableCreateStatement);
schema_statement!(sea_query::IndexCreateStatement);
schema_statement!(sea_query::TableAlterStatement);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::Users;
    use sea_query::{Alias, Expr, Query};

    /// The placeholders follow the connection, not the code.
    ///
    /// This is the property the whole layer exists for: the same statement,
    /// rendered `?` for SQLite and `$1` for Postgres, with no call site
    /// choosing. A statement built for the wrong one binds nothing and matches
    /// nothing — silently, since it is valid SQL either way.
    #[tokio::test]
    async fn a_statement_is_rendered_for_the_connection() {
        use crate::prepared::Statement as _;

        let select = Query::select()
            .column(Alias::new("handle"))
            .from(Alias::new("users"))
            .and_where(Expr::col(Alias::new("did")).eq("did:plc:alice"))
            .and_where(Expr::col(Alias::new("handle")).eq("alice.test"))
            .to_owned();

        let sqlite = select.prepare(crate::Dialect::Sqlite);
        assert_eq!(
            sqlite.sql,
            r#"SELECT "handle" FROM "users" WHERE "did" = ? AND "handle" = ?"#
        );

        let postgres = select.prepare(crate::Dialect::Postgres);
        assert_eq!(
            postgres.sql,
            r#"SELECT "handle" FROM "users" WHERE "did" = $1 AND "handle" = $2"#
        );
    }

    /// A round trip through the compatibility functions, on SQLite — which is
    /// the backend they could not reach before.
    #[tokio::test]
    async fn the_helpers_work_on_sqlite() {
        let db = crate::connect_in_memory().await.unwrap();

        let inserted = execute(
            &db,
            &Query::insert()
                .into_table(Users::Table)
                .columns([Users::XataId, Users::Did, Users::Handle, Users::Avatar])
                .values_panic([
                    crate::new_id().into(),
                    "did:plc:alice".into(),
                    "alice.test".into(),
                    "".into(),
                ])
                .to_owned(),
        )
        .await
        .unwrap();
        assert_eq!(inserted, 1, "execute reports rows affected");

        let handle: String = fetch_scalar(
            &db,
            &Query::select()
                .column(Users::Handle)
                .from(Users::Table)
                .and_where(Expr::col(Users::Did).eq("did:plc:alice"))
                .to_owned(),
        )
        .await
        .unwrap();
        assert_eq!(handle, "alice.test");

        // And the optional forms distinguish "no row" from an error.
        let missing: Option<String> = fetch_scalar_optional(
            &db,
            &Query::select()
                .column(Users::Handle)
                .from(Users::Table)
                .and_where(Expr::col(Users::Did).eq("did:plc:nobody"))
                .to_owned(),
        )
        .await
        .unwrap();
        assert_eq!(missing, None);
    }

    /// `fetch_one` and `fetch_scalar` promise a row; no row is `RowNotFound`
    /// rather than a panic or a default.
    #[tokio::test]
    async fn a_required_row_that_is_missing_is_an_error() {
        let db = crate::connect_in_memory().await.unwrap();

        let result: Result<String, _> = fetch_scalar(
            &db,
            &Query::select()
                .column(Users::Handle)
                .from(Users::Table)
                .to_owned(),
        )
        .await;
        assert!(matches!(result, Err(sqlx::Error::RowNotFound)));
    }

    /// DDL differs between the backends in more than placeholders, so the
    /// builder has to match the connection.
    #[tokio::test]
    async fn schema_statements_follow_the_dialect() {
        let db = crate::connect_in_memory().await.unwrap();
        let builder = schema_builder(&db);

        let create = sea_query::Table::create()
            .table(Alias::new("jellyfin_users"))
            .if_not_exists()
            .col(
                sea_query::ColumnDef::new(Alias::new("id"))
                    .text()
                    .primary_key(),
            )
            .to_owned();

        let sql = builder.build(&create);
        assert!(sql.contains("jellyfin_users"), "{sql}");
        // It has to actually run on this connection, which is the point.
        execute_schema(&db, sql).await.unwrap();
    }
}

/// Implements [`sqlx::FromRow`] for a struct once, for **either** backend.
///
/// A hand-written `FromRow` names the row type, and the row types differ:
/// `PgRow` and `SqliteRow` share no trait that `try_get` is defined on, so an
/// impl for one does not compile for the other. Writing both means keeping two
/// field lists in step, and the failure when they drift is a runtime decode
/// error on whichever backend was not being tested.
///
/// So the impl is generic over `sqlx::Row` instead, with the bounds that
/// requires: every field type must decode from whatever database the row came
/// from. Fields are read by name, and the name is the field's own — which is
/// the convention these structs already followed.
///
/// ```ignore
/// from_row_any!(GenreRow {
///     genre: String,
///     song_count: i64,
///     album_count: i64,
/// });
/// ```
#[macro_export]
macro_rules! from_row_any {
    ($ty:ty { $($field:ident : $fty:ty),* $(,)? }) => {
        impl<'r, R> sqlx::FromRow<'r, R> for $ty
        where
            R: sqlx::Row,
            &'r str: sqlx::ColumnIndex<R>,
            $($fty: sqlx::Decode<'r, R::Database> + sqlx::Type<R::Database>,)*
        {
            fn from_row(row: &'r R) -> Result<Self, sqlx::Error> {
                use sqlx::Row as _;
                Ok(Self {
                    $($field: row.try_get(stringify!($field))?,)*
                })
            }
        }
    };
}
