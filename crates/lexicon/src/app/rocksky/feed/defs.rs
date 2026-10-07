//! `app.rocksky.feed.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.feed.defs";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedGeneratorView {
    /// May be explicitly null as well as absent; both read as `None`. Format:
    /// `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creator: Option<super::super::super::super::app::rocksky::actor::defs::ProfileViewBasic>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedGeneratorsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feeds: Option<Vec<FeedGeneratorView>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItemView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobble:
        Option<super::super::super::super::app::rocksky::scrobble::defs::ScrobbleViewBasic>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedUriView {
    /// The feed URI. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedView {
    /// The pagination cursor for the next set of results.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feed: Option<Vec<FeedItemView>>,
    /// Legacy empty-array error fallback; successful responses use feed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles:
        Option<Vec<super::super::super::super::app::rocksky::scrobble::defs::ScrobbleViewBasic>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
    /// neighbour | social | serendipity
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommendations: Option<Vec<RecommendationView>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedAlbumView {
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// known-artist | new-artist | serendipity
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedAlbumsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albums: Option<Vec<RecommendedAlbumView>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedArtistView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    /// neighbour | social | serendipity
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedArtistsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<RecommendedArtistView>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFederation {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index_uid: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    #[serde(rename = "_federation")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub federation: Option<SearchFederation>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acoustid_fingerprint: Option<String>,
    /// The album of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// The URL of the album art image. May be explicitly null as well as
    /// absent; both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the album the song belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_artist: Option<String>,
    /// The URI of the album the song belongs to. May be explicitly null as well
    /// as absent; both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the artist of the song. May be explicitly null as well as
    /// absent; both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// The URL of the actor's avatar image. May be explicitly null as well as
    /// absent; both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub biography: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`. Format:
    /// `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub born: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub born_in: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// The URL of the cover image for the playlist. May be explicitly null as
    /// well as absent; both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_image_url: Option<String>,
    /// The timestamp when the song was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The URL of the avatar image of the curator. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_avatar_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_d_id: Option<String>,
    /// The DID of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_did: Option<String>,
    /// The handle of the curator of the playlist. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_handle: Option<String>,
    /// The name of the curator of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curator_name: Option<String>,
    /// A description of the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The DID of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`. Format:
    /// `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub died: Option<String>,
    /// The disc number of the song in the album. May be explicitly null as well
    /// as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discogs_release_id: Option<String>,
    /// The display name of the actor. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The duration of the song in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    /// The handle of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The International Standard Recording Code (ISRC) of the song. May be
    /// explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Whether the authenticated user has loved this song. False when
    /// unauthenticated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    /// The number of users who have loved this song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// The MusicBrainz ID of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The name of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The picture of the artist. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    /// The number of times the song has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The release date of the album. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The SHA256 hash of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The title of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Album-art URLs of up to four of the playlist's tracks, for rendering a
    /// cover mosaic when the playlist has no picture of its own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_arts: Option<Vec<String>>,
    /// The number of tracks in the playlist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_count: Option<i64>,
    /// The track number of the song in the album. May be explicitly null as
    /// well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The number of unique listeners who have played the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// The URI of the song. May be explicitly null as well as absent; both read
    /// as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xata_version: Option<i64>,
    /// The year the album was released. May be explicitly null as well as
    /// absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultsView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_total_hits: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hits: Option<Vec<SearchHit>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub processing_time_ms: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoriesView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stories: Option<Vec<StoryView>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_artist: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
    /// Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}
