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
    AlbumTracks, Albums, ArtistAlbums, ArtistTracks, Artists, Follows, LovedTracks, PlaylistTracks,
    Playlists, Scrobbles, Shouts, Tracks, UserPlaylists, Users,
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
pub const SHOUT_NSID: &str = "app.rocksky.shout";
pub const FOLLOW_NSID: &str = "app.rocksky.graph.follow";
pub const PLAYLIST_NSID: &str = "app.rocksky.playlist";
pub const PLAYLIST_SONG_NSID: &str = "app.rocksky.playlist.song";

/// Every collection this projection understands.
pub const SUPPORTED_COLLECTIONS: &[&str] = &[
    SCROBBLE_NSID,
    SONG_NSID,
    ALBUM_NSID,
    ARTIST_NSID,
    LIKE_NSID,
    SHOUT_NSID,
    FOLLOW_NSID,
    PLAYLIST_NSID,
    PLAYLIST_SONG_NSID,
];

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
    pub shouts: u64,
    pub follows: u64,
    pub playlists: u64,
    /// Entries, i.e. `app.rocksky.playlist.song` records.
    pub playlist_songs: u64,
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
        self.shouts += other.shouts;
        self.follows += other.follows;
        self.playlists += other.playlists;
        self.playlist_songs += other.playlist_songs;
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
        // `createdAt` on a scrobble, a song, an album; `addedAt` on an
        // `app.rocksky.playlist.song`, whose lexicon has no `createdAt` at
        // all. Reading only the first meant every real playlist entry parsed
        // as `None` and was silently dropped.
        let created_at = string(value, "createdAt")
            .or_else(|| string(value, "addedAt"))
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
            // The full catalogue, not just the track: a song record names its
            // album and its artist, and creating only the track leaves a row
            // with no album, no artist and no junction rows — invisible to
            // every listing that reaches a track through one of them.
            //
            // Identical to what a scrobble builds, and keyed on the same
            // content hashes, so whichever record arrives first wins and the
            // second finds the rows already there.
            let track_id = upsert_catalogue(db, &song).await?;

            // A song record is the canonical URI for the track it names.
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

            // An album record names its artist, so the row and the link are
            // created here too — otherwise an album known only from its own
            // record has no artist and never appears on that artist's page.
            let artist_id = upsert_artist(db, &artist, None).await?;
            link_artist_album(db, &artist_id, &album_id).await?;

            // `tracks.album_uri` is a denormalised copy, and it is what every
            // view reads — setting only `albums.uri` leaves the copy null, so
            // the feed answers a null URI for a record it has.
            denormalise_album_uri(db, &album_id).await?;
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
            denormalise_artist_uri(db, &artist_id).await?;
            stats.artists += 1;
        }
        LIKE_NSID => {
            if ingest_like(db, record).await? {
                stats.likes += 1;
            } else {
                stats.skipped += 1;
            }
        }
        SHOUT_NSID => {
            if ingest_shout(db, record).await? {
                stats.shouts += 1;
            } else {
                stats.skipped += 1;
            }
        }
        FOLLOW_NSID => {
            if ingest_follow(db, record).await? {
                stats.follows += 1;
            } else {
                stats.skipped += 1;
            }
        }
        PLAYLIST_NSID => {
            if ingest_playlist(db, record).await? {
                stats.playlists += 1;
            } else {
                stats.skipped += 1;
            }
        }
        PLAYLIST_SONG_NSID => {
            if ingest_playlist_song(db, record).await? {
                stats.playlist_songs += 1;
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

    let id = find_or_create(
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
            album_art.clone().into(),
            year.into(),
            release_date.into(),
            hash.clone().into(),
        ],
        || format!("an album row for {title}"),
    )
    .await?;

    // An album row is created by whichever record happened to arrive first,
    // and `find_or_create` writes only on create — so an album first seen
    // through a record carrying no cover (or the placeholder) would keep that
    // gap forever, even though the next record for the same album has real
    // art. Filling it here is what keeps the album pages populated as the
    // firehose runs.
    fill_album_art(db, &hash, album_art.as_deref()).await?;

    Ok(id)
}

/// Whether a stored `album_art` value is actually art.
///
/// Three values mean "none": NULL, the empty string, and the Last.fm
/// placeholder — which is a real URL serving a grey record sleeve, written by
/// [`SongRecord::from_value`] when a record has no cover at all. Anything
/// rendering it shows the same nothing as an empty column, so every reader
/// that asks "does this album have art" has to treat all three alike.
/// `art` is the column to test. Pass it qualified — `(Albums::Table,
/// Albums::AlbumArt)` — in a statement that joins `tracks`, which has an
/// `album_art` of its own and would otherwise make the reference ambiguous.
pub fn album_art_is_missing(
    art: impl crate::sea_query::IntoColumnRef + Clone,
) -> crate::sea_query::Cond {
    crate::sea_query::Cond::any()
        .add(Expr::col(art.clone()).is_null())
        .add(Expr::col(art.clone()).eq(""))
        .add(Expr::col(art).eq(PLACEHOLDER_ALBUM_ART))
}

/// Whether a value from a record or an API is usable as album art.
pub fn usable_album_art(art: Option<&str>) -> Option<&str> {
    art.map(str::trim)
        .filter(|art| !art.is_empty() && *art != PLACEHOLDER_ALBUM_ART)
}

/// Writes album art onto the album with this hash, if it has none.
///
/// Guarded in the `WHERE` rather than by reading first: the condition and the
/// write are then one statement, so two records for the same album arriving
/// together cannot both decide the column is empty. Real art already stored
/// is never replaced — it came from a record that named this album directly.
///
/// Returns whether a row was written.
pub async fn fill_album_art(db: &Backend, hash: &str, art: Option<&str>) -> anyhow::Result<bool> {
    let Some(art) = usable_album_art(art) else {
        return Ok(false);
    };

    let update = Query::update()
        .table(Albums::Table)
        .value(Albums::AlbumArt, art)
        .value(Albums::XataUpdatedat, crate::db::now_timestamp())
        .and_where(Expr::col(Albums::Sha256).eq(hash))
        .cond_where(album_art_is_missing(Albums::AlbumArt))
        .to_owned();

    Ok(db.execute(&update).await? > 0)
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

    link_artist_album(db, artist_id, album_id).await?;

    Ok(())
}

