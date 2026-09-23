//! The wire types of the ListenBrainz API, on both directions.
//!
//! # Why every field is spelled out
//!
//! The clients that read these are statically typed, and the one this was
//! written for — Pano Scrobbler — decodes with `kotlinx.serialization`, where
//! a property with no default is *mandatory*. Its `explicitNulls = false`
//! makes a missing **nullable** key decode as null, so `Option` fields may be
//! skipped; a non-nullable one may not. `count`, `offset`, `range`, `from_ts`,
//! `to_ts`, `last_updated`, `listen_count`, `time_range`, `score`, `created`,
//! `artist_name` and `track_name` are therefore always emitted, even when the
//! answer is empty — omit one and the whole screen fails to parse rather than
//! rendering blank.
//!
//! # Timestamps are seconds
//!
//! Every `*_ts`, `listened_at` and `created` on the wire is Unix **seconds**,
//! which is what ListenBrainz sends and what the clients multiply up.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ------------------------------------------------------------- submissions

#[derive(Deserialize, Debug, Clone)]
pub struct AdditionalInfo {
    pub release_name: Option<String>,
    pub musicbrainz_artist_id: Option<String>,
    pub musicbrainz_track_id: Option<String>,
    pub duration_ms: Option<f64>,
    pub media_player: Option<String>,
    pub submission_client: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

impl AdditionalInfo {
    /// The duration in milliseconds, however this client spelled it.
    ///
    /// `duration_ms` is the documented field; several clients send `duration`
    /// in whole seconds instead, which is why the fallback is not a guess.
    pub fn duration_ms(&self) -> Option<i64> {
        self.duration_ms
            .map(|ms| ms as i64)
            .or_else(|| {
                self.extra
                    .get("duration")
                    .and_then(Value::as_f64)
                    .map(|seconds| (seconds * 1000.0) as i64)
            })
            .filter(|ms| *ms > 0)
    }

