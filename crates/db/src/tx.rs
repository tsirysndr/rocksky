//! A transaction that does not know which backend it is on.
//!
//! [`crate::Backend`] hides the difference between SQLite and Postgres for
//! single statements, but a few writes are only correct as a group — a playlist
//! and the rows linking it to its tracks, above all, where a half-written
//! playlist is worse than none. Those need a transaction, and a transaction is
//! typed by its driver: `sqlx::Transaction<'_, Postgres>` and
//! `Transaction<'_, Sqlite>` are different types with no common trait that
//! covers what is needed here.
//!
//! So this is the same enum-over-drivers shape as `Backend`, with the same
//! query methods, rendering each statement for the dialect it is about to run
//! on. A caller writes the statement once and never names a driver.
//!
//! # Why not a generic executor
//!
//! `sqlx` does have `Executor`, and the obvious move is to make every helper
//! generic over it. That fails on the row type: `FromRow<'_, PgRow>` and
//! `FromRow<'_, SqliteRow>` are separate bounds, so a generic function needs
//! both anyway *and* a way to pick the builder — which is exactly the match
//! below, only spread across every call site's type parameters. Keeping it
//! concrete here costs one `match` per method and nothing anywhere else.

use crate::prepared::{Prepared, Statement};
use crate::Dialect;
use sqlx::postgres::PgRow;
use sqlx::sqlite::SqliteRow;
use sqlx::{FromRow, Postgres, Sqlite};

/// An open transaction. Dropped without [`Tx::commit`], it rolls back — which
/// is `sqlx`'s behaviour, and the reason an early `?` is safe.
pub enum Tx<'c> {
    Sqlite(sqlx::Transaction<'c, Sqlite>),
    Postgres(sqlx::Transaction<'c, Postgres>),
}

impl Tx<'_> {
    pub fn dialect(&self) -> Dialect {
        match self {
            Tx::Sqlite(_) => Dialect::Sqlite,
            Tx::Postgres(_) => Dialect::Postgres,
        }
    }

    /// Makes the transaction's writes permanent.
    pub async fn commit(self) -> Result<(), sqlx::Error> {
        match self {
            Tx::Sqlite(tx) => tx.commit().await,
            Tx::Postgres(tx) => tx.commit().await,
        }
    }

    /// Discards them. Also what happens on drop, stated explicitly for the
    /// cases where the intent is worth reading.
    pub async fn rollback(self) -> Result<(), sqlx::Error> {
        match self {
            Tx::Sqlite(tx) => tx.rollback().await,
            Tx::Postgres(tx) => tx.rollback().await,
        }
    }

    pub async fn fetch_all<T>(
        &mut self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Tx::Sqlite(tx) => {
                sqlx::query_as_with::<Sqlite, T, _>(&sql, values)
                    .fetch_all(&mut **tx)
                    .await
            }
            Tx::Postgres(tx) => {
                sqlx::query_as_with::<Postgres, T, _>(&sql, values)
                    .fetch_all(&mut **tx)
                    .await
            }
        }
    }

    pub async fn fetch_optional<T>(
        &mut self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Option<T>, sqlx::Error>
    where
        T: Send + Unpin + for<'r> FromRow<'r, SqliteRow> + for<'r> FromRow<'r, PgRow>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Tx::Sqlite(tx) => {
                sqlx::query_as_with::<Sqlite, T, _>(&sql, values)
                    .fetch_optional(&mut **tx)
                    .await
            }
            Tx::Postgres(tx) => {
                sqlx::query_as_with::<Postgres, T, _>(&sql, values)
                    .fetch_optional(&mut **tx)
                    .await
            }
        }
    }

    /// The first column of the first row. `None` means no rows — which is not
    /// the same as a row holding SQL `NULL`; for that, decode into
    /// `Option<T>`.
    pub async fn fetch_scalar<T>(
        &mut self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Option<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> sqlx::Decode<'r, Sqlite>
            + sqlx::Type<Sqlite>
            + for<'r> sqlx::Decode<'r, Postgres>
            + sqlx::Type<Postgres>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Tx::Sqlite(tx) => {
                sqlx::query_scalar_with::<Sqlite, T, _>(&sql, values)
                    .fetch_optional(&mut **tx)
                    .await
            }
            Tx::Postgres(tx) => {
                sqlx::query_scalar_with::<Postgres, T, _>(&sql, values)
                    .fetch_optional(&mut **tx)
                    .await
            }
        }
    }

    /// Every value of a single-column query, in row order.
    pub async fn fetch_scalars<T>(
        &mut self,
        query: &(impl Statement + ?Sized),
    ) -> Result<Vec<T>, sqlx::Error>
    where
        T: Send
            + Unpin
            + for<'r> sqlx::Decode<'r, Sqlite>
            + sqlx::Type<Sqlite>
            + for<'r> sqlx::Decode<'r, Postgres>
            + sqlx::Type<Postgres>,
    {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Tx::Sqlite(tx) => {
                sqlx::query_scalar_with::<Sqlite, T, _>(&sql, values)
                    .fetch_all(&mut **tx)
                    .await
            }
            Tx::Postgres(tx) => {
                sqlx::query_scalar_with::<Postgres, T, _>(&sql, values)
                    .fetch_all(&mut **tx)
                    .await
            }
        }
    }

    /// Runs a statement, returning how many rows it affected.
    pub async fn execute(&mut self, query: &(impl Statement + ?Sized)) -> Result<u64, sqlx::Error> {
        let Prepared { sql, values } = query.prepare(self.dialect());
        match self {
            Tx::Sqlite(tx) => Ok(sqlx::query_with::<Sqlite, _>(&sql, values)
                .execute(&mut **tx)
                .await?
                .rows_affected()),
            Tx::Postgres(tx) => Ok(sqlx::query_with::<Postgres, _>(&sql, values)
                .execute(&mut **tx)
                .await?
                .rows_affected()),
        }
    }
}

