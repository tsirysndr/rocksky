//! Projecting `app.rocksky.like` records into `loved_tracks`.
//!
//! The hosted API writes the row itself the moment somebody clicks, so likes
//! made through the web never needed this. Everything else that writes a like
//! record — the CLI, the desktop app, a third-party client — only exists as a
//! commit on the firehose, and `repo.rs` used to skip `app.rocksky.like`
//! entirely: those likes were never indexed, and the liked counts said so.
//!
//! The projection is deliberately split so the parts that touch the network
//! are the thinnest possible layer:
//!
//! - [`write_like`] and [`write_unlike`] are pure database work — records
//!   in, rows out — which is what makes them testable against an in-memory
//!   database and safe to re-run.
//! - [`save_like`] and [`delete_like`] wrap them with the NATS announcement,
//!   mirroring the `rocksky.like` / `rocksky.unlike` events `apps/api`
//!   publishes, byte for byte in shape.
//! - [`index_subject_song`] is the one place a like goes looking for a record
//!   it names: a like carries no title, artist or duration, only a strongRef
//!   to an `app.rocksky.song`, and `loved_tracks.track_id` is NOT NULL — so a
//!   like whose song is not indexed cannot be stored at all until that song
//!   is fetched from its repository.
//!
//! This module is the *hosted* path: `rockskyd jetstream` is what writes the
//! production database. `crates/appview` has its own like ingestion (with the
//! same not-yet-indexed resolution in `materialise::resolve_like`) for
//! self-hosted instances; the two are kept apart deliberately — the appview
//! publishes no NATS events, and this module does — and row-level dedupe on
//! the record URI makes a like arriving through both harmless. They can drift
//! in resolution strategy, but never in correctness: the unique `uri` is the
//! last word on what exists.

use anyhow::Error;
use serde_json::json;

use crate::repo::{
    id_by_sha256, save_album, save_album_track, save_artist, save_artist_album, save_artist_track,
    save_user, track_by_hash_or_id,
};
use crate::schema::{LovedTracks, Tracks};
use crate::subscriber::SONG_NSID;
use crate::types::{LikeRecord, ScrobbleRecord, SongRecord};
use crate::xata::track::Track;
use rocksky_db::sea_query::{Alias, Expr, Func, OnConflict, Query};
use rocksky_db::{exec as sql, Backend};

/// The loved-track row a projection wrote, when it wrote one.
///
/// Carried out of the database rather than reconstructed from the record so
/// the NATS payload matches what `apps/api` publishes for the same like —
/// the consumers parse one spelling, not two.
#[derive(Debug, Clone)]
pub struct LikedRow {
    pub like_id: String,
    pub user_id: String,
    pub track_id: String,
    pub created_at: String,
}

/// What [`write_like`] wrote, when it wrote one.
#[derive(Debug, Clone)]
pub(crate) struct Written {
    pub row: LikedRow,
    /// `true` when an existing uri-less row for the same (user, track) was
    /// claimed instead of a new row inserted — the hosted API's own write,
    /// which has already been announced.
    pub claimed: bool,
}

