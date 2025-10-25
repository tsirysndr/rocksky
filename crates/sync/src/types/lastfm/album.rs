use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Album {
    #[serde(rename = "#text")]
    pub text: String,
    pub mbid: String,
}
