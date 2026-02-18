use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct Root {
    pub did: String,
    pub time_us: i64,
    pub kind: String,
    pub commit: Option<Commit>,
}

#[derive(Debug, Deserialize)]
pub struct Commit {
    pub rev: String,
    pub operation: String,
    pub collection: String,
    pub rkey: String,
    pub record: Option<Value>,
    pub cid: Option<String>,
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

#[derive(Debug, Deserialize, Clone)]
pub struct Ref {
    #[serde(rename = "$link")]
    pub link: String,
}

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
    pub album_art: Option<ImageBlob>,
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
    pub artists: Option<Vec<ArtistMbid>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ArtistMbid {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ProfileResponse {
    pub uri: String,
    pub cid: String,
    pub value: Profile,
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

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageBlob {
    #[serde(rename = "$type")]
    pub r#type: String,
    #[serde(rename = "ref")]
    pub r#ref: BlobRef,
    pub mime_type: String,
    pub size: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct BlobRef {
    #[serde(rename = "$link")]
    pub link: String,
}

#[derive(Debug, Deserialize)]
pub struct PinnedPost {
    pub cid: String,
    pub uri: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRecord {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<ImageBlob>,
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
    pub album_art: Option<ImageBlob>,
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
    pub album_art: Option<ImageBlob>,
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
#[serde(rename_all = "camelCase")]
pub struct FeedGeneratorRecord {
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<ImageBlob>,
    pub did: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowRecord {
    pub subject: String,
    pub created_at: String,
}
