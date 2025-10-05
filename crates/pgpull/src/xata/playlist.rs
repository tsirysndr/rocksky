use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Playlist {
    pub xata_id: String,
    pub name: String,
    pub description: Option<String>,
    pub picture: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
    pub uri: Option<String>,
    pub created_by: String,
}
