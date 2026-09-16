//! How a track, album or artist is identified.
//!
//! Rocksky has no numeric ids in its records: an entity is identified by a
//! hash of its own metadata, so the same song scrobbled by two people from two
//! sources lands on one row without anyone coordinating. That makes these four
//! functions load-bearing, and their exact inputs part of the data format:
//!
//! | entity | hash                                              |
//! |--------|---------------------------------------------------|
//! | track  | `sha256(lower("{title} - {artist} - {album}"))`     |
//! | album  | `sha256(lower("{album} - {albumArtist}"))`          |
//! | artist | `sha256(lower(name))`                              |
//! | cover  | `md5(lower("{albumArtist} - {album}"))`             |
//!
//! Changing any of them orphans every existing row, so they are defined here,
//! once, rather than reimplemented per caller — which is how the scrobble
//! indexer, the upload pipeline and the cloud-drive scanners came to agree in
//! the first place.
//!
//! The cover is md5 and the rest sha256 for no better reason than that is what
//! was built first and what the objects in storage are already named after.

use sha2::{Digest, Sha256};

fn sha256_hex(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

/// `sha256(lower("{title} - {artist} - {album}"))`
///
/// The album is part of a track's identity, which is why the same recording on
/// an original release and on a compilation is two rows. That is deliberate: a
/// play of one is not a play of the other, and their track numbers differ.
pub fn track_hash(title: &str, artist: &str, album: &str) -> String {
    sha256_hex(&format!("{title} - {artist} - {album}").to_lowercase())
}

/// `sha256(lower("{album} - {albumArtist}"))`
///
/// The *album* artist, not the track artist: a compilation's tracks each have
/// their own artist, and keying on those would split one album into many.
pub fn album_hash(album: &str, album_artist: &str) -> String {
    sha256_hex(&format!("{album} - {album_artist}").to_lowercase())
}

/// `sha256(lower(name))`
pub fn artist_hash(name: &str) -> String {
    sha256_hex(&name.to_lowercase())
}

/// `md5(lower("{albumArtist} - {album}"))`
///
/// The object name cover art is stored under. Note the order is reversed
/// relative to [`album_hash`] — artist first here, album first there — which
/// is an accident of history now fixed by every object already in storage.
pub fn cover_id(album_artist: &str, album: &str) -> String {
    let digest = md5::compute(format!("{album_artist} - {album}").to_lowercase());
    format!("{digest:x}")
}

/// The cover shown when a track has none.
///
/// Substituted before a row is written or a record published, rather than left
/// NULL, so nothing downstream has to special-case a missing cover.
pub const PLACEHOLDER_ALBUM_ART: &str =
    "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";

#[cfg(test)]
mod tests {
    use super::*;

    /// Fixed values, because changing any of these orphans every row in every
    /// deployed database. A failure here is not a bug in the test.
    ///
    /// The expectations are the digests of the documented inputs, computed
    /// independently:
    ///
    /// ```text
    /// sha256("roygbiv - boards of canada - music has the right to children")
    /// sha256("music has the right to children - boards of canada")
    /// sha256("boards of canada")
    /// md5("boards of canada - music has the right to children")
    /// ```
    #[test]
    fn the_hashes_are_stable() {
        const TITLE: &str = "Roygbiv";
        const ARTIST: &str = "Boards of Canada";
        const ALBUM: &str = "Music Has the Right to Children";

        assert_eq!(
            track_hash(TITLE, ARTIST, ALBUM),
            "28a9a16f6771587ac94e23c9bd9d09d4b4c3e19dad2a5e012bc5fb35577370bd"
        );
        assert_eq!(
            album_hash(ALBUM, ARTIST),
            "423fba73a4d13df31e2c3258502fdc8e3ddac17fb4f3062d9b441622d159fb05"
        );
        assert_eq!(
            artist_hash(ARTIST),
            "aa2c2448a9434297d175412e0368baf5901c930fff9cb0dff88ef6e7db54bdec"
        );
        assert_eq!(cover_id(ARTIST, ALBUM), "bf1cc97ec6b6ee551eefd8c9118805a5");
    }

    /// Case is folded, so tags that differ only in capitalisation still meet.
    #[test]
    fn hashing_is_case_insensitive() {
        assert_eq!(
            track_hash("ROYGBIV", "BOARDS OF CANADA", "MUSIC"),
            track_hash("roygbiv", "boards of canada", "music"),
        );
        assert_eq!(artist_hash("Björk"), artist_hash("BJÖRK"));
        assert_eq!(
            album_hash("Vespertine", "Björk"),
            album_hash("VESPERTINE", "björk")
        );
        assert_eq!(
            cover_id("Björk", "Vespertine"),
            cover_id("BJÖRK", "vespertine")
        );
    }

    /// The album is part of a track's identity: two editions of one recording
    /// are two tracks.
    #[test]
    fn the_album_is_part_of_a_tracks_identity() {
        let single = track_hash("Somewhere Only We Know", "Keane", "Hopes And Fears");
        let compilation = track_hash("Somewhere Only We Know", "Keane", "Now That's 57");
        assert_ne!(single, compilation);
    }

    /// And the album artist is what keys an album, so a compilation does not
    /// fragment.
    #[test]
    fn an_album_is_keyed_on_its_album_artist() {
        let first = album_hash("Now That's 57", "Various Artists");
        let second = album_hash("Now That's 57", "Various Artists");
        assert_eq!(first, second);
        assert_ne!(first, album_hash("Now That's 57", "Keane"));
    }

    /// The cover's argument order is the reverse of the album hash's. Easy to
    /// get wrong, and wrong means every cover lands at a new name.
    #[test]
    fn the_cover_id_takes_the_artist_first() {
        assert_ne!(
            cover_id("Keane", "Hopes And Fears"),
            cover_id("Hopes And Fears", "Keane")
        );
        // 32 hex characters, which is what the stored object names are.
        let id = cover_id("Keane", "Hopes And Fears");
        assert_eq!(id.len(), 32, "{id}");
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()), "{id}");
    }

    #[test]
    fn a_sha256_hash_is_sixty_four_hex_characters() {
        for hash in [
            track_hash("a", "b", "c"),
            album_hash("a", "b"),
            artist_hash("a"),
        ] {
            assert_eq!(hash.len(), 64, "{hash}");
            assert!(hash.chars().all(|c| c.is_ascii_hexdigit()), "{hash}");
        }
    }
}
