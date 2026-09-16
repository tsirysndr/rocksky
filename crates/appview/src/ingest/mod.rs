//! Projecting `app.rocksky.*` records into the appview tables.
//!
//! This is the one place records become rows, shared by every sync source —
//! the CAR backfill ([`crate::backfill`]) and the live TAP stream
//! ([`crate::sync`]) both hand records here. Keeping it single means a
//! backfilled row and a live-indexed row are identical, which is what makes
//! re-running a backfill safe.
//!
//! The projection follows `crates/jetstream/src/repo.rs`, which is the
//! reference implementation. The parts that matter:
//!
//! - **Identity is a content hash, not the record.** A track is
//!   `sha256(lower("{title} - {artist} - {album}"))`, an album
//!   `sha256(lower("{album} - {albumArtist}"))`, an artist
//!   `sha256(lower(albumArtist))`. One scrobble therefore creates or reuses an
//!   artist, an album and a track.
//! - **Track lookup ranks sha256 > mbId > isrc.** The same ISRC can map to
//!   several `tracks` rows when a recording appears on both a single and a
//!   compilation, so an unordered `OR` would non-deterministically cross
//!   albums.
//! - **Scrobbles dedupe on `(user_id, track_id, timestamp)`.** Several sources
//!   (Spotify, a Last.fm mirror, Navidrome) publish their own AT-URI for the
//!   same listen, so the URI cannot be the dedupe key.

use crate::db::{new_id, Backend};
use sha2::{Digest, Sha256};

pub const SCROBBLE_NSID: &str = "app.rocksky.scrobble";
pub const SONG_NSID: &str = "app.rocksky.song";
pub const ALBUM_NSID: &str = "app.rocksky.album";
pub const ARTIST_NSID: &str = "app.rocksky.artist";
pub const LIKE_NSID: &str = "app.rocksky.like";

/// Every collection this projection understands.
pub const SUPPORTED_COLLECTIONS: &[&str] =
    &[SCROBBLE_NSID, SONG_NSID, ALBUM_NSID, ARTIST_NSID, LIKE_NSID];

/// Stand-in cover used when a record carries no album art, so the UI has
/// something to render rather than a broken image.
pub const PLACEHOLDER_ALBUM_ART: &str =
    "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";

/// One record to project, however it arrived.
#[derive(Debug, Clone)]
pub struct IncomingRecord {
    pub did: String,
    pub collection: String,
    pub rkey: String,
    pub value: serde_json::Value,
}

impl IncomingRecord {
    pub fn uri(&self) -> String {
        format!("at://{}/{}/{}", self.did, self.collection, self.rkey)
    }
}

/// What a batch of records did, for logging and for the backfill summary.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct IngestStats {
    pub scrobbles: u64,
    /// Records that were already present, so nothing changed.
    pub duplicates: u64,
    pub songs: u64,
    pub albums: u64,
    pub artists: u64,
    pub likes: u64,
    /// Records this projection does not handle, or that were malformed.
    pub skipped: u64,
}

impl IngestStats {
    pub fn merge(&mut self, other: IngestStats) {
        self.scrobbles += other.scrobbles;
        self.duplicates += other.duplicates;
        self.songs += other.songs;
        self.albums += other.albums;
        self.artists += other.artists;
        self.likes += other.likes;
        self.skipped += other.skipped;
    }

    pub fn total(&self) -> u64 {
        self.scrobbles + self.songs + self.albums + self.artists + self.likes
    }
}

fn sha256_hex(input: &str) -> String {
    hex::encode(Sha256::digest(input.as_bytes()))
}

/// `sha256(lower("{title} - {artist} - {album}"))`
pub fn track_hash(title: &str, artist: &str, album: &str) -> String {
    sha256_hex(&format!("{title} - {artist} - {album}").to_lowercase())
}

/// `sha256(lower("{album} - {albumArtist}"))`
pub fn album_hash(album: &str, album_artist: &str) -> String {
    sha256_hex(&format!("{album} - {album_artist}").to_lowercase())
}

/// `sha256(lower(name))`
pub fn artist_hash(name: &str) -> String {
    sha256_hex(&name.to_lowercase())
}

/// Reads a string field, treating blank as absent.
fn string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// Reads an integer field. Records in the wild sometimes carry numbers as
/// strings, so both are accepted.
fn integer(value: &serde_json::Value, key: &str) -> Option<i64> {
    let field = value.get(key)?;
    field
        .as_i64()
        .or_else(|| field.as_f64().map(|n| n as i64))
        .or_else(|| field.as_str()?.trim().parse().ok())
}

