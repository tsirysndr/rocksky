use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct SpotifyApp {
    pub xata_id: String,
    pub xata_version: i32,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_updatedat: DateTime<Utc>,
    pub spotify_app_id: String,
    pub spotify_secret: String,
}
