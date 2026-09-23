//! Recording MSIDs, and how they map back onto a catalogue row.
//!
//! ListenBrainz gives every submitted listen a "recording MSID" — an opaque
//! UUID naming the *submitted* metadata, as opposed to an MBID naming a
//! MusicBrainz entity. Clients treat it as the identity of a track they have
//! no MBID for: Pano Scrobbler sends it back to love a song and to delete a
//! listen, and those requests carry nothing else to identify the track by.
//!
//! So an MSID here has to be reversible, and it is: it is the first half of
//! the track's catalogue `sha256` — the hash of
//! `"{title} - {artist} - {album}"` lowercased, which is the same key the
//! ingest path uses — written in UUID shape. Coming back, the dashes are
//! stripped and the row is found by hash prefix. 128 bits of a SHA-256 is not
//! going to collide across a catalogue.
//!
//! The UUID shape is not decoration: clients and their storage layers assume
//! an MSID looks like one, and a bare 64-character hash would be rejected by
//! some of them before it ever reached us.

use sha2::{Digest, Sha256};

/// The MSID for a track with this catalogue hash, or `None` if the hash is not
/// one (a row written by hand, say).
pub fn from_sha256(sha256: &str) -> Option<String> {
    let hex = sha256.get(..32)?.to_ascii_lowercase();
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

/// The `sha256` prefix an MSID names, for looking the row back up.
pub fn to_sha256_prefix(msid: &str) -> Option<String> {
    let hex: String = msid.chars().filter(|c| *c != '-').collect();
    if hex.len() != 32 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(hex.to_ascii_lowercase())
}

/// The catalogue hash of a track, as `crates/appview`'s ingest computes it.
///
/// Reproduced rather than shared because this crate needs the hash for a
/// listen that has not been ingested yet — the now-playing one — and the
/// ingest path is in another service.
pub fn track_sha256(title: &str, artist: &str, album: &str) -> String {
    let key = format!("{} - {} - {}", title, artist, album).to_lowercase();
    hex::encode(Sha256::digest(key.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_msid_round_trips_to_the_hash_prefix_it_came_from() {
        let sha = track_sha256(
            "Roygbiv",
            "Boards of Canada",
            "Music Has the Right to Children",
        );
        let msid = from_sha256(&sha).unwrap();

        assert_eq!(msid.len(), 36);
        assert_eq!(msid.matches('-').count(), 4);
        assert_eq!(to_sha256_prefix(&msid).unwrap(), sha[..32]);
    }

    /// The hash is the ingest path's, so the same track spelled in a different
    /// case has to land on the same row.
    #[test]
    fn the_hash_ignores_case() {
        assert_eq!(
            track_sha256("Roygbiv", "Boards of Canada", "Geogaddi"),
            track_sha256("ROYGBIV", "boards of canada", "GEOGADDI")
        );
    }

    #[test]
    fn something_that_is_not_an_msid_resolves_to_nothing() {
        assert!(to_sha256_prefix("not-a-msid").is_none());
        // An MBID-shaped UUID is still 32 hex digits, so it parses — the
        // caller tries `mb_id` first, which is why that is not a problem.
        assert!(to_sha256_prefix("a1b2c3d4-0000-0000-0000-000000000000").is_some());
        assert!(from_sha256("short").is_none());
    }
}