/// The fields of an `app.rocksky.scrobble` (and `app.rocksky.song`, which
/// shares its shape) that reach the database.
#[derive(Debug, Clone)]
pub struct SongRecord {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub album_art: Option<String>,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub year: Option<i64>,
    pub release_date: Option<String>,
    pub genre: Option<String>,
    pub composer: Option<String>,
    pub lyrics: Option<String>,
    pub copyright_message: Option<String>,
    pub label: Option<String>,
    pub mb_id: Option<String>,
    pub isrc: Option<String>,
    pub spotify_link: Option<String>,
    pub youtube_link: Option<String>,
    pub tidal_link: Option<String>,
    pub apple_music_link: Option<String>,
}

impl SongRecord {
    /// Parses a record, or `None` when a required field is missing — which is
    /// a skip rather than an error, since a repository can contain anything.
    pub fn parse(value: &serde_json::Value) -> Option<Self> {
        let created_at = string(value, "createdAt")
            .and_then(|raw| chrono::DateTime::parse_from_rfc3339(&raw).ok())
            .map(|value| value.with_timezone(&chrono::Utc))?;

        Some(Self {
            title: string(value, "title")?,
            artist: string(value, "artist")?,
            album: string(value, "album")?,
            // Falls back to the track artist: `albumArtist` is required by the
            // lexicon but older records predate it.
            album_artist: string(value, "albumArtist").or_else(|| string(value, "artist"))?,
            duration: integer(value, "duration").unwrap_or(0),
            created_at,
            // A record with no art gets the placeholder rather than NULL, so
            // the UI never has to special-case a missing cover.
            album_art: Some(
                string(value, "albumArtUrl")
                    .or_else(|| string(value, "albumArt"))
                    .unwrap_or_else(|| PLACEHOLDER_ALBUM_ART.to_string()),
            ),
            track_number: integer(value, "trackNumber"),
            disc_number: integer(value, "discNumber"),
            year: integer(value, "year"),
            release_date: string(value, "releaseDate"),
            genre: string(value, "genre"),
            composer: string(value, "composer"),
            lyrics: string(value, "lyrics"),
            copyright_message: string(value, "copyrightMessage"),
            label: string(value, "label"),
            mb_id: string(value, "mbid").or_else(|| string(value, "mbId")),
            isrc: string(value, "isrc"),
            spotify_link: string(value, "spotifyLink"),
            youtube_link: string(value, "youtubeLink"),
            tidal_link: string(value, "tidalLink"),
            apple_music_link: string(value, "appleMusicLink"),
        })
    }
}

/// Inserts one record, returning what it did.
pub async fn ingest(db: &Backend, record: &IncomingRecord) -> anyhow::Result<IngestStats> {
    let mut stats = IngestStats::default();

    match record.collection.as_str() {
        SCROBBLE_NSID => {
            let Some(song) = SongRecord::parse(&record.value) else {
                stats.skipped += 1;
                return Ok(stats);
            };
            if ingest_scrobble(db, record, &song).await? {
                stats.scrobbles += 1;
            } else {
                stats.duplicates += 1;
            }
        }
        SONG_NSID => {
            let Some(song) = SongRecord::parse(&record.value) else {
                stats.skipped += 1;
                return Ok(stats);
            };
            // A song record is the canonical URI for a track the user owns,
            // so it backfills `tracks.uri` on the row the hash resolves to.
            let track_id = upsert_track(db, &song, None).await?;
            set_uri(db, "tracks", &track_id, &record.uri()).await?;
            stats.songs += 1;
        }
        ALBUM_NSID => {
            let (Some(title), Some(artist)) = (
                string(&record.value, "title"),
                string(&record.value, "artist"),
            ) else {
                stats.skipped += 1;
                return Ok(stats);
            };
            let album_id = upsert_album(
                db,
                &title,
                &artist,
                string(&record.value, "albumArtUrl").or_else(|| string(&record.value, "albumArt")),
                integer(&record.value, "year"),
                string(&record.value, "releaseDate"),
            )
            .await?;
            set_uri(db, "albums", &album_id, &record.uri()).await?;
            stats.albums += 1;
        }
        ARTIST_NSID => {
            let Some(name) = string(&record.value, "name") else {
                stats.skipped += 1;
                return Ok(stats);
            };
            let artist_id = upsert_artist(
                db,
                &name,
                string(&record.value, "pictureUrl").or_else(|| string(&record.value, "picture")),
            )
            .await?;
            set_uri(db, "artists", &artist_id, &record.uri()).await?;
            stats.artists += 1;
        }
        LIKE_NSID => {
            if ingest_like(db, record).await? {
                stats.likes += 1;
            } else {
                stats.skipped += 1;
            }
        }
        _ => stats.skipped += 1,
    }

    Ok(stats)
}

