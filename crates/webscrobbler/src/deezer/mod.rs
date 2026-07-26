pub mod client;

use crate::types::Track;
use client::EnrichedTrack;

impl From<EnrichedTrack> for Track {
    fn from(t: EnrichedTrack) -> Self {
        // Derive a year from the release date when Deezer didn't provide one.
        let year = t.year.or_else(|| {
            t.release_date
                .as_deref()
                .and_then(|d| d.split('-').next())
                .and_then(|y| y.parse::<u32>().ok())
        });

        Track {
            title: t.title,
            album: t.album,
            artist: t.artist.clone(),
            album_artist: t.album_artist.or(Some(t.artist)),
            duration: t.duration_ms as u32,
            mbid: None,
            isrc: t.isrc.filter(|s| !s.is_empty()),
            track_number: t.track_number.unwrap_or(0),
            release_date: t.release_date,
            year,
            disc_number: t.disc_number.unwrap_or(0),
            album_art: t.album_art,
            spotify_link: None,
            label: t.label,
            artist_picture: t.artist_picture,
            timestamp: None,
            genres: t.genres.filter(|g| !g.is_empty()),
        }
    }
}

impl From<&EnrichedTrack> for Track {
    fn from(t: &EnrichedTrack) -> Self {
        Track::from(t.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enriched_track_maps_to_track() {
        let enriched = EnrichedTrack {
            title: "Get Lucky".into(),
            artist: "Daft Punk".into(),
            album: "Random Access Memories".into(),
            album_art: Some("https://cdn/art.jpg".into()),
            isrc: Some("GBDUW1300109".into()),
            duration_ms: 369_000,
            track_number: Some(8),
            disc_number: Some(1),
            release_date: Some("2013-05-17".into()),
            label: Some("Columbia".into()),
            genres: Some(vec!["Dance".into(), "Pop".into()]),
            artist_picture: Some("https://cdn/artist.jpg".into()),
            ..Default::default()
        };

        let track: Track = enriched.into();

        assert_eq!(track.title, "Get Lucky");
        assert_eq!(track.album_artist.as_deref(), Some("Daft Punk"));
        assert_eq!(track.duration, 369_000);
        assert_eq!(track.isrc.as_deref(), Some("GBDUW1300109"));
        assert_eq!(track.track_number, 8);
        assert_eq!(track.disc_number, 1);
        assert_eq!(track.release_date.as_deref(), Some("2013-05-17"));
        // Year derived from the release date when absent.
        assert_eq!(track.year, Some(2013));
        assert_eq!(track.label.as_deref(), Some("Columbia"));
        assert_eq!(
            track.genres.as_deref(),
            Some(&["Dance".to_string(), "Pop".to_string()][..])
        );
        // Deezer never populates the Spotify link / MBID.
        assert!(track.spotify_link.is_none());
        assert!(track.mbid.is_none());
    }

    #[test]
    fn empty_isrc_and_genres_become_none() {
        let enriched = EnrichedTrack {
            title: "x".into(),
            artist: "y".into(),
            album: "z".into(),
            isrc: Some(String::new()),
            genres: Some(vec![]),
            ..Default::default()
        };
        let track: Track = enriched.into();
        assert!(track.isrc.is_none());
        assert!(track.genres.is_none());
        assert_eq!(track.year, None);
    }
}
