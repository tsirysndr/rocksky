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

    let mut records = atproto::records_from_car(&car, SUPPORTED_COLLECTIONS)?;
    tracing::debug!(did = %did, records = records.len(), "extracted records");

    // Content before commentary.
    //
    // A like, a shout or a reply is stored against the thing it refers to,
    // looked up by URI — so if it is ingested before that thing exists, the
    // reference cannot be resolved. Records come out of the repository in MST
    // order, which is alphabetical by collection, and that puts
    // `app.rocksky.like` and `app.rocksky.graph.follow` *before*
    // `app.rocksky.song`.
    //
    // Sorting by this rank costs one pass over a list already in memory and
    // removes the whole class of problem within a repository. It cannot help
    // across repositories — a reply to somebody else's shout depends on their
    // repository having been read — which is why the links are also fillable
    // after the fact; see `ingest::fill_shout_link`.
    records.sort_by_key(|(reference, _)| ingest_rank(&reference.collection));

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
                    crate::search::index_record(state, &record).await;
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
            Ok(result) => {
                stats.merge(result);
                crate::search::index_record(state, &record).await;
            }
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

/// Where a collection belongs in the ingest order.
///
/// Lower first: the things that can be referred to, then the things that refer
/// to them. Anything unlisted sorts last, which is the safe end — a record
/// this projection does not know cannot be a prerequisite for one it does.
fn ingest_rank(collection: &str) -> u8 {
    match collection {
        // Standalone: a song, album or artist record names only itself.
        ingest::SONG_NSID | ingest::ALBUM_NSID | ingest::ARTIST_NSID => 0,
        // Builds on the catalogue, and is itself a shout subject.
        ingest::SCROBBLE_NSID => 1,
        // Point at all of the above by URI.
        ingest::LIKE_NSID | ingest::SHOUT_NSID | ingest::FOLLOW_NSID => 2,
        _ => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::{
        ALBUM_NSID, ARTIST_NSID, FOLLOW_NSID, LIKE_NSID, SCROBBLE_NSID, SHOUT_NSID, SONG_NSID,
    };

    /// The ordering that makes a reference resolvable: everything a like or a
    /// shout can point at is ingested first.
    #[test]
    fn content_is_ingested_before_the_things_that_refer_to_it() {
        let mut collections = vec![
            LIKE_NSID,
            SHOUT_NSID,
            SONG_NSID,
            FOLLOW_NSID,
            SCROBBLE_NSID,
            ALBUM_NSID,
            ARTIST_NSID,
        ];
        collections.sort_by_key(|c| ingest_rank(c));

        let at = |needle: &str| collections.iter().position(|c| *c == needle).unwrap();
        for subject in [SONG_NSID, ALBUM_NSID, ARTIST_NSID, SCROBBLE_NSID] {
            for referrer in [LIKE_NSID, SHOUT_NSID, FOLLOW_NSID] {
                assert!(
                    at(subject) < at(referrer),
                    "{subject} must be ingested before {referrer}"
                );
            }
        }
        // And a scrobble after the catalogue it is built from, since a shout
        // can point at either.
        assert!(at(SONG_NSID) < at(SCROBBLE_NSID));
    }

    /// An unknown collection sorts last rather than first, so a record this
    /// projection cannot read never delays one it can.
    #[test]
    fn an_unknown_collection_sorts_last() {
        assert!(ingest_rank("app.bsky.feed.post") > ingest_rank(SHOUT_NSID));
    }

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
