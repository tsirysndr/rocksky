//! `app.rocksky.scrobble.createScrobble` — recording a listen.
//!
//! The core write of the whole application, and the one with the most ways to
//! go wrong, because the same listen reaches it from several places at once: a
//! Spotify webhook, a Last.fm mirror, navidrome, the desktop app and the
//! browser miniplayer can all report one play.
//!
//! # Two layers of deduplication, for two different problems
//!
//! **A ±60 second window on (user, title, artist).** Two sources rarely agree
//! on a timestamp to the second — one reports when playback started, another
//! when it passed halfway — so an exact-match check would let both through.
//! The window catches that.
//!
//! **A put-lock, before the record is written.** The window is checked against
//! the database, and two concurrent requests both pass it before either has
//! inserted. The unique index catches the second row, but by then the second
//! ATProto *record* has already been written to the user's repository, where
//! nothing will remove it. So the lock is taken first, keyed on the same
//! identity the window uses plus the whole-second timestamp, and only the
//! winner publishes.
//!
//! # Album metadata is filled in from what is already known
//!
//! A source that reports a title and an artist but no cover art would
//! otherwise produce a track with the placeholder, next to an identical track
//! from a richer source that has one. So a known album's year, release date
//! and cover are copied onto an incoming scrobble that lacks them.

use crate::atproto::records;
use crate::atproto::writer::Writer;
use crate::auth::AuthDid;
use crate::db::models::{Scrobble, SCROBBLE_COLS};
use crate::db::schema::{Albums, Artists, Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Expr, Func, JoinType, Query, SimpleExpr, SubQueryStatement};
use crate::state::AppState;
use crate::xrpc::json;
use crate::xrpc_procedure;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::Deserialize;
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_procedure!(cfg, "app.rocksky.scrobble.createScrobble", create_scrobble);
}

/// How far apart two reports of the same song count as one listen.
///
/// Sixty seconds each way. Wide enough that two sources disagreeing about when
/// a play began still collapse; narrow enough that someone genuinely replaying
/// a short track is not swallowed.
const DEDUPE_WINDOW_SECONDS: i64 = 60;

/// How long the put-lock is held.
///
/// Longer than any plausible request, so a slow PDS cannot let a second source
/// through behind it; short enough that a crashed request does not block that
/// listen for long.
const PUT_LOCK_TTL: Duration = Duration::from_secs(120);

/// Everything a source can report about a listen.
///
/// Only `title` and `artist` are required. Everything else is best-effort:
/// a webhook may know the Spotify link and nothing else, while a tagged local
/// file knows the label and the ISRC. The projection fills what it can from
/// the catalogue.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScrobbleInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub duration: Option<i64>,
    #[serde(default)]
    pub mb_id: Option<String>,
    #[serde(default)]
    pub isrc: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub track_number: Option<i64>,
    #[serde(default)]
    pub disc_number: Option<i64>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub lyrics: Option<String>,
    #[serde(default)]
    pub composer: Option<String>,
    #[serde(default)]
    pub copyright_message: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub artist_picture: Option<String>,
    #[serde(default)]
    pub spotify_link: Option<String>,
    #[serde(default)]
    pub lastfm_link: Option<String>,
    #[serde(default)]
    pub tidal_link: Option<String>,
    #[serde(default)]
    pub apple_music_link: Option<String>,
    #[serde(default)]
    pub youtube_link: Option<String>,
    #[serde(default)]
    pub deezer_link: Option<String>,
    /// Unix seconds. Absent means now — which is what a live player sends.
    #[serde(default)]
    pub timestamp: Option<i64>,
}

