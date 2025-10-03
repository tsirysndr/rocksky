use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct Request {
    pub cursor: Option<String>,
    pub feed: String,
    pub limit: Option<u8>,
}

#[derive(Debug, Clone)]
pub struct Cid(pub String);

#[derive(Debug, Clone)]
pub struct Did(pub String);

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct Uri(pub String);

#[derive(Debug, Clone)]
pub struct FeedResult {
    pub cursor: Option<String>,
    pub feed: Vec<Uri>,
}

#[derive(Debug, Clone)]
pub struct Scrobble {}

#[derive(Serialize)]
pub(crate) struct DidDocument {
    #[serde(rename = "@context")]
    pub(crate) context: Vec<String>,
    pub(crate) id: String,
    pub(crate) service: Vec<Service>,
}

#[derive(Serialize)]
pub(crate) struct Service {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) type_: String,
    #[serde(rename = "serviceEndpoint")]
    pub(crate) service_endpoint: String,
}

#[derive(Debug, Deserialize)]
pub struct Commit {
    pub rev: String,
    pub operation: String,
    pub collection: String,
    pub rkey: String,
    pub record: Value,
    pub cid: String,
}

#[derive(Debug, Deserialize)]
pub struct Root {
    pub did: String,
    pub time_us: i64,
    pub kind: String,
    pub commit: Option<Commit>,
}

#[derive(Serialize, Deserialize)]
pub struct SkeletonFeedScrobbleData {
    #[serde(skip_serializing_if = "core::option::Option::is_none")]
    pub feed_context: core::option::Option<String>,
    pub scrobble: String,
}

#[derive(Serialize, Deserialize)]
pub struct FeedSkeleton {
    pub cursor: Option<String>,
    pub feed: Vec<SkeletonFeedScrobbleData>,
}

//
// Jetstream types
//

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleRecord {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i32>,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub duration: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wiki: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_picture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub song_uri: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRecord {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub died: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born_in: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRecord {
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SongRecord {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration: i32,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disc_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wiki: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Ref {
    #[serde(rename = "$link")]
    pub link: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Blob {
    #[serde(rename = "$type")]
    pub r#type: String,
    pub r#ref: Ref,
    pub mime_type: String,
    pub size: i32,
}

#[derive(Debug, Deserialize)]
pub struct PinnedPost {
    pub cid: String,
    pub uri: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(rename = "$type")]
    pub r#type: String,
    pub avatar: Option<Blob>,
    pub banner: Option<Blob>,
    pub created_at: Option<String>,
    pub pinned_post: Option<PinnedPost>,
    pub description: Option<String>,
    pub display_name: Option<String>,
    pub handle: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProfileResponse {
    pub uri: String,
    pub cid: String,
    pub value: Profile,
}
