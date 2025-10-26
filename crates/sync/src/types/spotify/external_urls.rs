use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct ExternalUrls {
    pub spotify: String,
}
