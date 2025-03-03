use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LikePayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub track_id: Ref,
    pub user_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnlikePayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub track_id: Ref,
    pub user_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NewTrackPayload {
    pub track: Track,
    pub album_track: AlbumTrack,
    pub artist_track: ArtistTrack,
    pub artist_album: ArtistAlbum,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScrobblePayload {
    pub scrobble: Scrobble,
    pub user_album: UserAlbum,
    pub user_artist: UserArtist,
    pub user_track: UserTrack,
    pub album_track: AlbumTrack,
    pub artist_track: ArtistTrack,
    pub artist_album: ArtistAlbum,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub xata_id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: i32,
    pub duration: i32,
    pub mb_id: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub sha256: String,
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub disc_number: i32,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub uri: Option<String>,
    pub artist_uri: Option<String>,
    pub album_uri: Option<String>,
    pub xata_createdat: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Scrobble {
    pub album_id: AlbumId,
    pub artist_id: ArtistId,
    pub track_id: TrackId,
    pub uri: String,
    pub user_id: UserId,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlbumId {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    pub artist: String,
    pub artist_uri: String,
    pub release_date: DateTime<Utc>,
    pub sha256: String,
    pub title: String,
    pub uri: String,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
    pub year: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtistId {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    pub sha256: String,
    pub uri: String,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub biography: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub born_in: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub died: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackId {
    pub album: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    pub album_artist: String,
    pub album_uri: String,
    pub artist: String,
    pub artist_uri: String,
    pub disc_number: i32,
    pub duration: i32,
    pub sha256: String,
    pub title: String,
    pub track_number: i32,
    pub uri: String,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserId {
    pub avatar: String,
    pub did: String,
    pub display_name: String,
    pub handle: String,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserAlbum {
    pub album_id: Ref,
    pub scrobbles: i32,
    pub uri: String,
    pub user_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserArtist {
    pub artist_id: Ref,
    pub scrobbles: i32,
    pub uri: String,
    pub user_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserTrack {
    pub track_id: Ref,
    pub scrobbles: i32,
    pub uri: String,
    pub user_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlbumTrack {
    pub track_id: Ref,
    pub album_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtistTrack {
    pub track_id: Ref,
    pub artist_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtistAlbum {
    pub album_id: Ref,
    pub artist_id: Ref,
    pub xata_createdat: DateTime<Utc>,
    pub xata_id: String,
    pub xata_updatedat: DateTime<Utc>,
    pub xata_version: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Ref {
    pub xata_id: String,
}