/// `app.rocksky.scrobble.createScrobble`
async fn create_scrobble(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<CreateScrobbleInput>,
) -> XrpcResult<HttpResponse> {
    let mut input = body.into_inner();

    let title = required(&input.title, "title")?;
    let artist = required(&input.artist, "artist")?;

    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let listened_at = match input.timestamp {
        Some(seconds) => chrono::DateTime::from_timestamp(seconds, 0).ok_or_else(|| {
            XrpcError::invalid_request(format!("{seconds} is not a usable unix timestamp"))
        })?,
        None => chrono::Utc::now(),
    };

    // An album this instance already knows fills in what the source omitted.
    let album = input
        .album
        .clone()
        .filter(|album| !album.is_empty())
        .unwrap_or_else(|| title.clone());
    let album_artist = input
        .album_artist
        .clone()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| artist.clone());
    enrich_from_album(db, &mut input, &album, &album_artist).await?;

    // Already recorded? The window, not an exact match — see the module note.
    if let Some(existing) = recent_duplicate(db, &user_id, &title, &artist, listened_at).await? {
        tracing::debug!(
            did = %auth.did,
            title = %title,
            "a scrobble for this song is already recorded within the window"
        );
        return answer(db, &existing).await;
    }

    // The lock, before anything is published.
    let lock = put_lock_key(&auth.did, &title, &artist, listened_at);
    let publish = state.cache().claim(&lock, PUT_LOCK_TTL).await;
    if !publish {
        tracing::info!(
            did = %auth.did,
            title = %title,
            "another source is publishing this listen; recording the row only"
        );
    }

    let song = song_from_input(&input, &title, &artist, &album, &album_artist, listened_at);

    let track_id = crate::ingest::upsert_catalogue(db, &song)
        .await
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;

    // The track, its album and its artist, so a brand-new record is findable
    // immediately rather than after the next restart.
    crate::search::index_track_tree(&state, &track_id).await;

    // Published before the row is written, so the row can carry the record's
    // URI — which is the key the projection dedupes on when the same scrobble
    // comes back over the firehose.
    let uri = if publish {
        publish_records(&state, &auth.did, &song, listened_at).await
    } else {
        None
    };

    let scrobble_id = crate::db::new_id();
    insert_scrobble(
        db,
        &scrobble_id,
        &user_id,
        &track_id,
        &album,
        &album_artist,
        uri.clone(),
        listened_at,
    )
    .await?;

    tracing::info!(
        did = %auth.did,
        title = %title,
        artist = %artist,
        published = uri.is_some(),
        "recorded a scrobble"
    );

    // The mirrors push this listen onward. A bare DID, not JSON — see the
    // subject table in `crate::events`.
    if let Some(events) = state.events() {
        events
            .publish_text(crate::events::subject::SCROBBLE_SYNC, &auth.did)
            .await;
    }

    // The feed's cached pages are keyed on this, so bumping it is what makes
    // the new scrobble visible rather than waiting for a TTL.
    state
        .cache()
        .incr(
            super::scrobble::SCROBBLES_VERSION_KEY,
            Duration::from_secs(86_400),
        )
        .await;

    answer(db, &scrobble_id).await
}

// ------------------------------------------------------------------- pieces

/// The projection's view of what a source reported.
///
/// Shared with `POST /likes`, which takes the same payload — `apps/api`
/// validates both routes with one `trackSchema` — and has to produce the same
/// track row, or liking a song would create a second copy of it beside the one
/// scrobbling created.
pub(crate) fn song_from_input(
    input: &CreateScrobbleInput,
    title: &str,
    artist: &str,
    album: &str,
    album_artist: &str,
    created_at: chrono::DateTime<chrono::Utc>,
) -> crate::ingest::SongRecord {
    crate::ingest::SongRecord {
        title: title.to_string(),
        artist: artist.to_string(),
        album: album.to_string(),
        album_artist: album_artist.to_string(),
        duration: input.duration.unwrap_or(0),
        created_at,
        album_art: Some(
            input
                .album_art
                .clone()
                .filter(|art| !art.is_empty())
                .unwrap_or_else(|| rocksky_core::PLACEHOLDER_ALBUM_ART.to_string()),
        ),
        track_number: input.track_number,
        disc_number: Some(input.disc_number.filter(|d| *d > 0).unwrap_or(1)),
        year: input.year,
        release_date: input.release_date.clone(),
        genre: None,
        composer: input.composer.clone(),
        lyrics: input.lyrics.clone(),
        copyright_message: input.copyright_message.clone(),
        label: input.label.clone(),
        mb_id: input.mb_id.clone(),
        isrc: input.isrc.clone(),
        spotify_link: input.spotify_link.clone(),
        youtube_link: input.youtube_link.clone(),
        tidal_link: input.tidal_link.clone(),
        apple_music_link: input.apple_music_link.clone(),
    }
}

fn required(value: &Option<String>, field: &str) -> Result<String, XrpcError> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| XrpcError::invalid_request(format!("{field} is required")))
}

async fn caller_id(db: &Backend, did: &str) -> Result<String, XrpcError> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

