use serde::{Deserialize, Serialize};

use super::pagination::Pagination;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetAlbumsParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
    pub genre: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetTopAlbumsParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAlbumTracksParams {
    pub album_id: String,
}
