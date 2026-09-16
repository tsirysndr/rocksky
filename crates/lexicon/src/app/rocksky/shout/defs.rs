//! `app.rocksky.shout.defs`
//!
//! Generated from the lexicon by `rocksky-lexicon-codegen`. Do not edit:
//! change `apps/api/pkl/defs/**.pkl`, regenerate the JSON, then rerun
//! `cargo run -p rocksky-lexicon-codegen`.

#![allow(unused_imports)]

use super::super::super::super::Blob;
use serde::{Deserialize, Serialize};

/// The lexicon this module was generated from.
pub const NSID: &str = "app.rocksky.shout.defs";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    /// The URL of the author's avatar image. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    /// The decentralized identifier (DID) of the author. Format:
    /// `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    /// The display name of the author.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// The handle of the author. Format: `at-identifier`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// The unique identifier of the author.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// A GIF, sticker, or clip embedded in a shout. `url` may point at an image
/// (GIF/WebP) or a video (MP4); the client decides how to render it from
/// the file extension.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gif {
    /// Alternative text describing the media.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    /// The intrinsic height of the media in pixels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<i64>,
    /// Smaller still/preview image URL. Format: `uri`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    /// Direct URL of the animated GIF/MP4. Format: `uri`.
    pub url: String,
    /// The intrinsic width of the media in pixels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
}

/// A mention of another actor within the shout message, anchored to a UTF-8
/// byte range in the message.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    /// Exclusive UTF-8 byte offset of the mention end.
    pub byte_end: i64,
    /// Inclusive UTF-8 byte offset of the mention start.
    pub byte_start: i64,
    /// The DID of the mentioned actor. Format: `did`.
    pub did: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShoutView {
    /// The author of the shout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<Author>,
    /// The date and time when the shout was created. Format: `datetime`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    /// Mentions of other actors within the message, anchored to UTF-8 byte
    /// ranges.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub facets: Option<Vec<Mention>>,
    /// An attached GIF, sticker, or clip.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gif: Option<Gif>,
    /// The unique identifier of the shout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The content of the shout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// The ID of the parent shout if this is a reply, otherwise null.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}