/// Links an album to its artist.
///
/// Separate from [`link_catalogue`] because an `app.rocksky.album` record
/// establishes this relation without naming a track.
pub async fn link_artist_album(
    db: &Backend,
    artist_id: &str,
    album_id: &str,
) -> anyhow::Result<()> {
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

/// Copies an album's URI onto every track linked to it.
///
/// `tracks.album_uri` duplicates `albums.uri`, and the views read the copy.
/// The copy is written by the local write paths but was never written by the
/// firehose path, so an instance fed only by Tap answered a null `albumUri`
/// for every scrobble — which is both wrong and, for a client that splits the
/// URI, fatal.
///
/// Only fills nulls: a track already carrying a URI has one from a record that
/// named it directly, which is at least as authoritative as this.
pub async fn denormalise_album_uri(db: &Backend, album_id: &str) -> anyhow::Result<u64> {
    let uri = Query::select()
        .column(Albums::Uri)
        .from(Albums::Table)
        .and_where(Expr::col(Albums::XataId).eq(album_id))
        .limit(1)
        .to_owned();

    let Some(uri) = db
        .fetch_scalar::<String>(&uri)
        .await?
        .filter(|u| !u.is_empty())
    else {
        return Ok(0);
    };

    let tracks_on_album = Query::select()
        .column(AlbumTracks::TrackId)
        .from(AlbumTracks::Table)
        .and_where(Expr::col(AlbumTracks::AlbumId).eq(album_id))
        .to_owned();

    let update = Query::update()
        .table(Tracks::Table)
        .value(Tracks::AlbumUri, uri)
        .and_where(Expr::col(Tracks::AlbumUri).is_null())
        .and_where(Expr::col(Tracks::XataId).in_subquery(tracks_on_album))
        .to_owned();

    Ok(db.execute(&update).await?)
}

/// The same, for an artist.
pub async fn denormalise_artist_uri(db: &Backend, artist_id: &str) -> anyhow::Result<u64> {
    let uri = Query::select()
        .column(Artists::Uri)
        .from(Artists::Table)
        .and_where(Expr::col(Artists::XataId).eq(artist_id))
        .limit(1)
        .to_owned();

    let Some(uri) = db
        .fetch_scalar::<String>(&uri)
        .await?
        .filter(|u| !u.is_empty())
    else {
        return Ok(0);
    };

    let tracks_by_artist = Query::select()
        .column(ArtistTracks::TrackId)
        .from(ArtistTracks::Table)
        .and_where(Expr::col(ArtistTracks::ArtistId).eq(artist_id))
        .to_owned();

    let update = Query::update()
        .table(Tracks::Table)
        .value(Tracks::ArtistUri, uri)
        .and_where(Expr::col(Tracks::ArtistUri).is_null())
        .and_where(Expr::col(Tracks::XataId).in_subquery(tracks_by_artist))
        .to_owned();

    Ok(db.execute(&update).await?)
}

/// Fills every `tracks.album_uri` and `tracks.artist_uri` that a known album
/// or artist row could have supplied.
///
/// The repair for data ingested before the two functions above existed. Runs
/// at startup and is idempotent — it only touches rows that are still null, so
/// on a repaired database it updates nothing.
///
/// Two statements rather than per-row work: this runs over the whole catalogue
/// and a query per track would be hundreds of thousands of round trips.
pub async fn repair_denormalised_uris(db: &Backend) -> anyhow::Result<(u64, u64)> {
    // The junction row is what links a track to the album, so the URI comes
    // through it rather than through the track's own (null) copy.
    let album_uri = Query::select()
        .column((Albums::Table, Albums::Uri))
        .from(AlbumTracks::Table)
        .inner_join(
            Albums::Table,
            Expr::col((Albums::Table, Albums::XataId))
                .equals((AlbumTracks::Table, AlbumTracks::AlbumId)),
        )
        .and_where(
            Expr::col((AlbumTracks::Table, AlbumTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Albums::Table, Albums::Uri)).is_not_null())
        .limit(1)
        .to_owned();

    let albums = db
        .execute(
            &Query::update()
                .table(Tracks::Table)
                .value(
                    Tracks::AlbumUri,
                    SimpleExpr::SubQuery(
                        None,
                        Box::new(album_uri.clone().into_sub_query_statement()),
                    ),
                )
                .and_where(Expr::col(Tracks::AlbumUri).is_null())
                .and_where(Expr::exists(album_uri))
                .to_owned(),
        )
        .await?;

    let artist_uri = Query::select()
        .column((Artists::Table, Artists::Uri))
        .from(ArtistTracks::Table)
        .inner_join(
            Artists::Table,
            Expr::col((Artists::Table, Artists::XataId))
                .equals((ArtistTracks::Table, ArtistTracks::ArtistId)),
        )
        .and_where(
            Expr::col((ArtistTracks::Table, ArtistTracks::TrackId))
                .equals((Tracks::Table, Tracks::XataId)),
        )
        .and_where(Expr::col((Artists::Table, Artists::Uri)).is_not_null())
        .limit(1)
        .to_owned();

    let artists = db
        .execute(
            &Query::update()
                .table(Tracks::Table)
                .value(
                    Tracks::ArtistUri,
                    SimpleExpr::SubQuery(
                        None,
                        Box::new(artist_uri.clone().into_sub_query_statement()),
                    ),
                )
                .and_where(Expr::col(Tracks::ArtistUri).is_null())
                .and_where(Expr::exists(artist_uri))
                .to_owned(),
        )
        .await?;

    Ok((albums, artists))
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

/// Projects an `app.rocksky.shout` record into `shouts`.
///
/// A shout is a comment, and what it is a comment *on* is `subject`, a
/// strongRef whose collection says which table to resolve it against:
///
/// | `subject.uri` collection  | column        |
/// |---------------------------|---------------|
/// | `app.rocksky.song`        | `track_id`    |
/// | `app.rocksky.album`       | `album_id`    |
/// | `app.rocksky.artist`      | `artist_id`   |
/// | `app.rocksky.scrobble`    | `scrobble_id` |
/// | `app.bsky.actor.profile`  | — see below   |
///
/// # Profile shouts cannot be placed, and that is upstream
///
/// A shout on someone's profile records the subject as
/// `at://<did>/app.bsky.actor.profile/self` — where `<did>` is **the author's
/// own**, because `shouts.service.ts` fetches the ref with
/// `repo: agent.assertDid` regardless of whose profile is being shouted on.
/// Checked against the live network: every profile shout in the wild, including
/// ones the hosted API lists on *other people's* profiles, names its author's
/// own profile record.
///
/// So which profile was shouted on is simply not in the record, and this
/// cannot reconstruct the `profile_shouts` link. Guessing the author's own
/// profile would be worse than omitting it: it would move other people's
/// shouts onto the author's profile. The row is still written, so replies and
/// likes that reference it resolve, and it is counted as a shout.
///
/// Returns `false` for a record that is not a shout at all.
async fn ingest_shout(db: &Backend, record: &IncomingRecord) -> anyhow::Result<bool> {
    let Some(subject) = strong_ref_uri(&record.value, "subject") else {
        return Ok(false);
    };

    // `message` is optional in the lexicon — a shout may be only a GIF — but
    // `shouts.content` is NOT NULL, which is how the TypeScript writes it too
    // (`content: shout.message ?? ""`).
    let content = string(&record.value, "message").unwrap_or_default();
    let author_id = upsert_user(db, &record.did).await?;

    // The subject is resolved by looking the URI up in the table its
    // collection names. A miss means the subject has not been indexed here
    // yet — the shout is still stored, unattached, rather than dropped: it is
    // a real record, and the alternative is losing it permanently because two
    // records arrived in an unlucky order.
    let (column, subject_id) = match subject_table(&subject) {
        Some(table) => (
            Some(table.column()),
            lookup_by_uri(db, table, &subject).await?,
        ),
        None => (None, None),
    };

    let gif = record.value.get("gif");
    let mut columns = vec![
        Shouts::XataId,
        Shouts::Content,
        Shouts::Uri,
        Shouts::AuthorId,
        Shouts::GifUrl,
        Shouts::GifPreviewUrl,
        Shouts::GifAlt,
        Shouts::GifWidth,
        Shouts::GifHeight,
        Shouts::Facets,
    ];
    let mut values: Vec<crate::sea_query::SimpleExpr> = vec![
        new_id().into(),
        content.into(),
        record.uri().into(),
        author_id.into(),
        gif.and_then(|g| string(g, "url")).into(),
        gif.and_then(|g| string(g, "previewUrl")).into(),
        gif.and_then(|g| string(g, "alt")).into(),
        gif.and_then(|g| integer(g, "width")).into(),
        gif.and_then(|g| integer(g, "height")).into(),
        // Stored as JSON text, matching the Postgres `jsonb` column.
        record
            .value
            .get("facets")
            .filter(|facets| facets.as_array().is_some_and(|f| !f.is_empty()))
            .map(|facets| facets.to_string())
            .into(),
    ];

    // A reply names the shout it answers. Resolved against `shouts.uri`, so a
    // reply that arrives before its parent is stored without the link rather
    // than dropped — and attached by a later pass.
    let parent_id = match strong_ref_uri(&record.value, "parent") {
        Some(parent) => lookup_by_uri(db, SubjectTable::Shout, &parent).await?,
        None => None,
    };
    if let Some(parent_id) = &parent_id {
        columns.push(Shouts::ParentId);
        values.push(parent_id.clone().into());
    }

    let attachment = match (column, subject_id) {
        (Some(column), Some(subject_id)) => {
            columns.push(column);
            values.push(subject_id.clone().into());
            Some((column, subject_id))
        }
        _ => None,
    };

    let insert = Query::insert()
        .into_table(Shouts::Table)
        .columns(columns)
        .values_panic(values)
        // Keyed on the record URI, so re-reading a repository does not
        // duplicate every comment in it.
        .on_conflict(OnConflict::column(Shouts::Uri).do_nothing().to_owned())
        .to_owned();
    db.execute(&insert).await?;

    // The row may already have existed from a pass where the subject was not
    // yet indexed, in which case the insert above did nothing — so the links
    // are filled separately, guarded on still being empty. This is what makes
    // a second pass able to attach a comment that arrived early, and it is
    // why re-ingesting a shout is worth doing rather than being a no-op.
    if let Some((column, subject_id)) = attachment {
        fill_shout_link(db, &record.uri(), column, &subject_id).await?;
    }
    if let Some(parent_id) = &parent_id {
        fill_shout_link(db, &record.uri(), Shouts::ParentId, parent_id).await?;
    }

    Ok(true)
}

/// Points a stored shout at its subject or parent, if it is not pointed yet.
///
/// Guarded on the column being NULL rather than read-then-write, so two
/// passes over the same repository cannot fight over it, and an attachment
/// already made is never moved.
async fn fill_shout_link(
    db: &Backend,
    uri: &str,
    column: Shouts,
    id: &str,
) -> Result<(), sqlx::Error> {
    let update = Query::update()
        .table(Shouts::Table)
        .value(column, id)
        .and_where(Expr::col(Shouts::Uri).eq(uri))
        .and_where(Expr::col(column).is_null())
        .to_owned();
    db.execute(&update).await?;
    Ok(())
}

/// The tables a shout's subject or parent can point at.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum SubjectTable {
    Track,
    Album,
    Artist,
    Scrobble,
    Shout,
}

impl SubjectTable {
    /// The `shouts` column this subject fills.
    fn column(self) -> Shouts {
        match self {
            SubjectTable::Track => Shouts::TrackId,
            SubjectTable::Album => Shouts::AlbumId,
            SubjectTable::Artist => Shouts::ArtistId,
            SubjectTable::Scrobble => Shouts::ScrobbleId,
            SubjectTable::Shout => Shouts::ParentId,
        }
    }
}

/// Which table an AT-URI's collection names.
fn subject_table(uri: &str) -> Option<SubjectTable> {
    // `at://<did>/<collection>/<rkey>` — the collection is the third segment,
    // matched exactly rather than with `contains`, so a handle or rkey that
    // happens to contain a collection name cannot be mistaken for one.
    let collection = uri.strip_prefix("at://")?.split('/').nth(1)?;
    match collection {
        SONG_NSID => Some(SubjectTable::Track),
        ALBUM_NSID => Some(SubjectTable::Album),
        ARTIST_NSID => Some(SubjectTable::Artist),
        SCROBBLE_NSID => Some(SubjectTable::Scrobble),
        SHOUT_NSID => Some(SubjectTable::Shout),
        // Including `app.bsky.actor.profile` — see [`ingest_shout`].
        _ => None,
    }
}

async fn lookup_by_uri(
    db: &Backend,
    table: SubjectTable,
    uri: &str,
) -> Result<Option<String>, sqlx::Error> {
    let query = match table {
        SubjectTable::Track => Query::select()
            .column(Tracks::XataId)
            .from(Tracks::Table)
            .and_where(Expr::col(Tracks::Uri).eq(uri))
            .limit(1)
            .to_owned(),
        SubjectTable::Album => Query::select()
            .column(Albums::XataId)
            .from(Albums::Table)
            .and_where(Expr::col(Albums::Uri).eq(uri))
            .limit(1)
            .to_owned(),
        SubjectTable::Artist => Query::select()
            .column(Artists::XataId)
            .from(Artists::Table)
            .and_where(Expr::col(Artists::Uri).eq(uri))
            .limit(1)
            .to_owned(),
        SubjectTable::Scrobble => Query::select()
            .column(Scrobbles::XataId)
            .from(Scrobbles::Table)
            .and_where(Expr::col(Scrobbles::Uri).eq(uri))
            .limit(1)
            .to_owned(),
        SubjectTable::Shout => Query::select()
            .column(Shouts::XataId)
            .from(Shouts::Table)
            .and_where(Expr::col(Shouts::Uri).eq(uri))
            .limit(1)
            .to_owned(),
    };
    db.fetch_scalar::<String>(&query).await
}

/// The `uri` of a `com.atproto.repo.strongRef` field.
///
/// Also accepts a bare string, which is how some older records were written.
fn strong_ref_uri(value: &serde_json::Value, field: &str) -> Option<String> {
    let reference = value.get(field)?;
    if let Some(uri) = reference.as_str() {
        return Some(uri.to_string()).filter(|uri| !uri.is_empty());
    }
    string(reference, "uri")
}

/// Projects an `app.rocksky.graph.follow` record into `follows`.
///
/// The row records DIDs rather than row ids, because a follow may name an
/// account this instance has never indexed — so there is nothing to join to
/// and no `users` row is created for the subject.
async fn ingest_follow(db: &Backend, record: &IncomingRecord) -> anyhow::Result<bool> {
    let Some(subject) = string(&record.value, "subject")
        .or_else(|| strong_ref_uri(&record.value, "subject"))
        .map(|subject| {
            // A follow names its subject by DID. Some records carry it as a
            // bare `at://<did>`, which is the same thing wearing a URI.
            subject
                .strip_prefix("at://")
                .unwrap_or(&subject)
                .split('/')
                .next()
                .unwrap_or_default()
                .to_string()
        })
        .filter(|subject| subject.starts_with("did:"))
    else {
        return Ok(false);
    };

    // Following yourself is not a relationship, and it would inflate both
    // counts on the profile it appears on.
    if subject == record.did {
        return Ok(false);
    }

    // The follower must exist as a row: it is the account whose repository
    // this came from, so it is a real participant.
    upsert_user(db, &record.did).await?;

    let insert = Query::insert()
        .into_table(Follows::Table)
        .columns([
            Follows::XataId,
            Follows::Uri,
            Follows::FollowerDid,
            Follows::SubjectDid,
        ])
        .values_panic([
            new_id().into(),
            record.uri().into(),
            record.did.clone().into(),
            subject.into(),
        ])
        // Two unique keys: the record URI, and the pair. A re-read hits the
        // first; the same follow re-created under a new rkey hits the second.
        .on_conflict(OnConflict::column(Follows::Uri).do_nothing().to_owned())
        .on_conflict(
            OnConflict::columns([Follows::FollowerDid, Follows::SubjectDid])
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&insert).await?;
    Ok(true)
}

/// Projects an `app.rocksky.playlist` record into `playlists`.
///
/// Keyed on the record's own AT-URI, so re-reading a repository updates the
/// row rather than duplicating it, and a playlist renamed upstream is renamed
/// here.
///
/// `created_by` is set only on insert. It names the repository the record came
/// from, which cannot change for a given AT-URI — and pinning it is what makes
/// the ownership check in [`ingest_playlist_song`] meaningful.
async fn ingest_playlist(db: &Backend, record: &IncomingRecord) -> anyhow::Result<bool> {
    let Some(name) = string(&record.value, "name") else {
        // NOT NULL, and a playlist with no name cannot be rendered.
        return Ok(false);
    };

    let owner_id = upsert_user(db, &record.did).await?;
    let uri = record.uri();

    let insert = Query::insert()
        .into_table(Playlists::Table)
        .columns([
            Playlists::XataId,
            Playlists::Name,
            Playlists::Description,
            Playlists::Picture,
            Playlists::Uri,
            Playlists::Cid,
            Playlists::SpotifyLink,
            Playlists::TidalLink,
            Playlists::AppleMusicLink,
            Playlists::CreatedBy,
        ])
        .values_panic([
            new_id().into(),
            name.clone().into(),
            string(&record.value, "description").into(),
            string(&record.value, "pictureUrl").into(),
            uri.clone().into(),
            string(&record.value, "cid").into(),
            string(&record.value, "spotifyLink").into(),
            string(&record.value, "tidalLink").into(),
            string(&record.value, "appleMusicLink").into(),
            owner_id.clone().into(),
        ])
        .on_conflict(
            OnConflict::column(Playlists::Uri)
                .update_columns([
                    Playlists::Name,
                    Playlists::Description,
                    Playlists::Picture,
                    Playlists::SpotifyLink,
                    Playlists::TidalLink,
                    Playlists::AppleMusicLink,
                ])
                .value(Playlists::XataUpdatedat, crate::db::now_timestamp())
                .to_owned(),
        )
        .to_owned();
    db.execute(&insert).await?;

    // The owner's own listing. Separate from `created_by` because
    // `user_playlists` is what "playlists I have" reads, and a collaborator
    // would get a row here without becoming the creator.
    let Some(playlist_id) = playlist_id_by_uri(db, &uri).await? else {
        return Ok(false);
    };
    let link = Query::insert()
        .into_table(UserPlaylists::Table)
        .columns([
            UserPlaylists::XataId,
            UserPlaylists::UserId,
            UserPlaylists::PlaylistId,
            UserPlaylists::Uri,
        ])
        .values_panic([
            new_id().into(),
            owner_id.into(),
            playlist_id.into(),
            uri.into(),
        ])
        .on_conflict(
            OnConflict::column(UserPlaylists::Uri)
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&link).await?;

    Ok(true)
}

/// Projects an `app.rocksky.playlist.song` record into `playlist_tracks`.
///
/// # The entry is only accepted from the playlist's owner
///
/// An entry names its playlist by AT-URI, and anyone can publish a record
/// naming anyone else's. Taking one at face value would let a stranger push
/// songs into somebody's playlist, so the author's DID has to match the
/// repository the playlist came from — the same rule `crates/jetstream`
/// applies.
///
/// # A song that is not indexed yet
///
/// The entry carries the song's metadata as well as a reference to it, so the
/// track is created from that rather than dropped: an entry whose
/// `app.rocksky.song` record has not arrived is normal, and dropping it would
/// lose the playlist position permanently.
async fn ingest_playlist_song(db: &Backend, record: &IncomingRecord) -> anyhow::Result<bool> {
    let Some(playlist_uri) = strong_ref_uri(&record.value, "playlist") else {
        return Ok(false);
    };

    let Some((playlist_id, owner_did)) = playlist_owner(db, &playlist_uri).await? else {
        // The playlist has not been indexed here yet. Nothing to attach to,
        // and inventing a playlist row from a URI alone would create one with
        // no name.
        tracing::debug!(playlist = %playlist_uri, "playlist entry for an unknown playlist");
        return Ok(false);
    };

    if owner_did != record.did {
        tracing::warn!(
            playlist = %playlist_uri,
            author = %record.did,
            owner = %owner_did,
            "refusing a playlist entry from someone who does not own the playlist"
        );
        return Ok(false);
    }

    // The entry carries the song's own metadata, which is what lets a track be
    // created for an entry whose song record has not arrived.
    let Some(song) = SongRecord::parse(&record.value) else {
        return Ok(false);
    };
    let track_id = upsert_catalogue(db, &song).await?;
    if let Some(song_uri) = strong_ref_uri(&record.value, "song") {
        set_record_uri(db, UriTable::Tracks, &track_id, &song_uri).await?;
    }

    let author_id = upsert_user(db, &record.did).await?;
    let insert = Query::insert()
        .into_table(PlaylistTracks::Table)
        .columns([
            PlaylistTracks::XataId,
            PlaylistTracks::PlaylistId,
            PlaylistTracks::TrackId,
            PlaylistTracks::Uri,
            PlaylistTracks::Cid,
            PlaylistTracks::AddedBy,
            PlaylistTracks::AddedAt,
        ])
        .values_panic([
            new_id().into(),
            playlist_id.into(),
            track_id.into(),
            record.uri().into(),
            string(&record.value, "cid").into(),
            author_id.into(),
            // The record's own timestamp, which is the order the playlist is
            // read in — not when this instance happened to see it. The field
            // is `addedAt` here; `createdAt` is accepted for records written
            // before the lexicon settled.
            string(&record.value, "addedAt")
                .or_else(|| string(&record.value, "createdAt"))
                .unwrap_or_else(crate::db::now_timestamp)
                .into(),
        ])
        .on_conflict(
            OnConflict::column(PlaylistTracks::Uri)
                .do_nothing()
                .to_owned(),
        )
        .to_owned();
    db.execute(&insert).await?;

    Ok(true)
}

async fn playlist_id_by_uri(db: &Backend, uri: &str) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(Playlists::XataId)
        .from(Playlists::Table)
        .and_where(Expr::col(Playlists::Uri).eq(uri))
        .limit(1)
        .to_owned();
    db.fetch_scalar::<String>(&query).await
}

