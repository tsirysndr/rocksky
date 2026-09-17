//! Response bodies for the XRPC methods.
//!
//! These are written by hand rather than taken from the generated lexicon
//! types in `rocksky-sdk`, because the live JSON deliberately carries more than
//! the lexicons declare: `ScrobbleViewBasic` in the lexicon has no `cover`,
//! `date`, `user` or `tags`, but the TypeScript handler adds them and the view
//! is typed with an open index signature so it can. Clients read those fields,
//! so they are part of the real contract.
//!
//! The shapes here were checked against live responses from
//! `https://api.rocksky.app`, captured under `tests/fixtures/`. Three things
//! that came out of that and are easy to get wrong:
//!
//! 1. **Absent values are `null`, not omitted.** `JSON.stringify` keeps `null`
//!    and drops only `undefined`, and the Postgres rows yield `null`. So almost
//!    nothing here is `skip_serializing_if` — a client reading
//!    `scrobble.mbId === null` must not instead find the key missing.
//! 2. **`xataVersion` is on the wire.** It is a Xata bookkeeping column that
//!    means nothing to this crate, but it is in the live response, so it is
//!    carried through rather than quietly dropped.
//! 3. **`tags` differs between the two scrobble views**: `null` in the feed
//!    (`artists?.genres`) and `[]` in the detail (`artists?.genres || []`).

pub mod timestamp;

use crate::db::models::{Artist, Scrobble, Track, User};
use crate::likes::Likes;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A full artist record, as embedded in the detailed scrobble view.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistView {
    pub id: String,
    pub name: String,
    pub biography: Option<String>,
    #[serde(with = "timestamp::optional")]
    pub born: Option<DateTime<Utc>>,
    pub born_in: Option<String>,
    #[serde(with = "timestamp::optional")]
    pub died: Option<DateTime<Utc>>,
    pub picture: Option<String>,
    pub sha256: String,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub apple_music_link: Option<String>,
    pub spotify_link: Option<String>,
    pub tidal_link: Option<String>,
    pub youtube_link: Option<String>,
    /// `null` when the column is NULL — the live response shows `null` here
    /// rather than an empty array.
    pub genres: Option<Vec<String>>,
    #[serde(with = "timestamp::required")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "timestamp::required")]
    pub updated_at: DateTime<Utc>,
    pub xata_version: Option<i64>,
}

impl From<&Artist> for ArtistView {
    fn from(artist: &Artist) -> Self {
        Self {
            id: artist.id.clone(),
            name: artist.name.clone(),
            biography: artist.biography.clone(),
            born: artist.born,
            born_in: artist.born_in.clone(),
            died: artist.died,
            picture: artist.picture.clone(),
            sha256: artist.sha256.clone(),
            uri: artist.uri.clone(),
            apple_music_link: artist.apple_music_link.clone(),
            spotify_link: artist.spotify_link.clone(),
            tidal_link: artist.tidal_link.clone(),
            youtube_link: artist.youtube_link.clone(),
            // The raw column is preserved: a NULL stays `null`, and a present
            // array is parsed.
            genres: artist.genres.as_deref().map(|_| artist.genres()),
            created_at: artist.created_at,
            updated_at: artist.updated_at,
            xata_version: artist.xata_version,
        }
    }
}

/// A track in full, as the detail endpoints report it.
///
/// `crate::db::models::Track` cannot be used directly: it is the row model and
/// serializes snake_case, so nesting it inside a camelCase payload would emit
/// `album_artist`. `rename_all` on the outer struct does not reach into a nested one.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackView {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    pub album: String,
    pub track_number: Option<i64>,
    pub duration: i64,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub tidal_link: Option<String>,
    pub sha256: String,
    pub disc_number: Option<i64>,
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub copyright_message: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[serde(with = "crate::views::timestamp::required")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub xata_version: Option<i64>,
}