    pub fn submission_client_version(&self) -> Option<&str> {
        self.extra
            .get("submission_client_version")
            .and_then(Value::as_str)
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct TrackMetadata {
    pub artist_name: String,
    pub track_name: String,
    pub release_name: Option<String>,
    pub additional_info: Option<AdditionalInfo>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ListenPayload {
    pub track_metadata: TrackMetadata,
    pub listened_at: Option<u64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct SubmitListensRequest {
    pub listen_type: String,
    pub payload: Vec<ListenPayload>,
}

/// `POST /1/delete-listen`
#[derive(Deserialize, Debug, Clone)]
pub struct DeleteListenRequest {
    pub listened_at: i64,
    pub recording_msid: Option<String>,
}

/// `POST /1/feedback/recording-feedback`
#[derive(Deserialize, Debug, Clone)]
pub struct FeedbackRequest {
    #[serde(default)]
    pub recording_mbid: Option<String>,
    #[serde(default)]
    pub recording_msid: Option<String>,
    pub score: i32,
}

// ----------------------------------------------------------------- listens

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListenAdditionalInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_msid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submission_client: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub submission_client_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub music_service_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracknumber: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discnumber: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListenTrackMetadata {
    pub artist_name: String,
    pub track_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_info: Option<ListenAdditionalInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub mbid_mapping: Option<MbidMapping>,
}

/// The MusicBrainz identifiers a listen resolved to.
///
/// `release_mbid` is always `None`: the catalogue stores a recording MBID per
/// track and nothing at all for releases. Clients that build cover art from
/// `https://coverartarchive.org/release/{release_mbid}` therefore show none —
/// see the module note in `listens.rs`.
///
/// Deserializable as well as serializable because a now-playing listen is
/// cached as JSON in Redis and read back out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbidMapping {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_mbids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Listen {
    /// Unix seconds. Absent on a now-playing listen, which is how a client
    /// tells the two apart.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listened_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inserted_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playing_now: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_msid: Option<String>,
    pub user_name: String,
    pub track_metadata: ListenTrackMetadata,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListensPayload {
    pub count: usize,
    pub listens: Vec<Listen>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_listen_ts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oldest_listen_ts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playing_now: Option<bool>,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListensResponse {
    pub payload: ListensPayload,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListenCountPayload {
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListenCountResponse {
    pub payload: ListenCountPayload,
}

// ---------------------------------------------------------------- feedback

#[derive(Debug, Clone, Serialize)]
pub struct FeedbackItem {
    /// Unix seconds.
    pub created: i64,
    pub score: i32,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_msid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_metadata: Option<ListenTrackMetadata>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FeedbackResponse {
    pub count: usize,
    pub total_count: i64,
    pub offset: i64,
    pub feedback: Vec<FeedbackItem>,
}

// ------------------------------------------------------------------- stats

/// One row of a top-artists, top-releases or top-recordings chart.
///
/// The three endpoints differ only in which fields carry a value, so they
/// share a struct. Every key is emitted — including the nulls — because the
/// entry is decoded into one class on the client side whichever chart it came
/// from.
#[derive(Debug, Clone, Serialize)]
pub struct StatsEntry {
    pub artist_name: String,
    pub artist_mbids: Option<Vec<String>>,
    pub release_name: Option<String>,
    pub release_mbid: Option<String>,
    pub track_name: Option<String>,
    pub recording_mbid: Option<String>,
    pub listen_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatsPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<StatsEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub releases: Option<Vec<StatsEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recordings: Option<Vec<StatsEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_groups: Option<Vec<StatsEntry>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_artist_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_release_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_recording_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_release_group_count: Option<i64>,
    pub count: usize,
    pub offset: i64,
    pub range: String,
    /// Unix seconds.
    pub from_ts: i64,
    pub to_ts: i64,
    pub last_updated: i64,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatsResponse {
    pub payload: StatsPayload,
}

/// One bar of the listening-activity chart.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityBucket {
    pub from_ts: i64,
    pub to_ts: i64,
    pub time_range: String,
    pub listen_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityPayload {
    pub listening_activity: Vec<ActivityBucket>,
    pub from_ts: i64,
    pub to_ts: i64,
    pub last_updated: i64,
    pub range: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityResponse {
    pub payload: ActivityPayload,
}

// ------------------------------------------------------------------- graph

#[derive(Debug, Clone, Serialize)]
pub struct FollowingResponse {
    pub following: Vec<String>,
    pub user: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FollowersResponse {
    pub followers: Vec<String>,
    pub user: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchUser {
    pub user_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchUsersResponse {
    pub users: Vec<SearchUser>,
}

// ---------------------------------------------------------------- metadata

#[derive(Debug, Clone, Serialize)]
pub struct MetadataLookup {
    pub artist_credit_name: Option<String>,
    pub artist_mbids: Option<Vec<String>>,
    pub recording_mbid: Option<String>,
    pub recording_name: Option<String>,
    pub release_mbid: Option<String>,
    pub release_name: Option<String>,
}

// ------------------------------------------------------------------ errors

/// The error envelope every ListenBrainz endpoint answers with.
#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub code: u16,
    pub error: String,
}

impl ApiError {
    pub fn new(code: u16, error: impl Into<String>) -> Self {
        Self {
            code,
            error: error.into(),
        }
    }
}

// -------------------------------------------------------------- submissions

#[derive(Debug, Clone, Serialize)]
pub struct SubmitPayload {
    pub submitted_listens: u32,
    pub ignored_listens: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubmitResponse {
    pub status: &'static str,
    pub payload: SubmitPayload,
    /// Only when the client asked for it with `return_msid=1`, which is how a
    /// client learns the identity of a track it has no MusicBrainz id for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_msid: Option<String>,
}

impl SubmitResponse {
    pub fn accepted(recording_msid: Option<String>) -> Self {
        Self {
            status: "ok",
            payload: SubmitPayload {
                submitted_listens: 1,
                ignored_listens: 0,
            },
            recording_msid,
        }
    }

    pub fn ignored() -> Self {
        Self {
            status: "ok",
            payload: SubmitPayload {
                submitted_listens: 0,
                ignored_listens: 1,
            },
            recording_msid: None,
        }
    }
}
