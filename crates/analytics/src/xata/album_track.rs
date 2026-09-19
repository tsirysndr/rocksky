use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct AlbumTrack {
    pub xata_id: String,
    pub album_id: String,
    pub track_id: String,
}
