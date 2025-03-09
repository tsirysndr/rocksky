use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyResponse {
    pub href: String,
    pub limit: u32,
    pub next: Option<String>,
    pub offset: u32,
    pub previous: Option<String>,
    pub total: u32,
    pub items: Vec<Playlist>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Playlist {
    pub collaborative: bool,
    pub description: String,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub images: Vec<Image>,
    pub name: String,
    pub owner: Owner,
    pub primary_color: Option<String>,
    pub public: Option<bool>,
    pub snapshot_id: String,
    pub tracks: Tracks,
    pub r#type: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExternalUrls {
    pub spotify: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Image {
    pub height: u32,
    pub url: String,
    pub width: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Owner {
    pub display_name: Option<String>,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub r#type: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tracks {
    pub href: String,
    pub limit: Option<u32>,
    pub next: Option<String>,
    pub offset: Option<u32>,
    pub previous: Option<String>,
    pub total: u32,
    pub items: Option<Vec<TrackItem>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackItem {
    pub added_at: String,
    pub added_by: Owner,
    pub is_local: bool,
    pub track: Track,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
    pub is_playable: Option<bool>,
    pub linked_from: Option<LinkedFrom>,
    pub restrictions: Option<Restrictions>,
    pub name: String,
    pub popularity: u32,
    pub preview_url: Option<String>,
    pub track_number: u32,
    pub r#type: String,
    pub uri: String,
    pub is_local: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Album {
    pub album_type: String,
    pub total_tracks: u32,
    pub available_markets: Vec<String>,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub images: Vec<Image>,
    pub name: String,
    pub release_date: String,
    pub release_date_precision: String,
    pub restrictions: Option<Restrictions>,
    pub r#type: String,
    pub uri: String,
    pub artists: Vec<Artist>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Artist {
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExternalIds {
    pub isrc: String,
    pub ean: Option<String>,
    pub upc: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LinkedFrom {}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Restrictions {
    pub reason: String,
}