/// Projects a like record, announcing it on `rocksky.like` when a row was
/// written.
///
/// Returns whether a row was written, which is what the backfill counts.
pub async fn save_like(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    record: &LikeRecord,
) -> Result<bool, Error> {
    let subject = subject_uri(record);
    let track_id = match subject.as_deref() {
        Some(subject) => match track_by_uri(pool, subject).await? {
            Some(track_id) => Some(track_id),
            // Not indexed under its URI: fetch the song record the like
            // names and match the track by identity instead.
            None => index_subject_song(pool, subject).await?,
        },
        None => None,
    };

    let uri = like_uri(did, rkey);
    match write_like(pool, did, rkey, record, track_id).await? {
        Some(written) => {
            // A claimed row is the hosted API's own like, announced there at
            // click time — a second event would double-count on the mirrors.
            if !written.claimed {
                publish(nc, "rocksky.like", &uri, &written.row).await?;
            }
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Removes the loved-track row behind a deleted like record, announcing it on
/// `rocksky.unlike` when there was one.
pub async fn delete_like(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
) -> Result<bool, Error> {
    let uri = like_uri(did, rkey);
    match write_unlike(pool, &uri).await? {
        Some(row) => {
            publish(nc, "rocksky.unlike", &uri, &row).await?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// The subject a like points at, if it has one.
///
/// A strongRef, or a bare URI string in older records.
fn subject_uri(record: &LikeRecord) -> Option<String> {
    record
        .subject
        .as_ref()
        .map(|subject| subject.uri().to_string())
        .filter(|uri| !uri.is_empty())
}

fn like_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/app.rocksky.like/{}", did, rkey)
}

/// The `tracks` row a like's subject names, found by the URI the song record
/// was stamped with.
async fn track_by_uri(pool: &Backend, subject: &str) -> Result<Option<String>, Error> {
    let query = Query::select()
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::Uri).eq(subject))
        .limit(1)
        .take();
    Ok(sql::fetch_scalar_optional::<String>(pool, &query).await?)
}

/// The loved-track row already projected for a like record's URI.
async fn loved_track_by_uri(pool: &Backend, uri: &str) -> Result<Option<String>, Error> {
    let query = Query::select()
        .column(LovedTracks::XataId)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::Uri).eq(uri))
        .limit(1)
        .take();
    Ok(sql::fetch_scalar_optional::<String>(pool, &query).await?)
}

/// Writes the loved-track row for a like, or returns `None` when there is
/// nothing to write.
///
/// `track_id` is `None` for a like whose song could not be resolved. That is
/// a skip, not an error: the like can only attach to a track that exists, and
/// inventing a row from a URI alone would create a track nothing else knows
/// about. The backfill and the live stream will both try again, so a song
/// that arrives later still picks its likes up.
pub(crate) async fn write_like(
    pool: &Backend,
    did: &str,
    rkey: &str,
    record: &LikeRecord,
    track_id: Option<String>,
) -> Result<Option<Written>, Error> {
    let uri = like_uri(did, rkey);

    // Idempotency first: at-least-once delivery and a backfill re-run must
    // not add a second row for the same like record.
    if loved_track_by_uri(pool, &uri).await?.is_some() {
        return Ok(None);
    }

    let Some(track_id) = track_id else {
        tracing::warn!(uri = %uri, "Like's song is not indexed; skipping the like");
        return Ok(None);
    };

    let Some(subject) = subject_uri(record) else {
        tracing::warn!(uri = %uri, "Like record carries no subject");
        return Ok(None);
    };
    tracing::debug!(uri = %uri, subject = %subject, "Indexing a like");

    let user_id = save_user(pool, did).await?;
    let created_at = like_created_at(record);

    // The hosted API writes its row the moment somebody clicks and only
    // backfills `uri` once the record exists. A row for this very like with
    // no URI is therefore that write, seen from the other side — claim it
    // rather than adding a second row for the same (user, track).
    let claim = Query::update()
        .table(LovedTracks::Table)
        .value(LovedTracks::Uri, uri.clone())
        .and_where(Expr::col(LovedTracks::UserId).eq(&user_id))
        .and_where(Expr::col(LovedTracks::TrackId).eq(&track_id))
        .and_where(Expr::col(LovedTracks::Uri).is_null())
        .to_owned();
    let claimed = pool.execute(&claim).await?;

    let like_id = if claimed > 0 {
        let row = Query::select()
            .column(LovedTracks::XataId)
            // `cast_timestamp`, not `cast_text`: same reason as in
            // `write_unlike` — the payload's timestamp spelling is
            // `format_timestamp`'s, not `timestamptz::text`'s.
            .expr(pool.cast_timestamp(Expr::col(LovedTracks::XataCreatedat)))
            .from(LovedTracks::Table)
            .and_where(Expr::col(LovedTracks::UserId).eq(&user_id))
            .and_where(Expr::col(LovedTracks::TrackId).eq(&track_id))
            .and_where(Expr::col(LovedTracks::Uri).eq(&uri))
            .limit(1)
            .take();
        let (like_id, row_created_at) =
            sql::fetch_optional::<(String, chrono::DateTime<chrono::Utc>)>(pool, &row)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Like {} was claimed but not found", uri))?;

        // The claimed row keeps the hosted API's click time; the event (if
        // one is ever sent) reports the row, not the record.
        return Ok(Some(Written {
            claimed: true,
            row: LikedRow {
                like_id,
                user_id,
                track_id,
                created_at: rocksky_db::format_timestamp(row_created_at),
            },
        }));
    } else {
        let like_id = rocksky_db::new_id();
        let insert = Query::insert()
            .into_table(LovedTracks::Table)
            .columns([
                LovedTracks::XataId,
                LovedTracks::UserId,
                LovedTracks::TrackId,
                LovedTracks::Uri,
                // When the like happened, not when this projection heard
                // about it — a backfill must not date years-old likes to
                // today.
                LovedTracks::XataCreatedat,
            ])
            .values_panic([
                like_id.clone().into(),
                user_id.clone().into(),
                track_id.clone().into(),
                uri.clone().into(),
                pool.timestamp_value(created_at.clone()),
            ])
            .on_conflict(OnConflict::column(LovedTracks::Uri).do_nothing().to_owned())
            .to_owned();

        // Zero rows means another projection of the same record won the race;
        // its event is already out, and a second one would double-count.
        if pool.execute(&insert).await? == 0 {
            return Ok(None);
        }
        like_id
    };

    Ok(Some(Written {
        claimed: false,
        row: LikedRow {
            like_id,
            user_id,
            track_id,
            created_at,
        },
    }))
}

/// The loved-track row behind a like record's URI, deleted.
pub(crate) async fn write_unlike(pool: &Backend, uri: &str) -> Result<Option<LikedRow>, Error> {
    // Read before deleting: the announcement names the row, and after the
    // DELETE that is no longer in the database.
    let row = Query::select()
        .column(LovedTracks::XataId)
        .column(LovedTracks::UserId)
        .column(LovedTracks::TrackId)
        // `cast_timestamp`, not `cast_text`: the payload spells timestamps
        // the way `apps/api` and the fresh-like path do (ISO-8601 via
        // `format_timestamp`), and `timestamptz::text` on Postgres answers
        // `2025-06-01 12:00:00+00` instead.
        .expr(pool.cast_timestamp(Expr::col(LovedTracks::XataCreatedat)))
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::Uri).eq(uri))
        .limit(1)
        .take();

    let Some((like_id, user_id, track_id, created_at)) =
        sql::fetch_optional::<(String, String, String, chrono::DateTime<chrono::Utc>)>(pool, &row)
            .await?
    else {
        return Ok(None);
    };

    let delete = Query::delete()
        .from_table(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::Uri).eq(uri))
        .to_owned();
    pool.execute(&delete).await?;

    Ok(Some(LikedRow {
        like_id,
        user_id,
        track_id,
        created_at: rocksky_db::format_timestamp(created_at),
    }))
}