/// A playlist's row id and the DID of the repository it came from.
async fn playlist_owner(db: &Backend, uri: &str) -> Result<Option<(String, String)>, sqlx::Error> {
    let query = Query::select()
        .column((Playlists::Table, Playlists::XataId))
        .column((Users::Table, Users::Did))
        .from(Playlists::Table)
        .inner_join(
            Users::Table,
            Expr::col((Users::Table, Users::XataId))
                .equals((Playlists::Table, Playlists::CreatedBy)),
        )
        .and_where(Expr::col((Playlists::Table, Playlists::Uri)).eq(uri))
        .limit(1)
        .to_owned();
    db.fetch_optional::<(String, String)>(&query).await
}

/// The denormalised URIs, which a null of crashes the web client.
#[cfg(test)]
mod denormalised_uris {
    use super::*;

    /// Builds a catalogue the way the firehose does: a scrobble first (which
    /// creates the track, album and artist rows with no URIs), then the album
    /// and artist records that name them.
    async fn scrobbled() -> (Backend, String) {
        let db = crate::db::connect_in_memory().await.unwrap();
        let song = SongRecord::parse(&serde_json::json!({
            "title": "Roygbiv",
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 151000,
            "createdAt": "2026-01-01T00:00:00.000Z",
        }))
        .unwrap();

        let track_id = upsert_catalogue(&db, &song).await.unwrap();
        (db, track_id)
    }

