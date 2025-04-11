use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Artist {
    pub xata_id: String,
    pub name: String,
    pub biography: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub born: Option<DateTime<Utc>>,
    pub born_in: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub died: Option<DateTime<Utc>>,
    pub picture: Option<String>,
    pub sha256: String,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub uri: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}