/// The like record's own `createdAt`, as the TEXT form the date column holds.
///
/// Falls back to now for a record that omits or mangles it — the lexicon
/// makes `createdAt` required, so the fallback is for malformed records.
fn like_created_at(record: &LikeRecord) -> String {
    record
        .created_at
        .as_deref()
        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(raw).ok())
        .map(|parsed| rocksky_db::format_timestamp(parsed.with_timezone(&chrono::Utc)))
        .unwrap_or_else(rocksky_db::now_timestamp)
}

/// Announces a like or unlike in the shape `apps/api` publishes, so the
/// consumers parse one spelling.
///
/// The `user_id` and `track_id` wrappers are how `apps/api` serialises an
/// Xata relation; the mirrors read `user_id.xata_id`, not the bare string.
async fn publish(
    nc: &async_nats::Client,
    subject: &'static str,
    uri: &str,
    row: &LikedRow,
) -> Result<(), Error> {
    let payload = json!({
        "uri": uri,
        "user_id": { "xata_id": row.user_id },
        "track_id": { "xata_id": row.track_id },
        "xata_createdat": row.created_at,
        "xata_id": row.like_id,
        "xata_updatedat": row.created_at,
        "xata_version": 0,
    });
    nc.publish(subject, serde_json::to_vec(&payload)?.into())
        .await?;
    nc.flush().await?;
    Ok(())
}

/// Indexes the song record a like names, when it is not indexed already.
///
/// A like points at an `app.rocksky.song` record, and the song ingest stamps
/// that record's AT-URI on the track row — so a miss on [`track_by_uri`]
/// means the song itself was never seen. Fetch it from the repository that
/// holds it and index the track the same way a song commit would have: by
/// content hash first, then MBID, then ISRC, creating the row only when none
/// of them match.
///
/// The network lives here and only here, so everything else in this module
/// runs against an in-memory database. Failures are a skip, not an error:
/// the like stays unprojected and is picked up by a later pass.
async fn index_subject_song(pool: &Backend, subject: &str) -> Result<Option<String>, Error> {
    let parsed = parse_at_uri(subject);
    let Some((did, collection, rkey)) = parsed else {
        tracing::warn!(subject = %subject, "Like subject is not a resolvable AT-URI");
        return Ok(None);
    };
    if collection != SONG_NSID {
        tracing::warn!(subject = %subject, "Like subject is not a song record");
        return Ok(None);
    }

    let Some(song) = fetch_song_record(did, rkey).await else {
        return Ok(None);
    };

    tracing::info!(subject = %subject, title = %song.title, "Like's song is not indexed; fetching it from the PDS");
    let track_id = save_song_track(pool, &song, subject).await?;
    Ok(Some(track_id))
}

