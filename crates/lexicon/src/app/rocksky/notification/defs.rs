//! `app.rocksky.notification.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.notification.defs";

/// The user who triggered a notification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationActor {
    /// The URL of the actor's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The decentralized identifier of the actor. Format: `did`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// The display name of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The handle of the actor. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the actor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor: Option<NotificationActor>,
    /// When the notification was created. Format: `datetime`.
    pub created_at: String,
    /// The unique identifier of the notification.
    pub id: String,
    /// Whether the notification has been viewed.
    pub read: bool,
    /// The content of the related shout, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shout_content: Option<String>,
    /// The id of the related shout, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shout_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<SubjectView>,
    /// The at-uri of the subject the notification relates to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject_uri: Option<String>,
    /// The notification type: like_scrobble, follow, comment_scrobble,
    /// comment_profile, reply, or react_comment. Known values: `like_scrobble`,
    /// `follow`, `comment_scrobble`, `comment_profile`, `reply`,
    /// `react_comment`.
    pub type_: String,
}

/// The song, album, or scrobble a notification relates to, for rich
/// display.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectView {
    /// The album art image URL. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    /// The artist of the track or album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    /// The title of the track or album.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The at-uri of the subject.
    pub uri: String,
}
