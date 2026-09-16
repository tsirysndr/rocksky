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

use crate::db::schema::{
    AlbumTracks, Albums, ArtistAlbums, ArtistTracks, Artists, LovedTracks, Scrobbles, Tracks, Users,
};
use crate::db::{new_id, Backend};
use crate::sea_query::{
    Alias, CaseStatement, Expr, Func, Iden, IntoIden, OnConflict, Order, Query, SelectStatement,
    SimpleExpr,
};

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
pub use rocksky_core::identity::PLACEHOLDER_ALBUM_ART;

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

// The content hashes are the data format, shared with the upload pipeline and
// the record writer, so they live in `rocksky-core`. Re-exported because the
// projection refers to them constantly and every caller already imports them
// from here.
pub use rocksky_core::identity::{album_hash, artist_hash, track_hash};

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
            set_record_uri(db, UriTable::Tracks, &track_id, &record.uri()).await?;
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
            set_record_uri(db, UriTable::Albums, &album_id, &record.uri()).await?;
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
            set_record_uri(db, UriTable::Artists, &artist_id, &record.uri()).await?;
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

/// Finds a row by its unique key, or inserts it and finds it again.
///
/// Four tables need exactly this — users by DID, and artists, albums and
/// tracks by content hash — and the shape is not obvious, so it is written
/// once.
///
/// The re-read after the insert is the point. `ON CONFLICT DO NOTHING` means a
/// concurrent writer may have won the race, in which case this insert affected
/// no rows and the id it generated is not the row's id. Returning that id would
/// hand out a key to a row that does not exist. Two sync sources ingesting the
/// same repository is the ordinary case here, not a rare one.
async fn find_or_create<T>(
    db: &Backend,
    table: T,
    id_column: T,
    unique_column: T,
    unique_value: &str,
    columns: Vec<T>,
    values: Vec<SimpleExpr>,
    describe: impl FnOnce() -> String,
) -> anyhow::Result<String>
where
    T: Iden + IntoIden + Copy + 'static,
{
    let find = || {
        Query::select()
            .column(id_column)
            .from(table)
            .and_where(Expr::col(unique_column).eq(unique_value))
            .limit(1)
            .to_owned()
    };

    if let Some(id) = db.fetch_scalar::<String>(&find()).await? {
        return Ok(id);
    }

    let insert = Query::insert()
        .into_table(table)
        .columns(columns)
        .values_panic(values)
        .on_conflict(OnConflict::column(unique_column).do_nothing().to_owned())
        .to_owned();
    db.execute(&insert).await?;

    db.fetch_scalar::<String>(&find())
        .await?
        .ok_or_else(|| anyhow::anyhow!("could not create {}", describe()))
}

/// The tables whose AT-URI can be backfilled by [`set_record_uri`].
///
/// An enum rather than a table name string: the previous signature took
/// `table: &str`, which a typo turns into a runtime SQL error on a path that
/// only runs when a record of that type arrives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UriTable {
    Tracks,
    Albums,
    Artists,
}

impl UriTable {
    fn table(self) -> Alias {
        Alias::new(match self {
            Self::Tracks => "tracks",
            Self::Albums => "albums",
            Self::Artists => "artists",
        })
    }
}

pub async fn upsert_user(db: &Backend, did: &str) -> anyhow::Result<String> {
    find_or_create(
        db,
        Users::Table,
        Users::XataId,
        Users::Did,
        did,
        vec![Users::XataId, Users::Did, Users::Handle, Users::Avatar],
        vec![
            new_id().into(),
            did.into(),
            // The DID stands in for the handle until one is known.
            did.into(),
            "".into(),
        ],
        || format!("a user row for {did}"),
    )
    .await
}

/// Records the handle for an already-indexed account.
///
/// Only overwrites the placeholder or a stale value, and never takes a handle
/// another row already holds — `handle` is UNIQUE, and a renamed account can
/// briefly collide with the previous owner of the name.
pub async fn set_handle(db: &Backend, did: &str, handle: &str) -> anyhow::Result<bool> {
    let taken = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Handle).eq(handle))
        .and_where(Expr::col(Users::Did).ne(did))
        .limit(1)
        .to_owned();
    if db.fetch_scalar::<String>(&taken).await?.is_some() {
        tracing::warn!(
            did = %did,
            handle = %handle,
            "another account already holds this handle; leaving it unchanged"
        );
        return Ok(false);
    }

    let update = Query::update()
        .table(Users::Table)
        .value(Users::Handle, handle)
        .value(Users::XataUpdatedat, crate::db::now_timestamp())
        .and_where(Expr::col(Users::Did).eq(did))
        // Only when it differs, so the return value means "the handle
        // changed" rather than "a row matched".
        .and_where(Expr::col(Users::Handle).ne(handle))
        .to_owned();
    Ok(db.execute(&update).await? > 0)
}