    /// Both URIs, as `Option`s that really distinguish NULL from empty —
    /// `fetch_scalar::<String>` cannot, since its `None` means "no rows".
    async fn uris(db: &Backend, track_id: &str) -> (Option<String>, Option<String>) {
        let query = Query::select()
            .columns([Tracks::AlbumUri, Tracks::ArtistUri])
            .from(Tracks::Table)
            .and_where(Expr::col(Tracks::XataId).eq(track_id))
            .to_owned();

        db.fetch_optional::<(Option<String>, Option<String>)>(&query)
            .await
            .unwrap()
            .expect("the track exists")
    }

    /// Ingesting an album record must fill the copy the views read, not only
    /// `albums.uri` — that gap is why every scrobble in the feed answered a
    /// null `albumUri`.
    #[tokio::test]
    async fn an_album_record_fills_the_track_copy() {
        let (db, track_id) = scrobbled().await;
        assert_eq!(uris(&db, &track_id).await, (None, None));

        let record = IncomingRecord {
            did: "did:plc:alice".into(),
            collection: ALBUM_NSID.into(),
            rkey: "3abc".into(),
            value: serde_json::json!({
                "title": "Music Has the Right to Children",
                "artist": "Boards of Canada",
            }),
        };
        ingest(&db, &record).await.unwrap();

        let (album_uri, _) = uris(&db, &track_id).await;
        assert_eq!(album_uri.as_deref(), Some(record.uri().as_str()));
    }

