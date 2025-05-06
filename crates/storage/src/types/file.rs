use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct File {
    pub last_modified: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    e_tag: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage_class: Option<String>,

    pub key: String,
    pub owner: String,
    pub size: u64,
}
