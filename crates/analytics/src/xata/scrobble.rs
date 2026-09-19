use chrono::{DateTime, Utc};
use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct Scrobble {
    pub xata_id: String,
    pub user_id: String,
    pub track_id: String,
    pub album_id: Option<String>,
    pub artist_id: Option<String>,
    pub uri: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub timestamp: DateTime<Utc>,
}
