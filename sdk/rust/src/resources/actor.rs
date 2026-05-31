//! `app.rocksky.actor.*` — profile and per-actor library views.

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::models::{
    AlbumBasic, AlbumsEnvelope, ArtistBasic, ArtistsEnvelope, Compatibility, Neighbour,
    NeighboursEnvelope, PlaylistBasic, PlaylistsEnvelope, Profile, Scrobble, ScrobblesEnvelope,
    SongBasic, SongsEnvelope,
};

#[derive(Debug)]
pub struct ActorApi<'a> {
    client: &'a Client,
}

impl<'a> ActorApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Get a profile by handle or DID.
    pub async fn get_profile(&self, did_or_handle: impl Into<String>) -> Result<Profile> {
        #[derive(Serialize)]
        struct Params {
            did: String,
        }
        self.client
            .query_as(
                "app.rocksky.actor.getProfile",
                &Params {
                    did: did_or_handle.into(),
                },
                false,
            )
            .await
    }

    /// Get the authenticated user's profile.
    pub async fn get_profile_me(&self) -> Result<Profile> {
        self.client
            .query_as("app.rocksky.actor.getProfile", &(), true)
            .await
    }

    /// Albums an actor has scrobbled.
    pub fn get_albums(&self, did: impl Into<String>) -> GetActorAlbums<'_> {
        GetActorAlbums {
            client: self.client,
            params: ActorRangeParams {
                did: did.into(),
                limit: None,
                offset: None,
                start_date: None,
                end_date: None,
            },
        }
    }

    /// Artists an actor has scrobbled.
    pub fn get_artists(&self, did: impl Into<String>) -> GetActorArtists<'_> {
        GetActorArtists {
            client: self.client,
            params: ActorRangeParams {
                did: did.into(),
                limit: None,
                offset: None,
                start_date: None,
                end_date: None,
            },
        }
    }

    /// Songs an actor has scrobbled.
    pub fn get_songs(&self, did: impl Into<String>) -> GetActorSongs<'_> {
        GetActorSongs {
            client: self.client,
            params: ActorRangeParams {
                did: did.into(),
                limit: None,
                offset: None,
                start_date: None,
                end_date: None,
            },
        }
    }

    /// Recent scrobbles for an actor.
    pub fn get_scrobbles(&self, did: impl Into<String>) -> GetActorScrobbles<'_> {
        GetActorScrobbles {
            client: self.client,
            params: ActorPageParams {
                did: did.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Songs an actor has marked as loved.
    pub fn get_loved_songs(&self, did: impl Into<String>) -> GetActorLovedSongs<'_> {
        GetActorLovedSongs {
            client: self.client,
            params: ActorPageParams {
                did: did.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Playlists curated by an actor.
    pub fn get_playlists(&self, did: impl Into<String>) -> GetActorPlaylists<'_> {
        GetActorPlaylists {
            client: self.client,
            params: ActorPageParams {
                did: did.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Musical neighbours (taste-similar actors).
    pub async fn get_neighbours(&self, did: impl Into<String>) -> Result<Vec<Neighbour>> {
        #[derive(Serialize)]
        struct P {
            did: String,
        }
        let env: NeighboursEnvelope = self
            .client
            .query_as(
                "app.rocksky.actor.getActorNeighbours",
                &P { did: did.into() },
                false,
            )
            .await?;
        Ok(env.neighbours)
    }

    /// Compatibility between the authenticated user and another actor.
    /// Requires auth.
    pub async fn get_compatibility(&self, did: impl Into<String>) -> Result<Compatibility> {
        #[derive(Serialize)]
        struct P {
            did: String,
        }
        self.client
            .query_as(
                "app.rocksky.actor.getActorCompatibility",
                &P { did: did.into() },
                true,
            )
            .await
    }
}

// Shared params shapes ----------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ActorRangeParams {
    did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_date: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ActorPageParams {
    did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

// Request builders ---------------------------------------------------------

macro_rules! range_builder {
    ($name:ident, $envelope:ty, $field:ident, $item:ty, $method:expr) => {
        #[doc = concat!("Builder for [`", stringify!($method), "`].")]
        #[derive(Debug)]
        pub struct $name<'a> {
            client: &'a Client,
            params: ActorRangeParams,
        }

        impl<'a> $name<'a> {
            /// Set the page size.
            pub fn limit(mut self, limit: u32) -> Self {
                self.params.limit = Some(limit);
                self
            }
            /// Set the page offset.
            pub fn offset(mut self, offset: u32) -> Self {
                self.params.offset = Some(offset);
                self
            }
            /// Restrict to scrobbles on/after this date.
            pub fn start_date(mut self, when: DateTime<Utc>) -> Self {
                self.params.start_date = Some(when.to_rfc3339());
                self
            }
            /// Restrict to scrobbles on/before this date.
            pub fn end_date(mut self, when: DateTime<Utc>) -> Self {
                self.params.end_date = Some(when.to_rfc3339());
                self
            }
            /// Execute the request.
            pub async fn send(self) -> Result<Vec<$item>> {
                let env: $envelope = self
                    .client
                    .query_as($method, &self.params, false)
                    .await?;
                Ok(env.$field)
            }
        }
    };
}

macro_rules! page_builder {
    ($name:ident, $envelope:ty, $field:ident, $item:ty, $method:expr) => {
        #[doc = concat!("Builder for [`", stringify!($method), "`].")]
        #[derive(Debug)]
        pub struct $name<'a> {
            client: &'a Client,
            params: ActorPageParams,
        }

        impl<'a> $name<'a> {
            /// Set the page size.
            pub fn limit(mut self, limit: u32) -> Self {
                self.params.limit = Some(limit);
                self
            }
            /// Set the page offset.
            pub fn offset(mut self, offset: u32) -> Self {
                self.params.offset = Some(offset);
                self
            }
            /// Execute the request.
            pub async fn send(self) -> Result<Vec<$item>> {
                let env: $envelope = self
                    .client
                    .query_as($method, &self.params, false)
                    .await?;
                Ok(env.$field)
            }
        }
    };
}

range_builder!(
    GetActorAlbums,
    AlbumsEnvelope,
    albums,
    AlbumBasic,
    "app.rocksky.actor.getActorAlbums"
);
range_builder!(
    GetActorArtists,
    ArtistsEnvelope,
    artists,
    ArtistBasic,
    "app.rocksky.actor.getActorArtists"
);
range_builder!(
    GetActorSongs,
    SongsEnvelope,
    songs,
    SongBasic,
    "app.rocksky.actor.getActorSongs"
);
page_builder!(
    GetActorScrobbles,
    ScrobblesEnvelope,
    scrobbles,
    Scrobble,
    "app.rocksky.actor.getActorScrobbles"
);

// loved songs uses a different envelope (`lovedSongs`/`songs`)
#[derive(Debug)]
pub struct GetActorLovedSongs<'a> {
    client: &'a Client,
    params: ActorPageParams,
}

impl<'a> GetActorLovedSongs<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<SongBasic>> {
        let env: crate::models::LovedSongsEnvelope = self
            .client
            .query_as("app.rocksky.actor.getActorLovedSongs", &self.params, false)
            .await?;
        Ok(env.loved_songs)
    }
}

page_builder!(
    GetActorPlaylists,
    PlaylistsEnvelope,
    playlists,
    PlaylistBasic,
    "app.rocksky.actor.getActorPlaylists"
);
