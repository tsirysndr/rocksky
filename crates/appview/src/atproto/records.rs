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

use crate::atproto::session::AtpSession;
use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value;

/// The Last.fm placeholder cover, used when a record has no art.
///
/// The lexicon allows the field to be absent, but a record with no art shows
/// as a broken image everywhere downstream — including the Discord embeds — so
/// the placeholder is written instead of nothing.
pub const PLACEHOLDER_ALBUM_ART: &str = crate::ingest::PLACEHOLDER_ALBUM_ART;

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
        .post(format!("{}/xrpc/com.atproto.repo.putRecord", pds.trim_end_matches('/')))
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
    let created_at = crate::views::timestamp::to_iso8601(&chrono::Utc::now());
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
            mine(&Some("at://did:plc:aliceandbob/app.rocksky.album/3k2a".into())),
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

        for absent in ["trackNumber", "year", "releaseDate", "composer", "lyrics", "isrc", "mbid"] {
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
        assert_eq!(PLACEHOLDER_ALBUM_ART, crate::ingest::PLACEHOLDER_ALBUM_ART);
    }
}
