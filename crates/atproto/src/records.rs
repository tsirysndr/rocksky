//! Publishing `app.rocksky.*` records to a user's repository.
//!
//! An upload is not really in Rocksky until the record exists in the user's
//! own repo — that is what makes the library portable and visible to the rest
//! of the network. The local row is a projection of it.
//!
//! Records are written with `com.atproto.repo.putRecord` under a fresh TID
//! rkey, matching `apps/api`'s `putSongRecord` / `putAlbumRecord` /
//! `putArtistRecord`. The shapes here are those functions', field for field,
//! because the lexicon validates them and an extra or misnamed key is a
//! rejected write.

use crate::AtpSession;
use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value;

/// The Last.fm placeholder cover, used when a record has no art.
///
/// The lexicon allows the field to be absent, but a record with no art shows
/// as a broken image everywhere downstream — including the Discord embeds — so
/// the placeholder is written instead of nothing.
pub use rocksky_core::identity::PLACEHOLDER_ALBUM_ART;

fn with_fallback_album_art(album_art: Option<&str>) -> String {
    album_art
        .map(str::trim)
        .filter(|art| !art.is_empty())
        .unwrap_or(PLACEHOLDER_ALBUM_ART)
        .to_string()
}

/// A TID — the timestamp identifier atproto uses for record keys.
///
/// 13 characters of base32-sortable encoding a microsecond timestamp plus a
/// clock id. Sortable by construction, which is why the MST walk returns
/// records in creation order.
pub fn next_tid() -> String {
    // s32 alphabet, as in `@atproto/common`'s TID.
    const ALPHABET: &[u8] = b"234567abcdefghijklmnopqrstuvwxyz";

    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_micros() as u64)
        .unwrap_or_default();

    // A random clock id keeps two processes from minting the same TID in the
    // same microsecond.
    let clock_id = {
        use rand::Rng;
        rand::thread_rng().gen_range(0..1024u64)
    };

    // 64 bits: the top bit is always 0, then 53 bits of timestamp, then 10
    // bits of clock id.
    let value = ((micros & ((1 << 53) - 1)) << 10) | clock_id;

    let mut out = [0u8; 13];
    let mut remaining = value;
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET[(remaining & 0x1f) as usize];
        remaining >>= 5;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The fields a song, album or artist record is built from.
///
/// One struct for all three because they draw on the same tags; each `record`
/// function takes what it needs.
#[derive(Debug, Clone, Default)]
pub struct TrackRecord {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub release_date: Option<String>,
    pub album_art: Option<String>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub composer: Option<String>,
    pub lyrics: Option<String>,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub spotify_link: Option<String>,
    pub artist_picture: Option<String>,
}

/// Drops the keys whose value is null.
///
/// The lexicons declare optional fields as absent-or-present, not nullable, so
/// a `null` is a validation failure rather than "no value". `serde_json`'s
/// `skip_serializing_if` cannot express this across a builder, so the map is
/// pruned once at the end.
fn prune(mut value: Value) -> Value {
    if let Some(map) = value.as_object_mut() {
        map.retain(|_, field| !field.is_null());
    }
    value
}

/// An `app.rocksky.song` record.
pub fn song_record(track: &TrackRecord, created_at: &str) -> Value {
    prune(serde_json::json!({
        "$type": "app.rocksky.song",
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "albumArtist": track.album_artist,
        "duration": track.duration,
        "trackNumber": track.track_number,
        // Zero is not a disc; a single-disc release is disc 1.
        "discNumber": track.disc_number.filter(|d| *d > 0).unwrap_or(1),
        "year": track.year,
        "releaseDate": track.release_date,
        "albumArtUrl": with_fallback_album_art(track.album_art.as_deref()),
        "composer": track.composer,
        "lyrics": track.lyrics,
        "copyrightMessage": track.copyright_message,
        "spotifyLink": track.spotify_link,
        "tags": track.tags,
        "mbid": track.mb_id,
        "isrc": track.isrc,
        "createdAt": created_at,
    }))
}

