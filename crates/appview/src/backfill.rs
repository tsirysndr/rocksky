//! Backfilling the local database from repositories.
//!
//! For each configured DID: resolve its PDS, download the repository CAR via
//! `com.atproto.sync.getRepo`, walk the MST for record keys, and project every
//! `app.rocksky.*` record through [`crate::ingest`].
//!
//! This is what makes a fresh self-hosted instance useful immediately, rather
//! than only showing listens that happen after it started. It is idempotent —
//! the projection dedupes on content hashes and the
//! `(user, track, timestamp)` key — so re-running it after a schema change or
//! a wipe is safe and is the intended recovery path.
//!
//! Records are ingested in repository order, which matters: a `like` can only
//! attach to a song that is already indexed, and the MST walk yields
//! `app.rocksky.album` before `app.rocksky.like` before `app.rocksky.scrobble`
//! before `app.rocksky.song` (keys sort lexicographically). Likes that arrive
//! before their song are reported as skipped and picked up by a second pass.

use crate::atproto;
use crate::ingest::{self, IncomingRecord, IngestStats, SUPPORTED_COLLECTIONS};
use crate::state::AppState;

/// What one repository's backfill produced.
#[derive(Debug, Clone)]
pub struct RepoReport {
    pub did: String,
    pub stats: IngestStats,
    /// `None` on success, the failure otherwise. A repository that cannot be
    /// read must not abort the whole run.
    pub error: Option<String>,
}

/// Backfills every DID in `dids`, continuing past failures.
pub async fn run(state: &AppState, dids: &[String]) -> Vec<RepoReport> {
    let mut reports = Vec::with_capacity(dids.len());

    for did in dids {
        tracing::info!(did = %did, "backfilling repository");
        match backfill_repo(state, did).await {
            Ok(stats) => {
                tracing::info!(
                    did = %did,
                    scrobbles = stats.scrobbles,
                    songs = stats.songs,
                    albums = stats.albums,
                    artists = stats.artists,
                    likes = stats.likes,
                    duplicates = stats.duplicates,
                    skipped = stats.skipped,
                    "backfill complete"
                );
                reports.push(RepoReport {
                    did: did.clone(),
                    stats,
                    error: None,
                });
            }
            Err(err) => {
                tracing::error!(did = %did, error = ?err, "backfill failed");
                reports.push(RepoReport {
                    did: did.clone(),
                    stats: IngestStats::default(),
                    error: Some(format!("{err:#}")),
                });
            }
        }
    }

    reports
}

/// Downloads and ingests one repository.
pub async fn backfill_repo(state: &AppState, did: &str) -> anyhow::Result<IngestStats> {
    let identity = atproto::resolve(state.http(), &state.config().plc_directory_url, did).await?;
    tracing::debug!(
        did = %did,
        pds = %identity.pds,
        handle = ?identity.handle,
        "resolved identity"
    );

    let car = atproto::fetch_repo(state.http(), &identity.pds, did).await?;
    tracing::debug!(did = %did, bytes = car.len(), "downloaded repository");

    let records = atproto::records_from_car(&car, SUPPORTED_COLLECTIONS)?;
    tracing::debug!(did = %did, records = records.len(), "extracted records");

    // The user row is created up front so a repository with no scrobbles still
    // produces a profile, and the handle from the DID document replaces the
    // DID placeholder — profile URLs are built from handles.
    ingest::upsert_user(state.db(), did).await?;
    if let Some(handle) = &identity.handle {
        ingest::set_handle(state.db(), did, handle).await?;
    }

    let mut stats = IngestStats::default();
    let mut deferred = Vec::new();

    for (reference, value) in records {
        let record = IncomingRecord {
            did: did.to_string(),
            collection: reference.collection.clone(),
            rkey: reference.rkey.clone(),
            value,
        };

        match ingest::ingest(state.db(), &record).await {
            Ok(result) => {
                // A like whose song had not been indexed yet is retried once
                // the rest of the repository is in.
                if result.skipped > 0 && record.collection == ingest::LIKE_NSID {
                    deferred.push(record);
                } else {
                    stats.merge(result);
                }
            }
            Err(err) => {
                // One bad record must not lose the rest of the repository.
                tracing::warn!(
                    did = %did,
                    uri = %record.uri(),
                    error = ?err,
                    "skipping record that failed to ingest"
                );
                stats.skipped += 1;
            }
        }
    }

    for record in deferred {
        match ingest::ingest(state.db(), &record).await {
            Ok(result) => stats.merge(result),
            Err(err) => {
                tracing::warn!(uri = %record.uri(), error = ?err, "deferred record failed");
                stats.skipped += 1;
            }
        }
    }

    Ok(stats)
}

/// Runs the backfill configured in `config.toml`, if any. Called at startup.
pub async fn run_configured(state: &AppState) {
    let dids = &state.config().backfill_dids;
    if dids.is_empty() {
        return;
    }

    tracing::info!(repositories = dids.len(), "starting configured backfill");
    let reports = run(state, dids).await;

    let total: u64 = reports.iter().map(|report| report.stats.total()).sum();
    let failed = reports
        .iter()
        .filter(|report| report.error.is_some())
        .count();
    tracing::info!(
        records = total,
        repositories = reports.len(),
        failed,
        "configured backfill finished"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::{ALBUM_NSID, LIKE_NSID, SCROBBLE_NSID, SONG_NSID};

    #[test]
    fn a_report_carries_the_failure_rather_than_throwing_it_away() {
        let report = RepoReport {
            did: "did:plc:alice".into(),
            stats: IngestStats::default(),
            error: Some("boom".into()),
        };
        assert!(report.error.is_some());
        assert_eq!(report.stats.total(), 0);
    }

    /// The deferred-like pass exists because MST keys sort lexicographically,
    /// which puts `like` before `song`.
    #[test]
    fn collection_keys_sort_likes_before_songs() {
        let mut collections = vec![SONG_NSID, SCROBBLE_NSID, LIKE_NSID, ALBUM_NSID];
        collections.sort_unstable();
        assert_eq!(
            collections,
            vec![ALBUM_NSID, LIKE_NSID, SCROBBLE_NSID, SONG_NSID]
        );
        assert!(
            collections.iter().position(|c| *c == LIKE_NSID)
                < collections.iter().position(|c| *c == SONG_NSID),
            "a like is reached before the song it points at, so it must be retried"
        );
    }

    #[tokio::test]
    async fn no_configured_dids_does_nothing() {
        let state = AppState::for_test().await.unwrap();
        assert!(state.config().backfill_dids.is_empty());
        // Must not attempt any network call.
        run_configured(&state).await;
    }

    #[tokio::test]
    async fn an_unresolvable_did_is_reported_and_the_run_continues() {
        let state = AppState::for_test().await.unwrap();
        let reports = run(
            &state,
            &[
                "did:key:unsupported".to_string(),
                "did:key:also".to_string(),
            ],
        )
        .await;

        assert_eq!(reports.len(), 2, "both DIDs are attempted");
        assert!(reports.iter().all(|report| report.error.is_some()));
    }
}