/// Ensures a `users` row exists for `did`, returning its id.
///
/// Records carry no profile, so the DID stands in for the handle until one is
/// known — `handle` is NOT NULL and UNIQUE, so it has to be something, and a
/// DID is guaranteed unique. [`set_handle`] replaces it once the DID document
/// has been read.
pub async fn upsert_user(db: &Backend, did: &str) -> anyhow::Result<String> {
    let mut existing = db.sql("SELECT xata_id FROM users WHERE did = ");
    existing.bind(did).push(" LIMIT 1");
    if let Some(id) = db.fetch_scalar::<String>(&existing).await? {
        return Ok(id);
    }

    let id = new_id();
    let mut insert = db.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
    insert
        .bind(&id)
        .push(", ")
        .bind(did)
        .push(", ")
        .bind(did)
        .push(", ")
        .bind("")
        .push(") ON CONFLICT (did) DO NOTHING");
    db.execute(&insert).await?;

    // A concurrent insert means the row now exists under another id.
    let mut again = db.sql("SELECT xata_id FROM users WHERE did = ");
    again.bind(did).push(" LIMIT 1");
    db.fetch_scalar::<String>(&again)
        .await?
        .ok_or_else(|| anyhow::anyhow!("could not create a user row for {did}"))
}

/// Records the handle for an already-indexed account.
///
/// Only overwrites the placeholder or a stale value, and never takes a handle
/// another row already holds — `handle` is UNIQUE, and a renamed account can
/// briefly collide with the previous owner of the name.
pub async fn set_handle(db: &Backend, did: &str, handle: &str) -> anyhow::Result<bool> {
    let mut taken = db.sql("SELECT xata_id FROM users WHERE handle = ");
    taken
        .bind(handle)
        .push(" AND did <> ")
        .bind(did)
        .push(" LIMIT 1");
    if db.fetch_scalar::<String>(&taken).await?.is_some() {
        tracing::warn!(
            did = %did,
            handle = %handle,
            "another account already holds this handle; leaving it unchanged"
        );
        return Ok(false);
    }

    let mut sql = db.sql("UPDATE users SET handle = ");
    sql.bind(handle)
        .push(", xata_updatedat = ")
        .bind(crate::db::now_timestamp())
        .push(" WHERE did = ")
        .bind(did)
        .push(" AND handle <> ")
        .bind(handle);
    Ok(db.execute(&sql).await? > 0)
}

async fn upsert_artist(
    db: &Backend,
    name: &str,
    picture: Option<String>,
) -> anyhow::Result<String> {
    let hash = artist_hash(name);

    let mut existing = db.sql("SELECT xata_id FROM artists WHERE sha256 = ");
    existing.bind(&hash).push(" LIMIT 1");
    if let Some(id) = db.fetch_scalar::<String>(&existing).await? {
        return Ok(id);
    }

    let id = new_id();
    let mut insert = db.sql("INSERT INTO artists (xata_id, name, picture, sha256) VALUES (");
    insert
        .bind(&id)
        .push(", ")
        .bind(name)
        .push(", ")
        .bind(picture)
        .push(", ")
        .bind(&hash)
        .push(") ON CONFLICT (sha256) DO NOTHING");
    db.execute(&insert).await?;

    let mut again = db.sql("SELECT xata_id FROM artists WHERE sha256 = ");
    again.bind(&hash).push(" LIMIT 1");
    db.fetch_scalar::<String>(&again)
        .await?
        .ok_or_else(|| anyhow::anyhow!("could not create an artist row for {name}"))
}

async fn upsert_album(
    db: &Backend,
    title: &str,
    album_artist: &str,
    album_art: Option<String>,
    year: Option<i64>,
    release_date: Option<String>,
) -> anyhow::Result<String> {
    let hash = album_hash(title, album_artist);

    let mut existing = db.sql("SELECT xata_id FROM albums WHERE sha256 = ");
    existing.bind(&hash).push(" LIMIT 1");
    if let Some(id) = db.fetch_scalar::<String>(&existing).await? {
        return Ok(id);
    }

    let id = new_id();
    let mut insert = db.sql(
        "INSERT INTO albums (xata_id, title, artist, album_art, year, release_date, sha256) \
         VALUES (",
    );
    insert
        .bind(&id)
        .push(", ")
        .bind(title)
        .push(", ")
        .bind(album_artist)
        .push(", ")
        .bind(album_art)
        .push(", ")
        .bind(year)
        .push(", ")
        .bind(release_date)
        .push(", ")
        .bind(&hash)
        .push(") ON CONFLICT (sha256) DO NOTHING");
    db.execute(&insert).await?;

    let mut again = db.sql("SELECT xata_id FROM albums WHERE sha256 = ");
    again.bind(&hash).push(" LIMIT 1");
    db.fetch_scalar::<String>(&again)
        .await?
        .ok_or_else(|| anyhow::anyhow!("could not create an album row for {title}"))
}