/// An `app.rocksky.scrobble` record.
///
/// The same fields as the song record plus the moment it was played, because a
/// scrobble is self-describing: a consumer reading it off the firehose has the
/// whole song without having to resolve the song record too. That is why
/// backfill can rebuild a catalogue from scrobbles alone.
pub fn scrobble_record(track: &TrackRecord, listened_at: chrono::DateTime<chrono::Utc>) -> Value {
    let created_at = rocksky_core::timestamp::to_iso8601(&listened_at);
    let mut value = song_record(track, &created_at);

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "$type".to_string(),
            Value::String("app.rocksky.scrobble".to_string()),
        );
    }
    value
}

/// An `app.rocksky.album` record.
pub fn album_record(track: &TrackRecord, created_at: &str) -> Value {
    prune(serde_json::json!({
        "$type": "app.rocksky.album",
        "title": track.album,
        "artist": track.album_artist,
        "albumArtUrl": with_fallback_album_art(track.album_art.as_deref()),
        "year": track.year,
        "releaseDate": track.release_date,
        "tags": track.tags,
        "createdAt": created_at,
    }))
}

/// An `app.rocksky.artist` record.
pub fn artist_record(track: &TrackRecord, created_at: &str) -> Value {
    prune(serde_json::json!({
        "$type": "app.rocksky.artist",
        "name": track.album_artist,
        "pictureUrl": track.artist_picture,
        "tags": track.tags,
        "createdAt": created_at,
    }))
}

// ------------------------------------------------------------------- teal.fm
//
// Rocksky publishes each listen into the listener's own repository a second
// time, as teal.fm's vocabulary, so a teal.fm client reading their repo sees
// it. The schemas live in `apps/api/src/tealfm/lexicons/fm.teal/`.
//
// Built by hand rather than generated: the codegen vendors `app.rocksky`,
// `com.atproto` and `app.bsky`, and teaching it a fourth namespace to produce
// two record shapes is more machinery than the shapes are worth.

pub const TEAL_PLAY_NSID: &str = "fm.teal.feed.play";
pub const TEAL_STATUS_NSID: &str = "fm.teal.actor.status";

/// What teal.fm records as the client that submitted a play.
pub const TEAL_CLIENT_AGENT: &str = "rocksky/v0.0.1";

/// MusicBrainz ids are URIs in this vocabulary: `mbid:<uuid>`.
///
/// Idempotent, because some sources already store the prefix and double
/// prefixing produces an id that resolves to nothing.
fn mbid_uri(mbid: Option<&str>) -> Option<String> {
    let mbid = mbid.map(str::trim).filter(|id| !id.is_empty())?;
    Some(if mbid.starts_with("mbid:") {
        mbid.to_string()
    } else {
        format!("mbid:{mbid}")
    })
}

/// The credited artists, as `fm.teal.feed.defs#artist`.
///
/// Rocksky keeps one comma-separated `artist` string where teal.fm wants a
/// list, so it is split here. Only the album artist has a MusicBrainz id in
/// this shape, and attaching it to each name would be wrong — so names go out
/// without one rather than with somebody else's.
fn teal_artists(track: &TrackRecord) -> Vec<Value> {
    let names: Vec<&str> = track
        .artist
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect();

    // `artists` is required and must not be empty; fall back to the album
    // artist when the track's own field is unusable.
    if names.is_empty() {
        return vec![serde_json::json!({ "artistName": track.album_artist })];
    }

    names
        .into_iter()
        .map(|name| serde_json::json!({ "artistName": name }))
        .collect()
}