impl From<&Track> for TrackView {
    fn from(track: &Track) -> Self {
        Self {
            id: track.id.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            album_artist: track.album_artist.clone(),
            album_art: track.album_art.clone(),
            album: track.album.clone(),
            track_number: track.track_number,
            duration: track.duration,
            mb_id: track.mb_id.clone(),
            isrc: track.isrc.clone(),
            youtube_link: track.youtube_link.clone(),
            spotify_link: track.spotify_link.clone(),
            apple_music_link: track.apple_music_link.clone(),
            tidal_link: track.tidal_link.clone(),
            sha256: track.sha256.clone(),
            disc_number: track.disc_number,
            lyrics: track.lyrics.clone(),
            composer: track.composer.clone(),
            genre: track.genre.clone(),
            label: track.label.clone(),
            copyright_message: track.copyright_message.clone(),
            key: track.key.clone(),
            bpm: track.bpm,
            uri: track.uri.clone(),
            album_uri: track.album_uri.clone(),
            artist_uri: track.artist_uri.clone(),
            created_at: track.created_at,
            updated_at: track.updated_at,
            xata_version: track.xata_version,
        }
    }
}

/// One row of the scrobbles feed (`app.rocksky.scrobble.getScrobbles`).
///
/// The track's own fields are spread in, minus `albumArt` (renamed `cover`),
/// `id` (the scrobble's wins) and `lyrics` (too large for a feed). The scrobble
/// then overrides `uri`, `createdAt` and `date`, and the track's URI moves to
/// `trackUri` — the distinction matters because liking a song needs the track
/// URI while replying to a scrobble needs the scrobble's.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleViewBasic {
    /// The scrobble's id, not the track's.
    pub id: String,
    /// The scrobble's AT-URI.
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    /// The track's AT-URI.
    #[serde(default, with = "crate::views::uri")]
    pub track_uri: Option<String>,

    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub track_number: Option<i64>,
    pub duration: i64,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub tidal_link: Option<String>,
    pub sha256: String,
    pub disc_number: Option<i64>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub copyright_message: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    pub xata_version: Option<i64>,

    /// The track's album art. Named `cover` on the wire.
    pub cover: Option<String>,

    /// When the play happened. `date` and `createdAt` are the same value —
    /// both the scrobble's timestamp, *not* the track row's creation time.
    #[serde(with = "timestamp::required")]
    pub date: DateTime<Utc>,
    #[serde(with = "timestamp::required")]
    pub created_at: DateTime<Utc>,
    /// The track row's last update, the one field here that really does come
    /// from the track.
    ///
    /// The live TypeScript response has a bug at this key: it serializes as
    /// `{}` rather than a timestamp. A proper ISO-8601 string is emitted
    /// instead — `new Date(view.updatedAt)` was already an Invalid Date
    /// against `{}`, so nothing can be relying on the broken form.
    #[serde(with = "timestamp::required")]
    pub updated_at: DateTime<Utc>,

    /// The listener's handle, under the legacy key `user`.
    pub user: String,
    pub user_display_name: Option<String>,
    pub user_avatar: String,

    /// The scrobbled artist's genres, or `null` — which is what
    /// `artists?.genres` yields for a missing artist row or a NULL column.
    pub tags: Option<Vec<String>>,

    pub likes_count: i64,
    pub liked: bool,
}