/// One record, fetched from the repository that holds it.
///
/// The same thing `playlist.rs` does for a playlist it has not seen: an
/// AT-URI names the repo, a PDS serves one record to anyone, so a reference
/// is resolvable even when the record arrived out of order.
async fn fetch_song_record(did: &str, rkey: &str) -> Option<SongRecord> {
    // Bounded, unlike the bare `Client::new()` elsewhere in this crate: this
    // fetch sits on the firehose consumer's hot path, so a hung PDS must
    // cost the like a skip, not stall ingestion.
    let client = match reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            tracing::warn!(error = %err, "Could not build an HTTP client");
            return None;
        }
    };

    let pds = match crate::profile::did_to_pds(did).await {
        Ok(pds) => pds,
        Err(err) => {
            tracing::warn!(did = %did, error = %err, "Could not resolve the PDS holding a like's song");
            return None;
        }
    };

    let response = match client
        .get(format!(
            "{}/xrpc/com.atproto.repo.getRecord?repo={}&collection={}&rkey={}",
            pds, did, SONG_NSID, rkey
        ))
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(err) => {
            tracing::warn!(did = %did, error = %err, "Could not reach the PDS holding a like's song");
            return None;
        }
    };

    if !response.status().is_success() {
        tracing::warn!(
            did = %did,
            status = %response.status(),
            "The PDS would not serve a like's song"
        );
        return None;
    }

    let body: serde_json::Value = match response.json().await {
        Ok(body) => body,
        Err(err) => {
            tracing::warn!(did = %did, error = %err, "Could not read a like's song record");
            return None;
        }
    };

    match serde_json::from_value::<SongRecord>(body["value"].clone()) {
        Ok(record) => Some(record),
        Err(err) => {
            tracing::warn!(did = %did, error = %err, "A like's song record is malformed");
            None
        }
    }
}

/// Find-or-create the catalogue rows a song record describes — the track, its
/// artist and album, and the junction rows linking them — and stamp the
/// record's AT-URI on the track.
///
/// This is the catalogue half of the song/scrobble ingest, and a like needs
/// all of it: artist and album pages reach a track through the junctions, so
/// a track created without them is invisible there until somebody scrobbles
/// it. What is deliberately left out is the per-user half — `save_user_track`'s
/// `user_tracks` rollup and its scrobble counter — because a like is not a
/// listen, and the counter bump would make it look like one.
async fn save_song_track(pool: &Backend, song: &SongRecord, uri: &str) -> Result<String, Error> {
    let hash =
        sha256::digest(format!("{} - {} - {}", song.title, song.artist, song.album).to_lowercase());
    let mb_id = song
        .mbid
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let isrc = song
        .isrc
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    if let Some(track) = pool
        .fetch_optional::<Track>(&track_by_hash_or_id(&hash, mb_id, isrc))
        .await?
    {
        // First publisher keeps its URI — see the same guard in
        // `save_user_track`.
        if track.uri.is_none() {
            let stamp = Query::update()
                .table(Tracks::Table)
                .value(Tracks::Uri, uri)
                .and_where(Expr::col(Tracks::XataId).eq(&track.xata_id))
                .and_where(Expr::col(Tracks::Uri).is_null())
                .to_owned();
            pool.execute(&stamp).await?;
        }
        return Ok(track.xata_id);
    }

    // Catalogue creation runs in one transaction, like a scrobble's: the
    // track only belongs on artist and album pages once the junction rows
    // are in, so a half-built catalogue must not be possible.
    let scrobble = ScrobbleRecord::from_song(song);
    let mut tx = pool.begin().await?;

    let artist_id = save_artist(&mut tx, scrobble.clone()).await?;
    let album_id = save_album(&mut tx, scrobble).await?;

    let insert = Query::insert()
        .into_table(Tracks::Table)
        .columns([
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
            Tracks::Label,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            song.title.clone().into(),
            song.artist.clone().into(),
            song.album.clone().into(),
            song.album_art_url.clone().into(),
            song.album_artist.clone().into(),
            song.track_number.into(),
            song.duration.into(),
            song.mbid.clone().into(),
            song.isrc.clone().into(),
            song.composer.clone().into(),
            song.lyrics.clone().into(),
            song.disc_number.into(),
            hash.clone().into(),
            song.copyright_message.clone().into(),
            uri.into(),
            song.spotify_link.clone().into(),
            song.label.clone().into(),
        ])
        .on_conflict(
            OnConflict::column(Tracks::Sha256)
                .value(
                    Tracks::Uri,
                    Func::coalesce([
                        Expr::col((Tracks::Table, Tracks::Uri)).into(),
                        Expr::col((Alias::new("excluded"), Tracks::Uri)).into(),
                    ]),
                )
                .to_owned(),
        )
        .to_owned();
    tx.execute(&insert).await?;

    // The SELECT after INSERT, not RETURNING: on a sha256 conflict the
    // insert does nothing and the existing row's id is the answer either way.
    let track_id: String = tx
        .fetch_scalar(&id_by_sha256(Tracks::Table, &hash))
        .await?
        .ok_or_else(|| anyhow::anyhow!("Track {} vanished after insert", hash))?;

    save_album_track(&mut tx, &album_id, &track_id).await?;
    save_artist_track(&mut tx, &artist_id, &track_id).await?;
    save_artist_album(&mut tx, &artist_id, &album_id).await?;

    tx.commit().await?;
    Ok(track_id)
}

