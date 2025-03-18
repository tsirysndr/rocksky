use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct File {
    pub id: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileList {
    pub files: Vec<File>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetFilesParams {
    pub did: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetFilesInParentsParams {
    pub did: String,
    pub parent_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadFileParams {
    pub did: String,
    pub file_id: String,
}
