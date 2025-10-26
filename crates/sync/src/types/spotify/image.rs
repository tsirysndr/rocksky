use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Image {
    pub url: String,
    pub height: u32,
    pub width: u32,
}
