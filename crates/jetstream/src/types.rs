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
    pub isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artists: Option<Vec<ArtistMbid>>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ArtistMbid {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mbid: Option<String>,
    pub name: String,
}

impl ScrobbleRecord {
    /// A scrobble-shaped record for a song record's track.
    ///
    /// The like fallback indexes a song whose track is missing, and the
    /// catalogue writers (`save_artist`, `save_album`) are written against
    /// the scrobble record. This carries the song's fields across; the only
    /// field a song record has no counterpart for is `wiki`, which nothing
    /// downstream reads.
    pub fn from_song(song: &SongRecord) -> Self {
        Self {
            track_number: song.track_number,
            disc_number: song.disc_number,
            title: song.title.clone(),
            artist: song.artist.clone(),
            album_artist: song.album_artist.clone(),
            album: song.album.clone(),
            duration: song.duration,
            release_date: song.release_date.clone(),
            year: song.year,
            genre: song.genre.clone(),
            // `tags` becomes `artists.genres` in `save_artist`, and an
            // artist row is never backfilled once it exists — dropping it
            // here would leave genres empty forever.
            tags: song.tags.clone(),
            composer: song.composer.clone(),
            lyrics: song.lyrics.clone(),
            copyright_message: song.copyright_message.clone(),
            wiki: None,
            album_art: song.album_art.clone(),
            album_art_url: song.album_art_url.clone(),
            youtube_link: song.youtube_link.clone(),
            spotify_link: song.spotify_link.clone(),
            tidal_link: song.tidal_link.clone(),
            apple_music_link: song.apple_music_link.clone(),
            created_at: song.created_at.clone(),
            label: song.label.clone(),
            mbid: song.mbid.clone(),
            isrc: song.isrc.clone(),
            artists: None,
        }
    }
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isrc: Option<String>,
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

/// `com.atproto.repo.strongRef` — an AT-URI plus the CID of the exact record
/// revision it pointed at.
#[derive(Debug, Deserialize, Clone)]
pub struct StrongRef {
    pub uri: String,
    pub cid: String,
}

/// What a like points at.
///
/// The lexicon says `com.atproto.repo.strongRef`, but records in the wild
/// carry a bare URI string — the same tolerance `apps/api` applies when it
/// reads them (`materialise::like_subject` in the appview has the comment).
#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub enum LikeSubject {
    Ref(LikeSubjectRef),
    Uri(String),
}

impl LikeSubject {
    pub fn uri(&self) -> &str {
        match self {
            Self::Ref(reference) => &reference.uri,
            Self::Uri(uri) => uri,
        }
    }
}

/// A strongRef whose CID is tolerated as absent: dropping a whole like
/// because its ref omitted the CID would lose a real like over a field this
/// projection never reads.
#[derive(Debug, Deserialize, Clone)]
pub struct LikeSubjectRef {
    pub uri: String,
    #[serde(default)]
    pub cid: Option<String>,
}

/// An `app.rocksky.like` record.
///
/// `subject` is optional at the edge only so a malformed record is logged and
/// skipped rather than failing the whole commit; a like without one projects
/// nothing.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LikeRecord {
    #[serde(default)]
    pub subject: Option<LikeSubject>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistRecord {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<ImageBlob>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apple_music_link: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistSongRecord {
    pub playlist: StrongRef,
    pub song: StrongRef,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art_url: Option<String>,
    pub added_at: String,
}