/// Finds or creates the `tracks` row for a record.
///
/// The lookup ranks the content hash above MBID above ISRC: the same ISRC can
/// belong to several rows (a single and a compilation), so an unranked `OR`
/// would pick a non-deterministic row and silently cross albums.
async fn upsert_track(
    db: &Backend,
    song: &SongRecord,
    uri: Option<&str>,
) -> anyhow::Result<String> {
    let hash = track_hash(&song.title, &song.artist, &song.album);

    let mut lookup = db.sql("SELECT xata_id FROM tracks WHERE sha256 = ");
    lookup.bind(&hash);
    if let Some(mb_id) = &song.mb_id {
        lookup
            .push(" OR (mb_id IS NOT NULL AND mb_id = ")
            .bind(mb_id)
            .push(")");
    }
    if let Some(isrc) = &song.isrc {
        lookup
            .push(" OR (isrc IS NOT NULL AND isrc = ")
            .bind(isrc)
            .push(")");
    }
    lookup.push(" ORDER BY CASE WHEN sha256 = ").bind(&hash);
    lookup.push(" THEN 0 ");
    if let Some(mb_id) = &song.mb_id {
        lookup.push("WHEN mb_id = ").bind(mb_id).push(" THEN 1 ");
    }
    if let Some(isrc) = &song.isrc {
        lookup.push("WHEN isrc = ").bind(isrc).push(" THEN 2 ");
    }
    lookup.push("ELSE 3 END LIMIT 1");

    if let Some(id) = db.fetch_scalar::<String>(&lookup).await? {
        return Ok(id);
    }

    let id = new_id();
    let mut insert = db.sql(
        "INSERT INTO tracks (xata_id, title, artist, album, album_art, album_artist, \
         track_number, duration, mb_id, isrc, composer, lyrics, disc_number, sha256, \
         copyright_message, uri, spotify_link, apple_music_link, tidal_link, youtube_link, \
         label, genre) VALUES (",
    );
    for (index, bind) in [
        Some(id.clone()),
        Some(song.title.clone()),
        Some(song.artist.clone()),
        Some(song.album.clone()),
        song.album_art.clone(),
        Some(song.album_artist.clone()),
    ]
    .into_iter()
    .enumerate()
    {
        if index > 0 {
            insert.push(", ");
        }
        insert.bind(bind);
    }
    insert
        .push(", ")
        .bind(song.track_number)
        .push(", ")
        .bind(song.duration)
        .push(", ")
        .bind(song.mb_id.clone())
        .push(", ")
        .bind(song.isrc.clone())
        .push(", ")
        .bind(song.composer.clone())
        .push(", ")
        .bind(song.lyrics.clone())
        .push(", ")
        .bind(song.disc_number)
        .push(", ")
        .bind(&hash)
        .push(", ")
        .bind(song.copyright_message.clone())
        .push(", ")
        .bind(uri.map(str::to_string))
        .push(", ")
        .bind(song.spotify_link.clone())
        .push(", ")
        .bind(song.apple_music_link.clone())
        .push(", ")
        .bind(song.tidal_link.clone())
        .push(", ")
        .bind(song.youtube_link.clone())
        .push(", ")
        .bind(song.label.clone())
        .push(", ")
        .bind(song.genre.clone())
        .push(") ON CONFLICT (sha256) DO NOTHING");
    db.execute(&insert).await?;

    let mut again = db.sql("SELECT xata_id FROM tracks WHERE sha256 = ");
    again.bind(&hash).push(" LIMIT 1");
    db.fetch_scalar::<String>(&again)
        .await?
        .ok_or_else(|| anyhow::anyhow!("could not create a track row for {}", song.title))
}

/// Fills in a row's AT-URI without clobbering one already there.
async fn set_uri(db: &Backend, table: &str, id: &str, uri: &str) -> anyhow::Result<()> {
    let mut sql = db.sql(format!("UPDATE {table} SET uri = "));
    sql.bind(uri)
        .push(" WHERE xata_id = ")
        .bind(id)
        .push(" AND (uri IS NULL OR uri = ")
        .bind(uri)
        .push(")");
    db.execute(&sql).await?;
    Ok(())
}

