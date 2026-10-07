//! `app.rocksky.album.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.album.defs";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumViewBasic {
    /// The URL of the album art image. May be explicitly null as well as
    /// absent; both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the album's artist. May be explicitly null as well as absent;
    /// both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discogs_release_id: Option<String>,
    /// The unique identifier of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The number of times the album has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The release date of the album. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The SHA256 hash of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    /// The title of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The number of unique listeners who have played the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i64>,
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// The URI of the album. May be explicitly null as well as absent; both
    /// read as `None`. Format: `at-uri`.
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
pub struct AlbumViewDetailed {
    /// The URL of the album art image. May be explicitly null as well as
    /// absent; both read as `None`. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    /// The artist of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The URI of the album's artist. May be explicitly null as well as absent;
    /// both read as `None`. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discogs: Option<DiscogsView>,
    /// May be explicitly null as well as absent; both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discogs_release_id: Option<String>,
    /// The unique identifier of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The number of times the album has been played.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The release date of the album. May be explicitly null as well as absent;
    /// both read as `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The SHA256 hash of the album.
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
    /// The title of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<super::super::super::super::app::rocksky::song::defs::SongViewBasic>>,
    /// The number of unique listeners who have played the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique_listeners: Option<i64>,
    /// Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// The URI of the album. May be explicitly null as well as absent; both
    /// read as `None`. Format: `at-uri`.
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

/// An artist credited on the release itself.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsArtistView {
    /// The name as credited on this release, when it differs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anv: Option<String>,
    /// The Discogs artist ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_id: Option<i64>,
    /// What separates this artist from the next in the credit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub join_phrase: Option<String>,
    /// The artist name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The role, when the release gives one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

/// One performance or production credit from Discogs.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsCreditView {
    /// The Discogs artist ID, when the credit is linked to one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_id: Option<i64>,
    /// The credited name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The role as Discogs words it, such as "Written-By" or "Mixed By,
    /// Engineer".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// The track positions the credit applies to, absent when it covers the
    /// whole release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<String>,
}

/// An identifier printed on the release: barcode, matrix / runout, label
/// code, rights society.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsIdentifierView {
    /// What the identifier applies to, when Discogs says.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The identifier type as Discogs names it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    /// The identifier itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

/// A label or company involved in the release.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsLabelView {
    /// The catalog number this label gave the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_number: Option<String>,
    /// The role for a company, such as Pressed By or Distributed By.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entity_type: Option<String>,
    /// Either label or company.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// The Discogs label ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_id: Option<i64>,
    /// The label or company name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// The master that groups every edition of the release.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsMasterView {
    /// The master artist credit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The Discogs genres of the master.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    /// The release Discogs treats as the canonical edition.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub main_release_id: Option<i64>,
    /// The Discogs master ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub master_id: Option<i64>,
    /// The Discogs styles of the master.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub styles: Option<Vec<String>>,
    /// The master title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The master page on Discogs. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// The year the release first came out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}

/// One entry of the release tracklist, as printed on it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsTrackView {
    /// The disc the track sits on, parsed from the position.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i64>,
    /// The duration as printed, m:ss.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    /// The duration in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    /// The position Discogs prints, such as 7, 2-04 or C2.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
    /// The track title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The track number, side-relative for vinyl.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i64>,
    /// The entry kind: track, heading or index.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
}

/// Release metadata matched on Discogs for this album.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscogsView {
    /// The primary release image on Discogs. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The release artist as Discogs credits it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// Every artist credited on the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<DiscogsArtistView>>,
    /// The barcode printed on this pressing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub barcode: Option<String>,
    /// The label's catalog number for this pressing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_number: Option<String>,
    /// The country this pressing was released in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    /// Performance and production credits for the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credits: Option<Vec<DiscogsCreditView>>,
    /// The physical or digital formats of this pressing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formats: Option<Vec<String>>,
    /// The Discogs genres of the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    /// Every identifier printed on the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identifiers: Option<Vec<DiscogsIdentifierView>>,
    /// The record label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Every label and company on the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<DiscogsLabelView>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub master: Option<DiscogsMasterView>,
    /// The Discogs master ID, shared by every edition of the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub master_id: Option<i64>,
    /// The year the release first came out, from its master.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_year: Option<i64>,
    /// The release date of this pressing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    /// The Discogs release ID.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_id: Option<i64>,
    /// Confidence of the match that produced this release, from 0 to 100.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<i64>,
    /// The Discogs styles of the release.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub styles: Option<Vec<String>>,
    /// The release title as Discogs spells it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The release tracklist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracklist: Option<Vec<DiscogsTrackView>>,
    /// The release page on Discogs. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// The year this pressing was released.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}
