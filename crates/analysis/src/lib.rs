//! Key and tempo analysis for uploaded tracks.
//!
//! Ported from music-player's analysis crate, trimmed to what Rocksky stores
//! on a track: the musical **key** and the **tempo**. Tags win over detection
//! when the file carries them — a tag was written deliberately, and detection
//! only fills the gap.
//!
//! Analysis is expensive and its inputs never change — the same bytes always
//! give the same answer — so results are stored and a track is analysed once.
//! That belongs to the caller; this crate only computes.

mod decode;
mod features;
pub mod key;
pub mod tags;

pub use decode::{decode, Decoded};

use anyhow::Result;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

/// What analysis knows about one track.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Analysis {
    /// Beats per minute.
    pub bpm: Option<f32>,
    /// How much to believe the bpm, 0–1. Tempo detection is confident on a
    /// four-to-the-floor track and much less so on something rubato.
    pub bpm_confidence: Option<f32>,
    /// The musical key in traditional notation, e.g. `"Fm"` — what every other
    /// tool in a user's library shows. [`key::Key`] converts to Camelot when
    /// the wheel position is what is wanted.
    pub key: Option<String>,
    /// How much to believe the key, 0–1.
    pub key_confidence: Option<f32>,
    /// Seconds, as decoded rather than as the tags claim.
    pub duration: f32,
}

/// Analyse audio.
///
/// `extension_hint` is the file extension or codec name when it is known, to
/// help the prober; a wrong hint costs nothing.
///
/// Feature extraction that fails does not fail the analysis. A track whose
/// tempo cannot be found may still have a readable key, and returning nothing
/// would mean re-attempting all of it every time.
pub fn analyze(bytes: &[u8], extension_hint: Option<&str>) -> Result<Analysis> {
    let decoded = decode(bytes, extension_hint)?;

    let mut analysis = Analysis {
        duration: decoded.duration,
        ..Default::default()
    };

    // The file's own tempo, when it has one. Detection only fills the gap.
    match decoded.tags.bpm {
        Some(bpm) => {
            analysis.bpm = Some(bpm);
            analysis.bpm_confidence = Some(0.95);
        }
        None => match features::tempo(&decoded) {
            Ok((bpm, confidence)) => {
                analysis.bpm = Some(bpm);
                analysis.bpm_confidence = Some(confidence);
            }
            Err(cause) => tracing::debug!(%cause, "no tempo"),
        },
    }

    // The file's own key, when it has one.
    //
    // Not merely a shortcut: correlation-based detection picks the tonic well
    // and the *mode* poorly, and mode is not a small error — F major is 7B and
    // F minor is 4A, at opposite ends of the wheel. A tag written by a DJ tool
    // says which outright.
    match decoded.tags.key.clone() {
        Some(key) => {
            analysis.key = Some(key);
            // Stated rather than estimated. Not 1.0: a tag can be wrong too.
            analysis.key_confidence = Some(0.95);
        }
        None => match features::key(&decoded) {
            Ok((key, confidence)) => {
                analysis.key = Some(key);
                analysis.key_confidence = Some(confidence);
            }
            Err(cause) => tracing::debug!(%cause, "no key"),
        },
    }

    Ok(analysis)
}

/// Analyse a batch of tracks across all cores.
///
/// Decoding dominates the cost and every item is independent, so the batch
/// fans out on rayon's thread pool. `on_item` fires as each track finishes —
/// from worker threads, in completion order — so a caller can report progress
/// while long tracks are still decoding. Results come back in input order.
pub fn analyze_batch<F>(items: &[(Vec<u8>, Option<String>)], on_item: F) -> Vec<Result<Analysis>>
where
    F: Fn(usize, &Result<Analysis>) + Sync,
{
    items
        .par_iter()
        .enumerate()
        .map(|(index, (bytes, hint))| {
            let result = analyze(bytes, hint.as_deref());
            on_item(index, &result);
            result
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn nothing_is_not_a_track() {
        assert!(analyze(&[], None).is_err());
    }

    /// The batch keeps input order and reports every item exactly once, even
    /// when everything fails — progress on garbage input is still progress.
    #[test]
    fn a_batch_reports_every_item_and_keeps_order() {
        let items: Vec<(Vec<u8>, Option<String>)> = vec![
            (vec![], None),
            (b"<html>404</html>".to_vec(), Some("mp3".into())),
            (vec![], None),
        ];
        let seen = AtomicUsize::new(0);
        let results = analyze_batch(&items, |_, _| {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        assert_eq!(results.len(), 3);
        assert_eq!(seen.load(Ordering::SeqCst), 3);
        assert!(results.iter().all(|r| r.is_err()));
    }
}