    #[tokio::test]
    async fn an_artist_record_fills_the_track_copy() {
        let (db, track_id) = scrobbled().await;

        let record = IncomingRecord {
            did: "did:plc:alice".into(),
            collection: ARTIST_NSID.into(),
            rkey: "3def".into(),
            value: serde_json::json!({ "name": "Boards of Canada" }),
        };
        ingest(&db, &record).await.unwrap();

        let (_, artist_uri) = uris(&db, &track_id).await;
        assert_eq!(artist_uri.as_deref(), Some(record.uri().as_str()));
    }

    /// The repair for rows ingested before the above existed: the album row
    /// has a URI, the track's copy is null, and the sweep closes the gap.
    #[tokio::test]
    async fn the_repair_fills_rows_ingested_earlier() {
        let (db, track_id) = scrobbled().await;

        // Exactly the state the old firehose path left: `albums.uri` and
        // `artists.uri` set, the copies on `tracks` still null.
        let album_id = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Albums::XataId)
                    .from(Albums::Table)
                    .to_owned(),
            )
            .await
            .unwrap()
            .unwrap();
        set_record_uri(
            &db,
            UriTable::Albums,
            &album_id,
            "at://did:plc:alice/app.rocksky.album/3abc",
        )
        .await
        .unwrap();

        let artist_id = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Artists::XataId)
                    .from(Artists::Table)
                    .to_owned(),
            )
            .await
            .unwrap()
            .unwrap();
        set_record_uri(
            &db,
            UriTable::Artists,
            &artist_id,
            "at://did:plc:alice/app.rocksky.artist/3def",
        )
        .await
        .unwrap();

        assert_eq!(uris(&db, &track_id).await, (None, None));

        let (albums, artists) = repair_denormalised_uris(&db).await.unwrap();
        assert_eq!((albums, artists), (1, 1));

        assert_eq!(
            uris(&db, &track_id).await,
            (
                Some("at://did:plc:alice/app.rocksky.album/3abc".into()),
                Some("at://did:plc:alice/app.rocksky.artist/3def".into())
            )
        );

        // Idempotent: it runs at every startup.
        assert_eq!(repair_denormalised_uris(&db).await.unwrap(), (0, 0));
    }

    /// A song record has to build the same rows a scrobble does. Creating
    /// only the track leaves it with no album, no artist and no junction
    /// rows — so it never appears on an album page, an artist page, or
    /// anywhere else that reaches a track through a relation.
    #[tokio::test]
    async fn a_song_record_builds_the_whole_catalogue() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let record = IncomingRecord {
            did: "did:plc:alice".into(),
            collection: SONG_NSID.into(),
            rkey: "3song".into(),
            value: serde_json::json!({
                "title": "Roygbiv",
                "artist": "Boards of Canada",
                "album": "Music Has the Right to Children",
                "albumArtist": "Boards of Canada",
                "duration": 151000,
                "createdAt": "2026-01-01T00:00:00.000Z",
            }),
        };
        ingest(&db, &record).await.unwrap();

        async fn rows(db: &Backend, table: &str) -> i64 {
            let query = Query::select()
                .expr(Func::count(Expr::col(Alias::new("xata_id"))))
                .from(Alias::new(table))
                .to_owned();
            db.count(&query).await.unwrap()
        }

        for (table, what) in [
            ("tracks", "the track row"),
            ("albums", "the album row"),
            ("artists", "the artist row"),
            ("album_tracks", "the album link"),
            ("artist_tracks", "the artist link"),
            ("artist_albums", "the artist-album link"),
        ] {
            assert_eq!(rows(&db, table).await, 1, "{what} is missing");
        }

        // And the track carries the record's own URI.
        let uri = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Tracks::Uri)
                    .from(Tracks::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(uri.as_deref(), Some(record.uri().as_str()));
    }

    /// An album record names its artist, so it must create and link that
    /// artist — an album known only from its own record would otherwise never
    /// appear on the artist's page.
    #[tokio::test]
    async fn an_album_record_links_its_artist() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let record = IncomingRecord {
            did: "did:plc:alice".into(),
            collection: ALBUM_NSID.into(),
            rkey: "3album".into(),
            value: serde_json::json!({
                "title": "Music Has the Right to Children",
                "artist": "Boards of Canada",
            }),
        };
        ingest(&db, &record).await.unwrap();

        let links = Query::select()
            .expr(Func::count(Expr::col(ArtistAlbums::XataId)))
            .from(ArtistAlbums::Table)
            .to_owned();
        assert_eq!(db.count(&links).await.unwrap(), 1);

        // Whichever record arrives first, the second finds the rows there —
        // both are keyed on the same content hashes.
        ingest(&db, &record).await.unwrap();
        assert_eq!(
            db.count(&links).await.unwrap(),
            1,
            "the link was duplicated"
        );
    }

    /// A URI already on the track came from a record naming it directly, so
    /// the sweep must not overwrite it with one inferred from a junction row.
    #[tokio::test]
    async fn an_existing_uri_is_not_overwritten() {
        let (db, track_id) = scrobbled().await;

        let update = Query::update()
            .table(Tracks::Table)
            .value(
                Tracks::AlbumUri,
                "at://did:plc:bob/app.rocksky.album/original",
            )
            .and_where(Expr::col(Tracks::XataId).eq(&track_id))
            .to_owned();
        db.execute(&update).await.unwrap();

        let album_id = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Albums::XataId)
                    .from(Albums::Table)
                    .to_owned(),
            )
            .await
            .unwrap()
            .unwrap();
        set_record_uri(
            &db,
            UriTable::Albums,
            &album_id,
            "at://did:plc:alice/app.rocksky.album/later",
        )
        .await
        .unwrap();

        denormalise_album_uri(&db, &album_id).await.unwrap();
        repair_denormalised_uris(&db).await.unwrap();

        let (album_uri, _) = uris(&db, &track_id).await;
        assert_eq!(
            album_uri.as_deref(),
            Some("at://did:plc:bob/app.rocksky.album/original")
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    pub(super) fn scrobble_value() -> serde_json::Value {
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

    /// An album first seen without a cover is filled in by the next record
    /// that has one.
    ///
    /// `find_or_create` writes only on create, and which record creates an
    /// album is an accident of firehose ordering — so without this an album
    /// whose first scrobble carried no cover would stay blank forever, even
    /// with a hundred later scrobbles that all have the art.
    #[tokio::test]
    async fn a_later_record_fills_in_missing_album_art() {
        let db = db::connect_in_memory().await.unwrap();

        // First sighting: no cover at all, so `SongRecord::from_value` stores
        // the placeholder.
        let id = upsert_album(
            &db,
            "Music Has the Right to Children",
            "Boards of Canada",
            Some(PLACEHOLDER_ALBUM_ART.to_string()),
            None,
            None,
        )
        .await
        .unwrap();

        // A later record for the same album, this one with real art.
        let again = upsert_album(
            &db,
            "Music Has the Right to Children",
            "Boards of Canada",
            Some("https://cdn.invalid/mhtrtc.jpg".into()),
            None,
            None,
        )
        .await
        .unwrap();

        assert_eq!(again, id, "still one album row");

        let hash = album_hash("Music Has the Right to Children", "Boards of Canada");
        let art = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Albums::AlbumArt)
                    .from(Albums::Table)
                    .and_where(Expr::col(Albums::Sha256).eq(&hash))
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(art.as_deref(), Some("https://cdn.invalid/mhtrtc.jpg"));

        // And a third record with no cover does not undo it.
        upsert_album(
            &db,
            "Music Has the Right to Children",
            "Boards of Canada",
            None,
            None,
            None,
        )
        .await
        .unwrap();
        assert!(!fill_album_art(&db, &hash, Some(PLACEHOLDER_ALBUM_ART))
            .await
            .unwrap());

        let art = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Albums::AlbumArt)
                    .from(Albums::Table)
                    .and_where(Expr::col(Albums::Sha256).eq(&hash))
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(art.as_deref(), Some("https://cdn.invalid/mhtrtc.jpg"));
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

/// Shouts and follows, the two record types the projection used to drop.
#[cfg(test)]
mod social {
    use super::*;

    fn shout_record(did: &str, rkey: &str, value: serde_json::Value) -> IncomingRecord {
        IncomingRecord {
            did: did.into(),
            collection: SHOUT_NSID.into(),
            rkey: rkey.into(),
            value,
        }
    }

    async fn stored_shout(db: &Backend, uri: &str) -> (String, Option<String>, Option<String>) {
        let query = Query::select()
            .columns([Shouts::Content, Shouts::TrackId, Shouts::ParentId])
            .from(Shouts::Table)
            .and_where(Expr::col(Shouts::Uri).eq(uri))
            .to_owned();
        db.fetch_optional::<(String, Option<String>, Option<String>)>(&query)
            .await
            .unwrap()
            .expect("the shout exists")
    }

    /// A shout on a song, with the subject resolved to the track it names.
    ///
    /// The record shape is the one on the network: `subject` is a strongRef,
    /// and `message` is absent when the shout is only a GIF.
    #[tokio::test]
    async fn a_shout_on_a_song_is_attached_to_its_track() {
        let db = crate::db::connect_in_memory().await.unwrap();

        // The song first, so there is something to attach to.
        let song = SongRecord::parse(&super::tests::scrobble_value()).unwrap();
        let track_id = upsert_catalogue(&db, &song).await.unwrap();
        let song_uri = "at://did:plc:alice/app.rocksky.song/3song";
        set_record_uri(&db, UriTable::Tracks, &track_id, song_uri)
            .await
            .unwrap();

        let stats = ingest(
            &db,
            &shout_record(
                "did:plc:bob",
                "3shout",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    "subject": { "uri": song_uri, "cid": "bafyshout" },
                    "message": "this one is a banger",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.shouts, 1);
        assert_eq!(stats.skipped, 0);

        let (content, attached_track, parent) =
            stored_shout(&db, "at://did:plc:bob/app.rocksky.shout/3shout").await;
        assert_eq!(content, "this one is a banger");
        assert_eq!(attached_track.as_deref(), Some(track_id.as_str()));
        assert_eq!(parent, None);
    }

    /// A GIF-only shout: the lexicon makes `message` optional but
    /// `shouts.content` is NOT NULL, so it has to become the empty string
    /// rather than failing the insert. The gif fields are the real payload.
    #[tokio::test]
    async fn a_gif_only_shout_is_stored() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &shout_record(
                "did:plc:bob",
                "3gif",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    "subject": {
                        "uri": "at://did:plc:alice/app.rocksky.album/3album",
                        "cid": "bafy",
                    },
                    "gif": {
                        "url": "https://gif.invalid/a.gif",
                        "previewUrl": "https://gif.invalid/a-preview.gif",
                        "alt": "a cat",
                        "width": 320,
                        "height": 240,
                    },
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            ),
        )
        .await
        .unwrap();
        assert_eq!(stats.shouts, 1);

        let query = Query::select()
            .columns([
                Shouts::Content,
                Shouts::GifUrl,
                Shouts::GifAlt,
                Shouts::GifWidth,
            ])
            .from(Shouts::Table)
            .to_owned();
        let (content, url, alt, width) = db
            .fetch_optional::<(String, Option<String>, Option<String>, Option<i64>)>(&query)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(content, "");
        assert_eq!(url.as_deref(), Some("https://gif.invalid/a.gif"));
        assert_eq!(alt.as_deref(), Some("a cat"));
        assert_eq!(width, Some(320));
    }

    /// A reply is linked to the shout it answers, by record URI.
    #[tokio::test]
    async fn a_reply_is_linked_to_its_parent() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let subject = serde_json::json!({
            "uri": "at://did:plc:alice/app.rocksky.artist/3artist",
            "cid": "bafy",
        });

        ingest(
            &db,
            &shout_record(
                "did:plc:bob",
                "3parent",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    "subject": subject,
                    "message": "first",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            ),
        )
        .await
        .unwrap();

        ingest(
            &db,
            &shout_record(
                "did:plc:carol",
                "3reply",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    "subject": subject,
                    "parent": {
                        "uri": "at://did:plc:bob/app.rocksky.shout/3parent",
                        "cid": "bafyparent",
                    },
                    "message": "agreed",
                    "createdAt": "2026-01-01T00:00:01.000Z",
                }),
            ),
        )
        .await
        .unwrap();

        let parent_row = stored_shout(&db, "at://did:plc:bob/app.rocksky.shout/3parent").await;
        let reply_row = stored_shout(&db, "at://did:plc:carol/app.rocksky.shout/3reply").await;
        assert_eq!(parent_row.2, None, "the parent has no parent");
        assert!(reply_row.2.is_some(), "the reply points at it");
    }

    /// Re-reading a repository must not duplicate every comment in it.
    #[tokio::test]
    async fn the_same_shout_twice_is_one_row() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let incoming = shout_record(
            "did:plc:bob",
            "3dupe",
            serde_json::json!({
                "$type": SHOUT_NSID,
                "subject": { "uri": "at://did:plc:alice/app.rocksky.song/3song", "cid": "bafy" },
                "message": "twice",
                "createdAt": "2026-01-01T00:00:00.000Z",
            }),
        );

        ingest(&db, &incoming).await.unwrap();
        ingest(&db, &incoming).await.unwrap();

        let count = db
            .count(
                &Query::select()
                    .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(Shouts::XataId))))
                    .from(Shouts::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    /// A shout whose subject has not been indexed here yet is still kept.
    ///
    /// Records arrive in whatever order the firehose sends them, and dropping
    /// the comment would lose it permanently — it is never re-sent.
    #[tokio::test]
    async fn a_shout_for_an_unknown_subject_is_kept_unattached() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &shout_record(
                "did:plc:bob",
                "3orphan",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    "subject": {
                        "uri": "at://did:plc:nobody/app.rocksky.song/3unknown",
                        "cid": "bafy",
                    },
                    "message": "early",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.shouts, 1);
        let (content, track, _) =
            stored_shout(&db, "at://did:plc:bob/app.rocksky.shout/3orphan").await;
        assert_eq!(content, "early");
        assert_eq!(track, None, "nothing to attach to yet");
    }

    /// The collection is matched exactly, at its own position in the AT-URI.
    /// A `contains`-style check would mistake an rkey or a handle containing a
    /// collection name for the collection itself.
    #[test]
    fn a_subject_is_routed_by_its_collection() {
        assert_eq!(
            subject_table("at://did:plc:a/app.rocksky.song/3x"),
            Some(SubjectTable::Track)
        );
        assert_eq!(
            subject_table("at://did:plc:a/app.rocksky.album/3x"),
            Some(SubjectTable::Album)
        );
        assert_eq!(
            subject_table("at://did:plc:a/app.rocksky.artist/3x"),
            Some(SubjectTable::Artist)
        );
        assert_eq!(
            subject_table("at://did:plc:a/app.rocksky.scrobble/3x"),
            Some(SubjectTable::Scrobble)
        );
        assert_eq!(
            subject_table("at://did:plc:a/app.rocksky.shout/3x"),
            Some(SubjectTable::Shout)
        );

        // A profile shout, which cannot be placed — see `ingest_shout`.
        assert_eq!(
            subject_table("at://did:plc:a/app.bsky.actor.profile/self"),
            None
        );
        // And nothing that is not an AT-URI resolves at all.
        assert_eq!(subject_table("app.rocksky.song"), None);
        assert_eq!(subject_table("at://did:plc:a"), None);
        assert_eq!(subject_table(""), None);
    }

    /// A profile shout is stored but not attached, because the record names
    /// the author's own profile whoever it was aimed at.
    #[tokio::test]
    async fn a_profile_shout_is_stored_without_a_subject() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &shout_record(
                "did:plc:bob",
                "3profile",
                serde_json::json!({
                    "$type": SHOUT_NSID,
                    // What the network actually holds: bob's own profile,
                    // even for a shout on somebody else's.
                    "subject": {
                        "uri": "at://did:plc:bob/app.bsky.actor.profile/self",
                        "cid": "bafy",
                    },
                    "message": "hello",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.shouts, 1, "counted, not skipped");
        let (content, track, _) =
            stored_shout(&db, "at://did:plc:bob/app.rocksky.shout/3profile").await;
        assert_eq!(content, "hello");
        assert_eq!(track, None);
    }

    /// Follower counts come from this table, and they were all zero.
    #[tokio::test]
    async fn a_follow_is_recorded_by_did() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &IncomingRecord {
                did: "did:plc:bob".into(),
                collection: FOLLOW_NSID.into(),
                rkey: "3follow".into(),
                value: serde_json::json!({
                    "$type": FOLLOW_NSID,
                    "subject": "did:plc:alice",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                }),
            },
        )
        .await
        .unwrap();
        assert_eq!(stats.follows, 1);

        let query = Query::select()
            .columns([Follows::FollowerDid, Follows::SubjectDid])
            .from(Follows::Table)
            .to_owned();
        let row = db
            .fetch_optional::<(String, String)>(&query)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row, ("did:plc:bob".into(), "did:plc:alice".into()));
    }

    /// The subject may arrive as a bare DID or wearing an `at://`; both are
    /// the same relationship, and storing them differently would double a
    /// follower count.
    #[tokio::test]
    async fn a_follow_subject_may_be_a_uri() {
        let db = crate::db::connect_in_memory().await.unwrap();

        for (rkey, subject) in [
            ("3bare", serde_json::json!("did:plc:alice")),
            ("3uri", serde_json::json!("at://did:plc:alice")),
            ("3ref", serde_json::json!({ "uri": "at://did:plc:alice" })),
        ] {
            ingest(
                &db,
                &IncomingRecord {
                    did: "did:plc:bob".into(),
                    collection: FOLLOW_NSID.into(),
                    rkey: rkey.into(),
                    value: serde_json::json!({ "subject": subject }),
                },
            )
            .await
            .unwrap();
        }

        let count = db
            .count(
                &Query::select()
                    .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(Follows::XataId))))
                    .from(Follows::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(count, 1, "one relationship, however it was spelled");
    }

    /// Following yourself is not a relationship, and it would inflate both
    /// counts shown on the profile.
    #[tokio::test]
    async fn a_self_follow_is_refused() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &IncomingRecord {
                did: "did:plc:bob".into(),
                collection: FOLLOW_NSID.into(),
                rkey: "3self".into(),
                value: serde_json::json!({ "subject": "did:plc:bob" }),
            },
        )
        .await
        .unwrap();

        assert_eq!(stats.follows, 0);
        assert_eq!(stats.skipped, 1);
    }

    /// A subject that is not a DID at all is not a follow.
    #[tokio::test]
    async fn a_malformed_follow_is_skipped() {
        let db = crate::db::connect_in_memory().await.unwrap();

        for value in [
            serde_json::json!({}),
            serde_json::json!({ "subject": "" }),
            serde_json::json!({ "subject": "alice.example" }),
            serde_json::json!({ "subject": "at://alice.example/app.rocksky.song/3x" }),
        ] {
            let stats = ingest(
                &db,
                &IncomingRecord {
                    did: "did:plc:bob".into(),
                    collection: FOLLOW_NSID.into(),
                    rkey: "3bad".into(),
                    value,
                },
            )
            .await
            .unwrap();
            assert_eq!(stats.follows, 0);
            assert_eq!(stats.skipped, 1);
        }
    }

    /// Both collections have to be in the subscribed set, or Tap and Jetstream
    /// never deliver them and none of the above ever runs.
    #[test]
    fn the_new_collections_are_subscribed() {
        assert!(SUPPORTED_COLLECTIONS.contains(&SHOUT_NSID));
        assert!(SUPPORTED_COLLECTIONS.contains(&FOLLOW_NSID));
    }
}

