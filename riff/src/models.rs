//! Spotify Web API object shapes.
//!
//! `href` / `uri` / `external_urls` are emitted with Spotify's own canonical
//! hosts rather than riff's, so a response is byte-comparable with the real API
//! and a client that stores those URLs keeps storing the same thing after
//! switching `SPOTIFY_API_URL` over.

use serde::Serialize;

pub const API_BASE: &str = "https://api.spotify.com/v1";

pub fn href(kind_plural: &str, id: &str) -> String {
    format!("{API_BASE}/{kind_plural}/{id}")
}

pub fn uri(kind: &str, id: &str) -> String {
    format!("spotify:{kind}:{id}")
}

#[derive(Serialize, Clone)]
pub struct ExternalUrls {
    pub spotify: String,
}

impl ExternalUrls {
    pub fn new(kind: &str, id: &str) -> Self {
        Self {
            spotify: format!("https://open.spotify.com/{kind}/{id}"),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct Image {
    pub url: String,
    pub height: Option<i64>,
    pub width: Option<i64>,
}

#[derive(Serialize, Clone)]
pub struct Followers {
    pub href: Option<String>,
    pub total: i64,
}

#[derive(Serialize, Clone)]
pub struct SimplifiedArtist {
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub uri: String,
}

impl SimplifiedArtist {
    pub fn new(id: String, name: String) -> Self {
        Self {
            external_urls: ExternalUrls::new("artist", &id),
            href: href("artists", &id),
            name,
            kind: "artist",
            uri: uri("artist", &id),
            id,
        }
    }
}

#[derive(Serialize, Clone)]
pub struct Artist {
    #[serde(flatten)]
    pub base: SimplifiedArtist,
    pub followers: Followers,
    /// From `artist_genres.parquet`; `[]` when that file is absent, which is
    /// also what Spotify returns for plenty of real artists.
    pub genres: Vec<String>,
    pub images: Vec<Image>,
    pub popularity: i64,
}

#[derive(Serialize, Clone)]
pub struct Copyright {
    pub text: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
}

#[derive(Serialize, Clone)]
pub struct AlbumExternalIds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amgid: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct SimplifiedAlbum {
    pub album_type: String,
    /// Only set on `/artists/{id}/albums`, matching Spotify.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_group: Option<String>,
    pub artists: Vec<SimplifiedArtist>,
    pub available_markets: Vec<String>,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub images: Vec<Image>,
    pub name: String,
    pub release_date: String,
    pub release_date_precision: String,
    pub total_tracks: i64,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub uri: String,
}

#[derive(Serialize, Clone)]
pub struct Album {
    #[serde(flatten)]
    pub base: SimplifiedAlbum,
    pub copyrights: Vec<Copyright>,
    pub external_ids: AlbumExternalIds,
    pub genres: Vec<String>,
    pub label: Option<String>,
    pub popularity: i64,
    pub tracks: Page<SimplifiedTrack>,
}

#[derive(Serialize, Clone)]
pub struct SimplifiedTrack {
    pub artists: Vec<SimplifiedArtist>,
    pub available_markets: Vec<String>,
    pub disc_number: i64,
    pub duration_ms: i64,
    pub explicit: bool,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub is_local: bool,
    pub name: String,
    pub preview_url: Option<String>,
    pub track_number: i64,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub uri: String,
}

#[derive(Serialize, Clone)]
pub struct Track {
    #[serde(flatten)]
    pub base: SimplifiedTrack,
    pub album: SimplifiedAlbum,
    pub external_ids: TrackExternalIds,
    pub popularity: i64,
}

#[derive(Serialize, Clone)]
pub struct TrackExternalIds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AudioFeatures {
    pub acousticness: Option<f64>,
    pub analysis_url: String,
    pub danceability: Option<f64>,
    pub duration_ms: Option<i64>,
    pub energy: Option<f64>,
    pub id: String,
    pub instrumentalness: Option<f64>,
    pub key: Option<i64>,
    pub liveness: Option<f64>,
    pub loudness: Option<f64>,
    pub mode: Option<i64>,
    pub speechiness: Option<f64>,
    pub tempo: Option<f64>,
    pub time_signature: Option<i64>,
    pub track_href: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub uri: String,
    pub valence: Option<f64>,
}

#[derive(Serialize, Clone)]
pub struct Page<T> {
    pub href: String,
    pub items: Vec<T>,
    pub limit: u32,
    pub next: Option<String>,
    pub offset: u32,
    pub previous: Option<String>,
    pub total: i64,
}

impl<T> Page<T> {
    /// `path_and_query` is the request path with its query string minus
    /// `limit`/`offset`, e.g. `/albums/xyz/tracks?market=US`.
    pub fn new(base: &str, items: Vec<T>, limit: u32, offset: u32, total: i64) -> Self {
        let sep = if base.contains('?') { '&' } else { '?' };
        let page_url = |off: u32| format!("{API_BASE}{base}{sep}offset={off}&limit={limit}");
        let returned = items.len() as u32;
        Self {
            href: page_url(offset),
            next: (i64::from(offset + returned) < total).then(|| page_url(offset + limit)),
            previous: (offset > 0).then(|| page_url(offset.saturating_sub(limit))),
            items,
            limit,
            offset,
            total,
        }
    }
}

// `GET /v1/artists?ids=` and friends answer with a single named array whose
// entries are `null` for ids that did not resolve — Spotify keeps the array
// aligned with the requested ids rather than dropping misses, and callers index
// into it positionally.

#[derive(Serialize)]
pub struct ManyArtists {
    pub artists: Vec<Option<Artist>>,
}

#[derive(Serialize)]
pub struct ManyAlbums {
    pub albums: Vec<Option<Album>>,
}

#[derive(Serialize)]
pub struct ManyTracks {
    pub tracks: Vec<Option<Track>>,
}

#[derive(Serialize)]
pub struct ManyAudioFeatures {
    pub audio_features: Vec<Option<AudioFeatures>>,
}

/// `GET /v1/artists/{id}/top-tracks` is a bare array, not a paging object.
#[derive(Serialize)]
pub struct TopTracks {
    pub tracks: Vec<Track>,
}

#[derive(Serialize)]
pub struct SearchResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Page<Track>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artists: Option<Page<Artist>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub albums: Option<Page<SimplifiedAlbum>>,
}
