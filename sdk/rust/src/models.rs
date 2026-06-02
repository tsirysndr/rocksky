//! Strongly typed response models.
//!
//! Lex-derived shapes live in `crate::generated`. This module re-exports them
//! under the historical SDK names and extends a few with fields the lexicon
//! does not yet declare. List-endpoint envelopes are SDK-internal and stay
//! hand-written.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::generated::{
    ActorCompatibilityViewBasic as Compatibility,
    ActorNeighbourViewBasic as Neighbour,
    ActorProfileViewBasic as ProfileBasic,
    AlbumViewBasic as AlbumBasic,
    AlbumViewDetailed as Album,
    ArtistListenerViewBasic as ArtistListener,
    ArtistViewBasic as ArtistBasic,
    FeedGeneratorView as FeedGenerator,
    FeedItemView as FeedItem,
    FeedRecommendationsView as Recommendations,
    FeedRecommendationView as Recommendation,
    FeedRecommendedAlbumView as RecommendedAlbum,
    FeedRecommendedArtistView as RecommendedArtist,
    FeedSearchResultsView as SearchResults,
    FeedStoryView as Story,
    FeedView as Feed,
    MirrorSourceView as MirrorSource,
    PlaylistViewBasic as PlaylistBasic,
    PlaylistViewDetailed as Playlist,
    ScrobbleViewDetailed as Scrobble,
    ShoutAuthor, ShoutView as Shout,
    SongFirstScrobbleView as FirstScrobble,
    SongRecentListenerView as RecentListener,
    SongViewBasic as SongBasic,
    SongViewDetailed as Song,
};

pub type Artist = ArtistBasic;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(flatten)]
    pub basic: ProfileBasic,
    pub spotify_connected: Option<bool>,
    pub spotify_user: Option<Value>,
    pub spotify_token: Option<Value>,
    pub googledrive: Option<Value>,
    pub dropbox: Option<Value>,
}

impl std::ops::Deref for Profile {
    type Target = ProfileBasic;
    fn deref(&self) -> &Self::Target {
        &self.basic
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKey {
    #[serde(flatten)]
    pub base: crate::generated::ApiKeyView,
    pub enabled: Option<bool>,
    pub api_key: Option<String>,
    pub shared_secret: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

impl std::ops::Deref for ApiKey {
    type Target = crate::generated::ApiKeyView;
    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

// --- Containers used by list endpoints ------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AlbumsEnvelope {
    #[serde(default)]
    pub albums: Vec<AlbumBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtistsEnvelope {
    #[serde(default)]
    pub artists: Vec<ArtistBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SongsEnvelope {
    #[serde(default)]
    pub songs: Vec<SongBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LovedSongsEnvelope {
    #[serde(default, alias = "songs")]
    pub loved_songs: Vec<SongBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScrobblesEnvelope {
    #[serde(default)]
    pub scrobbles: Vec<Scrobble>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlaylistsEnvelope {
    #[serde(default)]
    pub playlists: Vec<PlaylistBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TracksEnvelope {
    #[serde(default)]
    pub tracks: Vec<SongBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListenersEnvelope<T> {
    #[serde(default = "Vec::new", bound(deserialize = "T: serde::Deserialize<'de>"))]
    pub listeners: Vec<T>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NeighboursEnvelope {
    #[serde(default)]
    pub neighbours: Vec<Neighbour>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ShoutsEnvelope {
    #[serde(default, alias = "replies")]
    pub shouts: Vec<Shout>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FeedGeneratorsEnvelope {
    #[serde(default)]
    pub feeds: Vec<FeedGenerator>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoriesEnvelope {
    #[serde(default)]
    pub stories: Vec<Story>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecommendedArtistsEnvelope {
    #[serde(default)]
    pub artists: Vec<RecommendedArtist>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecommendedAlbumsEnvelope {
    #[serde(default)]
    pub albums: Vec<RecommendedAlbum>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApikeysEnvelope {
    #[serde(default, alias = "keys")]
    pub api_keys: Vec<ApiKey>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MirrorSourcesEnvelope {
    #[serde(default, alias = "mirrorSources")]
    pub sources: Vec<MirrorSource>,
}