/// Writes the scrobble row.
///
/// `INSERT … SELECT` rather than `VALUES`, because the album and the artist are
/// resolved by content hash inside the statement: both rows were created
/// moments ago by `upsert_catalogue`, and a NULL either side is a scrobble that
/// renders without a cover.
#[allow(clippy::too_many_arguments)]
async fn insert_scrobble(
    db: &Backend,
    scrobble_id: &str,
    user_id: &str,
    track_id: &str,
    album: &str,
    album_artist: &str,
    uri: Option<String>,
    listened_at: chrono::DateTime<chrono::Utc>,
) -> Result<(), XrpcError> {
    let row = Query::select()
        .expr(Expr::val(scrobble_id))
        .expr(Expr::val(user_id))
        .expr(Expr::val(track_id))
        .expr(id_by_hash(
            Albums::Table,
            Albums::XataId,
            Albums::Sha256,
            rocksky_core::album_hash(album, album_artist),
        ))
        .expr(id_by_hash(
            Artists::Table,
            Artists::XataId,
            Artists::Sha256,
            rocksky_core::artist_hash(album_artist),
        ))
        .expr(Expr::val(uri))
        // As text, not a native timestamp: SQLite stores these in a TEXT
        // column and compares them lexicographically.
        .expr(Expr::val(crate::db::format_timestamp(listened_at)))
        .take();

    let insert = Query::insert()
        .into_table(Scrobbles::Table)
        .columns([
            Scrobbles::XataId,
            Scrobbles::UserId,
            Scrobbles::TrackId,
            Scrobbles::AlbumId,
            Scrobbles::ArtistId,
            Scrobbles::Uri,
            Scrobbles::Timestamp,
        ])
        // Fails only if the column and expression counts disagree, which is a
        // programming error in the statement right above.
        .select_from(row)
        .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?
        .to_owned();

    db.execute(&insert).await?;
    Ok(())
}

/// `(SELECT <id> FROM <table> WHERE <hash column> = <hash>)`, as one scalar
/// expression to embed in a larger statement.
fn id_by_hash<T>(table: T, id: T, hash_column: T, hash: String) -> SimpleExpr
where
    T: crate::sea_query::IntoIden + Copy + 'static,
{
    let select = Query::select()
        .column(id)
        .from(table)
        .and_where(Expr::col(hash_column).eq(hash))
        .take();

    SimpleExpr::SubQuery(None, Box::new(SubQueryStatement::SelectStatement(select)))
}

/// Copies a known album's metadata onto a scrobble that lacks it.
///
/// Only fills what is missing: a source that *did* report a cover keeps its
/// own, which may be the higher-resolution one.
async fn enrich_from_album(
    db: &Backend,
    input: &mut CreateScrobbleInput,
    album: &str,
    album_artist: &str,
) -> Result<(), sqlx::Error> {
    if input.year.is_some() && input.release_date.is_some() && input.album_art.is_some() {
        return Ok(());
    }

    let query = Query::select()
        // `year` is `int4` on Postgres and sqlx will not decode that into an
        // `i64`, so without the cast this read errors and takes the whole
        // scrobble with it.
        .expr_as(db.cast_int(Expr::col(Albums::Year)), Alias::new("year"))
        .columns([Albums::ReleaseDate, Albums::AlbumArt])
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Sha256).eq(rocksky_core::album_hash(album, album_artist)))
        .limit(1)
        .take();

    type Row = (Option<i64>, Option<String>, Option<String>);
    let Some((year, release_date, album_art)) = db.fetch_optional::<Row>(&query).await? else {
        return Ok(());
    };

    if input.year.is_none() {
        input.year = year;
    }
    if input.release_date.is_none() {
        input.release_date = release_date;
    }
    if input.album_art.as_deref().is_none_or(str::is_empty) {
        // Not the placeholder: an album row that only has the placeholder has
        // nothing to contribute, and copying it would look like real art.
        input.album_art = album_art.filter(|art| art != rocksky_core::PLACEHOLDER_ALBUM_ART);
    }
    Ok(())
}

