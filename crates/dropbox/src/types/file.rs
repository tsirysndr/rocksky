use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Entry {
    #[serde(rename = ".tag")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    pub path_display: String,
    pub path_lower: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_downloadable: Option<bool>,
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct EntryList {
    pub entries: Vec<Entry>,
    pub cursor: String,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetFilesParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetFilesAtParams {
    pub did: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct DownloadFileParams {
    pub did: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TemporaryLink {
    pub metadata: Entry,
    pub link: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanFolderParams {
    pub did: String,
    pub path: String,
}
