use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ExternalIds {
    pub isrc: String,
}
