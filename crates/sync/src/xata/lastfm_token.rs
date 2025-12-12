use serde::Deserialize;

#[derive(Debug, Deserialize, sqlx::FromRow, Default, Clone)]
pub struct LastfmToken {
    pub xata_id: String,
    pub user_id: String,
    pub user: String,
    pub session_key: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
}