/// Links a track to its album and artist, and the album to the artist.
async fn link_catalogue(
    db: &Backend,
    artist_id: &str,
    album_id: &str,
    track_id: &str,
) -> anyhow::Result<()> {
    // The UNIQUE constraints make these idempotent; duplicate junction rows
    // are what fan out into duplicated library results.
    for (table, left_column, left, right_column, right) in [
        ("album_tracks", "album_id", album_id, "track_id", track_id),
        (
            "artist_tracks",
            "artist_id",
            artist_id,
            "track_id",
            track_id,
        ),
        (
            "artist_albums",
            "artist_id",
            artist_id,
            "album_id",
            album_id,
        ),
    ] {
        let mut sql = db.sql(format!(
            "INSERT INTO {table} (xata_id, {left_column}, {right_column}) VALUES ("
        ));
        sql.bind(new_id())
            .push(", ")
            .bind(left)
            .push(", ")
            .bind(right)
            .push(format!(
                ") ON CONFLICT ({left_column}, {right_column}) DO NOTHING"
            ));
        db.execute(&sql).await?;
    }
    Ok(())
}

/// Bumps the per-user play counters, creating the row on first play.
async fn bump_counter(
    db: &Backend,
    table: &str,
    column: &str,
    user_id: &str,
    entity_id: &str,
    uri: &str,
) -> anyhow::Result<()> {
    let mut update = db.sql(format!(
        "UPDATE {table} SET scrobbles = COALESCE(scrobbles, 0) + 1 WHERE user_id = "
    ));
    update
        .push("")
        .bind(user_id)
        .push(format!(" AND {column} = "))
        .bind(entity_id);
    if db.execute(&update).await? > 0 {
        return Ok(());
    }

    let mut insert = db.sql(format!(
        "INSERT INTO {table} (xata_id, user_id, {column}, scrobbles, uri) VALUES ("
    ));
    insert
        .bind(new_id())
        .push(", ")
        .bind(user_id)
        .push(", ")
        .bind(entity_id)
        .push(", ")
        .bind(1i64)
        .push(", ")
        .bind(uri)
        .push(") ON CONFLICT (uri) DO NOTHING");
    db.execute(&insert).await?;
    Ok(())
}

/// Projects a scrobble record. Returns false when it was a duplicate.
async fn ingest_scrobble(
    db: &Backend,
    record: &IncomingRecord,
    song: &SongRecord,
) -> anyhow::Result<bool> {
    let user_id = upsert_user(db, &record.did).await?;
    let artist_id = upsert_artist(db, &song.album_artist, None).await?;
    let album_id = upsert_album(
        db,
        &song.album,
        &song.album_artist,
        song.album_art.clone(),
        song.year,
        song.release_date.clone(),
    )
    .await?;
    let track_id = upsert_track(db, song, None).await?;

    link_catalogue(db, &artist_id, &album_id, &track_id).await?;

    // The composite UNIQUE is the real dedupe key: several sources publish
    // their own URI for the same listen.
    let mut insert = db.sql(
        "INSERT INTO scrobbles (xata_id, album_id, artist_id, track_id, uri, user_id, timestamp) \
         VALUES (",
    );
    insert
        .bind(new_id())
        .push(", ")
        .bind(&album_id)
        .push(", ")
        .bind(&artist_id)
        .push(", ")
        .bind(&track_id)
        .push(", ")
        .bind(record.uri())
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(song.created_at)
        .push(") ON CONFLICT (user_id, track_id, timestamp) DO NOTHING");

    if db.execute(&insert).await? == 0 {
        return Ok(false);
    }

    // Counters only advance for a scrobble that was actually new.
    let uri = record.uri();
    bump_counter(db, "user_artists", "artist_id", &user_id, &artist_id, &uri).await?;
    bump_counter(db, "user_albums", "album_id", &user_id, &album_id, &uri).await?;
    bump_counter(db, "user_tracks", "track_id", &user_id, &track_id, &uri).await?;

    Ok(true)
}

