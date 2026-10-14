use serde::{Deserialize, Serialize};

use crate::{
    musicbrainz::{self, normalize_date},
    spotify, xata,
};

#[derive(Debug, Deserialize, Clone)]
pub struct Scrobble {
    pub artist: String,
    pub track: String,
    pub timestamp: u64,
    pub album: Option<String>,
    pub context: Option<String>,
    pub stream_id: Option<String>,
    pub chosen_by_user: Option<u8>,
    pub track_number: Option<u32>,
    pub mbid: Option<String>,
    pub album_artist: Option<String>,
    pub duration: Option<u32>,
    pub ignored: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub album: String,
    pub artist: String,
    pub album_artist: Option<String>,
    pub duration: u32,
    #[serde(rename = "mbId", alias = "mbid")]
    pub mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    pub track_number: u32,
    pub release_date: Option<String>,
    pub year: Option<u32>,
    pub disc_number: u32,
    pub album_art: Option<String>,
    pub spotify_link: Option<String>,
    pub label: Option<String>,
    pub artist_picture: Option<String>,
    pub timestamp: Option<u64>,
    pub genres: Option<Vec<String>>,
}

impl From<xata::track::Track> for Track {
    fn from(track: xata::track::Track) -> Self {
        Track {
            title: track.title,
            album: track.album,
            artist: track.artist,
            album_artist: Some(track.album_artist),
            album_art: track.album_art,
            spotify_link: track.spotify_link,
            label: track.label,
            artist_picture: None,
            timestamp: None,
            duration: track.duration as u32,
            mbid: track.mb_id,
            isrc: track.isrc,
            track_number: track.track_number as u32,
            disc_number: track.disc_number as u32,
            year: None,
            release_date: None,
            genres: None,
        }
    }
}

impl From<musicbrainz::recording::Recording> for Track {
    fn from(recording: musicbrainz::recording::Recording) -> Self {
        let artist_credit = recording
            .artist_credit
            .unwrap_or_default()
            .first()
            .map(|credit| credit.name.clone())
            .unwrap_or_default();
        let releases = recording.releases.unwrap_or_default();
        let album_artist = releases.first().and_then(|release| {
            let credits = release.artist_credit.clone().unwrap_or_default();
            credits.first().map(|credit| credit.name.clone())
        });
        let album = releases
            .first()
            .map(|release| release.title.clone())
            .unwrap_or_default();
        let release_date = releases
            .first()
            .and_then(|release| release.date.clone())
            .and_then(|date| normalize_date(Some(&date)).unwrap_or(None));
        tracing::info!(release_date = ?release_date, "Normalized release date:");
        Track {
            title: recording.title.clone(),
            album,
            artist: artist_credit,
            album_artist,
            duration: recording.length.unwrap_or_default(),
            year: release_date
                .as_ref()
                .and_then(|date| date.split('-').next())
                .and_then(|year| year.parse::<u32>().ok()),
            release_date: release_date.clone(),
            track_number: releases
                .first()
                .and_then(|release| {
                    release
                        .media
                        .as_ref()
                        .and_then(|media| media.first())
                        .and_then(|media| {
                            media
                                .track
                                .as_ref()
                                .and_then(|tracks| tracks.first())
                                .map(|track| track.number.parse::<u32>().unwrap())
                        })
                })
                .unwrap_or_default(),
            disc_number: releases
                .first()
                .and_then(|release| {
                    release
                        .media
                        .as_ref()
                        .and_then(|media| media.first())
                        .map(|media| media.position.unwrap_or(1) as u32)
                })
                .unwrap_or_default(),
            ..Default::default()
        }
    }
}

impl From<&spotify::types::Track> for Track {
    fn from(track: &spotify::types::Track) -> Self {
        Track {
            title: track.name.clone(),
            album: track.album.name.clone(),
            artist: track
                .artists
                .iter()
                .map(|artist| artist.name.clone())
                .collect::<Vec<_>>()
                .join(", "),
            album_artist: track
                .album
                .artists
                .first()
                .map(|artist| artist.name.clone()),
            duration: track.duration_ms as u32,
            isrc: Some(track.external_ids.isrc.clone()).filter(|s| !s.is_empty()),
            album_art: track.album.images.first().map(|image| image.url.clone()),
            spotify_link: Some(track.external_urls.spotify.clone()),
            artist_picture: track.album.artists.first().and_then(|artist| {
                artist
                    .images
                    .as_ref()
                    .and_then(|images| images.first().map(|image| image.url.clone()))
            }),
            track_number: track.track_number,
            disc_number: track.disc_number,
            release_date: match track.album.release_date_precision.as_str() {
                "day" => Some(track.album.release_date.clone()),
                _ => None,
            },
            year: match track.album.release_date_precision.as_str() {
                "day" => Some(
                    track
                        .album
                        .release_date
                        .split('-')
                        .next()
                        .unwrap()
                        .parse::<u32>()
                        .unwrap(),
                ),
                "year" => Some(track.album.release_date.parse::<u32>().unwrap()),
                _ => None,
            },
            label: track.album.label.clone(),
            genres: track
                .album
                .artists
                .first()
                .and_then(|artist| artist.genres.clone()),
            ..Default::default()
        }
    }
}

impl From<spotify::types::Track> for Track {
    fn from(track: spotify::types::Track) -> Self {
        Track::from(&track)
    }
}

impl From<rocksky_matching::Candidate> for Track {
    fn from(c: rocksky_matching::Candidate) -> Self {
        Self {
            title: c.title,
            artist: c.artists.join(", "),
            album: c.album.unwrap_or_default(),
            album_artist: c.album_artist.or_else(|| c.artists.first().cloned()),
            duration: c
                .duration_ms
                .and_then(|v| v.try_into().ok())
                .unwrap_or_default(),
            mbid: c.identifiers.musicbrainz_recording_id,
            isrc: c.identifiers.isrc,
            track_number: c.track_number.unwrap_or_default(),
            disc_number: c.disc_number.unwrap_or_default(),
            year: c
                .release_date
                .as_deref()
                .and_then(|d| d.split('-').next())
                .and_then(|y| y.parse().ok()),
            release_date: c.release_date.filter(|d| d.len() == 10),
            album_art: c.album_art,
            spotify_link: c.spotify_link.or_else(|| {
                c.identifiers
                    .spotify_track_id
                    .map(|id| format!("https://open.spotify.com/track/{id}"))
            }),
            label: c.label,
            artist_picture: c.artist_picture,
            genres: c.genres,
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod matching_conversion_tests {
    use super::*;
    #[test]
    fn selected_metadata_and_mbid_survive_the_api_wire_format() {
        let c = rocksky_matching::Candidate {
            title: "Song".into(),
            artists: vec!["Artist".into()],
            album: Some("Album".into()),
            duration_ms: Some(123000),
            track_number: Some(5),
            disc_number: Some(2),
            identifiers: rocksky_matching::Identifiers {
                musicbrainz_recording_id: Some("verified-id".into()),
                ..Default::default()
            },
            ..Default::default()
        };
        let track: Track = c.into();
        let wire = serde_json::to_value(track).unwrap();
        assert_eq!(wire["mbId"], "verified-id");
        assert_eq!(wire["albumArtist"], "Artist");
        assert_eq!(wire["duration"], 123000);
        assert_eq!(wire["trackNumber"], 5);
        assert_eq!(wire["discNumber"], 2);
    }
}
