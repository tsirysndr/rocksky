//! Turning catalogue rows into the shapes the ListenBrainz API answers with.
//!
//! # No cover art
//!
//! A ListenBrainz listen carries no image URL. Clients that show one build it
//! from `mbid_mapping.release_mbid` against the Cover Art Archive, and the
//! catalogue stores no release MBID — `albums` has no such column, and
//! `tracks.mb_id` is a *recording* MBID, which that URL will not accept. So
//! these responses carry the recording MBID where there is one and no release
//! MBID ever, and a client rendering cover art from a ListenBrainz account
//! shows none. Rocksky's own `album_art` cannot be substituted: there is no
//! field on the wire to put it in.

use rocksky_db::models::Track;

use crate::listenbrainz::msid;
use crate::listenbrainz::types::{
    ListenAdditionalInfo, ListenTrackMetadata, MbidMapping, StatsEntry,
};

/// Empty strings mean "no album" in the catalogue; on the wire that is a null.
fn some(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// The recording MSID naming this row — see [`crate::listenbrainz::msid`].
pub fn recording_msid(track: &Track) -> Option<String> {
    msid::from_sha256(&track.sha256)
}

pub fn track_metadata(track: &Track) -> ListenTrackMetadata {
    ListenTrackMetadata {
        artist_name: track.artist.clone(),
        track_name: track.title.clone(),
        release_name: some(&track.album),
        additional_info: Some(ListenAdditionalInfo {
            duration_ms: (track.duration > 0).then_some(track.duration),
            recording_msid: recording_msid(track),
            isrc: track.isrc.clone(),
            tracknumber: track.track_number,
            discnumber: track.disc_number,
            ..Default::default()
        }),
        mbid_mapping: track.mb_id.clone().map(|recording_mbid| MbidMapping {
            recording_mbid: Some(recording_mbid),
            release_mbid: None,
            artist_mbids: None,
        }),
    }
}

/// One chart row for a track — the shape `stats/user/{name}/recordings`
/// answers with.
pub fn recording_entry(track: &Track, listen_count: i64) -> StatsEntry {
    StatsEntry {
        artist_name: track.artist.clone(),
        artist_mbids: None,
        release_name: some(&track.album),
        release_mbid: None,
        track_name: Some(track.title.clone()),
        recording_mbid: track.mb_id.clone(),
        listen_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track() -> Track {
        Track {
            id: "rec_1".into(),
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album_artist: "Boards of Canada".into(),
            album_art: Some("https://example.test/art.jpg".into()),
            album: "Music Has the Right to Children".into(),
            track_number: Some(4),
            duration: 151_000,
            mb_id: None,
            isrc: None,
            youtube_link: None,
            spotify_link: None,
            apple_music_link: None,
            tidal_link: None,
            sha256: crate::listenbrainz::msid::track_sha256(
                "Roygbiv",
                "Boards of Canada",
                "Music Has the Right to Children",
            ),
            disc_number: Some(1),
            lyrics: None,
            composer: None,
            genre: None,
            label: None,
            copyright_message: None,
            key: None,
            bpm: None,
            uri: None,
            album_uri: None,
            artist_uri: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
            xata_version: None,
        }
    }

    /// `tracks.duration` is already milliseconds — the Subsonic front ends
    /// divide it by a thousand to get Subsonic's seconds — and so is
    /// `duration_ms` on the wire. Scaling it "to milliseconds" would make
    /// every track look a thousand times too long.
    #[test]
    fn duration_passes_through_as_milliseconds() {
        let meta = track_metadata(&track());
        assert_eq!(meta.additional_info.unwrap().duration_ms, Some(151_000));
    }

    /// A track with no duration recorded sends none, rather than zero: a
    /// client reads a zero as a real length and draws an empty progress bar.
    #[test]
    fn an_unknown_duration_is_absent() {
        let mut track = track();
        track.duration = 0;
        assert_eq!(
            track_metadata(&track).additional_info.unwrap().duration_ms,
            None
        );
    }

    /// A track with no album has `""` in the column, and a client rendering
    /// that shows an album line containing nothing rather than no album line.
    #[test]
    fn a_blank_album_is_null_rather_than_empty() {
        let mut track = track();
        track.album = "  ".into();
        assert_eq!(track_metadata(&track).release_name, None);
    }

    /// With no recording MBID there is no mapping at all, rather than a
    /// mapping full of nulls — the latter is what a client checks before
    /// deciding it has an MBID to work with.
    #[test]
    fn the_mbid_mapping_is_absent_when_there_is_no_mbid() {
        assert!(track_metadata(&track()).mbid_mapping.is_none());

        let mut track = track();
        track.mb_id = Some("b1a9c0e9".into());
        let mapping = track_metadata(&track).mbid_mapping.unwrap();
        assert_eq!(mapping.recording_mbid.as_deref(), Some("b1a9c0e9"));
        assert_eq!(mapping.release_mbid, None);
    }
}
