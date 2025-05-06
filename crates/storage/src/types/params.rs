use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ListParams {
    pub prefix: String,
    pub continuation_token: Option<String>,
    pub delimiter: Option<String>,
    pub start_after: Option<String>,
    pub max_keys: Option<usize>,
}
