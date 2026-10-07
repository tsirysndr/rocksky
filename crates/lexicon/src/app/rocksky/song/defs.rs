//! `app.rocksky.song.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.song.defs";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstScrobbleView {
    /// The avatar URL of the user who first scrobbled this song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The handle of the user who first scrobbled this song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The timestamp of the first scrobble. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentListenerView {
    /// The URL of the listener's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The DID of the listener.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// The display name of the listener.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The handle of the listener.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the listener.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The URI of the listener's most recent scrobble of this song. Format:
    /// `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobble_uri: Option<String>,
    /// The timestamp of the listener's most recent scrobble of this song.
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMbArtistsItemView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// A ranked candidate match for a song from an external metadata provider.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMatchView {
    /// The album of the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// The URL of the matched track's album art image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The disc number of the matched track in its album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the matched track in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    /// Whether the matched track has explicit lyrics.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explicit: Option<bool>,
    /// The provider's numeric identifier for the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    /// The International Standard Recording Code (ISRC) of the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// A URL to the matched track on the provider. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    /// A URL to a short audio preview of the matched track. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    /// The provider's popularity rank for the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<i64>,
    /// Match confidence score in the range 0-100 (higher is better).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// The title of the matched track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The track number of the matched track in its album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewBasic {
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
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// The timestamp when the song was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The disc number of the song in the album. May be explicitly null as well
    /// as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the song in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
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
    /// The number of times the song has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
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
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewDetailed {
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
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_picture: Option<String>,
    /// The URI of the artist of the song. May be explicitly null as well as
    /// absent; both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists:
        Option<Vec<super::super::super::super::app::rocksky::artist::defs::ArtistViewBasic>>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// The timestamp when the song was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The disc number of the song in the album. May be explicitly null as well
    /// as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration of the song in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// The first scrobble of this song on Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_scrobble: Option<FirstScrobbleView>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
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
    /// Ranked list of candidate matches from external metadata providers (e.g.
    /// Deezer). Additive field returned by matchSong; may be empty.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matches: Option<Vec<SongMatchView>>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_artists: Option<Vec<ResponseMbArtistsItemView>>,
    /// The MusicBrainz recording ID of the track, when available. May be
    /// explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// The MusicBrainz ID of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The number of times the song has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
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
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}