/// An existing scrobble of the same song within the window.
async fn recent_duplicate(
    db: &Backend,
    user_id: &str,
    title: &str,
    artist: &str,
    at: chrono::DateTime<chrono::Utc>,
) -> Result<Option<String>, sqlx::Error> {
    let window = chrono::Duration::seconds(DEDUPE_WINDOW_SECONDS);

    // Matched on the track's *text*, not its id: two sources can spell an
    // album differently and so produce two track rows for one song, and an
    // id match would let both scrobbles through.
    let query = Query::select()
        .column((Alias::new("s"), Scrobbles::XataId))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::Join,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("s"), Scrobbles::TrackId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::UserId)).eq(user_id))
        .and_where(
            Expr::expr(Func::lower(Expr::col((Alias::new("t"), Tracks::Title))))
                .eq(title.to_lowercase()),
        )
        .and_where(
            Expr::expr(Func::lower(Expr::col((Alias::new("t"), Tracks::Artist))))
                .eq(artist.to_lowercase()),
        )
        // The window's ends are bound as text, not as native timestamps:
        // SQLite holds `timestamp` in a TEXT column and compares it
        // lexicographically, so a rendered datetime literal would compare
        // against a different format and never match.
        .and_where(
            Expr::col((Alias::new("s"), Scrobbles::Timestamp))
                .gte(db.timestamp_value(crate::db::format_timestamp(at - window))),
        )
        .and_where(
            Expr::col((Alias::new("s"), Scrobbles::Timestamp))
                .lte(db.timestamp_value(crate::db::format_timestamp(at + window))),
        )
        .limit(1)
        .take();

    db.fetch_scalar::<String>(&query).await
}

/// The lock key for one listen.
///
/// Lowercased, so two sources capitalising differently take the same lock, and
/// hashed so a title containing a colon cannot break the key's structure.
///
/// The two fields are **length-prefixed** before hashing. Joining them with a
/// separator is not enough: `("a|b", "c")` and `("a", "b|c")` both produce
/// `a|b|c`, so a song whose title contains the separator could take the lock
/// belonging to a different song — and the first attempt at this did exactly
/// that until its own test caught it. A length prefix cannot be forged that
/// way, because the length is not part of the text.
///
/// The timestamp is whole seconds, which is the resolution sources agree on.
pub fn put_lock_key(
    did: &str,
    title: &str,
    artist: &str,
    at: chrono::DateTime<chrono::Utc>,
) -> String {
    use sha2::{Digest, Sha256};

    let title = title.to_lowercase();
    let artist = artist.to_lowercase();
    let identity = format!("{}:{title}{}:{artist}", title.len(), artist.len());

    let hash = hex::encode(Sha256::digest(identity.as_bytes()));
    format!("scrobble-put:{did}:{hash}:{}", at.timestamp())
}

/// Publishes the scrobble, song, album and artist records.
async fn publish_records(
    state: &AppState,
    did: &str,
    song: &crate::ingest::SongRecord,
    listened_at: chrono::DateTime<chrono::Utc>,
) -> Option<String> {
    let writer = match Writer::for_did(state, did).await {
        Ok(writer) => writer,
        Err(err) => {
            // Not fatal: the row is still written, and the scrobble is still
            // counted. It just is not in the user's repository yet.
            tracing::warn!(did, error = %err, "cannot publish; recording locally only");
            return None;
        }
    };

    let record = records::TrackRecord {
        title: song.title.clone(),
        artist: song.artist.clone(),
        album: song.album.clone(),
        album_artist: song.album_artist.clone(),
        duration: song.duration,
        track_number: song.track_number,
        disc_number: song.disc_number,
        year: song.year,
        release_date: song.release_date.clone(),
        album_art: song.album_art.clone(),
        genre: song.genre.clone(),
        tags: Vec::new(),
        composer: song.composer.clone(),
        lyrics: song.lyrics.clone(),
        copyright_message: song.copyright_message.clone(),
        label: song.label.clone(),
        mb_id: song.mb_id.clone(),
        isrc: song.isrc.clone(),
        spotify_link: song.spotify_link.clone(),
        artist_picture: None,
    };

    let db = state.db();
    let known = records::KnownUris {
        album: crate::ingest::album_uri(db, song).await.ok().flatten(),
        artist: crate::ingest::artist_uri(db, &song.album_artist)
            .await
            .ok()
            .flatten(),
    };

    // The scrobble record itself, which is what the firehose carries.
    let written = writer
        .create(
            crate::ingest::SCROBBLE_NSID,
            &records::next_tid(),
            &records::scrobble_record(&record, listened_at),
        )
        .await;

    let uri = match written {
        Ok(written) => Some(written.uri),
        Err(err) => {
            tracing::warn!(did, error = %err, "could not publish the scrobble record");
            None
        }
    };

    // And the catalogue records, so the song, album and artist exist in the
    // repo too. Each fails independently: a missing album record must not lose
    // the scrobble.
    let created_at = crate::views::timestamp::to_iso8601(&listened_at);
    for (collection, body) in [
        (
            crate::ingest::SONG_NSID,
            records::song_record(&record, &created_at),
        ),
        (
            crate::ingest::ALBUM_NSID,
            records::album_record(&record, &created_at),
        ),
        (
            crate::ingest::ARTIST_NSID,
            records::artist_record(&record, &created_at),
        ),
    ] {
        // Skipped when the repo already holds one, which is what keeps a
        // thousand scrobbles from writing a thousand album records.
        let already = match collection {
            c if c == crate::ingest::ALBUM_NSID => known.album.is_some(),
            c if c == crate::ingest::ARTIST_NSID => known.artist.is_some(),
            _ => false,
        };
        if already {
            continue;
        }

        if let Err(err) = writer.create(collection, &records::next_tid(), &body).await {
            tracing::warn!(did, collection, error = %err, "could not publish a record");
        }
    }

    uri
}

