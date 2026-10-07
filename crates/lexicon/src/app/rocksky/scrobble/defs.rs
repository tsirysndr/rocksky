//! `app.rocksky.scrobble.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.scrobble.defs";

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
pub struct ScrobbleViewBasic {
    /// The album of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// The album art URL of the song. May be explicitly null as well as absent;
    /// both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The album artist of the song. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_artist: Option<String>,
    /// The URI of the album. May be explicitly null as well as absent; both
    /// read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the artist. May be explicitly null as well as absent; both
    /// read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// The avatar URL of the user who created the scrobble. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    /// The timestamp when the scrobble was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// The DID of the user who created the scrobble. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The handle of the user who created the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The SHA256 hash of the scrobble data.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The title of the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The unique identifier of the track this scrobble is of. May be
    /// explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The URI of the track (song) this scrobble is of. May be explicitly null
    /// as well as absent; both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
    /// The URI of the scrobble. May be explicitly null as well as absent; both
    /// read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_avatar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xata_version: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleViewDetailed {
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acoustid_fingerprint: Option<String>,
    /// The album of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_artist: Option<String>,
    /// The URI of the album. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the song.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the artist. May be explicitly null as well as absent; both
    /// read as `None`. Format: `at-uri`.
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
    /// The album art URL of the song. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// The timestamp when the scrobble was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
    /// The first scrobble of this song on Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_scrobble: Option<FirstScrobbleView>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// The unique identifier of the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The International Standard Recording Code (ISRC) of the track, when
    /// available. May be explicitly null as well as absent; both read as
    /// `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub likes_count: Option<i64>,
    /// The number of listeners
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub listeners: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    /// The MusicBrainz recording ID of the track, when available. May be
    /// explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    /// The number of scrobbles for this song
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<i64>,
    /// The SHA256 hash of the scrobble data.
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
    /// The title of the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The URI of the track (song) this scrobble is of.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// The URI of the scrobble. May be explicitly null as well as absent; both
    /// read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    /// The handle of the user who created the scrobble.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xata_version: Option<i64>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}
