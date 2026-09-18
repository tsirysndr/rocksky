//! Consuming a Tap event stream.
//!
//! `TapStream` reconnects on its own and tracks its cursor, so this module is
//! a loop over events plus the projection. The two details worth knowing:
//!
//! - **Events are at-least-once.** A record can arrive twice, so the
//!   projection has to be idempotent — which it is, because it dedupes on
//!   content hashes and on `(user, track, timestamp)`.
//! - **Acks are sent when the event is parsed, not when it is ingested**
//!   (`TapStream` does it in its own background task). A crash between the two
//!   therefore loses that event rather than redelivering it, so the CAR
//!   backfill is the recovery path for a gap, not a reconnect.
//! - **Backfill arrives first, with `live: false`.** Tap replays history
//!   before switching to live events, so a fresh instance fills itself just by
//!   connecting. The flag is only used for logging; both kinds project the
//!   same way.
//! - **Deletes carry no body**, so they are projected from the URI alone by
//!   [`ingest::delete`]. Dropping them, as this used to, leaves a row behind
//!   for a record the repository no longer has — permanently, since nothing
//!   else revisits it.

use crate::db::schema::Users;
use crate::ingest::{self, IncomingRecord, IngestStats, SUPPORTED_COLLECTIONS};
use crate::sea_query::{Expr, Query};
use crate::state::AppState;
use crate::xrpc::app_rocksky::scrobble::SCROBBLES_VERSION_KEY;
use atproto_tap::{TapClient, TapConfig, TapEvent};
use futures::StreamExt;
use std::time::Duration;

/// How often to report progress while replaying history, in events.
const PROGRESS_EVERY: u64 = 500;

/// Registers the configured repositories with Tap, so it starts tracking them.
///
/// Requires the admin password. Without one this is skipped: the instance can
/// still consume whatever the Tap instance was already told to track, which is
/// the normal setup when Tap is shared.
async fn register_repos(state: &AppState) {
    let config = state.config();
    let (Some(hostname), Some(password)) = (&config.tap_hostname, &config.tap_admin_password)
    else {
        if !config.tap_repos.is_empty() {
            tracing::warn!(
                "[tap].repos is set but [tap].admin_password is not; \
                 cannot register repositories"
            );
        }
        return;
    };
    if config.tap_repos.is_empty() {
        return;
    }

    let client = TapClient::new(hostname, Some(password.clone()));
    let repos: Vec<&str> = config.tap_repos.iter().map(String::as_str).collect();
    match client.add_repos(&repos).await {
        Ok(_) => tracing::info!(
            repositories = config.tap_repos.len(),
            "registered repositories with Tap"
        ),
        // Not fatal: the stream is still worth consuming.
        Err(err) => tracing::warn!(error = %err, "could not register repositories with Tap"),
    }
}

/// Consumes the Tap stream until the process stops.
pub async fn run(state: AppState) {
    let Some(hostname) = state.config().tap_hostname.clone() else {
        return;
    };

    register_repos(&state).await;

    let mut config = TapConfig::builder().hostname(hostname.clone());
    if let Some(password) = state.config().tap_admin_password.clone() {
        config = config.admin_password(password);
    }

    tracing::info!(tap = %hostname, "connecting to Tap");
    let mut stream = atproto_tap::connect(config.build());

    let mut stats = IngestStats::default();
    let mut seen = 0u64;
    let mut replaying = false;

    while let Some(event) = stream.next().await {
        // The stream surfaces transport and parse failures as items; it
        // reconnects on its own, so a failure here is logged and skipped
        // rather than ending the loop.
        let event = match event {
            Ok(event) => event,
            Err(err) => {
                tracing::warn!(error = %err, "Tap stream error");
                continue;
            }
        };

        match &*event {
            TapEvent::Record { record, .. } => {
                // Only the collections this appview projects are of interest;
                // Tap may be tracking repos for other consumers too.
                if !SUPPORTED_COLLECTIONS.contains(&record.collection.as_ref()) {
                    continue;
                }

                if !record.live && !replaying {
                    replaying = true;
                    tracing::info!("Tap is replaying history");
                } else if record.live && replaying {
                    replaying = false;
                    tracing::info!(
                        records = stats.total(),
                        "history replayed; now following live events"
                    );
                    // Nothing was indexed during the replay, so the index is
                    // now as far behind as the replay was long. This rebuild
                    // is batched and paces itself against Typesense's write
                    // queue, which the per-record path cannot do.
                    if let Some(search) = state.search() {
                        crate::search::spawn_backfill(search, state.db());
                    }
                }

                // A delete carries no body, so it is projected from the URI
                // alone. Keyed on the action rather than on the missing body:
                // a create whose body failed to decode is a different thing
                // and must not remove the row.
                if record.action == atproto_tap::RecordAction::Delete {
                    match ingest::delete(state.db(), &record.did, &record.collection, &record.rkey)
                        .await
                    {
                        Ok(result) => {
                            if result.deletions > 0 {
                                state
                                    .cache()
                                    .incr(SCROBBLES_VERSION_KEY, Duration::from_secs(86_400))
                                    .await;
                            }
                            stats.merge(result);
                        }
                        Err(err) => {
                            tracing::warn!(
                                did = %record.did,
                                collection = %record.collection,
                                rkey = %record.rkey,
                                error = ?err,
                                "failed to project a deletion"
                            );
                            stats.skipped += 1;
                        }
                    }
                    seen += 1;
                    continue;
                }

                let Some(value) = record.record.clone() else {
                    stats.skipped += 1;
                    continue;
                };

                let incoming = IncomingRecord {
                    did: record.did.to_string(),
                    collection: record.collection.to_string(),
                    rkey: record.rkey.to_string(),
                    value,
                };

                match ingest::ingest(state.db(), &incoming).await {
                    Ok(mut result) => {
                        // A like whose song is not indexed here carries nothing
                        // to build a track from, so it cannot be stored
                        // unattached — fetch the song and try once more. On the
                        // firehose this is the common case rather than the
                        // exception: a like on a track somebody else published
                        // arrives with no guarantee their repository is read.
                        if result.skipped > 0 && incoming.collection == ingest::LIKE_NSID {
                            result = crate::materialise::resolve_like(&state, &incoming).await;
                        }

                        // A new scrobble invalidates every cached feed page.
                        if result.scrobbles > 0 {
                            state
                                .cache()
                                .incr(SCROBBLES_VERSION_KEY, Duration::from_secs(86_400))
                                .await;
                        }
                        stats.merge(result);
                        // Not while replaying. `index_record` issues one
                        // Typesense import per record — up to four, since a
                        // scrobble indexes its track, album and artist — and a
                        // replay delivers them as fast as the socket allows.
                        // That buried the server under a write queue it could
                        // not drain, and a Typesense behind on its queue stops
                        // answering searches at all. The rebuild when the
                        // replay ends covers these rows in batches instead.
                        if !replaying {
                            crate::search::index_record(&state, &incoming).await;
                        }
                    }
                    Err(err) => {
                        tracing::warn!(
                            uri = %incoming.uri(),
                            error = ?err,
                            "failed to ingest record"
                        );
                        stats.skipped += 1;
                    }
                }

                seen += 1;
                if seen % PROGRESS_EVERY == 0 {
                    tracing::info!(
                        events = seen,
                        scrobbles = stats.scrobbles,
                        duplicates = stats.duplicates,
                        "sync progress"
                    );
                }
            }
            TapEvent::Identity { identity, .. } => {
                // A handle change has to be reflected or profile URLs break.
                if let Err(err) = update_identity(&state, &identity).await {
                    tracing::warn!(error = ?err, "failed to apply an identity update");
                }
            }
        }
    }

    // `TapStream` reconnects internally, so reaching here means it gave up.
    tracing::warn!(
        events = seen,
        scrobbles = stats.scrobbles,
        "the Tap stream ended"
    );
}