pub async fn upsert_artist(
    db: &Backend,
    name: &str,
    picture: Option<String>,
) -> anyhow::Result<String> {
    let hash = artist_hash(name);

    find_or_create(
        db,
        Artists::Table,
        Artists::XataId,
        Artists::Sha256,
        &hash,
        vec![
            Artists::XataId,
            Artists::Name,
            Artists::Picture,
            Artists::Sha256,
        ],
        vec![
            new_id().into(),
            name.into(),
            picture.into(),
            hash.clone().into(),
        ],
        || format!("an artist row for {name}"),
    )
    .await
}

pub async fn upsert_album(
    db: &Backend,
    title: &str,
    album_artist: &str,
    album_art: Option<String>,
    year: Option<i64>,
    release_date: Option<String>,
) -> anyhow::Result<String> {
    let hash = album_hash(title, album_artist);

    find_or_create(
        db,
        Albums::Table,
        Albums::XataId,
        Albums::Sha256,
        &hash,
        vec![
            Albums::XataId,
            Albums::Title,
            Albums::Artist,
            Albums::AlbumArt,
            Albums::Year,
            Albums::ReleaseDate,
            Albums::Sha256,
        ],
        vec![
            new_id().into(),
            title.into(),
            album_artist.into(),
            album_art.into(),
            year.into(),
            release_date.into(),
            hash.clone().into(),
        ],
        || format!("an album row for {title}"),
    )
    .await
}

/// Finds or creates the `tracks` row for a record.
///
/// The lookup ranks the content hash above MBID above ISRC: the same ISRC can
/// belong to several rows (a single and a compilation), so an unranked `OR`
/// would pick a non-deterministic row and silently cross albums.
pub async fn upsert_track(
    db: &Backend,
    song: &SongRecord,
    uri: Option<&str>,
) -> anyhow::Result<String> {
    let hash = track_hash(&song.title, &song.artist, &song.album);

    let lookup = track_lookup(&hash, song.mb_id.as_deref(), song.isrc.as_deref());
    if let Some(id) = db.fetch_scalar::<String>(&lookup).await? {
        return Ok(id);
    }

    // The columns and the values are two lists that have to line up; keeping
    // them adjacent is the only protection against them drifting apart, which
    // in the string form silently shifted every field after the mistake.
    find_or_create(
        db,
        Tracks::Table,
        Tracks::XataId,
        Tracks::Sha256,
        &hash,
        vec![
            Tracks::XataId,
            Tracks::Title,
            Tracks::Artist,
            Tracks::Album,
            Tracks::AlbumArt,
            Tracks::AlbumArtist,
            Tracks::TrackNumber,
            Tracks::Duration,
            Tracks::MbId,
            Tracks::Isrc,
            Tracks::Composer,
            Tracks::Lyrics,
            Tracks::DiscNumber,
            Tracks::Sha256,
            Tracks::CopyrightMessage,
            Tracks::Uri,
            Tracks::SpotifyLink,
            Tracks::AppleMusicLink,
            Tracks::TidalLink,
            Tracks::YoutubeLink,
            Tracks::Label,
            Tracks::Genre,
        ],
        vec![
            new_id().into(),
            song.title.clone().into(),
            song.artist.clone().into(),
            song.album.clone().into(),
            song.album_art.clone().into(),
            song.album_artist.clone().into(),
            song.track_number.into(),
            song.duration.into(),
            song.mb_id.clone().into(),
            song.isrc.clone().into(),
            song.composer.clone().into(),
            song.lyrics.clone().into(),
            song.disc_number.into(),
            hash.clone().into(),
            song.copyright_message.clone().into(),
            uri.map(str::to_string).into(),
            song.spotify_link.clone().into(),
            song.apple_music_link.clone().into(),
            song.tidal_link.clone().into(),
            song.youtube_link.clone().into(),
            song.label.clone().into(),
            song.genre.clone().into(),
        ],
        || format!("a track row for {}", song.title),
    )
    .await
}