/// Playlists, the other record types the projection used to drop.
#[cfg(test)]
mod playlists {
    use super::*;

    fn record_of(
        did: &str,
        collection: &str,
        rkey: &str,
        value: serde_json::Value,
    ) -> IncomingRecord {
        IncomingRecord {
            did: did.into(),
            collection: collection.into(),
            rkey: rkey.into(),
            value,
        }
    }

    fn a_playlist(name: &str) -> serde_json::Value {
        serde_json::json!({
            "$type": PLAYLIST_NSID,
            "name": name,
            "description": "Songs for a long drive",
            "pictureUrl": "https://cdn.invalid/cover.jpg",
            "spotifyLink": "https://open.spotify.com/playlist/abc",
            "createdAt": "2026-01-01T00:00:00.000Z",
        })
    }

    fn an_entry(playlist_uri: &str, title: &str) -> serde_json::Value {
        serde_json::json!({
            "$type": PLAYLIST_SONG_NSID,
            "playlist": { "uri": playlist_uri, "cid": "bafyplaylist" },
            "song": { "uri": "at://did:plc:alice/app.rocksky.song/3song", "cid": "bafysong" },
            "title": title,
            "artist": "Boards of Canada",
            "album": "Music Has the Right to Children",
            "albumArtist": "Boards of Canada",
            "duration": 151000,
            // `addedAt`, which is what the lexicon declares and what real
            // records carry — this fixture said `createdAt` and so passed
            // while every record on the network was being dropped.
            "addedAt": "2026-01-02T00:00:00.000Z",
        })
    }