impl crate::Backend {
    /// Opens a transaction on the primary.
    ///
    /// Always the primary, never the replica: a transaction exists to make
    /// writes atomic, and a replica cannot take a write. A read-only
    /// transaction is not a thing this needs.
    ///
    /// # Do not query the pool while holding one
    ///
    /// On SQLite the transaction holds a connection from a small pool — one
    /// connection for an in-memory database, since an in-memory database
    /// belongs to its connection. Running a query on the `Backend` while the
    /// transaction is open therefore waits for a connection that cannot be
    /// released until the transaction ends, and fails with `PoolTimedOut`.
    /// Every read that belongs to the group goes through the [`Tx`].
    pub async fn begin(&self) -> Result<Tx<'_>, sqlx::Error> {
        match self {
            crate::Backend::Sqlite(pool) => Ok(Tx::Sqlite(pool.begin().await?)),
            crate::Backend::Postgres { primary, .. } => Ok(Tx::Postgres(primary.begin().await?)),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::schema::Users;
    use sea_query::{Expr, Query};

    async fn count_users(db: &crate::Backend) -> i64 {
        db.count(
            &Query::select()
                .expr(db.cast_int(sea_query::Func::count(Expr::col(Users::XataId))))
                .from(Users::Table)
                .to_owned(),
        )
        .await
        .unwrap()
    }

    fn insert_user(did: &str) -> sea_query::InsertStatement {
        Query::insert()
            .into_table(Users::Table)
            .columns([Users::XataId, Users::Did, Users::Handle, Users::Avatar])
            .values_panic([crate::new_id().into(), did.into(), did.into(), "".into()])
            .to_owned()
    }

    /// Committed work is visible afterwards.
    #[tokio::test]
    async fn a_committed_transaction_is_kept() {
        let db = crate::connect_in_memory().await.unwrap();

        let mut tx = db.begin().await.unwrap();
        tx.execute(&insert_user("did:plc:one")).await.unwrap();
        tx.execute(&insert_user("did:plc:two")).await.unwrap();
        tx.commit().await.unwrap();

        assert_eq!(count_users(&db).await, 2);
    }

    /// The point of the whole type: a group of writes that fails part way
    /// leaves nothing behind.
    #[tokio::test]
    async fn a_rolled_back_transaction_leaves_nothing() {
        let db = crate::connect_in_memory().await.unwrap();

        let mut tx = db.begin().await.unwrap();
        tx.execute(&insert_user("did:plc:one")).await.unwrap();
        tx.rollback().await.unwrap();

        assert_eq!(count_users(&db).await, 0);
    }

    /// Dropping without committing rolls back too, which is what makes an
    /// early `?` in the middle of a group of writes safe.
    #[tokio::test]
    async fn dropping_without_committing_rolls_back() {
        let db = crate::connect_in_memory().await.unwrap();

        {
            let mut tx = db.begin().await.unwrap();
            tx.execute(&insert_user("did:plc:one")).await.unwrap();
            // No commit, no rollback — just gone.
        }

        assert_eq!(count_users(&db).await, 0);
    }

    /// Reads inside the transaction see its own writes, which is what a
    /// find-or-insert inside one depends on.
    ///
    /// Note what this does *not* do: read from `db` while the transaction is
    /// open. An in-memory SQLite pool holds exactly one connection — an
    /// in-memory database belongs to its connection, so there is nothing to
    /// share — and the transaction has it. A query on the pool would wait for
    /// a connection that cannot be free until the transaction ends, and time
    /// out. On a file-backed pool it is fine.
    #[tokio::test]
    async fn a_transaction_sees_its_own_writes() {
        let db = crate::connect_in_memory().await.unwrap();

        let mut tx = db.begin().await.unwrap();
        tx.execute(&insert_user("did:plc:one")).await.unwrap();

        let found: Option<String> = tx
            .fetch_scalar(
                &Query::select()
                    .column(Users::Did)
                    .from(Users::Table)
                    .and_where(Expr::col(Users::Did).eq("did:plc:one"))
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(found.as_deref(), Some("did:plc:one"));

        tx.commit().await.unwrap();
        assert_eq!(count_users(&db).await, 1);
    }

    /// The statement is rendered for the transaction's own dialect, not for
    /// whatever was compiled in — the bug this whole layer exists to prevent.
    #[tokio::test]
    async fn statements_are_rendered_for_the_transactions_dialect() {
        let db = crate::connect_in_memory().await.unwrap();
        let tx = db.begin().await.unwrap();
        assert_eq!(tx.dialect(), crate::Dialect::Sqlite);
    }
}
