//! Keeping the local database up to date with the network.
//!
//! The sync source is [Tap](https://atproto.com/blog/introducing-tap), a
//! service that subscribes to a Relay and emits verified, filtered JSON
//! events. Consuming Tap rather than the firehose directly means MST
//! verification, signature checking, backfill and per-repo filtering are
//! already done, so this module only projects records — the same projection
//! the CAR backfill uses ([`crate::ingest`]).
//!
//! Tap is optional. With no `[tap]` section the instance still serves whatever
//! is in its database, which is what a read-only or backfill-only deployment
//! wants.

pub mod tap;

use crate::state::AppState;

/// Starts whichever sync sources are configured, returning the spawned tasks.
///
/// Sync runs as a background task rather than blocking startup: the API must
/// come up and serve existing data even if the sync source is unreachable.
pub fn spawn(state: &AppState) -> Vec<tokio::task::JoinHandle<()>> {
    let mut handles = Vec::new();

    if state.config().tap_enabled {
        let state = state.clone();
        handles.push(tokio::spawn(async move {
            tap::run(state).await;
        }));
    } else {
        tracing::info!("no sync source configured; serving the existing database only");
    }

    handles
}
