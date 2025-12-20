use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct ExternalIds {
    pub isrc: String,
}
