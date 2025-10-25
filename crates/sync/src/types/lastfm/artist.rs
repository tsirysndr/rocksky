use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Artist {
    #[serde(rename = "#text")]
    pub text: String,
    pub mbid: String,
}
