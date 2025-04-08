use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrentlyPlaying {
    pub actions: Actions,
    pub context: Option<Context>,
    pub currently_playing_type: String,
    pub is_playing: bool,
    pub item: Option<Item>,
    pub progress_ms: Option<u64>,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Actions {
    pub disallows: Disallows,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Disallows {
    pub resuming: Option<bool>,
    pub skipping_prev: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Context {
    pub external_urls: ExternalUrls,
    pub href: String,
    #[serde(rename = "type")]
    pub context_type: String,
    pub uri: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct ExternalUrls {
    pub spotify: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Item {
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
    pub name: String,
    pub popularity: u32,
    pub preview_url: Option<String>,
    pub track_number: u32,
    #[serde(rename = "type")]
    pub item_type: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Album {
    pub album_type: String,
    pub artists: Vec<Artist>,
    pub available_markets: Vec<String>,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub images: Vec<Image>,
    pub name: String,
    pub release_date: String,
    pub release_date_precision: String,
    pub total_tracks: u32,
    #[serde(rename = "type")]
    pub album_type_field: String,
    pub uri: String,
    pub label: Option<String>,
    pub genres: Option<Vec<String>>,
    pub copyrights: Option<Vec<Copyright>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Copyright {
    pub text: String,
    pub r#type: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Artist {
    pub external_urls: ExternalUrls,
    pub href: String,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub artist_type: String,
    pub uri: String,
    pub images: Option<Vec<Image>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Image {
    pub height: u32,
    pub url: String,
    pub width: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExternalIds {
    pub isrc: String,
}
