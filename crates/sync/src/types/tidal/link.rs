use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct Links {
    #[serde(rename = "self")]
    pub self_: String,
    pub next: Option<String>,
    pub meta: Option<LinksMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinksMeta {
    pub next_cursor: Option<String>,
}