/// The body both the play record and the status item carry.
fn teal_play_view(track: &TrackRecord, played_at: &str, duration_seconds: i64) -> Value {
    prune(serde_json::json!({
        "trackName": track.title,
        "artists": teal_artists(track),
        "duration": duration_seconds,
        "playedTime": played_at,
        "releaseName": track.album,
        "recordingMbId": mbid_uri(track.mb_id.as_deref()),
        "isrc": track.isrc,
        "submissionClientAgent": TEAL_CLIENT_AGENT,
    }))
}

/// An `fm.teal.feed.play` record.
///
/// `duration` is **seconds** here, where `app.rocksky.scrobble` carries
/// milliseconds — the two vocabularies disagree, and publishing milliseconds
/// into this field claims a three-minute song lasted two days.
pub fn teal_play_record(
    track: &TrackRecord,
    played_at: chrono::DateTime<chrono::Utc>,
    duration_seconds: i64,
) -> Value {
    let played_at = rocksky_core::timestamp::to_iso8601(&played_at);
    let mut value = teal_play_view(track, &played_at, duration_seconds);
    if let Some(object) = value.as_object_mut() {
        object.insert("$type".into(), Value::String(TEAL_PLAY_NSID.into()));
    }
    value
}

/// An `fm.teal.actor.status` record — "this is on right now".
///
/// One per repository, at rkey `self`, replaced on each play. `expiry` is what
/// stops a stale status showing forever when someone stops listening; ten
/// minutes is the default the lexicon names.
pub fn teal_status_record(
    track: &TrackRecord,
    played_at: chrono::DateTime<chrono::Utc>,
    duration_seconds: i64,
    now: chrono::DateTime<chrono::Utc>,
) -> Value {
    let item = teal_play_view(
        track,
        &rocksky_core::timestamp::to_iso8601(&played_at),
        duration_seconds,
    );
    serde_json::json!({
        "$type": TEAL_STATUS_NSID,
        "item": item,
        "time": rocksky_core::timestamp::to_iso8601(&now),
        "expiry": rocksky_core::timestamp::to_iso8601(&(now + chrono::Duration::minutes(10))),
    })
}

/// Writes a record and returns its AT-URI.
///
/// Uses the stored app-password session's access token. An OAuth session needs
/// a DPoP-signed request instead, which is why this takes the session rather
/// than reaching for one itself — see [`publish`].
async fn put_record(
    http: &reqwest::Client,
    pds: &str,
    access_jwt: &str,
    did: &str,
    collection: &str,
    rkey: &str,
    record: &Value,
) -> Result<String> {
    #[derive(Serialize)]
    struct Request<'a> {
        repo: &'a str,
        collection: &'a str,
        rkey: &'a str,
        record: &'a Value,
    }

    let response = http
        .post(format!(
            "{}/xrpc/com.atproto.repo.putRecord",
            pds.trim_end_matches('/')
        ))
        .bearer_auth(access_jwt)
        .json(&Request {
            repo: did,
            collection,
            rkey,
            record,
        })
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!(
            "{collection} record rejected by the PDS ({status}): {body}"
        ));
    }

    #[derive(serde::Deserialize)]
    struct Created {
        uri: String,
    }
    Ok(response.json::<Created>().await?.uri)
}

/// The URIs a published track gained.
#[derive(Debug, Clone, Default)]
pub struct PublishedUris {
    pub song: Option<String>,
    pub album: Option<String>,
    pub artist: Option<String>,
}

/// Publishes the song, album and artist records for a track.
///
/// Each is independent: a failed album write does not cost the song its URI,
/// because a track with no album record is still a usable track. Failures are
/// returned as `None` rather than as an error for that reason.
/// AT-URIs this repo already holds for the album and artist, so they are not
/// written twice.
///
/// `apps/api` mints a fresh TID for every one of these, which duplicates the
/// same album in a repo once per track — its dedup guard reads a URI the
/// firehose backfills asynchronously, so it usually has not arrived yet. Rows
/// are written synchronously here, so the URI is there to be reused.
#[derive(Debug, Default, Clone)]
pub struct KnownUris {
    pub album: Option<String>,
    pub artist: Option<String>,
}

