use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct PlaylistTrack {
    pub xata_id: String,
    pub playlist_id: String,
    pub track_id: String,
    pub added_by: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
