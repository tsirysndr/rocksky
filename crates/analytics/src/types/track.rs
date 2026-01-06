use super::pagination::Pagination;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: i32,
    pub duration: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    pub disc_number: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    pub created_at: NaiveDateTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetTracksParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetTopTracksParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetLovedTracksParams {
    pub user_did: String,
    pub pagination: Option<Pagination>,
}