impl ScrobbleViewBasic {
    pub fn new(
        scrobble: &Scrobble,
        track: &Track,
        user: &User,
        artist: Option<&Artist>,
        likes: Likes,
    ) -> Self {
        Self {
            id: scrobble.id.clone(),
            uri: scrobble.uri.clone(),
            track_uri: track.uri.clone(),

            title: track.title.clone(),
            artist: track.artist.clone(),
            album_artist: track.album_artist.clone(),
            album: track.album.clone(),
            track_number: track.track_number,
            duration: track.duration,
            mb_id: track.mb_id.clone(),
            isrc: track.isrc.clone(),
            youtube_link: track.youtube_link.clone(),
            spotify_link: track.spotify_link.clone(),
            apple_music_link: track.apple_music_link.clone(),
            tidal_link: track.tidal_link.clone(),
            sha256: track.sha256.clone(),
            disc_number: track.disc_number,
            composer: track.composer.clone(),
            genre: track.genre.clone(),
            label: track.label.clone(),
            copyright_message: track.copyright_message.clone(),
            key: track.key.clone(),
            bpm: track.bpm,
            album_uri: track.album_uri.clone(),
            artist_uri: track.artist_uri.clone(),
            xata_version: track.xata_version,

            cover: track.album_art.clone(),

            date: scrobble.timestamp,
            created_at: scrobble.timestamp,
            updated_at: track.updated_at,

            user: user.handle.clone(),
            user_display_name: user.display_name.clone(),
            user_avatar: user.avatar.clone(),

            tags: artist.and_then(|artist| artist.genres.as_deref().map(|_| artist.genres())),

            likes_count: likes.count,
            liked: likes.liked,
        }
    }
}

/// Who played a track first, shown on the scrobble page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstScrobbleView {
    pub handle: String,
    pub avatar: String,
    #[serde(with = "timestamp::required")]
    pub timestamp: DateTime<Utc>,
}

/// One scrobble in full (`app.rocksky.scrobble.getScrobble`).
///
/// Differs from the feed view in more than depth: `lyrics` is included,
/// `likesCount` is *not*, `albumUri` comes from the album row rather than the
/// track, `tags` is `[]` instead of `null` when absent, and
/// `createdAt`/`updatedAt` are the scrobble row's own timestamps while `date`
/// carries the play time.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleViewDetailed {
    pub id: String,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub track_uri: Option<String>,

    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub track_number: Option<i64>,
    pub duration: i64,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub youtube_link: Option<String>,
    pub spotify_link: Option<String>,
    pub apple_music_link: Option<String>,
    pub tidal_link: Option<String>,
    pub sha256: String,
    pub disc_number: Option<i64>,
    /// Present here, unlike the feed view.
    pub lyrics: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub label: Option<String>,
    pub copyright_message: Option<String>,
    pub key: Option<String>,
    pub bpm: Option<f64>,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    /// From the album row, not the track's own `album_uri`.
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    pub xata_version: Option<i64>,

    pub cover: Option<String>,

    /// Every artist credited on the track, resolved from its comma-separated
    /// `artist` field.
    pub artists: Vec<ArtistView>,

    /// When the play happened.
    #[serde(with = "timestamp::required")]
    pub date: DateTime<Utc>,
    /// The scrobble row's own timestamps, unlike the feed view's.
    #[serde(with = "timestamp::required")]
    pub created_at: DateTime<Utc>,
    #[serde(with = "timestamp::required")]
    pub updated_at: DateTime<Utc>,

    pub user: String,
    /// `artists?.genres || []`, so always an array here.
    pub tags: Vec<String>,

    /// Distinct listeners of this track, and total plays of it.
    pub listeners: i64,
    pub scrobbles: i64,
    /// The one genuinely optional key: the TypeScript yields `undefined` when
    /// there is no first scrobble, and `JSON.stringify` drops it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_scrobble: Option<FirstScrobbleView>,

    pub liked: bool,
}