pub async fn publish(
    http: &reqwest::Client,
    pds: &str,
    session: &AtpSession,
    track: &TrackRecord,
    known: &KnownUris,
) -> PublishedUris {
    let created_at = rocksky_core::timestamp::to_iso8601(&chrono::Utc::now());
    let mut uris = PublishedUris::default();

    // A URI is only reusable if it points into *this* repo: an album row is
    // shared between users, so the URI on it may be someone else's record.
    let mine = |uri: &Option<String>| {
        uri.as_deref()
            .filter(|uri| uri.starts_with(&format!("at://{}/", session.did)))
            .map(str::to_string)
    };
    uris.album = mine(&known.album);
    uris.artist = mine(&known.artist);

    let mut writes: Vec<(&str, Value)> =
        vec![("app.rocksky.song", song_record(track, &created_at))];
    if uris.album.is_none() {
        writes.push(("app.rocksky.album", album_record(track, &created_at)));
    }
    if uris.artist.is_none() {
        writes.push(("app.rocksky.artist", artist_record(track, &created_at)));
    }

    for (collection, record) in writes {
        let rkey = next_tid();
        match put_record(
            http,
            pds,
            &session.access_jwt,
            &session.did,
            collection,
            &rkey,
            &record,
        )
        .await
        {
            Ok(uri) => {
                tracing::debug!(collection, uri = %uri, "published a record");
                match collection {
                    "app.rocksky.song" => uris.song = Some(uri),
                    "app.rocksky.album" => uris.album = Some(uri),
                    _ => uris.artist = Some(uri),
                }
            }
            Err(err) => {
                tracing::warn!(collection, error = %err, "could not publish a record");
            }
        }
    }

    uris
}

#[cfg(test)]
mod tests {
    use super::*;

    fn teal_track() -> TrackRecord {
        TrackRecord {
            title: "Roygbiv".into(),
            artist: "Boards of Canada, Someone Else".into(),
            album: "Music Has the Right to Children".into(),
            album_artist: "Boards of Canada".into(),
            duration: 151_000,
            mb_id: Some("68bd5063-d006-40ec-8aff-a43bd66f00ce".into()),
            ..Default::default()
        }
    }

