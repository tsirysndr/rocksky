use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct LovedTrack {
    pub xata_id: String,
    pub user_id: String,
    pub track_id: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
