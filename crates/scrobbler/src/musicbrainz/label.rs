use serde::Deserialize;

use super::artist::{Area, LifeSpan};

#[derive(Debug, Deserialize)]
pub struct Label {
    #[serde(rename = "type-id")]
    pub type_id: String,
    pub disambiguation: String,
    #[serde(rename = "label-code")]
    pub label_code: u32,
    #[serde(rename = "sort-name")]
    pub sort_name: String,
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub area: Option<Area>,
    pub country: Option<String>,
    pub isnis: Option<Vec<String>>,
    pub ipis: Option<Vec<String>>,
    #[serde(rename = "life-span")]
    pub life_span: Option<LifeSpan>,
}

#[derive(Debug, Deserialize)]
pub struct LabelInfo {
    #[serde(rename = "catalog-number")]
    pub catalog_number: String,
    pub label: Label,
}