    fn at(iso: &str) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339(iso)
            .unwrap()
            .with_timezone(&chrono::Utc)
    }

    /// `app.rocksky.scrobble` carries milliseconds and `fm.teal.feed.play`
    /// carries seconds. Publishing one into the other claims a three-minute
    /// song lasted two days.
    #[test]
    fn a_teal_play_carries_seconds_not_milliseconds() {
        let record = teal_play_record(&teal_track(), at("2026-09-15T19:59:13Z"), 151_000 / 1000);
        assert_eq!(record["duration"], 151);
        assert_eq!(record["$type"], TEAL_PLAY_NSID);
        assert_eq!(record["playedTime"], "2026-09-15T19:59:13.000Z");
    }

    /// Rocksky keeps one comma-separated string; teal.fm wants a list, and
    /// `artists` is required and must not be empty.
    #[test]
    fn the_artist_string_becomes_a_list() {
        let record = teal_play_record(&teal_track(), at("2026-09-15T19:59:13Z"), 151);
        let artists = record["artists"].as_array().expect("an array");
        assert_eq!(artists.len(), 2);
        assert_eq!(artists[0]["artistName"], "Boards of Canada");
        assert_eq!(artists[1]["artistName"], "Someone Else");
        // Only the album artist has an id in this shape, and attaching it to
        // every name would credit the wrong person.
        assert!(artists[1].get("artistMbId").is_none());
    }

    /// `artists` is required, so a track whose artist field is unusable still
    /// has to produce one.
    #[test]
    fn an_empty_artist_field_falls_back_to_the_album_artist() {
        let mut track = teal_track();
        track.artist = "  ,  ".into();
        let record = teal_play_record(&track, at("2026-09-15T19:59:13Z"), 151);
        let artists = record["artists"].as_array().unwrap();
        assert_eq!(artists.len(), 1);
        assert_eq!(artists[0]["artistName"], "Boards of Canada");
    }

    /// MusicBrainz ids are URIs here, and double prefixing produces an id that
    /// resolves to nothing.
    #[test]
    fn the_mbid_is_prefixed_once() {
        assert_eq!(mbid_uri(Some("abc")).as_deref(), Some("mbid:abc"));
        assert_eq!(mbid_uri(Some("mbid:abc")).as_deref(), Some("mbid:abc"));
        assert_eq!(mbid_uri(Some("   ")), None);
        assert_eq!(mbid_uri(None), None);

        let record = teal_play_record(&teal_track(), at("2026-09-15T19:59:13Z"), 151);
        assert_eq!(
            record["recordingMbId"],
            "mbid:68bd5063-d006-40ec-8aff-a43bd66f00ce"
        );
    }

    /// The lexicon declares optional fields absent-or-present, so a null is a
    /// validation failure rather than "no value".
    #[test]
    fn absent_fields_are_dropped_rather_than_nulled() {
        let mut track = teal_track();
        track.mb_id = None;
        track.isrc = None;
        let record = teal_play_record(&track, at("2026-09-15T19:59:13Z"), 151);

        assert!(record.get("recordingMbId").is_none());
        assert!(record.get("isrc").is_none());
        assert!(record.as_object().unwrap().values().all(|v| !v.is_null()));
    }

    /// Ten minutes after the status is recorded, which is the default the
    /// lexicon names — without it a stale status shows forever.
    #[test]
    fn a_status_expires_ten_minutes_out() {
        let record = teal_status_record(
            &teal_track(),
            at("2026-09-15T19:59:13Z"),
            151,
            at("2026-09-15T20:00:00Z"),
        );
        assert_eq!(record["$type"], TEAL_STATUS_NSID);
        assert_eq!(record["time"], "2026-09-15T20:00:00.000Z");
        assert_eq!(record["expiry"], "2026-09-15T20:10:00.000Z");
        // The item is the play, so a client has the track without resolving
        // the play record too.
        assert_eq!(record["item"]["trackName"], "Roygbiv");
        assert_eq!(record["item"]["duration"], 151);
    }

    /// Only a URI from this repo is reusable — an album row is shared between
    /// users, so its URI is often someone else's record.
    #[test]
    fn a_known_uri_is_only_reused_when_it_is_ours() {
        let did = "did:plc:alice";
        let mine = |uri: &Option<String>| {
            uri.as_deref()
                .filter(|uri| uri.starts_with(&format!("at://{did}/")))
                .map(str::to_string)
        };

        let ours = Some("at://did:plc:alice/app.rocksky.album/3k2a".to_string());
        assert_eq!(mine(&ours), ours);

        // Someone else's record, and no record at all, both mean "publish".
        assert_eq!(
            mine(&Some("at://did:plc:bob/app.rocksky.album/3k2a".into())),
            None
        );
        assert_eq!(mine(&None), None);
        // A DID that merely starts the same is not the same DID.
        assert_eq!(
            mine(&Some(
                "at://did:plc:aliceandbob/app.rocksky.album/3k2a".into()
            )),
            None
        );
    }

    fn track() -> TrackRecord {
        TrackRecord {
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album: "Music Has the Right to Children".into(),
            album_artist: "Boards of Canada".into(),
            duration: 151_000,
            track_number: Some(4),
            disc_number: Some(1),
            year: Some(1998),
            album_art: Some("https://cdn.example/cover.jpg".into()),
            tags: vec!["electronic".into()],
            isrc: Some("GBAAA0000001".into()),
            ..Default::default()
        }
    }

    #[test]
    fn a_tid_is_thirteen_sortable_characters() {
        let tid = next_tid();
        assert_eq!(tid.len(), 13, "{tid}");
        assert!(
            tid.bytes()
                .all(|b| b"234567abcdefghijklmnopqrstuvwxyz".contains(&b)),
            "{tid}"
        );
    }

    #[test]
    fn tids_sort_in_creation_order() {
        // The MST walk relies on this: record keys sort chronologically, which
        // is what makes a repository read back in the order it was written.
        let first = next_tid();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let second = next_tid();
        assert!(first < second, "{first} should sort before {second}");
    }

    #[test]
    fn a_song_record_carries_the_required_lexicon_fields() {
        let record = song_record(&track(), "2026-09-16T00:00:00.000Z");

        // The lexicon requires exactly these.
        for field in [
            "title",
            "artist",
            "album",
            "albumArtist",
            "duration",
            "createdAt",
        ] {
            assert!(record.get(field).is_some(), "missing {field}: {record}");
        }
        assert_eq!(record["$type"], "app.rocksky.song");
        assert_eq!(record["duration"], 151_000);
        assert_eq!(record["trackNumber"], 4);
        assert_eq!(record["isrc"], "GBAAA0000001");
        assert_eq!(record["tags"][0], "electronic");
    }

    /// The lexicons declare optional fields as absent-or-present, so a `null`
    /// is a validation failure rather than "no value".
    #[test]
    fn absent_fields_are_omitted_rather_than_null() {
        let bare = TrackRecord {
            title: "T".into(),
            artist: "A".into(),
            album: "B".into(),
            album_artist: "A".into(),
            duration: 1000,
            ..Default::default()
        };
        let record = song_record(&bare, "2026-09-16T00:00:00.000Z");

        for absent in [
            "trackNumber",
            "year",
            "releaseDate",
            "composer",
            "lyrics",
            "isrc",
            "mbid",
        ] {
            assert!(
                record.get(absent).is_none(),
                "{absent} should be absent, not null: {record}"
            );
        }
        // And nothing anywhere is null.
        assert!(
            !record.to_string().contains("null"),
            "a null would be rejected: {record}"
        );
    }

    #[test]
    fn a_missing_cover_becomes_the_placeholder() {
        // Writing no art shows as a broken image everywhere downstream.
        let mut bare = track();
        bare.album_art = None;
        let record = song_record(&bare, "2026-09-16T00:00:00.000Z");
        assert_eq!(record["albumArtUrl"], PLACEHOLDER_ALBUM_ART);

        bare.album_art = Some("   ".into());
        let record = song_record(&bare, "2026-09-16T00:00:00.000Z");
        assert_eq!(
            record["albumArtUrl"], PLACEHOLDER_ALBUM_ART,
            "blank is not a cover"
        );
    }

    #[test]
    fn the_disc_number_defaults_to_one_in_the_record() {
        let mut bare = track();
        bare.disc_number = Some(0);
        assert_eq!(song_record(&bare, "x")["discNumber"], 1);
        bare.disc_number = None;
        assert_eq!(song_record(&bare, "x")["discNumber"], 1);
        bare.disc_number = Some(2);
        assert_eq!(song_record(&bare, "x")["discNumber"], 2);
    }

    #[test]
    fn an_album_record_is_titled_by_the_album_not_the_track() {
        let record = album_record(&track(), "2026-09-16T00:00:00.000Z");
        assert_eq!(record["$type"], "app.rocksky.album");
        assert_eq!(record["title"], "Music Has the Right to Children");
        assert_eq!(record["artist"], "Boards of Canada");
        assert_eq!(record["year"], 1998);
        // Not a song field.
        assert!(record.get("duration").is_none(), "{record}");
    }

    #[test]
    fn an_artist_record_names_the_album_artist() {
        let record = artist_record(&track(), "2026-09-16T00:00:00.000Z");
        assert_eq!(record["$type"], "app.rocksky.artist");
        assert_eq!(record["name"], "Boards of Canada");
        // No picture was known, so the key is absent rather than null.
        assert!(record.get("pictureUrl").is_none(), "{record}");
    }

    #[test]
    fn the_placeholder_matches_the_indexers() {
        // Both sides must agree, or a record published here and one ingested
        // from the firehose would disagree on the cover.
        assert_eq!(PLACEHOLDER_ALBUM_ART, rocksky_core::PLACEHOLDER_ALBUM_ART);
    }
}

