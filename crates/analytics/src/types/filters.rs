use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Filters {
    pub user_did: Option<String>,
    pub order_by: Option<String>,
    pub asc: Option<bool>,
}
