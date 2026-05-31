//! Strongly typed response models.
//!
//! The Rocksky API speaks camelCase JSON; every model is annotated with
//! `#[serde(rename_all = "camelCase")]` and accepts unknown fields silently
//! (so adding new fields server-side won't break compiled SDK consumers).
//!
//! Every field is `Option<…>` — the API is generous about returning partial
//! shapes (e.g. an empty `{}` for an unknown handle).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Trim trailing/leading whitespace on string fields without forcing callers
/// to think about it.
fn trim_string<'de, D>(de: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw: Option<String> = Option::deserialize(de)?;
    Ok(raw.map(|s| s.trim().to_string()))
}

// --- Actor ----------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileBasic {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    #[serde(default, deserialize_with = "trim_string")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

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

// --- Artist ---------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistBasic {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub sha256: Option<String>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
    pub tags: Option<Vec<String>>,
}

pub type Artist = ArtistBasic;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistListener {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub most_listened_song: Option<Value>,
    pub total_plays: Option<u64>,
    pub rank: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentListener {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub timestamp: Option<DateTime<Utc>>,
    pub scrobble_uri: Option<String>,
}

// --- Album ----------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumBasic {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artist_uri: Option<String>,
    pub year: Option<i32>,
    pub album_art: Option<String>,
    pub release_date: Option<String>,
    pub sha256: Option<String>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    #[serde(flatten)]
    pub basic: AlbumBasic,
    pub tags: Option<Vec<String>>,
    pub tracks: Option<Vec<SongBasic>>,
}

impl std::ops::Deref for Album {
    type Target = AlbumBasic;
    fn deref(&self) -> &Self::Target {
        &self.basic
    }
}

// --- Song -----------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstScrobble {
    pub handle: Option<String>,
    pub avatar: Option<String>,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongBasic {
    pub id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album_art: Option<String>,
    pub uri: Option<String>,
    pub album: Option<String>,
    pub duration: Option<u64>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub play_count: Option<u64>,
    pub unique_listeners: Option<u64>,
    pub album_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub sha256: Option<String>,
    pub mbid: Option<String>,
    pub isrc: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    #[serde(flatten)]
    pub basic: SongBasic,
    pub artists: Option<Vec<ArtistBasic>>,
    pub first_scrobble: Option<FirstScrobble>,
}

impl std::ops::Deref for Song {
    type Target = SongBasic;
    fn deref(&self) -> &Self::Target {
        &self.basic
    }
}

// --- Scrobble -------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scrobble {
    pub id: Option<String>,
    pub user: Option<String>,
    pub user_display_name: Option<String>,
    pub user_avatar: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artist_uri: Option<String>,
    pub album: Option<String>,
    pub album_uri: Option<String>,
    pub cover: Option<String>,
    pub date: Option<DateTime<Utc>>,
    pub uri: Option<String>,
    pub sha256: Option<String>,
    pub liked: Option<bool>,
    pub likes_count: Option<u32>,
    pub listeners: Option<u64>,
    pub scrobbles: Option<u64>,
    pub artists: Option<Vec<ArtistBasic>>,
    pub first_scrobble: Option<FirstScrobble>,
}

// --- Shouts ---------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShoutAuthor {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shout {
    pub id: Option<String>,
    pub message: Option<String>,
    pub parent: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub author: Option<ShoutAuthor>,
}

// --- API keys -------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKey {
    pub id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
    pub api_key: Option<String>,
    pub shared_secret: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// --- Playlist -------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistBasic {
    pub id: Option<String>,
    pub title: Option<String>,
    pub uri: Option<String>,
    pub curator_did: Option<String>,
    pub curator_handle: Option<String>,
    pub curator_name: Option<String>,
    pub curator_avatar_url: Option<String>,
    pub description: Option<String>,
    pub cover_image_url: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub track_count: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    #[serde(flatten)]
    pub basic: PlaylistBasic,
    pub tracks: Option<Vec<SongBasic>>,
}

impl std::ops::Deref for Playlist {
    type Target = PlaylistBasic;
    fn deref(&self) -> &Self::Target {
        &self.basic
    }
}

// --- Feed -----------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedGenerator {
    pub id: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub uri: Option<String>,
    pub avatar: Option<String>,
    pub creator: Option<ProfileBasic>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    pub scrobble: Option<Scrobble>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feed {
    #[serde(default)]
    pub feed: Vec<FeedItem>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub avatar: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artist_uri: Option<String>,
    pub album: Option<String>,
    pub album_uri: Option<String>,
    pub album_artist: Option<String>,
    pub album_art: Option<String>,
    pub created_at: Option<String>,
    pub track_id: Option<String>,
    pub track_uri: Option<String>,
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_art: Option<String>,
    pub track_uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    pub genres: Option<Vec<String>>,
    pub recommendation_score: Option<i32>,
    pub source: Option<String>,
    pub likes_count: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendations {
    #[serde(default)]
    pub recommendations: Vec<Recommendation>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedArtist {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub genres: Option<Vec<String>>,
    pub recommendation_score: Option<i32>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedAlbum {
    pub id: Option<String>,
    pub uri: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artist_uri: Option<String>,
    pub year: Option<i32>,
    pub album_art: Option<String>,
    pub recommendation_score: Option<i32>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    /// Heterogeneous hits — items may be songs, albums, artists, playlists, profiles.
    #[serde(default)]
    pub hits: Vec<Value>,
    pub processing_time_ms: Option<u64>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub estimated_total_hits: Option<u64>,
}

// --- Actor compatibility / neighbours -------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    pub compatibility_level: Option<i32>,
    pub compatibility_percentage: Option<i32>,
    pub shared_artists: Option<u32>,
    pub top_shared_artist_names: Option<Vec<String>>,
    pub top_shared_detailed_artists: Option<Vec<ArtistBasic>>,
    pub user1_artist_count: Option<u32>,
    pub user2_artist_count: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Neighbour {
    pub user_id: Option<String>,
    pub did: Option<String>,
    pub handle: Option<String>,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub shared_artists_count: Option<u32>,
    pub similarity_score: Option<i32>,
    pub top_shared_artist_names: Option<Vec<String>>,
    pub top_shared_artists_details: Option<Vec<ArtistBasic>>,
}

// --- Mirror ---------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorSource {
    pub id: Option<String>,
    pub kind: Option<String>,
    pub enabled: Option<bool>,
    pub config: Option<Value>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

// --- Containers used by list endpoints ------------------------------------
//
// Several list endpoints wrap their payload in a typed key. We provide the
// wrapper types so callers can read `result.scrobbles` directly without
// hand-rolling envelope shapes.

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