// --------------------------------------------------------------------- reads

/// One record, as `com.atproto.repo.getRecord` returns it.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct FetchedRecord {
    pub uri: String,
    /// Absent on some PDS implementations for a record with no commit yet.
    #[serde(default)]
    pub cid: Option<String>,
    pub value: serde_json::Value,
}

/// Reads one record from a repository, without credentials.
///
/// A repository is public, so a read needs no session — which matters for two
/// cases: looking up the CID a like has to pin, and reading another user's
/// audio settings or equalizer presets. Both are for repos this instance may
/// have no session for at all.
///
/// The PDS is resolved from the DID rather than assumed, so a record in a
/// self-hosted repo is as readable as one on `bsky.social`.
pub async fn get_record(
    http: &reqwest::Client,
    pds: &str,
    did: &str,
    collection: &str,
    rkey: &str,
) -> Result<Option<FetchedRecord>, anyhow::Error> {
    let response = http
        .get(format!("{pds}/xrpc/com.atproto.repo.getRecord"))
        .query(&[("repo", did), ("collection", collection), ("rkey", rkey)])
        .send()
        .await?;

    // A missing record is `None` rather than an error: "this user has no
    // saved settings" is an ordinary answer, not a failure.
    if response.status() == reqwest::StatusCode::BAD_REQUEST
        || response.status() == reqwest::StatusCode::NOT_FOUND
    {
        tracing::debug!(did, collection, rkey, "no such record");
        return Ok(None);
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("the PDS answered {status} reading {collection}/{rkey}: {body}");
    }

    Ok(Some(response.json().await?))
}

