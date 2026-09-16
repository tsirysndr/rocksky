//! `app.rocksky.stats.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.stats.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStatsView {
    /// Total number of albums known to Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albums: Option<i64>,
    /// Total number of artists known to Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<i64>,
    /// Total scrobbles across all users on Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<i64>,
    /// Total number of tracks known to Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<i64>,
    /// Total number of users on Rocksky.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub users: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsView {
    /// The total number of unique albums scrobbled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub albums: Option<i64>,
    /// The total number of unique artists scrobbled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artists: Option<i64>,
    /// The total number of tracks marked as loved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loved_tracks: Option<i64>,
    /// The total number of scrobbles.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles: Option<i64>,
    /// The total number of unique tracks scrobbled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedAlbum {
    /// The album art URL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The unique identifier of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Number of plays in the wrapped period.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The title of the album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The AT-URI of the album. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedArtist {
    /// The unique identifier of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The name of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The picture URL of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    /// Number of plays in the wrapped period.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The AT-URI of the artist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedDayCount {
    /// Number of scrobbles on this day.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    /// The date (YYYY-MM-DD).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedGenreCount {
    /// Number of scrobbles for this genre.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    /// The genre name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedMilestone {
    /// The name of the artist.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_name: Option<String>,
    /// The timestamp of the scrobble. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    /// The title of the track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_title: Option<String>,
    /// AT-URI of the track record, used to build a clickable link to the song
    /// page. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedMonthCount {
    /// Number of scrobbles in this month.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    /// Month number (1-12).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub month: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedTrack {
    /// The album art URL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The AT-URI of the album. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    /// The artist of the track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The AT-URI of the artist. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    /// The unique identifier of the track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Number of plays in the wrapped period.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_count: Option<i64>,
    /// The title of the track.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The AT-URI of the track. Format: `at-uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WrappedView {
    /// The first scrobble of the year.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_scrobble: Option<WrappedMilestone>,
    /// The last scrobble of the year.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scrobble: Option<WrappedMilestone>,
    /// Longest consecutive days streak.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub longest_streak: Option<i64>,
    /// The most active day of the year.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub most_active_day: Option<WrappedDayCount>,
    /// The most active hour of the day (0-23).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub most_active_hour: Option<i64>,
    /// Number of artists heard for the first time this year.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_artists_count: Option<i64>,
    /// Scrobble counts per month.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrobbles_per_month: Option<Vec<WrappedMonthCount>>,
    /// Top 5 albums by play count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_albums: Option<Vec<WrappedAlbum>>,
    /// Top 5 artists by play count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_artists: Option<Vec<WrappedArtist>>,
    /// Top genres by play count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_genres: Option<Vec<WrappedGenreCount>>,
    /// Top 5 tracks by play count.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_tracks: Option<Vec<WrappedTrack>>,
    /// Total listening time in minutes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_listening_time_minutes: Option<i64>,
    /// Total scrobbles in the year.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_scrobbles: Option<i64>,
    /// The year of the wrapped stats.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
}
