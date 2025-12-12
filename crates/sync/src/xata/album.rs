use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Album {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub release_date: Option<String>,
    pub album_art: Option<String>,
    pub year: Option<i32>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub sha256: String,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub spotify_id: Option<String>,
    pub tidal_id: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