/// Every record in one collection of a repository.
///
/// Paged through to the end, because the callers want a complete list — an
/// equalizer preset picker showing an arbitrary first page would be worse than
/// useless. Bounded by `max` so one enormous repo cannot be walked forever.
pub async fn list_records(
    http: &reqwest::Client,
    pds: &str,
    did: &str,
    collection: &str,
    max: usize,
) -> Result<Vec<FetchedRecord>, anyhow::Error> {
    let mut all = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let mut query = vec![
            ("repo", did.to_string()),
            ("collection", collection.to_string()),
            ("limit", "100".to_string()),
        ];
        if let Some(cursor) = &cursor {
            query.push(("cursor", cursor.clone()));
        }

        let response = http
            .get(format!("{pds}/xrpc/com.atproto.repo.listRecords"))
            .query(&query)
            .send()
            .await?;

        // An empty or absent collection is an empty list, not an error.
        if !response.status().is_success() {
            tracing::debug!(
                did,
                collection,
                status = response.status().as_u16(),
                "listing a collection did not succeed; treating it as empty"
            );
            break;
        }

        #[derive(serde::Deserialize)]
        struct Page {
            #[serde(default)]
            records: Vec<FetchedRecord>,
            #[serde(default)]
            cursor: Option<String>,
        }

        let page: Page = response.json().await?;
        let fetched = page.records.len();
        all.extend(page.records);

        // Stop on a short page, on no cursor, or at the cap — any one of the
        // three, since a PDS that returns a cursor forever would otherwise
        // loop.
        if fetched == 0 || page.cursor.is_none() || all.len() >= max {
            cursor = None;
        } else {
            cursor = page.cursor;
        }

        if cursor.is_none() {
            break;
        }
    }

    all.truncate(max);
    tracing::debug!(did, collection, records = all.len(), "listed a collection");
    Ok(all)
}
