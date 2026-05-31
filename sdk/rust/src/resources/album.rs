//! `app.rocksky.album.*` — album views.

use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::models::{Album, AlbumBasic, AlbumsEnvelope, SongBasic, TracksEnvelope};

#[derive(Debug)]
pub struct AlbumApi<'a> {
    client: &'a Client,
}

impl<'a> AlbumApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Detailed album view by AT-URI.
    pub async fn get(&self, uri: impl Into<String>) -> Result<Album> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        self.client
            .query_as("app.rocksky.album.getAlbum", &P { uri: uri.into() }, false)
            .await
    }

    /// List albums, optionally filtered.
    pub fn list(&self) -> ListAlbums<'_> {
        ListAlbums {
            client: self.client,
            params: ListParams::default(),
        }
    }

    /// Tracks on an album.
    pub async fn get_tracks(&self, uri: impl Into<String>) -> Result<Vec<SongBasic>> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        let env: TracksEnvelope = self
            .client
            .query_as("app.rocksky.album.getAlbumTracks", &P { uri: uri.into() }, false)
            .await?;
        Ok(env.tracks)
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genre: Option<String>,
}

/// Builder for `app.rocksky.album.getAlbums`.
#[derive(Debug)]
pub struct ListAlbums<'a> {
    client: &'a Client,
    params: ListParams,
}

impl<'a> ListAlbums<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub fn genre(mut self, genre: impl Into<String>) -> Self {
        self.params.genre = Some(genre.into());
        self
    }
    pub async fn send(self) -> Result<Vec<AlbumBasic>> {
        let env: AlbumsEnvelope = self
            .client
            .query_as("app.rocksky.album.getAlbums", &self.params, false)
            .await?;
        Ok(env.albums)
    }
}
