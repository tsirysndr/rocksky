use serde::{Deserialize, Serialize};

use crate::{musicbrainz, spotify, xata};

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
    pub mbid: Option<String>,
    pub track_number: u32,
    pub release_date: Option<String>,
    pub year: Option<u32>,
    pub disc_number: u32,
    pub album_art: Option<String>,
    pub spotify_link: Option<String>,
    pub label: Option<String>,
    pub artist_picture: Option<String>,
    pub timestamp: Option<u64>,
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
            track_number: track.track_number as u32,
            disc_number: track.disc_number as u32,
            year: None,
            release_date: None,
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
        Track {
            title: recording.title.clone(),
            album,
            artist: artist_credit,
            album_artist,
            duration: recording.length.unwrap_or_default(),
            year: recording
                .first_release_date
                .as_ref()
                .and_then(|date| date.split('-').next())
                .and_then(|year| year.parse::<u32>().ok()),
            release_date: recording.first_release_date.clone(),
            track_number: releases
                .first()
                .and_then(|release| {
                    release
                        .media
                        .as_ref()
                        .and_then(|media| media.first())
                        .and_then(|media| {
                            media
                                .tracks
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
                        .map(|media| media.position)
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
            ..Default::default()
        }
    }
}

impl From<spotify::types::Track> for Track {
    fn from(track: spotify::types::Track) -> Self {
        Track::from(&track)
    }
}
