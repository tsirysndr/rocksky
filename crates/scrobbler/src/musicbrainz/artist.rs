use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct Artist {
    pub name: String,
    #[serde(rename = "sort-name")]
    pub sort_name: String,
    pub r#type: Option<String>,
    #[serde(rename = "type-id")]
    pub type_id: Option<String>,
    #[serde(rename = "life-span")]
    pub life_span: Option<LifeSpan>,
    pub isnis: Option<Vec<String>>,
    pub ipis: Option<Vec<String>>,
    pub id: String,
    #[serde(rename = "gender-id")]
    pub gender_id: Option<String>,
    pub gender: Option<String>,
    #[serde(rename = "end_area")]
    pub end_area: Option<Area>,
    #[serde(rename = "end-area")]
    pub end_area_: Option<Area>,
    pub disambiguation: Option<String>,
    pub country: Option<String>,
    pub begin_area: Option<Area>,
    #[serde(rename = "begin-area")]
    pub begin_area_: Option<Area>,
    pub area: Option<Area>,
    pub aliases: Option<Vec<Alias>>,
}

#[derive(Debug, Deserialize)]
pub struct ArtistCredit {
    pub joinphrase: Option<String>,
    pub name: String,
    pub artist: Artist,
}

#[derive(Debug, Deserialize)]
pub struct Alias {
    pub name: String,
    #[serde(rename = "sort-name")]
    pub sort_name: String,
    pub locale: Option<String>,
    pub primary: Option<bool>,
    pub r#type: Option<String>,
    #[serde(rename = "type-id")]
    pub type_id: Option<String>,
    pub begin: Option<String>,
    pub end: Option<String>,
    pub ended: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct Area {
    pub disambiguation: Option<String>,
    pub id: String,
    pub name: String,
    #[serde(rename = "sort-name")]
    pub sort_name: String,
    pub r#type: Option<String>,
    #[serde(rename = "type-id")]
    pub type_id: Option<String>,
    #[serde(rename = "iso-3166-1-codes")]
    pub iso_3166_1_codes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct LifeSpan {
    pub begin: Option<String>,
    pub end: Option<String>,
    pub ended: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Params {
    pub inc: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Artists {
    pub created: String,
    pub count: u32,
    pub offset: u32,
    pub artists: Vec<Artist>,
}
