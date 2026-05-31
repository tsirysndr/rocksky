//! `app.rocksky.playlist.*` — playlist CRUD.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{Playlist, PlaylistBasic, PlaylistsEnvelope};

#[derive(Debug)]
pub struct PlaylistApi<'a> {
    client: &'a Client,
}

impl<'a> PlaylistApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn get(&self, uri: impl Into<String>) -> Result<Playlist> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        self.client
            .query_as(
                "app.rocksky.playlist.getPlaylist",
                &P { uri: uri.into() },
                false,
            )
            .await
    }

    pub fn list(&self) -> ListPlaylists<'_> {
        ListPlaylists {
            client: self.client,
            params: Page {
                limit: None,
                offset: None,
            },
        }
    }

    pub async fn create(
        &self,
        name: impl Into<String>,
        description: Option<String>,
    ) -> Result<Playlist> {
        #[derive(Serialize)]
        struct P {
            name: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.createPlaylist",
                Some(&P {
                    name: name.into(),
                    description,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn remove(&self, uri: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.removePlaylist",
                Some(&P { uri: uri.into() }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn start(
        &self,
        uri: impl Into<String>,
        shuffle: Option<bool>,
        position: Option<u32>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            uri: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            shuffle: Option<bool>,
            #[serde(skip_serializing_if = "Option::is_none")]
            position: Option<u32>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.startPlaylist",
                Some(&P {
                    uri: uri.into(),
                    shuffle,
                    position,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn insert_files(
        &self,
        uri: impl Into<String>,
        files: Vec<String>,
        position: Option<u32>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            uri: String,
            files: Vec<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            position: Option<u32>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.insertFiles",
                Some(&P {
                    uri: uri.into(),
                    files,
                    position,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn insert_directory(
        &self,
        uri: impl Into<String>,
        directory: impl Into<String>,
        position: Option<u32>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            uri: String,
            directory: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            position: Option<u32>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.insertDirectory",
                Some(&P {
                    uri: uri.into(),
                    directory: directory.into(),
                    position,
                }),
                None::<&()>,
                true,
            )
            .await
    }
}

#[derive(Debug, Serialize)]
struct Page {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug)]
pub struct ListPlaylists<'a> {
    client: &'a Client,
    params: Page,
}

impl<'a> ListPlaylists<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<PlaylistBasic>> {
        let env: PlaylistsEnvelope = self
            .client
            .query_as("app.rocksky.playlist.getPlaylists", &self.params, false)
            .await?;
        Ok(env.playlists)
    }
}
