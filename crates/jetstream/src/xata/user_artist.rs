use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct UserArtist {
    pub xata_id: String,
    pub user_id: String,
    pub artist_id: String,
    pub uri: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
