use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct PlaylistTrack {
    pub xata_id: String,
    pub playlist_id: String,
    pub track_id: String,
    pub uri: Option<String>,
    pub cid: Option<String>,
    pub added_by: Option<String>,
    pub added_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
