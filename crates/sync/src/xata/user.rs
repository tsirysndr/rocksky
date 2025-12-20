use serde::Deserialize;

#[derive(Debug, sqlx::FromRow, Deserialize, Clone)]
pub struct User {
    pub xata_id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: String,
}
