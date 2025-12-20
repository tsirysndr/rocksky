use serde::Deserialize;

use crate::types::spotify::{external_urls::ExternalUrls, image::Image};

#[derive(Debug, Deserialize, Clone)]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub r#type: String,
    pub uri: String,
    pub images: Option<Vec<Image>>,
    pub genres: Option<Vec<String>>,
}
