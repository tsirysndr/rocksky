use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct SpotifyToken {
    pub xata_id: String,
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub spotify_app_id: String,
    pub spotify_secret: String,
}
