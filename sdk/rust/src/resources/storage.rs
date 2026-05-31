//! `app.rocksky.dropbox.*` and `app.rocksky.googledrive.*`
//! — cloud storage browsing (auth required).

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;

#[derive(Debug)]
pub struct DropboxApi<'a> {
    client: &'a Client,
}

impl<'a> DropboxApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn list_files(&self, at: Option<&str>) -> Result<Value> {
        #[derive(Serialize)]
        struct P<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            at: Option<&'a str>,
        }
        self.client
            .call_with("app.rocksky.dropbox.getFiles", &P { at }, true)
            .await
    }

    pub async fn metadata(&self, path: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            path: String,
        }
        self.client
            .call_with(
                "app.rocksky.dropbox.getMetadata",
                &P { path: path.into() },
                true,
            )
            .await
    }

    pub async fn temporary_link(&self, path: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            path: String,
        }
        self.client
            .call_with(
                "app.rocksky.dropbox.getTemporaryLink",
                &P { path: path.into() },
                true,
            )
            .await
    }

    pub async fn download_file(&self, file_id: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            file_id: String,
        }
        self.client
            .call_with(
                "app.rocksky.dropbox.downloadFile",
                &P {
                    file_id: file_id.into(),
                },
                true,
            )
            .await
    }
}

#[derive(Debug)]
pub struct GoogleDriveApi<'a> {
    client: &'a Client,
}

impl<'a> GoogleDriveApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn list_files(&self, at: Option<&str>) -> Result<Value> {
        #[derive(Serialize)]
        struct P<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            at: Option<&'a str>,
        }
        self.client
            .call_with("app.rocksky.googledrive.getFiles", &P { at }, true)
            .await
    }

    pub async fn get_file(&self, file_id: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            file_id: String,
        }
        self.client
            .call_with(
                "app.rocksky.googledrive.getFile",
                &P {
                    file_id: file_id.into(),
                },
                true,
            )
            .await
    }

    pub async fn download_file(&self, file_id: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            file_id: String,
        }
        self.client
            .call_with(
                "app.rocksky.googledrive.downloadFile",
                &P {
                    file_id: file_id.into(),
                },
                true,
            )
            .await
    }
}