/// The ranked track lookup: content hash, then MBID, then ISRC.
///
/// Extracted so the ranking can be tested without a database. The `CASE` in the
/// `ORDER BY` is what makes it a ranking rather than an unordered `OR`: the same
/// ISRC can belong to several rows — a recording released as a single and again
/// on a compilation — so without it the answer is whichever row the planner
/// happens to reach first, and a scrobble silently lands on the wrong album.
fn track_lookup(hash: &str, mb_id: Option<&str>, isrc: Option<&str>) -> SelectStatement {
    let mut matches = Expr::col(Tracks::Sha256).eq(hash);
    if let Some(mb_id) = mb_id {
        matches = matches.or(Expr::col(Tracks::MbId)
            .is_not_null()
            .and(Expr::col(Tracks::MbId).eq(mb_id)));
    }
    if let Some(isrc) = isrc {
        matches = matches.or(Expr::col(Tracks::Isrc)
            .is_not_null()
            .and(Expr::col(Tracks::Isrc).eq(isrc)));
    }

    let mut rank = CaseStatement::new().case(Expr::col(Tracks::Sha256).eq(hash), 0);
    if let Some(mb_id) = mb_id {
        rank = rank.case(Expr::col(Tracks::MbId).eq(mb_id), 1);
    }
    if let Some(isrc) = isrc {
        rank = rank.case(Expr::col(Tracks::Isrc).eq(isrc), 2);
    }
    let rank = rank.finally(3);

    Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(matches)
        .order_by_expr(rank.into(), Order::Asc)
        .limit(1)
        .to_owned()
}

/// Fills in a row's AT-URI without clobbering one already there.
pub async fn set_record_uri(
    db: &Backend,
    table: UriTable,
    id: &str,
    uri: &str,
) -> anyhow::Result<()> {
    // Three tables share the column names, so one statement serves all of
    // them with only the table varying.
    let update = Query::update()
        .table(table.table())
        .value(Alias::new("uri"), uri)
        .and_where(Expr::col(Alias::new("xata_id")).eq(id))
        // Never clobbers a URI already there: a row can be reached by more
        // than one record, and the first one to name it wins.
        .and_where(
            Expr::col(Alias::new("uri"))
                .is_null()
                .or(Expr::col(Alias::new("uri")).eq(uri)),
        )
        .to_owned();
    db.execute(&update).await?;
    Ok(())
}

/// Links a track to its album and artist, and the album to the artist.
pub async fn link_catalogue(
    db: &Backend,
    artist_id: &str,
    album_id: &str,
    track_id: &str,
) -> anyhow::Result<()> {
    // The UNIQUE constraints make these idempotent; duplicate junction rows
    // are what fan out into duplicated library results.
    //
    // Written out three times rather than looped: each table's columns are a
    // different Rust type, which is the point — the loop it replaces passed
    // table and column names as strings, and nothing checked that
    // `artist_albums` really has an `album_id`.
    let album_track = Query::insert()
        .into_table(AlbumTracks::Table)
        .columns([
            AlbumTracks::XataId,
            AlbumTracks::AlbumId,
            AlbumTracks::TrackId,
        ])
        .values_panic([new_id().into(), album_id.into(), track_id.into()])
        .on_conflict(
            OnConflict::columns([AlbumTracks::AlbumId, AlbumTracks::TrackId])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&album_track).await?;

    let artist_track = Query::insert()
        .into_table(ArtistTracks::Table)
        .columns([
            ArtistTracks::XataId,
            ArtistTracks::ArtistId,
            ArtistTracks::TrackId,
        ])
        .values_panic([new_id().into(), artist_id.into(), track_id.into()])
        .on_conflict(
            OnConflict::columns([ArtistTracks::ArtistId, ArtistTracks::TrackId])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&artist_track).await?;

    let artist_album = Query::insert()
        .into_table(ArtistAlbums::Table)
        .columns([
            ArtistAlbums::XataId,
            ArtistAlbums::ArtistId,
            ArtistAlbums::AlbumId,
        ])
        .values_panic([new_id().into(), artist_id.into(), album_id.into()])
        .on_conflict(
            OnConflict::columns([ArtistAlbums::ArtistId, ArtistAlbums::AlbumId])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&artist_album).await?;

    Ok(())
}

/// Which per-user counter to bump.
///
/// The three tables have identical shapes and differ only in which entity they
/// point at, which is why the previous version passed the table and column as
/// strings. As an enum the pairing cannot be got wrong — `user_albums` with
/// `track_id` no longer type-checks.
#[derive(Debug, Clone, Copy)]
enum Counter {
    Artists,
    Albums,
    Tracks,
}