/// Projects an `app.rocksky.like` into `loved_tracks`.
async fn ingest_like(db: &Backend, record: &IncomingRecord) -> anyhow::Result<bool> {
    // The like points at a song record by URI.
    let Some(subject) = string(&record.value, "subject").or_else(|| {
        record
            .value
            .get("subject")
            .and_then(|s| s.get("uri"))
            .and_then(|u| u.as_str())
            .map(str::to_string)
    }) else {
        return Ok(false);
    };

    let mut track = db.sql("SELECT xata_id FROM tracks WHERE uri = ");
    track.bind(&subject).push(" LIMIT 1");
    let Some(track_id) = db.fetch_scalar::<String>(&track).await? else {
        // The song has not been indexed yet; the like is simply skipped rather
        // than inventing a track row from a URI alone.
        return Ok(false);
    };

    let user_id = upsert_user(db, &record.did).await?;

    let mut insert = db.sql("INSERT INTO loved_tracks (xata_id, user_id, track_id, uri) VALUES (");
    insert
        .bind(new_id())
        .push(", ")
        .bind(&user_id)
        .push(", ")
        .bind(&track_id)
        .push(", ")
        .bind(record.uri())
        .push(") ON CONFLICT (uri) DO NOTHING");
    db.execute(&insert).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn scrobble_value() -> serde_json::Value {
        serde_json::json!({
            "$type": SCROBBLE_NSID,
            "title": "Roygbiv",
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 151000,
            "trackNumber": 4,
            "discNumber": 1,
            "year": 1998,
            "genre": "electronic",
            "isrc": "GBAAA0000001",
            "albumArtUrl": "https://example.invalid/cover.jpg",
            "createdAt": "2026-09-15T19:59:13.000Z",
        })
    }

    fn record(collection: &str, rkey: &str, value: serde_json::Value) -> IncomingRecord {
        IncomingRecord {
            did: "did:plc:alice".into(),
            collection: collection.into(),
            rkey: rkey.into(),
            value,
        }
    }

    #[test]
    fn hashes_match_the_reference_implementation() {
        // sha256 of the lowercased "title - artist - album" triple.
        assert_eq!(
            track_hash("Roygbiv", "Boards of Canada", "MHTRTC"),
            sha256_hex("roygbiv - boards of canada - mhtrtc")
        );
        assert_eq!(
            album_hash("MHTRTC", "Boards of Canada"),
            sha256_hex("mhtrtc - boards of canada")
        );
        assert_eq!(
            artist_hash("Boards of Canada"),
            sha256_hex("boards of canada")
        );
        // Case must not change identity, or every source spelling makes a row.
        assert_eq!(
            track_hash("ROYGBIV", "BOARDS OF CANADA", "MHTRTC"),
            track_hash("roygbiv", "boards of canada", "mhtrtc")
        );
    }

    #[tokio::test]
    async fn a_scrobble_creates_the_whole_catalogue() {
        let db = db::connect_in_memory().await.unwrap();
        let stats = ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();

        assert_eq!(stats.scrobbles, 1);
        for (table, expected) in [
            ("users", 1),
            ("artists", 1),
            ("albums", 1),
            ("tracks", 1),
            ("scrobbles", 1),
            ("album_tracks", 1),
            ("artist_tracks", 1),
            ("artist_albums", 1),
            ("user_artists", 1),
            ("user_albums", 1),
            ("user_tracks", 1),
        ] {
            let count = db
                .count(&db.sql(format!("SELECT count(*) FROM {table}")))
                .await
                .unwrap();
            assert_eq!(count, expected, "{table}");
        }
    }

    #[tokio::test]
    async fn the_scrobble_uri_is_the_records_at_uri() {
        let db = db::connect_in_memory().await.unwrap();
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();

        let uri: Option<String> = db
            .fetch_scalar(&db.sql("SELECT uri FROM scrobbles"))
            .await
            .unwrap();
        assert_eq!(
            uri.as_deref(),
            Some("at://did:plc:alice/app.rocksky.scrobble/3aaa")
        );
    }

    /// Re-running a backfill must not multiply rows.
    #[tokio::test]
    async fn ingesting_the_same_record_twice_is_a_no_op() {
        let db = db::connect_in_memory().await.unwrap();
        let incoming = record(SCROBBLE_NSID, "3aaa", scrobble_value());

        let first = ingest(&db, &incoming).await.unwrap();
        let second = ingest(&db, &incoming).await.unwrap();

        assert_eq!(first.scrobbles, 1);
        assert_eq!(second.scrobbles, 0);
        assert_eq!(second.duplicates, 1);

        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM scrobbles"))
                .await
                .unwrap(),
            1
        );
        // And the counter did not advance a second time.
        let plays: Option<i64> = db
            .fetch_scalar(&db.sql("SELECT scrobbles FROM user_tracks"))
            .await
            .unwrap();
        assert_eq!(plays, Some(1));
    }

    /// A different URI for the same listen is still the same listen.
    #[tokio::test]
    async fn the_dedupe_key_is_user_track_and_timestamp_not_the_uri() {
        let db = db::connect_in_memory().await.unwrap();
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();
        let stats = ingest(&db, &record(SCROBBLE_NSID, "3bbb", scrobble_value()))
            .await
            .unwrap();

        assert_eq!(stats.duplicates, 1, "a second URI for the same play");
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM scrobbles"))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn a_second_play_advances_the_counters() {
        let db = db::connect_in_memory().await.unwrap();
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();

        let mut later = scrobble_value();
        later["createdAt"] = serde_json::json!("2026-09-15T20:30:00.000Z");
        ingest(&db, &record(SCROBBLE_NSID, "3bbb", later))
            .await
            .unwrap();

        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM scrobbles"))
                .await
                .unwrap(),
            2
        );
        let plays: Option<i64> = db
            .fetch_scalar(&db.sql("SELECT scrobbles FROM user_tracks"))
            .await
            .unwrap();
        assert_eq!(plays, Some(2));
        // Still one track, one album, one artist.
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks"))
                .await
                .unwrap(),
            1
        );
    }

    /// The ISRC fallback unifies a recording across cosmetic title
    /// differences, and the cost is that it can attach a play to a row for a
    /// *different* album — a single and a compilation share an ISRC.
    ///
    /// This is inherited behaviour, not an accident: `save_track` in
    /// `crates/jetstream/src/repo.rs` has the same fallback, and its ranking
    /// exists to make the choice deterministic rather than to prevent the
    /// crossover. Observed live: backfilling a repository attached a
    /// "vert1go vol. 1 - Single" play to the "Vertigo" row it had already
    /// created from the same ISRC, where the hosted appview had two rows
    /// because its history differed.
    #[tokio::test]
    async fn an_isrc_match_reuses_a_row_from_another_album() {
        let db = db::connect_in_memory().await.unwrap();

        let mut first = scrobble_value();
        first["album"] = serde_json::json!("Vertigo");
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", first))
            .await
            .unwrap();

        // Same ISRC, different album, an hour later so it is not a duplicate.
        let mut second = scrobble_value();
        second["album"] = serde_json::json!("vert1go vol. 1 - Single");
        second["createdAt"] = serde_json::json!("2026-09-15T20:59:13.000Z");
        ingest(&db, &record(SCROBBLE_NSID, "3bbb", second))
            .await
            .unwrap();

        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks"))
                .await
                .unwrap(),
            1,
            "the ISRC match reuses the existing row rather than adding one"
        );
        let album: Option<String> = db
            .fetch_scalar(&db.sql("SELECT album FROM tracks"))
            .await
            .unwrap();
        assert_eq!(
            album.as_deref(),
            Some("Vertigo"),
            "the first album seen wins, so the second play reports that album"
        );
        // Both plays are still recorded; only the track row is shared.
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM scrobbles"))
                .await
                .unwrap(),
            2
        );
        // And the albums themselves are kept apart.
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM albums"))
                .await
                .unwrap(),
            2
        );
    }

    /// An exact content-hash match must beat the ISRC fallback, or a play
    /// whose album *is* known would still be attached to the wrong row.
    #[tokio::test]
    async fn an_exact_hash_match_outranks_the_isrc_fallback() {
        let db = db::connect_in_memory().await.unwrap();

        let mut compilation = scrobble_value();
        compilation["album"] = serde_json::json!("A Compilation");
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", compilation.clone()))
            .await
            .unwrap();

        // The single, which creates its own row because no hash matches.
        let mut single = scrobble_value();
        single["album"] = serde_json::json!("The Single");
        single["isrc"] = serde_json::json!("DIFFERENT00001");
        single["createdAt"] = serde_json::json!("2026-09-15T20:10:00.000Z");
        ingest(&db, &record(SCROBBLE_NSID, "3bbb", single))
            .await
            .unwrap();
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks"))
                .await
                .unwrap(),
            2
        );

        // Now the compilation again: its hash matches exactly, so it must
        // resolve to the compilation row and not to whichever row the ISRC
        // happens to hit.
        compilation["createdAt"] = serde_json::json!("2026-09-15T21:00:00.000Z");
        ingest(&db, &record(SCROBBLE_NSID, "3ccc", compilation))
            .await
            .unwrap();

        let mut sql = db.sql(
            "SELECT t.album FROM scrobbles s JOIN tracks t ON t.xata_id = s.track_id \
             WHERE s.uri = ",
        );
        sql.bind("at://did:plc:alice/app.rocksky.scrobble/3ccc");
        let album: Option<String> = db.fetch_scalar(&sql).await.unwrap();
        assert_eq!(album.as_deref(), Some("A Compilation"));
    }

    #[tokio::test]
    async fn a_record_with_no_album_art_gets_the_placeholder() {
        let db = db::connect_in_memory().await.unwrap();
        let mut value = scrobble_value();
        value.as_object_mut().unwrap().remove("albumArtUrl");

        ingest(&db, &record(SCROBBLE_NSID, "3aaa", value))
            .await
            .unwrap();

        let art: Option<String> = db
            .fetch_scalar(&db.sql("SELECT album_art FROM tracks"))
            .await
            .unwrap();
        assert_eq!(art.as_deref(), Some(PLACEHOLDER_ALBUM_ART));
    }

    #[tokio::test]
    async fn a_record_missing_required_fields_is_skipped_not_fatal() {
        let db = db::connect_in_memory().await.unwrap();
        for value in [
            serde_json::json!({}),
            serde_json::json!({ "title": "x" }),
            // No createdAt.
            serde_json::json!({ "title": "x", "artist": "y", "album": "z" }),
            // Unparseable createdAt.
            serde_json::json!({
                "title": "x", "artist": "y", "album": "z",
                "albumArtist": "y", "createdAt": "not a date"
            }),
        ] {
            let stats = ingest(&db, &record(SCROBBLE_NSID, "3aaa", value))
                .await
                .unwrap();
            assert_eq!(stats.skipped, 1);
        }
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM scrobbles"))
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn an_unknown_collection_is_skipped() {
        let db = db::connect_in_memory().await.unwrap();
        let stats = ingest(
            &db,
            &record(
                "app.bsky.feed.post",
                "3aaa",
                serde_json::json!({ "text": "hi" }),
            ),
        )
        .await
        .unwrap();
        assert_eq!(stats.skipped, 1);
    }

    #[tokio::test]
    async fn a_song_record_fills_in_the_track_uri() {
        let db = db::connect_in_memory().await.unwrap();
        // The scrobble creates the track with no URI of its own.
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();
        let stats = ingest(&db, &record(SONG_NSID, "3song", scrobble_value()))
            .await
            .unwrap();

        assert_eq!(stats.songs, 1);
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks"))
                .await
                .unwrap(),
            1,
            "the song resolves to the same hash, not a new row"
        );
        let uri: Option<String> = db
            .fetch_scalar(&db.sql("SELECT uri FROM tracks"))
            .await
            .unwrap();
        assert_eq!(
            uri.as_deref(),
            Some("at://did:plc:alice/app.rocksky.song/3song")
        );
    }

    #[tokio::test]
    async fn a_like_needs_the_song_to_be_indexed_first() {
        let db = db::connect_in_memory().await.unwrap();
        let like = serde_json::json!({
            "subject": "at://did:plc:alice/app.rocksky.song/3song",
            "createdAt": "2026-09-15T20:00:00.000Z",
        });

        // Nothing to attach to yet.
        let stats = ingest(&db, &record(LIKE_NSID, "3like", like.clone()))
            .await
            .unwrap();
        assert_eq!(stats.likes, 0);
        assert_eq!(stats.skipped, 1);

        // Index the song, then the like lands.
        ingest(&db, &record(SCROBBLE_NSID, "3aaa", scrobble_value()))
            .await
            .unwrap();
        ingest(&db, &record(SONG_NSID, "3song", scrobble_value()))
            .await
            .unwrap();
        let stats = ingest(&db, &record(LIKE_NSID, "3like", like))
            .await
            .unwrap();
        assert_eq!(stats.likes, 1);
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM loved_tracks"))
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn a_user_row_is_created_once_per_did() {
        let db = db::connect_in_memory().await.unwrap();
        let first = upsert_user(&db, "did:plc:alice").await.unwrap();
        let second = upsert_user(&db, "did:plc:alice").await.unwrap();
        assert_eq!(first, second);
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM users"))
                .await
                .unwrap(),
            1
        );
    }

    #[test]
    fn integers_are_read_from_numbers_and_strings() {
        let value = serde_json::json!({ "a": 5, "b": "7", "c": 5.9, "d": "x" });
        assert_eq!(integer(&value, "a"), Some(5));
        assert_eq!(integer(&value, "b"), Some(7));
        assert_eq!(integer(&value, "c"), Some(5));
        assert_eq!(integer(&value, "d"), None);
        assert_eq!(integer(&value, "missing"), None);
    }

    #[test]
    fn blank_strings_read_as_absent() {
        let value = serde_json::json!({ "a": "  ", "b": " x ", "c": null });
        assert_eq!(string(&value, "a"), None);
        assert_eq!(string(&value, "b").as_deref(), Some("x"));
        assert_eq!(string(&value, "c"), None);
    }

    #[test]
    fn stats_merge_and_total() {
        let mut stats = IngestStats::default();
        stats.merge(IngestStats {
            scrobbles: 2,
            duplicates: 1,
            ..Default::default()
        });
        stats.merge(IngestStats {
            albums: 3,
            ..Default::default()
        });
        assert_eq!(stats.scrobbles, 2);
        assert_eq!(stats.albums, 3);
        assert_eq!(stats.duplicates, 1);
        // Duplicates and skips are not "ingested".
        assert_eq!(stats.total(), 5);
    }
}
