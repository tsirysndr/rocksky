use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct ArtistAlbum {
    pub xata_id: String,
    pub artist_id: String,
    pub album_id: String,
}