impl ScrobbleViewDetailed {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        scrobble: &Scrobble,
        track: &Track,
        user: &User,
        artist: Option<&Artist>,
        album_uri: Option<String>,
        artists: Vec<Artist>,
        listeners: i64,
        scrobbles: i64,
        first_scrobble: Option<FirstScrobbleView>,
        likes: Likes,
    ) -> Self {
        Self {
            id: scrobble.id.clone(),
            uri: scrobble.uri.clone(),
            track_uri: track.uri.clone(),

            title: track.title.clone(),
            artist: track.artist.clone(),
            album_artist: track.album_artist.clone(),
            album: track.album.clone(),
            track_number: track.track_number,
            duration: track.duration,
            mb_id: track.mb_id.clone(),
            isrc: track.isrc.clone(),
            youtube_link: track.youtube_link.clone(),
            spotify_link: track.spotify_link.clone(),
            apple_music_link: track.apple_music_link.clone(),
            tidal_link: track.tidal_link.clone(),
            sha256: track.sha256.clone(),
            disc_number: track.disc_number,
            lyrics: track.lyrics.clone(),
            composer: track.composer.clone(),
            genre: track.genre.clone(),
            label: track.label.clone(),
            copyright_message: track.copyright_message.clone(),
            key: track.key.clone(),
            bpm: track.bpm,
            artist_uri: track.artist_uri.clone(),
            album_uri,
            xata_version: track.xata_version,

            cover: track.album_art.clone(),

            artists: artists.iter().map(ArtistView::from).collect(),

            date: scrobble.timestamp,
            created_at: scrobble.created_at,
            updated_at: scrobble.updated_at,

            user: user.handle.clone(),
            tags: artist.map(|artist| artist.genres()).unwrap_or_default(),

            listeners,
            scrobbles,
            first_scrobble,

            liked: likes.liked,
        }
    }
}

/// Serialises an absent URI as `""` rather than `null`.
///
/// Every consumer of these fields treats them as strings: the web client
/// splits them to build a route, and guards with `!uri`, `!!uri` or `||`.
/// An empty string satisfies all three identically — it is falsy, and
/// `"".split("at://")[1]` is `undefined`, the same as the guarded path
/// produces — while `null.split(…)` throws
/// `Cannot read properties of null (reading 'split')` and takes the page
/// down.
///
/// Paired with `#[serde(default)]` at every use, because `serde(with = …)`
/// otherwise makes the field mandatory on the way in — and a payload that
/// simply omits a URI is normal.
///
/// The distinction a `null` would carry is not one any caller acts on: a
/// record with no URI and a record whose URI is unknown are both "nothing to
/// link to". So the safer spelling costs nothing.
///
/// Deliberately different from `apps/api`, which emits `null` here. That is
/// survivable there because its data is dense — almost every row has a URI —
/// and it is not survivable on a self-hosted instance, where a track known
/// only from a scrobble legitimately has none.
pub mod uri {
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<String>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(value.as_deref().unwrap_or(""))
    }

    /// Reads either spelling back, so a round trip through this module is
    /// lossless for anything that matters — `""` and `null` both mean absent.
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Ok(Option::<String>::deserialize(deserializer)?.filter(|uri| !uri.is_empty()))
    }
}

#[cfg(test)]
mod uri_tests {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Holder {
        #[serde(with = "super::uri")]
        uri: Option<String>,
    }

    /// The crash this exists to prevent: a client that splits the field must
    /// receive a string.
    #[test]
    fn an_absent_uri_serialises_as_an_empty_string() {
        let json = serde_json::to_string(&Holder { uri: None }).unwrap();
        assert_eq!(json, r#"{"uri":""}"#);
        assert!(!json.contains("null"));
    }

    #[test]
    fn a_present_uri_is_unchanged() {
        let json = serde_json::to_string(&Holder {
            uri: Some("at://did:plc:alice/app.rocksky.song/3abc".into()),
        })
        .unwrap();
        assert_eq!(
            json,
            r#"{"uri":"at://did:plc:alice/app.rocksky.song/3abc"}"#
        );
    }

    /// Both spellings read back as absent, so nothing downstream has to know
    /// which one it was given.
    #[test]
    fn either_spelling_reads_back_as_absent() {
        for body in [r#"{"uri":""}"#, r#"{"uri":null}"#] {
            let holder: Holder = serde_json::from_str(body).unwrap();
            assert_eq!(holder.uri, None, "{body}");
        }

        let holder: Holder = serde_json::from_str(r#"{"uri":"at://x/y/z"}"#).unwrap();
        assert_eq!(holder.uri.as_deref(), Some("at://x/y/z"));
    }
}