impl Counter {
    fn table(self) -> Alias {
        Alias::new(match self {
            Self::Artists => "user_artists",
            Self::Albums => "user_albums",
            Self::Tracks => "user_tracks",
        })
    }

    fn entity_column(self) -> Alias {
        Alias::new(match self {
            Self::Artists => "artist_id",
            Self::Albums => "album_id",
            Self::Tracks => "track_id",
        })
    }
}

/// Bumps the per-user play counter, creating the row on first play.
///
/// Update-then-insert rather than upsert-with-increment: the unique key is
/// `uri`, not `(user_id, entity_id)`, so `ON CONFLICT (uri) DO UPDATE` would
/// not fire for a second play that arrived under a different record URI — and
/// several sources publish their own URI for the same listen.
async fn bump_counter(
    db: &Backend,
    counter: Counter,
    user_id: &str,
    entity_id: &str,
    uri: &str,
) -> anyhow::Result<()> {
    let scrobbles = Alias::new("scrobbles");
    let update = Query::update()
        .table(counter.table())
        .value(
            scrobbles,
            // COALESCE, because the column is nullable and NULL + 1 is NULL —
            // a row created without a count would stay uncounted forever.
            Expr::expr(Func::coalesce([
                Expr::col(Alias::new("scrobbles")).into(),
                Expr::val(0).into(),
            ]))
            .add(1),
        )
        .and_where(Expr::col(Alias::new("user_id")).eq(user_id))
        .and_where(Expr::col(counter.entity_column()).eq(entity_id))
        .to_owned();
    if db.execute(&update).await? > 0 {
        return Ok(());
    }

    let insert = Query::insert()
        .into_table(counter.table())
        .columns([
            Alias::new("xata_id"),
            Alias::new("user_id"),
            counter.entity_column(),
            Alias::new("scrobbles"),
            Alias::new("uri"),
        ])
        .values_panic([
            new_id().into(),
            user_id.into(),
            entity_id.into(),
            1i64.into(),
            uri.into(),
        ])
        .on_conflict(
            OnConflict::column(Alias::new("uri"))
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&insert).await?;
    Ok(())
}

/// Creates the artist, album and track rows for a song and links them.
///
/// Returns the track's row id. This is the half of [`ingest_scrobble`] that is
/// about the catalogue rather than the play, so an upload — which is not a
/// play — can reuse it.
pub async fn upsert_catalogue(db: &Backend, song: &SongRecord) -> anyhow::Result<String> {
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
    Ok(track_id)
}

/// The AT-URI already recorded for an album, if any.
pub async fn album_uri(db: &Backend, song: &SongRecord) -> anyhow::Result<Option<String>> {
    let hash = album_hash(&song.album, &song.album_artist);
    let query = Query::select()
        .column(Albums::Uri)
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Sha256).eq(&hash))
        .limit(1)
        .to_owned();
    Ok(db
        .fetch_scalar::<String>(&query)
        .await?
        .filter(|uri| !uri.is_empty()))
}

/// The AT-URI already recorded for an artist, if any.
pub async fn artist_uri(db: &Backend, name: &str) -> anyhow::Result<Option<String>> {
    let hash = artist_hash(name);
    let query = Query::select()
        .column(Artists::Uri)
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Sha256).eq(&hash))
        .limit(1)
        .to_owned();
    Ok(db
        .fetch_scalar::<String>(&query)
        .await?
        .filter(|uri| !uri.is_empty()))
}

/// Fills in an album's AT-URI, found by its content hash.
pub async fn set_album_uri(db: &Backend, song: &SongRecord, uri: &str) -> anyhow::Result<()> {
    let hash = album_hash(&song.album, &song.album_artist);
    let lookup = Query::select()
        .column(Albums::XataId)
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Sha256).eq(&hash))
        .limit(1)
        .to_owned();
    if let Some(id) = db.fetch_scalar::<String>(&lookup).await? {
        set_record_uri(db, UriTable::Albums, &id, uri).await?;
    }
    Ok(())
}

/// Fills in an artist's AT-URI, found by name hash.
pub async fn set_artist_uri(db: &Backend, name: &str, uri: &str) -> anyhow::Result<()> {
    let hash = artist_hash(name);
    let lookup = Query::select()
        .column(Artists::XataId)
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Sha256).eq(&hash))
        .limit(1)
        .to_owned();
    if let Some(id) = db.fetch_scalar::<String>(&lookup).await? {
        set_record_uri(db, UriTable::Artists, &id, uri).await?;
    }
    Ok(())
}

