use serde::Deserialize;

use crate::types::spotify::external_urls::ExternalUrls;

#[derive(Debug, Deserialize)]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub external_urls: ExternalUrls,
    pub href: String,
    pub r#type: String,
    pub uri: String,
}