/// Splits `at://<did>/<collection>/<rkey>`.
///
/// A DID, not a handle: the PDS lookup goes through the PLC directory, and a
/// handle would have to be resolved first.
fn parse_at_uri(uri: &str) -> Option<(&str, &str, &str)> {
    let rest = uri.strip_prefix("at://")?;
    let mut parts = rest.splitn(3, '/');
    let did = parts.next()?;
    let collection = parts.next()?;
    let rkey = parts.next()?;
    if !did.starts_with("did:") || collection.is_empty() || rkey.is_empty() {
        return None;
    }
    Some((did, collection, rkey))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::LikeSubject;
    use rocksky_db::sea_query::Asterisk;

    /// One user and one track, inserted directly so the projection's `save_user`
    /// finds the DID without a network round trip.
    ///
    /// The DID is minted per call: `save_user` caches did → row id in a
    /// process-wide map, and these tests each own a separate in-memory
    /// database, so a shared DID would hand one test's user id to another and
    /// trip the foreign keys.
    async fn fixture() -> (Backend, String, String, String) {
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let did = format!(
            "did:plc:alice-{}",
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let db = rocksky_db::connect_in_memory().await.unwrap();

        let user_id = rocksky_db::new_id();
        let mut sql = db.sql("INSERT INTO users (xata_id, did, handle, avatar) VALUES (");
        sql.bind(&user_id)
            .push(", ")
            .bind(&did)
            .push(", ")
            .bind("alice.test")
            .push(", ")
            .bind("a")
            .push(")");
        db.execute(&sql).await.unwrap();

        let track_id = rocksky_db::new_id();
        let mut sql = db.sql(
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, uri) VALUES (",
        );
        sql.bind(&track_id)
            .push(", ")
            .bind("Roygbiv")
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("Boards of Canada")
            .push(", ")
            .bind("Music Has the Right to Children")
            .push(", ")
            .bind(151_000i64)
            .push(", ")
            .bind("sha-roygbiv")
            .push(", ")
            .bind("at://did:plc:bob/app.rocksky.song/3song")
            .push(")");
        db.execute(&sql).await.unwrap();

        (db, did, user_id, track_id)
    }

    fn a_like(subject: LikeSubject) -> LikeRecord {
        LikeRecord {
            subject: Some(subject),
            created_at: Some("2025-06-01T12:00:00.000Z".into()),
        }
    }

    async fn count(db: &Backend, table: &str) -> i64 {
        db.count(
            &Query::select()
                .expr(db.cast_int(Func::count(Expr::col(Asterisk))))
                .from(Alias::new(table))
                .to_owned(),
        )
        .await
        .unwrap()
    }

    /// A subject that names an indexed song: the ordinary path, resolved
    /// through the URI the song ingest stamped on the track.
    #[tokio::test]
    async fn a_like_with_a_uri_subject_attaches_to_the_indexed_track() {
        let (db, did, user_id, track_id) = fixture().await;

        let row = write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Uri(
                "at://did:plc:bob/app.rocksky.song/3song".into(),
            )),
            track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
                .await
                .unwrap(),
        )
        .await
        .unwrap()
        .expect("the like should project");

        assert_eq!(row.row.user_id, user_id);
        assert_eq!(row.row.track_id, track_id);
        assert_eq!(row.row.created_at, "2025-06-01T12:00:00.000Z");
        assert_eq!(count(&db, "loved_tracks").await, 1);
    }

    /// Older records carry the subject as a bare string rather than a
    /// strongRef; both must project.
    #[tokio::test]
    async fn a_strongref_subject_and_a_plain_string_project_the_same() {
        let (db, did, _user_id, _track_id) = fixture().await;

        let strong = write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Ref(crate::types::LikeSubjectRef {
                uri: "at://did:plc:bob/app.rocksky.song/3song".into(),
                cid: Some("bafy".into()),
            })),
            track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
                .await
                .unwrap(),
        )
        .await
        .unwrap();
        assert!(strong.is_some());

        let plain = write_like(
            &db,
            &did,
            "3like2",
            &a_like(LikeSubject::Uri(
                "at://did:plc:bob/app.rocksky.song/3song".into(),
            )),
            track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
                .await
                .unwrap(),
        )
        .await
        .unwrap();
        assert!(plain.is_some());
        assert_eq!(count(&db, "loved_tracks").await, 2);
    }

    /// The fallback: with the subject song not indexed, the like is skipped —
    /// not stored against an invented track — and lands once the song has been
    /// indexed, which is what `index_subject_song` does between the two calls.
    #[tokio::test]
    async fn a_like_whose_song_is_not_indexed_is_skipped_then_picked_up() {
        let (db, did, _user_id, _track_id) = fixture().await;
        let subject = "at://did:plc:bob/app.rocksky.song/3unseen";

        // Not indexed: the resolution misses, and the like is not stored.
        let resolved = track_by_uri(&db, subject).await.unwrap();
        assert!(resolved.is_none());
        let skipped = write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Uri(subject.into())),
            resolved,
        )
        .await
        .unwrap();
        assert!(skipped.is_none());
        assert_eq!(count(&db, "loved_tracks").await, 0);

        // The song arrives (the record fetched from the PDS is indexed here,
        // the same thing `save_song_track` does for `index_subject_song`).
        let song = SongRecord {
            title: "Alpha Beta Galaxy".into(),
            artist: "Eskmo".into(),
            album: "Solar".into(),
            album_artist: "Eskmo".into(),
            duration: 200_000,
            created_at: "2025-01-01T00:00:00.000Z".into(),
            track_number: Some(1),
            disc_number: Some(1),
            genre: None,
            release_date: None,
            year: Some(2025),
            tags: Some(vec!["electronic".into()]),
            composer: None,
            lyrics: None,
            copyright_message: None,
            wiki: None,
            album_art: None,
            album_art_url: None,
            youtube_link: None,
            spotify_link: None,
            tidal_link: None,
            apple_music_link: None,
            label: None,
            mbid: None,
            isrc: None,
        };
        let indexed = save_song_track(&db, &song, subject).await.unwrap();
        assert_eq!(
            track_by_uri(&db, subject).await.unwrap().as_deref(),
            Some(indexed.as_str())
        );

        // Same like record, re-projected: now it lands.
        let row = write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Uri(subject.into())),
            track_by_uri(&db, subject).await.unwrap(),
        )
        .await
        .unwrap()
        .expect("the like should project once its song is indexed");
        assert_eq!(row.row.track_id, indexed);

        // The song's catalogue came with it: the track is reachable from
        // artist and album pages, not an orphan only loved_tracks knows.
        assert_eq!(count(&db, "artists").await, 1);
        assert_eq!(count(&db, "albums").await, 1);
        assert_eq!(count(&db, "album_tracks").await, 1);
        assert_eq!(count(&db, "artist_tracks").await, 1);
        assert_eq!(count(&db, "artist_albums").await, 1);

        // Tags become genres, and an artist row is never backfilled once it
        // exists — dropping them here would leave them empty forever.
        let genres: Option<String> = db
            .fetch_scalar(&db.sql("SELECT genres FROM artists"))
            .await
            .unwrap();
        assert!(
            genres.unwrap().contains("electronic"),
            "the song's tags should reach artists.genres"
        );
        assert_eq!(count(&db, "loved_tracks").await, 1);
    }

    /// A like whose subject is not a song record, or not an AT-URI at all,
    /// resolves to nothing — it cannot be attached, and nothing is invented.
    #[tokio::test]
    async fn an_unresolvable_subject_is_skipped() {
        let (db, did, _user_id, _track_id) = fixture().await;

        for subject in ["at://did:plc:bob/app.rocksky.album/3al", "not-a-uri"] {
            let resolved = track_by_uri(&db, subject).await.unwrap();
            let skipped = write_like(
                &db,
                &did,
                "3like",
                &a_like(LikeSubject::Uri(subject.into())),
                resolved,
            )
            .await
            .unwrap();
            assert!(skipped.is_none(), "{subject} should not project");
        }
        assert_eq!(count(&db, "loved_tracks").await, 0);
    }

    /// Re-projecting the same like record must be a no-op: at-least-once
    /// delivery and a backfill re-run both hit this.
    #[tokio::test]
    async fn reprojecting_a_like_does_not_duplicate_it() {
        let (db, did, _user_id, _track_id) = fixture().await;
        let record = a_like(LikeSubject::Uri(
            "at://did:plc:bob/app.rocksky.song/3song".into(),
        ));
        let resolved = track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
            .await
            .unwrap();

        let first = write_like(&db, &did, "3like", &record, resolved.clone())
            .await
            .unwrap()
            .expect("first projection writes");
        let again = write_like(&db, &did, "3like", &record, resolved)
            .await
            .unwrap();
        assert!(again.is_none(), "second projection is a no-op");
        assert_eq!(count(&db, "loved_tracks").await, 1);

        // And the row is the first one, untouched.
        assert_eq!(
            loved_track_by_uri(&db, &format!("at://{}/app.rocksky.like/3like", did))
                .await
                .unwrap()
                .as_deref(),
            Some(first.row.like_id.as_str())
        );
    }

    /// The hosted API writes its row before the record exists, leaving a row
    /// with no URI behind. The projection claims it rather than adding a
    /// second row for the same (user, track).
    #[tokio::test]
    async fn a_like_claims_the_uri_less_row_the_hosted_api_left_behind() {
        let (db, did, user_id, track_id) = fixture().await;

        let mut sql = db.sql("INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES (");
        sql.bind(rocksky_db::new_id())
            .push(", ")
            .bind(&user_id)
            .push(", ")
            .bind(&track_id)
            .push(")");
        db.execute(&sql).await.unwrap();

        let row = write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Uri(
                "at://did:plc:bob/app.rocksky.song/3song".into(),
            )),
            track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
                .await
                .unwrap(),
        )
        .await
        .unwrap()
        .expect("the like should project");

        assert_eq!(
            count(&db, "loved_tracks").await,
            1,
            "claimed, not duplicated"
        );
        assert!(row.claimed, "the uri-less row was claimed, not duplicated");
        assert_eq!(row.row.user_id, user_id);
        assert_eq!(row.row.track_id, track_id);
    }

    /// Deleting a like removes exactly its row, once — the second delete finds
    /// nothing, which is what an at-least-once delete event re-delivery does.
    #[tokio::test]
    async fn deleting_a_like_removes_its_row_once() {
        let (db, did, _user_id, track_id) = fixture().await;
        write_like(
            &db,
            &did,
            "3like",
            &a_like(LikeSubject::Uri(
                "at://did:plc:bob/app.rocksky.song/3song".into(),
            )),
            Some(track_id),
        )
        .await
        .unwrap()
        .expect("the like should project");

        let uri = format!("at://{}/app.rocksky.like/3like", did);
        let removed = write_unlike(&db, &uri).await.unwrap().expect("row removed");
        assert!(!removed.like_id.is_empty());
        // Same spelling the like event and apps/api use, not
        // `timestamptz::text`'s "2025-06-01 12:00:00+00".
        assert_eq!(removed.created_at, "2025-06-01T12:00:00.000Z");
        assert_eq!(count(&db, "loved_tracks").await, 0);

        assert!(write_unlike(&db, &uri).await.unwrap().is_none());
        assert_eq!(count(&db, "loved_tracks").await, 0);
    }

    /// A like record without a subject projects nothing; one without a
    /// createdAt still projects, dated to now rather than rejected.
    #[tokio::test]
    async fn a_subject_less_like_is_skipped_and_a_date_less_one_survives() {
        let (db, did, _user_id, track_id) = fixture().await;

        let no_subject = LikeRecord {
            subject: None,
            created_at: Some("2025-06-01T12:00:00.000Z".into()),
        };
        let skipped = write_like(&db, &did, "3like", &no_subject, Some(track_id.clone()))
            .await
            .unwrap();
        assert!(skipped.is_none());
        assert_eq!(count(&db, "loved_tracks").await, 0);

        let no_date = LikeRecord {
            subject: Some(LikeSubject::Uri(
                "at://did:plc:bob/app.rocksky.song/3song".into(),
            )),
            created_at: None,
        };
        let row = write_like(&db, &did, "3like", &no_date, Some(track_id))
            .await
            .unwrap()
            .expect("a like without createdAt still projects");
        assert!(!row.row.created_at.is_empty());
        assert_eq!(count(&db, "loved_tracks").await, 1);
    }

    /// The fallback's identity matching: a song record whose title differs
    /// cosmetically still lands on the row its MBID names, and never creates
    /// a duplicate track.
    #[tokio::test]
    async fn an_unindexed_song_matches_by_mbid_instead_of_creating_a_row() {
        let (db, _did, _user_id, track_id) = fixture().await;

        // The subject song is a *different* record (another user's index of
        // the same recording) whose MBID matches the existing track.
        let subject = "at://did:plc:carol/app.rocksky.song/3other";
        let song = SongRecord {
            title: "ROYGBIV".into(),
            artist: "Boards Of Canada".into(),
            album: "Music Has The Right To Children".into(),
            album_artist: "Boards Of Canada".into(),
            duration: 151_000,
            created_at: "2025-01-01T00:00:00.000Z".into(),
            track_number: None,
            disc_number: None,
            genre: None,
            release_date: None,
            year: None,
            tags: None,
            composer: None,
            lyrics: None,
            copyright_message: None,
            wiki: None,
            album_art: None,
            album_art_url: None,
            youtube_link: None,
            spotify_link: None,
            tidal_link: None,
            apple_music_link: None,
            label: None,
            mbid: Some("mb-roygbiv".into()),
            isrc: None,
        };

        let mut sql = db.sql("UPDATE tracks SET mb_id = ");
        sql.bind("mb-roygbiv")
            .push(" WHERE sha256 = ")
            .bind("sha-roygbiv");
        db.execute(&sql).await.unwrap();

        let resolved = save_song_track(&db, &song, subject).await.unwrap();
        assert_eq!(resolved, track_id, "matched by MBID, not created");
        assert_eq!(count(&db, "tracks").await, 1, "no duplicate track");

        // The row's first URI wins, though: this song record names the same
        // recording but is not the record that created the row.
        assert_eq!(
            track_by_uri(&db, "at://did:plc:bob/app.rocksky.song/3song")
                .await
                .unwrap()
                .as_deref(),
            Some(track_id.as_str())
        );
    }

    #[test]
    fn an_at_uri_splits_into_its_three_parts() {
        assert_eq!(
            parse_at_uri("at://did:plc:alice/app.rocksky.song/3song"),
            Some(("did:plc:alice", "app.rocksky.song", "3song"))
        );
        assert_eq!(parse_at_uri("https://example.invalid/x"), None);
        assert_eq!(parse_at_uri("at://did:plc:alice/app.rocksky.song"), None);
        assert_eq!(
            parse_at_uri("at://alice.example/app.rocksky.song/3song"),
            None,
            "a handle cannot drive a PLC lookup"
        );
    }

    /// The subject tolerates a strongRef, a bare string, and nothing at all.
    #[test]
    fn the_subject_is_read_from_both_record_shapes() {
        let strong = a_like(LikeSubject::Ref(crate::types::LikeSubjectRef {
            uri: "at://did:plc:bob/app.rocksky.song/3song".into(),
            cid: None,
        }));
        assert_eq!(
            subject_uri(&strong).as_deref(),
            Some("at://did:plc:bob/app.rocksky.song/3song")
        );

        let plain = a_like(LikeSubject::Uri(
            "at://did:plc:bob/app.rocksky.song/3song".into(),
        ));
        assert_eq!(
            subject_uri(&plain).as_deref(),
            Some("at://did:plc:bob/app.rocksky.song/3song")
        );

        let none = LikeRecord {
            subject: None,
            created_at: None,
        };
        assert_eq!(subject_uri(&none), None);
    }
}