/// Applies a handle change to the `users` row.
async fn update_identity(
    state: &AppState,
    identity: &atproto_tap::IdentityEvent,
) -> anyhow::Result<()> {
    let handle = identity.handle.as_ref();
    if handle.is_empty() {
        return Ok(());
    }
    let did = identity.did.to_string();

    // Only touch a row that exists: an identity event for an account this
    // instance does not index is not a reason to create one.
    let db = state.db();
    let update = Query::update()
        .table(Users::Table)
        .value(Users::Handle, handle)
        .value(Users::XataUpdatedat, crate::db::now_timestamp())
        .and_where(Expr::col(Users::Did).eq(&did))
        .and_where(Expr::col(Users::Handle).ne(handle))
        .to_owned();

    if db.execute(&update).await? > 0 {
        tracing::info!(did = %did, handle = %handle, "handle updated");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_handle_change_updates_an_indexed_user() {
        let state = AppState::for_test().await.unwrap();
        let db = state.db();

        ingest::upsert_user(db, "did:plc:alice").await.unwrap();

        let mut sql = db.sql("UPDATE users SET handle = ");
        sql.bind("old.test")
            .push(" WHERE did = ")
            .bind("did:plc:alice");
        db.execute(&sql).await.unwrap();

        // The event carries the new handle.
        let mut update = db.sql("UPDATE users SET handle = ");
        update
            .bind("new.test")
            .push(" WHERE did = ")
            .bind("did:plc:alice")
            .push(" AND handle <> ")
            .bind("new.test");
        assert_eq!(db.execute(&update).await.unwrap(), 1);

        let handle: Option<String> = db
            .fetch_scalar(&db.sql("SELECT handle FROM users"))
            .await
            .unwrap();
        assert_eq!(handle.as_deref(), Some("new.test"));
    }

    #[tokio::test]
    async fn an_identity_event_for_an_unknown_did_creates_nothing() {
        let state = AppState::for_test().await.unwrap();
        let db = state.db();

        let mut sql = db.sql("UPDATE users SET handle = ");
        sql.bind("new.test")
            .push(" WHERE did = ")
            .bind("did:plc:stranger");
        assert_eq!(db.execute(&sql).await.unwrap(), 0);
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM users"))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn nothing_is_spawned_without_a_tap_hostname() {
        let state = AppState::for_test().await.unwrap();
        assert!(!state.config().tap_enabled);
        assert!(crate::sync::spawn(&state).is_empty());
    }

    #[test]
    fn only_the_projected_collections_are_consumed() {
        assert!(SUPPORTED_COLLECTIONS.contains(&"app.rocksky.scrobble"));
        // Tap may be tracking repos for other consumers; their records are
        // skipped without touching the database.
        assert!(!SUPPORTED_COLLECTIONS.contains(&"app.bsky.feed.post"));
    }
}
