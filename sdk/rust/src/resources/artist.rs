//! `app.rocksky.artist.*` — artist views.

use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::models::{
    AlbumBasic, AlbumsEnvelope, Artist, ArtistBasic, ArtistListener, ArtistsEnvelope,
    ListenersEnvelope, RecentListener, SongBasic, TracksEnvelope,
};

#[derive(Debug)]
pub struct ArtistApi<'a> {
    client: &'a Client,
}

impl<'a> ArtistApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Get an artist by AT-URI.
    pub async fn get(&self, uri: impl Into<String>) -> Result<Artist> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        self.client
            .query_as("app.rocksky.artist.getArtist", &P { uri: uri.into() }, false)
            .await
    }

    /// List artists.
    pub fn list(&self) -> ListArtists<'_> {
        ListArtists {
            client: self.client,
            params: ListArtistsParams::default(),
        }
    }

    /// Albums by an artist.
    pub async fn get_albums(&self, uri: impl Into<String>) -> Result<Vec<AlbumBasic>> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        let env: AlbumsEnvelope = self
            .client
            .query_as(
                "app.rocksky.artist.getArtistAlbums",
                &P { uri: uri.into() },
                false,
            )
            .await?;
        Ok(env.albums)
    }

    /// Top tracks by an artist.
    pub fn get_tracks(&self, uri: impl Into<String>) -> GetArtistTracks<'_> {
        GetArtistTracks {
            client: self.client,
            params: UriPageParams {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Top listeners of an artist (all-time, ranked).
    pub fn get_listeners(&self, uri: impl Into<String>) -> GetArtistListeners<'_> {
        GetArtistListeners {
            client: self.client,
            params: UriPageParams {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Most recent listeners of an artist.
    pub fn get_recent_listeners(&self, uri: impl Into<String>) -> GetArtistRecentListeners<'_> {
        GetArtistRecentListeners {
            client: self.client,
            params: UriPageParams {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListArtistsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    names: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genre: Option<String>,
}

#[derive(Debug)]
pub struct ListArtists<'a> {
    client: &'a Client,
    params: ListArtistsParams,
}

impl<'a> ListArtists<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub fn names<I, S>(mut self, names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.params.names = Some(names.into_iter().map(Into::into).collect());
        self
    }
    pub fn genre(mut self, genre: impl Into<String>) -> Self {
        self.params.genre = Some(genre.into());
        self
    }
    pub async fn send(self) -> Result<Vec<ArtistBasic>> {
        let env: ArtistsEnvelope = self
            .client
            .query_as("app.rocksky.artist.getArtists", &self.params, false)
            .await?;
        Ok(env.artists)
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UriPageParams {
    uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

macro_rules! uri_page_builder {
    ($name:ident, $env_t:ty, $field:ident, $item:ty, $method:expr) => {
        #[derive(Debug)]
        pub struct $name<'a> {
            client: &'a Client,
            params: UriPageParams,
        }

        impl<'a> $name<'a> {
            pub fn limit(mut self, limit: u32) -> Self {
                self.params.limit = Some(limit);
                self
            }
            pub fn offset(mut self, offset: u32) -> Self {
                self.params.offset = Some(offset);
                self
            }
            pub async fn send(self) -> Result<Vec<$item>> {
                let env: $env_t = self
                    .client
                    .query_as($method, &self.params, false)
                    .await?;
                Ok(env.$field)
            }
        }
    };
}

uri_page_builder!(
    GetArtistTracks,
    TracksEnvelope,
    tracks,
    SongBasic,
    "app.rocksky.artist.getArtistTracks"
);
uri_page_builder!(
    GetArtistListeners,
    ListenersEnvelope<ArtistListener>,
    listeners,
    ArtistListener,
    "app.rocksky.artist.getArtistListeners"
);
uri_page_builder!(
    GetArtistRecentListeners,
    ListenersEnvelope<RecentListener>,
    listeners,
    RecentListener,
    "app.rocksky.artist.getArtistRecentListeners"
);
