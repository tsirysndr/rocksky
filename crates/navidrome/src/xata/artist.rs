use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize, Clone)]
pub struct ArtistRow {
    pub xata_id: String,
    pub name: String,
    pub picture: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Clone)]
pub struct ArtistWithStats {
    pub xata_id: String,
    pub name: String,
    pub picture: Option<String>,
    pub album_count: i64,
}