/// Records a track's key and BPM, filling only what is still missing.
///
/// A track is shared across users and sources, so an answer someone else's
/// upload already produced is not overwritten by a second one.
pub async fn set_track_analysis(
    db: &Backend,
    track_id: &str,
    key: Option<&str>,
    bpm: Option<f64>,
) -> anyhow::Result<()> {
    if key.is_none() && bpm.is_none() {
        return Ok(());
    }

    // COALESCE keeps whatever is already there: a track is shared across
    // users and sources, so a second upload's analysis must not overwrite the
    // first one's answer.
    let update = Query::update()
        .table(Tracks::Table)
        .value(
            Tracks::Key,
            Func::coalesce([
                Expr::col(Tracks::Key).into(),
                Expr::val(key.map(str::to_string)).into(),
            ]),
        )
        .value(
            Tracks::Bpm,
            Func::coalesce([Expr::col(Tracks::Bpm).into(), Expr::val(bpm).into()]),
        )
        .and_where(Expr::col(Tracks::XataId).eq(track_id))
        .to_owned();
    db.execute(&update).await?;
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
    let insert = Query::insert()
        .into_table(Scrobbles::Table)
        .columns([
            Scrobbles::XataId,
            Scrobbles::AlbumId,
            Scrobbles::ArtistId,
            Scrobbles::TrackId,
            Scrobbles::Uri,
            Scrobbles::UserId,
            Scrobbles::Timestamp,
        ])
        .values_panic([
            new_id().into(),
            album_id.clone().into(),
            artist_id.clone().into(),
            track_id.clone().into(),
            record.uri().into(),
            user_id.clone().into(),
            // As text, not a native timestamp: SQLite stores these in a TEXT
            // column and compares them lexicographically.
            crate::db::format_timestamp(song.created_at).into(),
        ])
        .on_conflict(
            OnConflict::columns([Scrobbles::UserId, Scrobbles::TrackId, Scrobbles::Timestamp])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();

    if db.execute(&insert).await? == 0 {
        return Ok(false);
    }

    // Counters only advance for a scrobble that was actually new.
    let uri = record.uri();
    bump_counter(db, Counter::Artists, &user_id, &artist_id, &uri).await?;
    bump_counter(db, Counter::Albums, &user_id, &album_id, &uri).await?;
    bump_counter(db, Counter::Tracks, &user_id, &track_id, &uri).await?;

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

    let track = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(&subject))
        .limit(1)
        .to_owned();
    let Some(track_id) = db.fetch_scalar::<String>(&track).await? else {
        // The song has not been indexed yet; the like is simply skipped rather
        // than inventing a track row from a URI alone.
        return Ok(false);
    };

    let user_id = upsert_user(db, &record.did).await?;

    let insert = Query::insert()
        .into_table(LovedTracks::Table)
        .columns([
            LovedTracks::XataId,
            LovedTracks::UserId,
            LovedTracks::TrackId,
            LovedTracks::Uri,
        ])
        .values_panic([
            new_id().into(),
            user_id.into(),
            track_id.into(),
            record.uri().into(),
        ])
        .on_conflict(OnConflict::column(LovedTracks::Uri).do_nothing().to_owned())
        .to_owned();
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

    /// The projection must use the shared hashes, not its own copy.
    ///
    /// `rocksky-core` owns and tests the hashes themselves against
    /// independently computed digests. What matters here is that this module's
    /// re-exports really are those functions — a local reimplementation that
    /// drifted would split every row in two.
    #[test]
    fn the_projection_uses_the_shared_identity_hashes() {
        assert_eq!(
            track_hash("Roygbiv", "Boards of Canada", "MHTRTC"),
            rocksky_core::identity::track_hash("Roygbiv", "Boards of Canada", "MHTRTC")
        );
        assert_eq!(
            album_hash("MHTRTC", "Boards of Canada"),
            rocksky_core::identity::album_hash("MHTRTC", "Boards of Canada")
        );
        assert_eq!(
            artist_hash("Boards of Canada"),
            rocksky_core::identity::artist_hash("Boards of Canada")
        );
        assert_eq!(PLACEHOLDER_ALBUM_ART, rocksky_core::PLACEHOLDER_ALBUM_ART);
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
