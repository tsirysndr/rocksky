use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct ArtistAlbum {
    pub xata_id: String,
    pub artist_id: String,
    pub album_id: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    #[sqlx(try_from = "rocksky_db::timestamp::UtcTimestamp")]
    pub xata_createdat: chrono::DateTime<chrono::Utc>,
}
