use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct UserPlaylist {
    pub xata_id: String,
    pub user_id: String,
    pub playlist_id: String,
    pub uri: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    #[sqlx(try_from = "rocksky_db::timestamp::UtcTimestamp")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
