//! `app.rocksky.dropbox.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.dropbox.defs";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub directories: Option<Vec<ResponseDirectoriesItemView>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub directory: Option<ResponseDirectoryView>,
    /// A list of files in the Dropbox.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<FileView>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_directory: Option<ResponseParentDirectoryView>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileView {
    /// The last modified date and time of the file on the client. Format:
    /// `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_modified: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub directory_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
    /// The unique identifier of the file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The name of the file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The display path of the file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path_display: Option<String>,
    /// The lowercased path of the file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path_lower: Option<String>,
    /// The last modified date and time of the file on the server. Format:
    /// `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_modified: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseDirectoriesItemView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseDirectoryView {}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseParentDirectoryView {}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporaryLinkView {
    /// The temporary link to access the file. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}