/// Reads back the scrobble that was just written, as the feed presents it.
async fn answer(db: &Backend, scrobble_id: &str) -> XrpcResult<HttpResponse> {
    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, None);
    query
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::XataId).eq(scrobble_id))
        .limit(1);

    let Some(scrobble) = db.fetch_optional::<Scrobble>(&query).await? else {
        return json(serde_json::json!({}));
    };

    let tracks = crate::db::loaders::tracks_by_id(db, [scrobble.track_id.clone()]).await?;
    let users = crate::db::loaders::users_by_id(db, [scrobble.user_id.clone()]).await?;
    let artists = crate::db::loaders::artists_by_id(db, [scrobble.artist_id.clone()]).await?;

    let (Some(track_id), Some(user_id)) =
        (scrobble.track_id.as_deref(), scrobble.user_id.as_deref())
    else {
        return json(serde_json::json!({}));
    };
    let (Some(track), Some(user)) = (tracks.get(track_id), users.get(user_id)) else {
        return json(serde_json::json!({}));
    };

    json(crate::views::ScrobbleViewBasic::new(
        &scrobble,
        track,
        user,
        scrobble.artist_id.as_deref().and_then(|id| artists.get(id)),
        Default::default(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(seconds: i64) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::from_timestamp(seconds, 0).unwrap()
    }

    /// Two sources capitalising differently must take the *same* lock, or both
    /// publish.
    #[test]
    fn the_lock_key_ignores_case() {
        let a = put_lock_key("did:plc:alice", "Roygbiv", "Boards of Canada", at(1000));
        let b = put_lock_key("did:plc:alice", "ROYGBIV", "BOARDS OF CANADA", at(1000));
        assert_eq!(a, b);
    }

    /// And different listens must not collide.
    #[test]
    fn the_lock_key_separates_different_listens() {
        let base = put_lock_key("did:plc:alice", "Roygbiv", "Boards of Canada", at(1000));

        // A different second.
        assert_ne!(
            base,
            put_lock_key("did:plc:alice", "Roygbiv", "Boards of Canada", at(1001))
        );
        // A different user.
        assert_ne!(
            base,
            put_lock_key("did:plc:bob", "Roygbiv", "Boards of Canada", at(1000))
        );
        // A different song.
        assert_ne!(
            base,
            put_lock_key("did:plc:alice", "Olson", "Boards of Canada", at(1000))
        );
    }

    /// The identity is length-prefixed before hashing, so a title containing
    /// a separator cannot be made to collide with a different title and
    /// artist. A plain `title|artist` join fails this — which is how the bug
    /// was found.
    #[test]
    fn a_separator_in_a_title_cannot_forge_a_collision() {
        for (title_a, artist_a, title_b, artist_b) in [
            ("a|b", "c", "a", "b|c"),
            ("a:b", "c", "a", "b:c"),
            ("ab", "c", "a", "bc"),
            ("", "abc", "abc", ""),
        ] {
            assert_ne!(
                put_lock_key("did:plc:alice", title_a, artist_a, at(1000)),
                put_lock_key("did:plc:alice", title_b, artist_b, at(1000)),
                "({title_a:?}, {artist_a:?}) must not collide with ({title_b:?}, {artist_b:?})"
            );
        }
    }

    #[test]
    fn the_key_is_shaped_for_a_cache() {
        let key = put_lock_key("did:plc:alice", "Roygbiv", "Boards of Canada", at(1000));
        assert!(key.starts_with("scrobble-put:did:plc:alice:"), "{key}");
        assert!(key.ends_with(":1000"), "{key}");
        // No whitespace or newlines, which a Redis key must not contain.
        assert!(!key.chars().any(char::is_whitespace), "{key}");
    }

    #[test]
    fn title_and_artist_are_required() {
        assert!(required(&None, "title").is_err());
        assert!(required(&Some("  ".into()), "title").is_err());
        assert_eq!(
            required(&Some("  Roygbiv ".into()), "title").unwrap(),
            "Roygbiv"
        );
    }

    /// The insert and the window have to *run*, not just compile: the insert
    /// resolves the album and the artist with subqueries, and the window
    /// compares a timestamp against a TEXT column — a rendered datetime
    /// literal would match nothing and every source would scrobble twice.
    #[tokio::test]
    async fn a_scrobble_is_written_and_then_found_by_the_window() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let user_id = crate::ingest::upsert_user(&db, "did:plc:alice")
            .await
            .unwrap();

        let song = crate::ingest::SongRecord {
            title: "Roygbiv".into(),
            artist: "Boards of Canada".into(),
            album: "Music Has the Right to Children".into(),
            album_artist: "Boards of Canada".into(),
            duration: 151_000,
            created_at: at(1_000_000),
            album_art: Some("https://example.invalid/a.png".into()),
            track_number: Some(4),
            disc_number: Some(1),
            year: Some(1998),
            release_date: None,
            genre: None,
            composer: None,
            lyrics: None,
            copyright_message: None,
            label: None,
            mb_id: None,
            isrc: None,
            spotify_link: None,
            youtube_link: None,
            tidal_link: None,
            apple_music_link: None,
        };
        let track_id = crate::ingest::upsert_catalogue(&db, &song).await.unwrap();

        let scrobble_id = crate::db::new_id();
        insert_scrobble(
            &db,
            &scrobble_id,
            &user_id,
            &track_id,
            &song.album,
            &song.album_artist,
            Some("at://did:plc:alice/app.rocksky.scrobble/3k2a".into()),
            at(1_000_000),
        )
        .await
        .expect("the insert runs");

        // The subqueries resolved rather than leaving the row half-empty.
        let row: (String, Option<String>, Option<String>, String) = db
            .fetch_optional(
                &Query::select()
                    .columns([
                        Scrobbles::XataId,
                        Scrobbles::AlbumId,
                        Scrobbles::ArtistId,
                        Scrobbles::Timestamp,
                    ])
                    .from(Scrobbles::Table)
                    .take(),
            )
            .await
            .unwrap()
            .expect("one row");
        assert_eq!(row.0, scrobble_id);
        assert!(row.1.is_some(), "the album subquery resolved to NULL");
        assert!(row.2.is_some(), "the artist subquery resolved to NULL");
        assert_eq!(row.3, crate::db::format_timestamp(at(1_000_000)));

        // And a second source reporting the same listen 30 seconds later finds
        // it, which is the whole point of the window.
        let found = recent_duplicate(&db, &user_id, "ROYGBIV", "boards of canada", at(1_000_030))
            .await
            .unwrap();
        assert_eq!(found.as_deref(), Some(scrobble_id.as_str()));

        // Outside the window it does not.
        assert!(
            recent_duplicate(&db, &user_id, "Roygbiv", "Boards of Canada", at(1_000_200))
                .await
                .unwrap()
                .is_none()
        );
    }

    /// The window is symmetric, so a source reporting slightly *early* is
    /// caught as well as one reporting late.
    #[test]
    fn the_dedupe_window_reaches_both_ways() {
        assert_eq!(DEDUPE_WINDOW_SECONDS, 60);
        let now = at(10_000);
        let window = chrono::Duration::seconds(DEDUPE_WINDOW_SECONDS);
        assert_eq!((now - window).timestamp(), 9_940);
        assert_eq!((now + window).timestamp(), 10_060);
    }
}
