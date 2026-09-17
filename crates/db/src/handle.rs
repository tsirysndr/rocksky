//! A read/write pair, for a service that does both.
//!
//! The same shape as `rocksky-pgurl`'s `Db`, which the services were written
//! against — `db.replica()` for a read that tolerates lag, `db.primary()` for
//! a write or a read that must see one — except that it is not necessarily a
//! Postgres. It is whatever [`crate::shared::resolve`] chose, which with no
//! `XATA_*_POSTGRES_URL` set is the SQLite file the appview uses.
//!
//! # Why this exists next to `Backend`
//!
//! `Backend` already routes reads to a replica on request
//! ([`Backend::reads_may_lag`]), but *on request*: a call site has to say so
//! every time, and the default is the primary. That is the right default for
//! correctness and the wrong one for a service whose reads are nearly all
//! lag-tolerant listings. Holding the two handles side by side makes the
//! choice explicit at the point of use and impossible to forget, which is what
//! the services already relied on.
//!
//! The Postgres-specific parts of connecting — tagging `application_name` so a
//! connection can be traced in `pg_stat_activity`, and refusing to start when
//! the write endpoint turns out to be a replica — stay in `rocksky-pgurl`.
//! They have no SQLite counterpart to reconcile, and a service that wants them
//! builds its pools there and calls [`Handle::from_backend`].

use crate::shared::Source;
use crate::tx::Tx;
use crate::{Backend, ConnectError};

/// A service's database: one handle for lag-tolerant reads, one for writes.
#[derive(Clone, Debug)]
pub struct Handle {
    read: Backend,
    write: Backend,
    source: Source,
}

impl Handle {
    /// Connects to whatever is configured — Postgres, or the shared SQLite
    /// file when no Postgres URL is set.
    pub async fn connect() -> Result<Self, ConnectError> {
        let (backend, source) = crate::shared::connect().await?;
        Ok(Self::with_source(backend, source))
    }

    /// Wraps an already-open backend. What a test uses to run a service
    /// against an in-memory database, and what a service that built its own
    /// Postgres pools hands over.
    pub fn from_backend(backend: Backend) -> Self {
        let source = match backend.dialect() {
            crate::Dialect::Sqlite => Source::Sqlite(crate::shared::default_sqlite_path()),
            crate::Dialect::Postgres => Source::Postgres,
        };
        Self::with_source(backend, source)
    }

    fn with_source(backend: Backend, source: Source) -> Self {
        Self {
            // `reads_may_lag` hands back the replica when there is one and the
            // primary when there is not, so a call site never has to ask.
            read: backend.reads_may_lag(),
            write: backend,
            source,
        }
    }

    /// Lag-tolerant reads. Never a write, and never a read that has to show
    /// something written moments ago.
    pub fn replica(&self) -> &Backend {
        &self.read
    }

    /// Writes, and any read that has to reflect one — read-after-write,
    /// now-playing and auth all belong here even though they only SELECT.
    pub fn primary(&self) -> &Backend {
        &self.write
    }

    /// What this connected to, for the startup log.
    ///
    /// Worth logging: a service reporting an empty library and a service that
    /// quietly created its own database look identical from outside, and this
    /// is the line that separates them.
    pub fn source(&self) -> &Source {
        &self.source
    }

    /// Opens a transaction on the primary. See [`Tx`].
    pub async fn begin(&self) -> Result<Tx<'_>, sqlx::Error> {
        self.write.begin().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Both handles work, and on a single database they are the same one —
    /// adopting the split must not double a process's connection count.
    #[tokio::test]
    async fn an_unsplit_handle_reads_and_writes_the_same_database() {
        let db = crate::connect_in_memory().await.unwrap();
        let handle = Handle::from_backend(db);

        assert_eq!(handle.replica().dialect(), crate::Dialect::Sqlite);
        assert_eq!(handle.primary().dialect(), crate::Dialect::Sqlite);

        // A write through the primary is visible through the replica, which is
        // only true because there is no replica to lag.
        use crate::schema::Users;
        use sea_query::{Expr, Query};
        handle
            .primary()
            .execute(
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

        let handle_name: Option<String> = handle
            .replica()
            .fetch_scalar(
                &Query::select()
                    .column(Users::Handle)
                    .from(Users::Table)
                    .and_where(Expr::col(Users::Did).eq("did:plc:alice"))
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(handle_name.as_deref(), Some("alice.test"));
    }

    /// The source is reported, so a startup log can say which database a
    /// service actually joined.
    #[tokio::test]
    async fn the_source_is_reported() {
        let db = crate::connect_in_memory().await.unwrap();
        let handle = Handle::from_backend(db);
        assert!(matches!(handle.source(), Source::Sqlite(_)));
        assert!(handle.source().to_string().starts_with("sqlite"));
    }
}
