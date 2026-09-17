//! Filling in the profiles of accounts learned from the firehose.
//!
//! A record carries no profile. When a scrobble arrives for someone this
//! instance has never seen, [`crate::ingest::upsert_user`] has only their DID,
//! and `handle` is NOT NULL — so the DID stands in for it and `display_name`
//! and `avatar` are empty.
//!
//! In the deployed system those rows are created by the API during a login or
//! a write, where the profile is already to hand. An instance fed by Tap sees
//! thousands of accounts that will never log into it, so without this every
//! scrobble in the global feed is attributed to a raw DID with no name and no
//! picture.
//!
//! # Why a sweep rather than resolving during ingest
//!
//! Ingest is on the path of every firehose record. Resolving a profile is an
//! HTTP round trip to somebody else's service, and doing it inline would tie
//! the rate the database fills to the latency of an appview — and would repeat
//! the lookup for every scrobble by the same person.
//!
//! So ingest stores the DID and moves on, and this fills in the names behind
//! it, oldest first, a bounded batch at a time.

use crate::db::schema::Users;
use crate::db::Backend;
use crate::sea_query::{Expr, Order, Query};
use crate::state::AppState;
use std::time::Duration;

/// How often a batch is resolved.
///
/// Slow on purpose. Nothing here is urgent — a name appearing a minute after
/// the scrobble is fine — and a tighter loop would make this instance a
/// nuisance to the directory and the appview it is asking.
const INTERVAL: Duration = Duration::from_secs(30);

/// Accounts resolved per batch.
///
/// Each is at least one HTTP request, so a batch is a burst; thirty per thirty
/// seconds keeps it to about one request a second while still clearing a large
/// backfill within a few hours.
const BATCH: i64 = 30;

/// Starts the sweep. The handle stops it when dropped.
pub fn spawn(state: &AppState) -> tokio::task::JoinHandle<()> {
    let state = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(INTERVAL).await;
            match resolve_batch(&state).await {
                Ok(0) => {}
                Ok(resolved) => tracing::debug!(resolved, "filled in profiles"),
                Err(err) => tracing::warn!(error = ?err, "profile sweep failed"),
            }
        }
    })
}

/// Resolves one batch, returning how many were filled in.
pub async fn resolve_batch(state: &AppState) -> anyhow::Result<usize> {
    let pending = unresolved(state.db(), BATCH).await?;
    let mut resolved = 0;

    for did in pending {
        // The same path a login takes, so a handle learned here is stored
        // exactly as one learned there — including refusing a handle another
        // row already holds.
        crate::rest::auth::sync_user(state, &did, None).await;
        resolved += 1;
    }

    Ok(resolved)
}

/// DIDs whose handle is still the placeholder.
///
/// `upsert_user` writes the DID into `handle` because the column is NOT NULL
/// and UNIQUE and it has nothing better; a row where the two are equal is
/// therefore exactly one that has never been resolved.
///
/// Oldest first, so a long backfill is worked through in the order it arrived
/// rather than re-attempting the same failing rows.
async fn unresolved(db: &Backend, limit: i64) -> Result<Vec<String>, sqlx::Error> {
    let query = Query::select()
        .column(Users::Did)
        .from(Users::Table)
        .and_where(Expr::col(Users::Handle).equals(Users::Did))
        .order_by(Users::XataCreatedat, Order::Asc)
        .limit(limit as u64)
        .to_owned();

    db.fetch_scalars::<String>(&query).await
}

/// How many accounts are still unresolved, for the startup log.
pub async fn pending_count(db: &Backend) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(Users::XataId))))
        .from(Users::Table)
        .and_where(Expr::col(Users::Handle).equals(Users::Did))
        .to_owned();
    db.count(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A row whose handle equals its DID has never been resolved; one with a
    /// real handle has. Getting this backwards would either re-resolve
    /// everybody forever or never resolve anyone.
    #[tokio::test]
    async fn only_placeholder_handles_are_pending() {
        let db = crate::db::connect_in_memory().await.unwrap();

        // Straight from the firehose: handle == did.
        crate::ingest::upsert_user(&db, "did:plc:unresolved")
            .await
            .unwrap();

        // Resolved: a real handle.
        crate::ingest::upsert_user(&db, "did:plc:known").await.unwrap();
        crate::ingest::set_handle(&db, "did:plc:known", "alice.example")
            .await
            .unwrap();

        let pending = unresolved(&db, 10).await.unwrap();
        assert_eq!(pending, vec!["did:plc:unresolved".to_string()]);
        assert_eq!(pending_count(&db).await.unwrap(), 1);
    }

    /// The batch is bounded, or a first sync of a large network would try to
    /// resolve every account at once.
    #[tokio::test]
    async fn a_batch_is_bounded() {
        let db = crate::db::connect_in_memory().await.unwrap();
        for n in 0..10 {
            crate::ingest::upsert_user(&db, &format!("did:plc:user{n}"))
                .await
                .unwrap();
        }

        assert_eq!(unresolved(&db, 4).await.unwrap().len(), 4);
        assert_eq!(pending_count(&db).await.unwrap(), 10);
    }

    /// Nothing to do on a fully resolved database, so the sweep is free.
    #[tokio::test]
    async fn a_resolved_database_has_no_work() {
        let db = crate::db::connect_in_memory().await.unwrap();
        crate::ingest::upsert_user(&db, "did:plc:known").await.unwrap();
        crate::ingest::set_handle(&db, "did:plc:known", "alice.example")
            .await
            .unwrap();

        assert!(unresolved(&db, 10).await.unwrap().is_empty());
        assert_eq!(pending_count(&db).await.unwrap(), 0);
    }
}
