//! Running a sea-query statement against Postgres.
//!
//! The services here used to build SQL by `format!`ing strings together and
//! counting `$1, $2, …` by hand. That works right up until a fragment moves, a
//! filter becomes conditional, or a projection is shared between two callers
//! that bind different things — at which point the placeholder numbers in the
//! text and the order of the `.bind()` calls drift apart, and the failure is a
//! runtime decode error on whichever page nobody opened while testing. The
//! Subsonic track search, the Jellyfin alpha rail and the album listing each
//! carried their own arithmetic for it.
//!
//! sea-query removes the arithmetic: a value is attached to the expression it
//! belongs to, and the builder numbers the placeholders when it renders. This
//! module is the seam where a built statement meets the database — the one
//! place that names [`PostgresQueryBuilder`].
//!
//! It lives here rather than in one of the services because all three of them
//! (Subsonic, Jellyfin, jetstream) need it, and because the executor is
//! whatever [`crate::Db`] hands out. Every function takes an
//! [`sqlx::PgExecutor`], so the same call works against a pool or inside a
//! transaction.

use sea_query::{
    DeleteStatement, InsertStatement, PostgresQueryBuilder, SelectStatement, UpdateStatement,
    WithQuery,
};
use sea_query_binder::{SqlxBinder, SqlxValues};
use sqlx::postgres::{PgQueryResult, PgRow};
use sqlx::{FromRow, PgExecutor, Postgres};

/// Anything this module can run: sea-query's five statement types.
pub trait Statement {
    fn build_pg(&self) -> (String, SqlxValues);
}

macro_rules! statement {
    ($type:ty) => {
        impl Statement for $type {
            fn build_pg(&self) -> (String, SqlxValues) {
                self.build_sqlx(PostgresQueryBuilder)
            }
        }
    };
}

statement!(SelectStatement);
statement!(InsertStatement);
statement!(UpdateStatement);
statement!(DeleteStatement);
statement!(WithQuery);

pub async fn fetch_all<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<Vec<T>, sqlx::Error>
where
    T: for<'r> FromRow<'r, PgRow> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_as_with::<Postgres, T, _>(&sql, values)
        .fetch_all(executor)
        .await
}

pub async fn fetch_optional<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<Option<T>, sqlx::Error>
where
    T: for<'r> FromRow<'r, PgRow> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_as_with::<Postgres, T, _>(&sql, values)
        .fetch_optional(executor)
        .await
}

pub async fn fetch_one<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<T, sqlx::Error>
where
    T: for<'r> FromRow<'r, PgRow> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_as_with::<Postgres, T, _>(&sql, values)
        .fetch_one(executor)
        .await
}

/// The single column of a single-column query — `COUNT(*)`, a `RETURNING id`,
/// one `album_art`.
pub async fn fetch_scalar<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<T, sqlx::Error>
where
    T: for<'r> sqlx::Decode<'r, Postgres> + sqlx::Type<Postgres> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_scalar_with::<Postgres, T, _>(&sql, values)
        .fetch_one(executor)
        .await
}

pub async fn fetch_scalar_optional<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<Option<T>, sqlx::Error>
where
    T: for<'r> sqlx::Decode<'r, Postgres> + sqlx::Type<Postgres> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_scalar_with::<Postgres, T, _>(&sql, values)
        .fetch_optional(executor)
        .await
}

/// Every value of a single-column query, in row order.
pub async fn fetch_scalars<T>(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<Vec<T>, sqlx::Error>
where
    T: for<'r> sqlx::Decode<'r, Postgres> + sqlx::Type<Postgres> + Send + Unpin,
{
    let (sql, values) = stmt.build_pg();
    sqlx::query_scalar_with::<Postgres, T, _>(&sql, values)
        .fetch_all(executor)
        .await
}

pub async fn execute(
    executor: impl PgExecutor<'_>,
    stmt: &impl Statement,
) -> Result<PgQueryResult, sqlx::Error> {
    let (sql, values) = stmt.build_pg();
    sqlx::query_with::<Postgres, _>(&sql, values)
        .execute(executor)
        .await
}

/// Run DDL — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
///
/// Schema statements carry no bound values, so they render to text alone and
/// take the plain `sqlx::query` path rather than the binder's.
pub async fn execute_schema(
    executor: impl PgExecutor<'_>,
    sql: String,
) -> Result<PgQueryResult, sqlx::Error> {
    sqlx::query(&sql).execute(executor).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_query::{Alias, Expr, Query};

    #[test]
    fn values_are_numbered_by_the_builder_not_by_hand() {
        let (sql, values) = Query::select()
            .column(Alias::new("handle"))
            .from(Alias::new("users"))
            .and_where(Expr::col(Alias::new("did")).eq("did:plc:alice"))
            .and_where(Expr::col(Alias::new("handle")).eq("alice.test"))
            .build_pg();

        assert_eq!(
            sql,
            r#"SELECT "handle" FROM "users" WHERE "did" = $1 AND "handle" = $2"#
        );
        assert_eq!(values.0 .0.len(), 2);
    }
}
