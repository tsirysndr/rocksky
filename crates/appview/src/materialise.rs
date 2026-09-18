//! Fetching a record this instance refers to but has not indexed.
//!
//! Some records only make sense against another one. A `app.rocksky.like`
//! carries nothing but a strongRef to an `app.rocksky.song`: no title, no
//! artist, no duration. So unlike a shout — which can be stored unattached and
//! linked later — a like whose song is missing cannot be stored at all,
//! because `loved_tracks.track_id` is NOT NULL and there is nothing in the
//! record to build a track from.
//!
//! That made likes on *other people's* songs unrecoverable. The firehose
//! delivers records repository by repository, so a like in Alice's repo
//! pointing at a song in Bob's arrives before Bob's repo is read, if it is
//! ever read at all — this instance may not be following Bob. The like was
//! counted as skipped and never seen again.
//!
//! The fix is to go and get the song. Its AT-URI names the repository holding
//! it, and a PDS will serve one record to anyone, so the reference is
//! resolvable — the same thing `crates/jetstream` does for a playlist it has
//! not seen.
//!
//! # Why this is not in `ingest`
//!
//! [`crate::ingest`] is a pure projection: records in, rows out, no network.
//! That is what lets it be tested against an in-memory database and reused by
//! the XRPC write paths. Fetching belongs to the callers that already hold an
//! HTTP client and a PLC directory — the backfill and the Tap consumer — so
//! the resolution happens one layer up, and `ingest` stays a function of its
//! arguments.

use crate::ingest::{self, IncomingRecord, IngestStats};
use crate::state::AppState;

/// Reads the record `uri` names and projects it, returning whether it landed.
///
/// `Ok(false)` covers every ordinary way this does not work — a URI that is
/// not an AT-URI, a DID that does not resolve, a record the PDS no longer has,
/// a collection this projection does not handle. None of those is an error:
/// the caller's next step is the same either way, which is to give up on the
/// reference and carry on.
pub async fn fetch(state: &AppState, uri: &str) -> anyhow::Result<bool> {
    let Some((did, collection, rkey)) = parse_at_uri(uri) else {
        return Ok(false);
    };

    // Only the collections the projection understands. Fetching anything else
    // would be a request that cannot possibly help.
    if !ingest::SUPPORTED_COLLECTIONS.contains(&collection) {
        return Ok(false);
    }

    let pds = match crate::atproto::resolve_pds(
        state.http(),
        &state.config().plc_directory_url,
        did,
    )
    .await
    {
        Ok(pds) => pds,
        Err(err) => {
            tracing::debug!(uri, error = ?err, "could not resolve the repository holding a referenced record");
            return Ok(false);
        }
    };

    let fetched = match crate::atproto::records::get_record(
        state.http(),
        &pds,
        did,
        collection,
        rkey,
    )
    .await
    {
        Ok(Some(fetched)) => fetched,
        // Deleted since, or never existed.
        Ok(None) => return Ok(false),
        Err(err) => {
            tracing::debug!(uri, error = ?err, "could not read a referenced record");
            return Ok(false);
        }
    };

    let incoming = IncomingRecord {
        did: did.to_string(),
        collection: collection.to_string(),
        rkey: rkey.to_string(),
        value: fetched.value,
    };

    let stats = ingest::ingest(state.db(), &incoming).await?;
    if stats.total() == 0 {
        return Ok(false);
    }

    crate::search::index_record(state, &incoming).await;
    tracing::debug!(uri, "materialised a referenced record");
    Ok(true)
}

/// Fetches what a record refers to, then ingests the record again.
///
/// Only for the references that cannot be stored unresolved — a like, whose
/// record holds no title, artist or duration to build a track from. A shout
/// keeps its row either way and is linked later instead.
///
/// Counted as skipped when the subject cannot be had: the reference is then
/// genuinely unusable, and saying so is better than a silent zero.
pub async fn resolve_like(state: &AppState, record: &IncomingRecord) -> IngestStats {
    let Some(subject) = like_subject(&record.value) else {
        return IngestStats {
            skipped: 1,
            ..Default::default()
        };
    };

    match fetch(state, &subject).await {
        Ok(true) => match ingest::ingest(state.db(), record).await {
            Ok(result) => {
                crate::search::index_record(state, record).await;
                result
            }
            Err(err) => {
                tracing::warn!(uri = %record.uri(), error = ?err, "retry after materialising failed");
                IngestStats {
                    skipped: 1,
                    ..Default::default()
                }
            }
        },
        Ok(false) => {
            tracing::debug!(
                uri = %record.uri(),
                subject = %subject,
                "the referenced record could not be fetched; dropping the reference"
            );
            IngestStats {
                skipped: 1,
                ..Default::default()
            }
        }
        Err(err) => {
            tracing::warn!(subject = %subject, error = ?err, "materialising a referenced record failed");
            IngestStats {
                skipped: 1,
                ..Default::default()
            }
        }
    }
}

