use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ExternalUrls {
    pub spotify: String,
}
