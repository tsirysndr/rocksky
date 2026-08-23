//! `app.rocksky.playlist.*` — playlist CRUD.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{Playlist, PlaylistBasic, PlaylistsEnvelope};

/// The AT-URI + CID of a playlist record returned by create/update.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct PlaylistRef {
    pub uri: String,
    pub cid: String,
}

/// AT-URIs of the `app.rocksky.playlist.song` entries created by `add_songs`.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct AddedSongs {
    pub uris: Vec<String>,
}

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

    /// Publishes an `app.rocksky.playlist` record to the caller's repo. The
    /// AppView only lists the playlist once the commit has been ingested, so a
    /// read straight after this may not see it yet.
    pub async fn create(
        &self,
        name: impl Into<String>,
        description: Option<String>,
        picture_url: Option<String>,
    ) -> Result<PlaylistRef> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            name: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            picture_url: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.createPlaylist",
                Some(&P {
                    name: name.into(),
                    description,
                    picture_url,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Rename or re-describe a playlist. Owner only — the record is rewritten
    /// on its existing rkey, so the AT-URI is stable.
    pub async fn update(
        &self,
        uri: impl Into<String>,
        name: Option<String>,
        description: Option<String>,
        picture_url: Option<String>,
    ) -> Result<PlaylistRef> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            uri: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            picture_url: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.updatePlaylist",
                Some(&P {
                    uri: uri.into(),
                    name,
                    description,
                    picture_url,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Add songs by their `app.rocksky.song` AT-URIs. Owner only. Returns the
    /// AT-URIs of the created `app.rocksky.playlist.song` entries.
    pub async fn add_songs(
        &self,
        uri: impl Into<String>,
        songs: Vec<String>,
    ) -> Result<AddedSongs> {
        #[derive(Serialize)]
        struct P {
            uri: String,
            songs: Vec<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.addSongs",
                Some(&P {
                    uri: uri.into(),
                    songs,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Remove a song from a playlist. An entry record lives in the repo that
    /// published it, so only that repo can retract it.
    pub async fn remove_track(
        &self,
        uri: impl Into<String>,
        song_uri: impl Into<String>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            uri: String,
            song_uri: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.playlist.removeTrack",
                Some(&P {
                    uri: uri.into(),
                    song_uri: song_uri.into(),
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
