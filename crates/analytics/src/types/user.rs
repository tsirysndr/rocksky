use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct User {
    pub id: String,
    pub display_name: String,
    pub did: String,
    pub handle: String,
    pub avatar: String,
}
