use serde::{Deserialize, Serialize};

use crate::{types::spotify, xata};

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub album: String,
    pub artist: String,
    pub album_artist: Option<String>,
    pub duration: u32,
    #[serde(rename = "mbId")]
    pub mbid: Option<String>,
    pub track_number: u32,
    pub release_date: Option<String>,
    pub year: Option<u32>,
    pub disc_number: u32,
    pub album_art: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub deezer_link: Option<String>,
    pub youtube_music_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub label: Option<String>,
    pub artist_picture: Option<String>,
    pub timestamp: Option<u64>,
    pub genres: Option<Vec<String>>,
    pub isrc: Option<String>,
    pub spotify_id: Option<String>,
    pub tidal_id: Option<String>,
    pub deezer_id: Option<String>,
    pub apple_music_id: Option<String>,
    pub spotify_artist_id: Option<String>,
    pub tidal_artist_id: Option<String>,
    pub deezer_artist_id: Option<String>,
    pub apple_music_artist_id: Option<String>,
    pub spotify_album_id: Option<String>,
    pub tidal_album_id: Option<String>,
    pub deezer_album_id: Option<String>,
    pub apple_music_album_id: Option<String>,
    pub artist_roles: Option<Vec<String>>,
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
            genres: None,
            isrc: track.isrc,
            spotify_id: track.spotify_id,
            tidal_id: track.tidal_id,
            deezer_id: None,
            youtube_music_link: None,
            apple_music_link: track.apple_music_link,
            deezer_link: None,
            tidal_link: track.tidal_link,
            apple_music_id: None,
            spotify_artist_id: None,
            tidal_artist_id: None,
            deezer_artist_id: None,
            apple_music_artist_id: None,
            spotify_album_id: None,
            tidal_album_id: None,
            deezer_album_id: None,
            apple_music_album_id: None,
            artist_roles: None,
        }
    }
}

impl From<&spotify::track::Track> for Track {
    fn from(track: &spotify::track::Track) -> Self {
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
            genres: track
                .album
                .artists
                .first()
                .and_then(|artist| artist.genres.clone()),
            isrc: Some(track.external_ids.isrc.clone()),
            spotify_id: Some(track.id.clone()),
            spotify_artist_id: track.album.artists.first().map(|artist| artist.id.clone()),
            spotify_album_id: Some(track.album.id.clone()),
            ..Default::default()
        }
    }
}

impl From<spotify::track::Track> for Track {
    fn from(track: spotify::track::Track) -> Self {
        Track::from(&track)
    }
}
