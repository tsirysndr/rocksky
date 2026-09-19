use super::pagination::Pagination;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Artist {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biography: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born_in: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub died: Option<NaiveDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    pub sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ArtistBasic {
    pub id: String,
    pub name: String,
    pub uri: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ArtistListener {
    pub artist: String,
    pub listener_rank: i64,
    pub user_id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: String,
    pub total_artist_plays: i64,
    pub most_played_track: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub most_played_track_uri: Option<String>,
    pub track_play_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetArtistsParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
    pub names: Option<Vec<String>>,
    pub genre: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetTopArtistsParams {
    pub user_did: Option<String>,
    pub pagination: Option<Pagination>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetArtistTracksParams {
    pub artist_id: String,
    pub pagination: Option<Pagination>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetArtistAlbumsParams {
    pub artist_id: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetArtistListenersParams {
    pub artist_id: String,
    pub pagination: Option<Pagination>,
}
