//! Picks which Postgres endpoint a service talks to.
//!
//! Three env vars, only the last of which is required:
//!
//! - `XATA_READ_POSTGRES_URL`  — read-only replica. Cheap, but lags the
//!   primary, so it must not serve a read that has to reflect a write that just
//!   happened.
//! - `XATA_WRITE_POSTGRES_URL` — primary. Every write, and every read that has
//!   to be fresh (scrobbles and now-playing, above all).
//! - `XATA_POSTGRES_URL`       — read+write. The fallback for both of the
//!   above, so a deployment that sets only this one keeps working unchanged.

pub mod sql;

use std::env::{self, VarError};
use std::str::FromStr;

use anyhow::Result;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::PgPool;

const FALLBACK: &str = "XATA_POSTGRES_URL";

fn resolve(preferred: &str) -> Result<String, VarError> {
    match env::var(preferred) {
        // An empty value means "not configured", not "connect to nothing" —
        // deployment tooling sets blanks far more often than it unsets.
        Ok(url) if !url.trim().is_empty() => Ok(url),
        _ => env::var(FALLBACK),
    }
}

/// Primary URL, falling back to the read+write endpoint.
pub fn write_url() -> Result<String, VarError> {
    resolve("XATA_WRITE_POSTGRES_URL")
}

/// Replica URL, falling back to the read+write endpoint.
pub fn read_url() -> Result<String, VarError> {
    resolve("XATA_READ_POSTGRES_URL")
}

/// True when a distinct replica is configured. Useful for deciding whether
/// building a second pool would add capacity or just double the connection
/// count against one server.
pub fn is_split() -> bool {
    match (read_url(), write_url()) {
        (Ok(r), Ok(w)) => r != w,
        _ => false,
    }
}

fn options(url: &str, app_name: &str, role: &str) -> Result<PgConnectOptions> {
    Ok(PgConnectOptions::from_str(url)?
        // Shows up in pg_stat_activity, so a connection can be traced back to
        // the service and endpoint that opened it.
        .application_name(&format!("{app_name}:{role}"))
        // Backstop for a query whose caller has already given up; without it
        // nothing server-side ever reclaims the backend.
        .options([("statement_timeout", "60000")]))
}

/// Connect options for the primary, tagged with `app_name` in pg_stat_activity.
pub fn primary(app_name: &str) -> Result<PgConnectOptions> {
    options(&write_url()?, app_name, "primary")
}

/// Connect options for the replica, tagged with `app_name` in pg_stat_activity.
pub fn replica(app_name: &str) -> Result<PgConnectOptions> {
    options(&read_url()?, app_name, "replica")
}

/// Fails unless `pool` can actually write.
///
/// `XATA_POSTGRES_URL` is documented as read+write but is not guaranteed to
/// stay that way — it has pointed at a replica in production, which turned the
/// write fallback into a silent hole that swallowed thousands of scrobbles with
/// nothing but a per-row error to show for it. Call this once at startup so a
/// misrouted primary is a refusal to boot instead of hours of quiet data loss.
pub async fn ensure_writable(pool: &sqlx::PgPool, service: &str) -> Result<()> {
    let (in_recovery, read_only): (bool, String) =
        sqlx::query_as("select pg_is_in_recovery(), current_setting('transaction_read_only')")
            .fetch_one(pool)
            .await?;

    if in_recovery || read_only == "on" {
        anyhow::bail!(
            "{service}: the write endpoint is read-only (pg_is_in_recovery={in_recovery}, \
             transaction_read_only={read_only}). Point XATA_WRITE_POSTGRES_URL at the primary — \
             XATA_POSTGRES_URL is currently a replica and cannot accept writes."
        );
    }
    Ok(())
}

/// A primary/replica pair for a service that both reads and writes.
///
/// When no replica is configured both handles are the *same* pool, so turning
/// the split on never doubles a process's connection count against one server.
#[derive(Clone, Debug)]
pub struct Db {
    read: PgPool,
    write: PgPool,
}

impl Db {
    /// Connects both pools and verifies the primary can actually write.
    ///
    /// `configure` is applied to each pool, so a service keeps one place to set
    /// its sizing and timeouts.
    pub async fn connect(
        app_name: &str,
        configure: impl Fn(PgPoolOptions) -> PgPoolOptions,
    ) -> Result<Self> {
        let write = configure(PgPoolOptions::new())
            .connect_with(primary(app_name)?)
            .await?;
        ensure_writable(&write, app_name).await?;

        let read = if is_split() {
            configure(PgPoolOptions::new())
                .connect_with(replica(app_name)?)
                .await?
        } else {
            write.clone()
        };

        Ok(Self { read, write })
    }

    /// Builds a pair from one existing pool, for tests and for callers that
    /// already hold a connection they want both roles to use. Notably keeps a
    /// test harness honest: a schema pinned on the pool applies to both roles.
    pub fn from_pool(pool: PgPool) -> Self {
        Self {
            read: pool.clone(),
            write: pool,
        }
    }

    /// Lag-tolerant reads. Never a write, and never a read that has to show
    /// something written moments ago.
    pub fn replica(&self) -> &PgPool {
        &self.read
    }

    /// Writes, and any read that has to reflect one — read-after-write,
    /// now-playing, and auth all belong here even though they only SELECT.
    pub fn primary(&self) -> &PgPool {
        &self.write
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // These mutate process env, so they share one test to stay deterministic.
    #[test]
    fn falls_back_and_treats_blanks_as_unset() {
        let fallback = "postgres://fallback/db";
        let primary = "postgres://primary/db";
        let replica = "postgres://replica/db";

        env::set_var(FALLBACK, fallback);
        env::remove_var("XATA_READ_POSTGRES_URL");
        env::remove_var("XATA_WRITE_POSTGRES_URL");
        assert_eq!(read_url().unwrap(), fallback, "read falls back");
        assert_eq!(write_url().unwrap(), fallback, "write falls back");
        assert!(!is_split(), "no split when both fall back");

        // Deployment tooling sets blanks far more often than it unsets.
        env::set_var("XATA_READ_POSTGRES_URL", "");
        env::set_var("XATA_WRITE_POSTGRES_URL", "   ");
        assert_eq!(read_url().unwrap(), fallback, "blank read falls back");
        assert_eq!(
            write_url().unwrap(),
            fallback,
            "whitespace write falls back"
        );
        assert!(!is_split());

        env::set_var("XATA_READ_POSTGRES_URL", replica);
        env::set_var("XATA_WRITE_POSTGRES_URL", primary);
        assert_eq!(read_url().unwrap(), replica);
        assert_eq!(write_url().unwrap(), primary);
        assert!(is_split());

        // Only one side configured: the other still falls back.
        env::remove_var("XATA_READ_POSTGRES_URL");
        assert_eq!(read_url().unwrap(), fallback);
        assert_eq!(write_url().unwrap(), primary);

        // Connections are tagged so pg_stat_activity shows which service and
        // which endpoint opened them.
        env::set_var(FALLBACK, "postgres://u:p@host:5432/db");
        env::remove_var("XATA_WRITE_POSTGRES_URL");
        let opts = super::primary("rocksky-test").unwrap();
        assert_eq!(opts.get_application_name(), Some("rocksky-test:primary"));
        let opts = super::replica("rocksky-test").unwrap();
        assert_eq!(opts.get_application_name(), Some("rocksky-test:replica"));
    }
}