/// The subject a like points at, if it has one.
pub fn like_subject(value: &serde_json::Value) -> Option<String> {
    value
        .get("subject")
        .and_then(|subject| {
            // A strongRef, or a bare string in older records.
            subject
                .get("uri")
                .and_then(|uri| uri.as_str())
                .or_else(|| subject.as_str())
        })
        .map(str::to_string)
        .filter(|uri| !uri.is_empty())
}

/// Splits `at://<did>/<collection>/<rkey>`.
fn parse_at_uri(uri: &str) -> Option<(&str, &str, &str)> {
    let rest = uri.strip_prefix("at://")?;
    let mut parts = rest.splitn(3, '/');
    let did = parts.next()?;
    let collection = parts.next()?;
    let rkey = parts.next()?;

    // A DID, not a handle: the PDS lookup goes through the PLC directory, and
    // a handle would have to be resolved first. Records in the wild name DIDs.
    if !did.starts_with("did:") || collection.is_empty() || rkey.is_empty() {
        return None;
    }
    Some((did, collection, rkey))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_at_uri_splits_into_its_three_parts() {
        assert_eq!(
            parse_at_uri("at://did:plc:alice/app.rocksky.song/3song"),
            Some(("did:plc:alice", "app.rocksky.song", "3song"))
        );

        // Not an AT-URI, or not addressable.
        assert_eq!(parse_at_uri("https://example.invalid/x"), None);
        assert_eq!(parse_at_uri("at://did:plc:alice"), None);
        assert_eq!(parse_at_uri("at://did:plc:alice/app.rocksky.song"), None);
        assert_eq!(parse_at_uri("at://did:plc:alice/app.rocksky.song/"), None);
        // A handle rather than a DID: the PLC lookup cannot take it.
        assert_eq!(
            parse_at_uri("at://alice.example/app.rocksky.song/3song"),
            None
        );
        assert_eq!(parse_at_uri(""), None);
    }

    /// An rkey can contain nothing surprising, but the split has to keep the
    /// whole of it rather than stopping at the first slash.
    #[test]
    fn an_rkey_is_taken_whole() {
        assert_eq!(
            parse_at_uri("at://did:plc:alice/app.rocksky.song/a/b"),
            Some(("did:plc:alice", "app.rocksky.song", "a/b"))
        );
    }

    #[test]
    fn a_like_subject_is_read_from_either_shape() {
        // A strongRef, which is what the lexicon declares.
        assert_eq!(
            like_subject(&serde_json::json!({
                "subject": { "uri": "at://did:plc:alice/app.rocksky.song/3song", "cid": "bafy" }
            }))
            .as_deref(),
            Some("at://did:plc:alice/app.rocksky.song/3song")
        );

        // A bare string, which older records carry.
        assert_eq!(
            like_subject(&serde_json::json!({
                "subject": "at://did:plc:alice/app.rocksky.song/3song"
            }))
            .as_deref(),
            Some("at://did:plc:alice/app.rocksky.song/3song")
        );

        assert_eq!(like_subject(&serde_json::json!({})), None);
        assert_eq!(like_subject(&serde_json::json!({ "subject": "" })), None);
    }

    /// Nothing is fetched for a collection the projection cannot read — that
    /// request could not help, and this runs on the firehose path.
    #[tokio::test]
    async fn an_unhandled_collection_is_not_fetched() {
        let state = AppState::for_test().await.unwrap();
        assert!(
            !fetch(&state, "at://did:plc:alice/app.bsky.feed.post/3post")
                .await
                .unwrap()
        );
        // …nor for something that is not an AT-URI at all.
        assert!(!fetch(&state, "not-a-uri").await.unwrap());
    }
}