    async fn count(db: &Backend, table: impl crate::sea_query::IntoTableRef) -> i64 {
        db.count(
            &Query::select()
                .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(
                    crate::sea_query::Alias::new("xata_id"),
                ))))
                .from(table)
                .to_owned(),
        )
        .await
        .unwrap()
    }

    /// A playlist and one of its songs, from the owner's own repository.
    #[tokio::test]
    async fn a_playlist_and_its_entries_are_projected() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let playlist_uri = "at://did:plc:alice/app.rocksky.playlist/3road";

        let stats = ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_NSID,
                "3road",
                a_playlist("Road Trip"),
            ),
        )
        .await
        .unwrap();
        assert_eq!(stats.playlists, 1);

        let stats = ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_SONG_NSID,
                "3entry",
                an_entry(playlist_uri, "Roygbiv"),
            ),
        )
        .await
        .unwrap();
        assert_eq!(stats.playlist_songs, 1);

        assert_eq!(count(&db, Playlists::Table).await, 1);
        assert_eq!(count(&db, PlaylistTracks::Table).await, 1);
        // The owner's own listing, which is what "my playlists" reads.
        assert_eq!(count(&db, UserPlaylists::Table).await, 1);

        // The entry created the track from its own metadata, so the playlist
        // is readable even though no song record has arrived.
        assert_eq!(count(&db, Tracks::Table).await, 1);

        let name = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Playlists::Name)
                    .from(Playlists::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(name.as_deref(), Some("Road Trip"));
    }

    /// The rule that matters: anyone can publish a record naming somebody
    /// else's playlist, and taking one at face value would let a stranger push
    /// songs into it.
    #[tokio::test]
    async fn an_entry_from_someone_else_is_refused() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let playlist_uri = "at://did:plc:alice/app.rocksky.playlist/3road";

        ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_NSID,
                "3road",
                a_playlist("Road Trip"),
            ),
        )
        .await
        .unwrap();

        // Bob, publishing into Alice's playlist.
        let stats = ingest(
            &db,
            &record_of(
                "did:plc:bob",
                PLAYLIST_SONG_NSID,
                "3sneaky",
                an_entry(playlist_uri, "Not Yours"),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.playlist_songs, 0);
        assert_eq!(stats.skipped, 1);
        assert_eq!(count(&db, PlaylistTracks::Table).await, 0);
    }

    /// An entry for a playlist this instance has not indexed is dropped rather
    /// than inventing a nameless playlist from a URI.
    #[tokio::test]
    async fn an_entry_for_an_unknown_playlist_is_skipped() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_SONG_NSID,
                "3orphan",
                an_entry(
                    "at://did:plc:alice/app.rocksky.playlist/3missing",
                    "Roygbiv",
                ),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.playlist_songs, 0);
        assert_eq!(stats.skipped, 1);
        assert_eq!(count(&db, Playlists::Table).await, 0);
    }

    /// Re-reading a repository updates the playlist rather than duplicating
    /// it, and a rename upstream is a rename here.
    #[tokio::test]
    async fn re_reading_renames_rather_than_duplicating() {
        let db = crate::db::connect_in_memory().await.unwrap();

        ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_NSID,
                "3road",
                a_playlist("Road Trip"),
            ),
        )
        .await
        .unwrap();
        ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_NSID,
                "3road",
                a_playlist("Road Trip 2026"),
            ),
        )
        .await
        .unwrap();

        assert_eq!(count(&db, Playlists::Table).await, 1, "the URI is the key");
        assert_eq!(count(&db, UserPlaylists::Table).await, 1);

        let name = db
            .fetch_scalar::<String>(
                &Query::select()
                    .column(Playlists::Name)
                    .from(Playlists::Table)
                    .to_owned(),
            )
            .await
            .unwrap();
        assert_eq!(name.as_deref(), Some("Road Trip 2026"));
    }

    /// A playlist with no name cannot be rendered, and `name` is NOT NULL.
    #[tokio::test]
    async fn a_nameless_playlist_is_skipped() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let stats = ingest(
            &db,
            &record_of(
                "did:plc:alice",
                PLAYLIST_NSID,
                "3blank",
                serde_json::json!({ "$type": PLAYLIST_NSID, "description": "no name" }),
            ),
        )
        .await
        .unwrap();

        assert_eq!(stats.playlists, 0);
        assert_eq!(stats.skipped, 1);
    }

    /// The entry's timestamp is `addedAt`, and it is what the playlist is
    /// ordered by. `createdAt` is accepted too, for records written before the
    /// lexicon settled.
    #[tokio::test]
    async fn the_entry_timestamp_comes_from_added_at() {
        for (field, when) in [
            ("addedAt", "2026-03-01T00:00:00.000Z"),
            ("createdAt", "2026-04-01T00:00:00.000Z"),
        ] {
            let db = crate::db::connect_in_memory().await.unwrap();
            let playlist_uri = "at://did:plc:alice/app.rocksky.playlist/3road";
            ingest(
                &db,
                &record_of(
                    "did:plc:alice",
                    PLAYLIST_NSID,
                    "3road",
                    a_playlist("Road Trip"),
                ),
            )
            .await
            .unwrap();

            let mut entry = an_entry(playlist_uri, "Roygbiv");
            let object = entry.as_object_mut().unwrap();
            object.remove("addedAt");
            object.insert(field.to_string(), serde_json::json!(when));

            let stats = ingest(
                &db,
                &record_of("did:plc:alice", PLAYLIST_SONG_NSID, "3entry", entry),
            )
            .await
            .unwrap();
            assert_eq!(stats.playlist_songs, 1, "{field} must be accepted");

            let added_at = db
                .fetch_scalar::<String>(
                    &Query::select()
                        .column(PlaylistTracks::AddedAt)
                        .from(PlaylistTracks::Table)
                        .to_owned(),
                )
                .await
                .unwrap();
            assert_eq!(added_at.as_deref(), Some(when), "ordered by {field}");
        }
    }

    /// Both collections have to be subscribed, or Tap never delivers them and
    /// none of the above runs.
    #[test]
    fn the_playlist_collections_are_subscribed() {
        assert!(SUPPORTED_COLLECTIONS.contains(&PLAYLIST_NSID));
        assert!(SUPPORTED_COLLECTIONS.contains(&PLAYLIST_SONG_NSID));
    }
}
