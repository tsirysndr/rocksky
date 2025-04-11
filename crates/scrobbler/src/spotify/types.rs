use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SearchResponse {
    pub tracks: Tracks,
}

#[derive(Debug, Deserialize)]
pub struct Tracks {
    pub href: String,
    pub limit: u32,
    pub next: Option<String>,
    pub offset: u32,
    pub previous: Option<String>,
    pub total: u32,
    pub items: Vec<Track>,
}

#[derive(Debug, Deserialize)]
pub struct Track {
    pub album: Album,
    pub artists: Vec<Artist>,
    pub available_markets: Vec<String>,
    pub disc_number: u32,
    pub duration_ms: u32,
    pub explicit: bool,
    pub external_ids: ExternalIds,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub is_local: bool,
    pub is_playable: Option<bool>,
    pub name: String,
    pub popularity: u32,
    pub preview_url: Option<String>,
    pub track_number: u32,
    #[serde(rename = "type")]
    pub kind: String,
    pub uri: String,
}

#[derive(Debug, Deserialize)]
pub struct Album {
    pub album_type: String,
    pub artists: Vec<Artist>,
    pub available_markets: Vec<String>,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub images: Vec<Image>,
    pub is_playable: Option<bool>,
    pub name: String,
    pub release_date: String,
    pub release_date_precision: String,
    pub total_tracks: u32,
    #[serde(rename = "type")]
    pub kind: String,
    pub uri: String,
}

#[derive(Debug, Deserialize)]
pub struct Artist {
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub uri: String,
}

#[derive(Debug, Deserialize)]
pub struct ExternalUrls {
    pub spotify: String,
}

#[derive(Debug, Deserialize)]
pub struct ExternalIds {
    pub isrc: String,
}

#[derive(Debug, Deserialize)]
pub struct Image {
    pub height: u32,
    pub width: u32,
    pub url: String,
}
