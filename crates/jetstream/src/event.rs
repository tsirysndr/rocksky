//! Materializes music events into `events`, `event_artists` and `event_rsvps`.
//!
//! A music event is two records: a `community.lexicon.calendar.event` (name,
//! dates, venue) and an `app.rocksky.event.music` whose `subject` points at it
//! (kind, genre, lineup). Only the pair is an event to Rocksky. A calendar
//! event on its own is anyone's meetup and is left alone, and both records
//! have to come from a repo listed in `EVENT_PUBLISHER_DIDS`.
//!
//! Commits are handled concurrently and the two records are separate commits,
//! so either can arrive first. The music record drives indexing: when its
//! calendar event is not indexed yet, the event is fetched from the
//! publisher's PDS. A calendar commit only refreshes a row that already
//! exists, so a calendar event seen before its music record is skipped and
//! picked up when the music record comes through.
//!
//! RSVPs (`community.lexicon.calendar.rsvp`) are accepted from any repo and
//! kept only when their subject is an indexed event.
//!
//! The same show can be published twice (both allowed repos, a re-run of the
//! script, a record re-created under a new rkey). Rows are record-backed so
//! the second one is kept, but it is marked `duplicate_of` the first when the
//! two share a fingerprint (headliner, day, venue) or an external id, and
//! readers only list canonical rows.

use std::{env, future::Future, sync::OnceLock};

use anyhow::Error;
use chrono::{DateTime, Utc};
use owo_colors::OwoColorize;
use rocksky_db::exec as sql;
use rocksky_db::models::{cast_text_expr, now_sql, text_array_value};
use rocksky_db::{Backend, Dialect};
use sea_query::{Alias, Cond, Expr, OnConflict, Order, Query, SimpleExpr};
use serde_json::Value;

use crate::{
    profile::did_to_pds,
    repo::{id_by_sha256, keep_existing, save_user},
    schema::{Artists, EventArtists, EventRsvps, Events, UserArtists},
    subscriber::{CALENDAR_EVENT_NSID, CALENDAR_RSVP_NSID, EVENT_MUSIC_NSID},
    types::{CalendarEventRecord, EventArtistRecord, EventMusicRecord, RsvpRecord},
};

/// The repos whose events are indexed when `EVENT_PUBLISHER_DIDS` is unset:
/// tsiry-sandratraina.com and rocksky.app.
pub const DEFAULT_PUBLISHER_DIDS: [&str; 2] = [
    "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
    "did:plc:vegqomyce4ssoqs7zwqvgqty",
];

/// What the rsvp lexicon declares as the default when `status` is omitted.
pub const DEFAULT_RSVP_STATUS: &str = "community.lexicon.calendar.rsvp#going";

pub fn is_event_collection(collection: &str) -> bool {
    matches!(
        collection,
        EVENT_MUSIC_NSID | CALENDAR_EVENT_NSID | CALENDAR_RSVP_NSID
    )
}

/// `EVENT_PUBLISHER_DIDS` is a comma-separated list of DIDs; blank or unset
/// means the defaults, and `*` means every repo.
pub fn parse_publishers(raw: Option<&str>) -> Vec<String> {
    let listed: Vec<String> = raw
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    if listed.is_empty() {
        DEFAULT_PUBLISHER_DIDS
            .iter()
            .map(|s| s.to_string())
            .collect()
    } else {
        listed
    }
}

fn publisher_allowed(publishers: &[String], did: &str) -> bool {
    publishers.iter().any(|p| p == "*" || p == did)
}

pub fn is_allowed_publisher(did: &str) -> bool {
    static PUBLISHERS: OnceLock<Vec<String>> = OnceLock::new();
    let publishers = PUBLISHERS
        .get_or_init(|| parse_publishers(env::var("EVENT_PUBLISHER_DIDS").ok().as_deref()));
    publisher_allowed(publishers, did)
}

pub fn calendar_event_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, CALENDAR_EVENT_NSID, rkey)
}

pub fn music_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, EVENT_MUSIC_NSID, rkey)
}

pub fn rsvp_uri(did: &str, rkey: &str) -> String {
    format!("at://{}/{}/{}", did, CALENDAR_RSVP_NSID, rkey)
}

/// `(repo, collection, rkey)` of `at://<repo>/<collection>/<rkey>`.
fn split_at_uri(uri: &str) -> Option<(&str, &str, &str)> {
    let mut parts = uri.strip_prefix("at://")?.splitn(3, '/');
    Some((parts.next()?, parts.next()?, parts.next()?))
}

fn parse_timestamp(value: Option<&str>) -> Option<DateTime<Utc>> {
    value
        .and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|d| d.with_timezone(&Utc))
}

/// A JSON document for a `jsonb` column: a cast on Postgres, plain text on
/// SQLite, NULL for `None` on both.
fn json_value(dialect: Dialect, value: Option<Value>) -> SimpleExpr {
    let Some(value) = value else {
        return Option::<String>::None.into();
    };
    let text = value.to_string();
    match dialect {
        Dialect::Postgres => Expr::val(text).cast_as(Alias::new("jsonb")),
        Dialect::Sqlite => text.into(),
    }
}

fn json_array(items: Option<&Vec<Value>>) -> Option<Value> {
    items.map(|v| Value::Array(v.clone()))
}

/// The external id providers the music lexicon names; only these take part in
/// duplicate matching, and only they are ever interpolated into SQL.
pub const EXTERNAL_ID_PROVIDERS: [&str; 7] = [
    "ticketmaster",
    "songkick",
    "bandsintown",
    "residentAdvisor",
    "setlistfm",
    "dice",
    "eventbrite",
];

/// What identifies a show: who headlines, on which day, where. Undated events
/// get no fingerprint, since two announcements by the same artist with no
/// date are not known to be the same show.
pub fn fingerprint(headliner: &str, day: Option<&str>, venue: Option<&str>) -> Option<String> {
    let day = day?;
    Some(sha256::digest(
        format!(
            "{} | {} | {}",
            headliner.trim(),
            day.trim(),
            venue.unwrap_or("").trim()
        )
        .to_lowercase(),
    ))
}

/// The first named location of a calendar event: the venue, for an in-person
/// show.
fn venue_name(locations: &Value) -> Option<String> {
    locations
        .as_array()?
        .iter()
        .find_map(|l| l.get("name").and_then(Value::as_str))
        .map(str::to_string)
}

/// The `(provider, id)` pairs of an `externalIds` object, known providers only.
fn external_ids(raw: &Value) -> Vec<(&'static str, String)> {
    EXTERNAL_ID_PROVIDERS
        .iter()
        .filter_map(|provider| {
            raw.get(provider)
                .and_then(Value::as_str)
                .filter(|v| !v.trim().is_empty())
                .map(|v| (*provider, v.trim().to_string()))
        })
        .collect()
}

/// `external_ids -> provider` as text, per dialect. `provider` is one of
/// [`EXTERNAL_ID_PROVIDERS`], never user input.
fn external_id_expr(dialect: Dialect, provider: &str) -> SimpleExpr {
    match dialect {
        Dialect::Postgres => Expr::cust(format!("\"external_ids\" ->> '{provider}'")),
        Dialect::Sqlite => Expr::cust(format!("json_extract(\"external_ids\", '$.{provider}')")),
    }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Create and update are the same write for every event collection: both
/// carry the full record and both upsert on the record's AT-URI.
pub async fn save_event_commit(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    collection: &str,
    rkey: &str,
    cid: Option<&str>,
    record: Value,
) -> Result<(), Error> {
    match collection {
        EVENT_MUSIC_NSID => {
            let record: EventMusicRecord = serde_json::from_value(record)?;
            save_event_music(pool, nc, did, rkey, cid, record).await
        }
        CALENDAR_EVENT_NSID => {
            let record: CalendarEventRecord = serde_json::from_value(record)?;
            save_calendar_event(pool, nc, did, rkey, cid, record).await
        }
        CALENDAR_RSVP_NSID => {
            let record: RsvpRecord = serde_json::from_value(record)?;
            save_rsvp(pool, nc, did, rkey, cid, record).await
        }
        _ => Ok(()),
    }
}

pub async fn delete_event_commit(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    collection: &str,
    rkey: &str,
) -> Result<(), Error> {
    match collection {
        EVENT_MUSIC_NSID => delete_event_music(pool, nc, &music_uri(did, rkey)).await,
        CALENDAR_EVENT_NSID => {
            delete_calendar_event(pool, nc, &calendar_event_uri(did, rkey)).await
        }
        CALENDAR_RSVP_NSID => delete_rsvp(pool, nc, &rsvp_uri(did, rkey)).await,
        _ => Ok(()),
    }
}

async fn publish(nc: &async_nats::Client, subject: &str, payload: &str) -> Result<(), Error> {
    nc.publish(subject.to_string(), payload.to_string().into())
        .await?;
    nc.flush().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

struct EventRow {
    id: String,
}

/// The `events` row an AT-URI names, by either of its records.
async fn load_event(pool: &Backend, uri: &str) -> Result<Option<EventRow>, Error> {
    let stmt = Query::select()
        .column((Events::Table, Events::XataId))
        .from(Events::Table)
        .cond_where(
            Cond::any()
                .add(Expr::col((Events::Table, Events::Uri)).eq(uri))
                .add(Expr::col((Events::Table, Events::MusicUri)).eq(uri)),
        )
        .limit(1)
        .take();
    let id: Option<String> = sql::fetch_scalar_optional(pool, &stmt).await?;
    Ok(id.map(|id| EventRow { id }))
}

// ---------------------------------------------------------------------------
// app.rocksky.event.music
// ---------------------------------------------------------------------------

pub async fn save_event_music(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: EventMusicRecord,
) -> Result<(), Error> {
    let Some(event_id) =
        index_music_event(pool, did, rkey, cid, record, fetch_calendar_event).await?
    else {
        return Ok(());
    };
    publish(nc, "rocksky.event.indexed", &event_id).await
}

/// Indexes a music record and returns the event's id, or `None` when the
/// record was not honoured. `fetch` loads a calendar event from its PDS by
/// `(did, rkey)` when the event is not indexed yet; injected so the write path
/// can be exercised without a network.
async fn index_music_event<F, Fut>(
    pool: &Backend,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: EventMusicRecord,
    fetch: F,
) -> Result<Option<String>, Error>
where
    F: FnOnce(String, String) -> Fut,
    Fut: Future<Output = Result<Option<(Option<String>, CalendarEventRecord)>, Error>>,
{
    let uri = music_uri(did, rkey);

    if !is_allowed_publisher(did) {
        tracing::warn!(uri = %uri, "Music event from an unlisted publisher, ignoring");
        return Ok(None);
    }

    let subject_uri = record.subject.uri.clone();
    let Some((subject_did, collection, subject_rkey)) = split_at_uri(&subject_uri) else {
        tracing::warn!(uri = %uri, subject = %subject_uri, "Music event subject is not an AT-URI");
        return Ok(None);
    };
    if collection != CALENDAR_EVENT_NSID {
        tracing::warn!(uri = %uri, subject = %subject_uri, "Music event subject is not a calendar event");
        return Ok(None);
    }
    // The calendar event is the organizer's record; it has to be from a
    // listed repo as well, or anyone's event could be annotated into the index.
    if !is_allowed_publisher(subject_did) {
        tracing::warn!(uri = %uri, subject = %subject_uri, "Calendar event from an unlisted publisher, ignoring");
        return Ok(None);
    }

    let existing = load_event(pool, &subject_uri).await?;

    let calendar = match existing {
        Some(_) => None,
        None => {
            let Some(found) = fetch(subject_did.to_string(), subject_rkey.to_string()).await?
            else {
                tracing::warn!(uri = %uri, subject = %subject_uri, "Calendar event not found on its PDS, dropping music event");
                return Ok(None);
            };
            Some(found)
        }
    };
    let owner_id = save_user(pool, subject_did).await?;

    let mut tx = pool.begin().await?;

    // A music record re-pointed at another calendar event takes its
    // annotation with it: the event it used to mark is no longer a music event.
    let detach = Query::delete()
        .from_table(Events::Table)
        .and_where(Expr::col(Events::MusicUri).eq(&uri))
        .and_where(Expr::col(Events::Uri).ne(&subject_uri))
        .to_owned();
    tx.execute(&detach).await?;

    let event_id = match (existing, calendar) {
        (Some(row), _) => {
            update_music_columns(&mut tx, &row.id, &uri, cid, &record).await?;
            row.id
        }
        (None, Some((calendar_cid, calendar))) => {
            tracing::info!(name = %calendar.name.magenta(), uri = %subject_uri, "Indexing music event");
            insert_event(
                &mut tx,
                &owner_id,
                &subject_uri,
                calendar_cid.as_deref(),
                &calendar,
                &uri,
                cid,
                &record,
            )
            .await?
        }
        (None, None) => unreachable!("a missing event is always fetched"),
    };

    replace_lineup(&mut tx, &event_id, &record.artists).await?;
    reconcile_duplicates(&mut tx, &event_id).await?;

    tx.commit().await?;

    tracing::info!(uri = %uri, event = %subject_uri, artists = record.artists.len(), "Saved music event");
    Ok(Some(event_id))
}

fn calendar_values(
    dialect: Dialect,
    cid: Option<&str>,
    record: &CalendarEventRecord,
) -> Vec<(Events, SimpleExpr)> {
    vec![
        (Events::Cid, cid.map(str::to_string).into()),
        (Events::Name, record.name.clone().into()),
        (Events::Description, record.description.clone().into()),
        (
            Events::StartsAt,
            parse_timestamp(record.starts_at.as_deref()).into(),
        ),
        (
            Events::EndsAt,
            parse_timestamp(record.ends_at.as_deref()).into(),
        ),
        (Events::Mode, record.mode.clone().into()),
        (Events::Status, record.status.clone().into()),
        (
            Events::Locations,
            json_value(dialect, json_array(record.locations.as_ref())),
        ),
        (
            Events::Uris,
            json_value(dialect, json_array(record.uris.as_ref())),
        ),
        (
            Events::CreatedAt,
            parse_timestamp(Some(&record.created_at)).into(),
        ),
    ]
}

fn music_values(
    dialect: Dialect,
    uri: &str,
    cid: Option<&str>,
    record: &EventMusicRecord,
) -> Vec<(Events, SimpleExpr)> {
    vec![
        (Events::MusicUri, uri.to_string().into()),
        (Events::MusicCid, cid.map(str::to_string).into()),
        (Events::Kind, record.kind.clone().into()),
        (Events::Genre, record.genre.clone().into()),
        (
            Events::Tags,
            text_array_value(dialect, record.tags.as_deref()),
        ),
        (
            Events::ExternalIds,
            json_value(dialect, record.external_ids.clone()),
        ),
        (Events::TicketsUrl, record.tickets_url.clone().into()),
        (Events::ImageUrl, record.image_url.clone().into()),
    ]
}

#[allow(clippy::too_many_arguments)]
async fn insert_event(
    tx: &mut rocksky_db::tx::Tx<'_>,
    owner_id: &str,
    uri: &str,
    cid: Option<&str>,
    calendar: &CalendarEventRecord,
    music_uri: &str,
    music_cid: Option<&str>,
    music: &EventMusicRecord,
) -> Result<String, Error> {
    let dialect = tx.dialect();
    let mut columns = vec![Events::XataId, Events::Uri, Events::CreatedBy];
    let mut values: Vec<SimpleExpr> = vec![
        rocksky_db::new_id().into(),
        uri.to_string().into(),
        owner_id.to_string().into(),
    ];
    let mut updated = Vec::new();
    for (column, value) in calendar_values(dialect, cid, calendar)
        .into_iter()
        .chain(music_values(dialect, music_uri, music_cid, music))
    {
        columns.push(column);
        updated.push(column);
        values.push(value);
    }

    // Two music commits for the same event can be in flight at once; the
    // second lands as an update of the first. created_by is deliberately not
    // in the SET list: the organizer owns the event forever.
    let insert = Query::insert()
        .into_table(Events::Table)
        .columns(columns)
        .values_panic(values)
        .on_conflict(
            OnConflict::column(Events::Uri)
                .update_columns(updated)
                .value(Events::XataUpdatedat, Expr::cust(now_sql(dialect)))
                .to_owned(),
        )
        .returning_col(Events::XataId)
        .to_owned();

    tx.fetch_scalar(&insert)
        .await?
        .ok_or_else(|| anyhow::anyhow!("the event upsert returned no row"))
}

async fn update_music_columns(
    tx: &mut rocksky_db::tx::Tx<'_>,
    event_id: &str,
    uri: &str,
    cid: Option<&str>,
    record: &EventMusicRecord,
) -> Result<(), Error> {
    let dialect = tx.dialect();
    let update = Query::update()
        .table(Events::Table)
        .values(music_values(dialect, uri, cid, record))
        .value(Events::XataUpdatedat, Expr::cust(now_sql(dialect)))
        .and_where(Expr::col(Events::XataId).eq(event_id))
        .to_owned();
    tx.execute(&update).await?;
    Ok(())
}

/// Rewrites the lineup wholesale: the record is the whole truth about who
/// plays, so removed artists go and the rest take the record's order.
async fn replace_lineup(
    tx: &mut rocksky_db::tx::Tx<'_>,
    event_id: &str,
    artists: &[EventArtistRecord],
) -> Result<(), Error> {
    let clear = Query::delete()
        .from_table(EventArtists::Table)
        .and_where(Expr::col(EventArtists::EventId).eq(event_id))
        .to_owned();
    tx.execute(&clear).await?;

    for (position, artist) in artists.iter().enumerate() {
        let artist_id = resolve_artist(tx, artist).await?;
        let insert = Query::insert()
            .into_table(EventArtists::Table)
            .columns([
                EventArtists::XataId,
                EventArtists::EventId,
                EventArtists::ArtistId,
                EventArtists::Name,
                EventArtists::Role,
                EventArtists::Stage,
                EventArtists::Mbid,
                EventArtists::StartsAt,
                EventArtists::Position,
            ])
            .values_panic([
                rocksky_db::new_id().into(),
                event_id.to_string().into(),
                artist_id.into(),
                artist.name.clone().into(),
                artist.role.clone().into(),
                artist.stage.clone().into(),
                artist.mbid.clone().into(),
                parse_timestamp(artist.starts_at.as_deref()).into(),
                (position as i32).into(),
            ])
            // The same artist billed twice (two sets) keeps its first billing.
            .on_conflict(
                OnConflict::columns([EventArtists::EventId, EventArtists::ArtistId])
                    .do_nothing()
                    .to_owned(),
            )
            .to_owned();
        tx.execute(&insert).await?;
    }
    Ok(())
}

/// The `artists` row a lineup entry names: by the artist record's AT-URI when
/// the record carries one (the canonical `artists.uri`, then any user's copy),
/// then by the same name hash every scrobble is matched on, inserting a bare
/// artist as a last resort so the event still links to a page.
async fn resolve_artist(
    tx: &mut rocksky_db::tx::Tx<'_>,
    artist: &EventArtistRecord,
) -> Result<String, Error> {
    if let Some(uri) = artist.uri.as_deref() {
        let by_uri = Query::select()
            .column(Artists::XataId)
            .from(Artists::Table)
            .and_where(Expr::col(Artists::Uri).eq(uri))
            .limit(1)
            .take();
        if let Some(id) = tx.fetch_scalar::<String>(&by_uri).await? {
            return Ok(id);
        }
        let by_user_artist = Query::select()
            .column(UserArtists::ArtistId)
            .from(UserArtists::Table)
            .and_where(Expr::col(UserArtists::Uri).eq(uri))
            .limit(1)
            .take();
        if let Some(id) = tx.fetch_scalar::<String>(&by_user_artist).await? {
            return Ok(id);
        }
    }

    // The same hash `repo::save_artist` keys artists on, so a scrobbled artist
    // and a billed one land on one row.
    let hash = sha256::digest(artist.name.to_lowercase());
    if let Some(id) = tx
        .fetch_scalar::<String>(&id_by_sha256(Artists::Table, &hash))
        .await?
    {
        return Ok(id);
    }

    tracing::info!(name = %artist.name, "Creating artist for event lineup");
    let insert = Query::insert()
        .into_table(Artists::Table)
        .columns([
            Artists::XataId,
            Artists::Name,
            Artists::Sha256,
            Artists::Uri,
            Artists::Picture,
            Artists::Genres,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            artist.name.clone().into(),
            hash.into(),
            Option::<String>::None.into(),
            "".into(),
            text_array_value(tx.dialect(), None),
        ])
        .on_conflict(keep_existing(Artists::Table, Artists::Sha256))
        .returning_col(Artists::XataId)
        .to_owned();

    tx.fetch_scalar(&insert)
        .await?
        .ok_or_else(|| anyhow::anyhow!("the artist insert returned no row"))
}

/// Recomputes the event's fingerprint from what is now in the row and points
/// it at the earliest canonical event describing the same show, if any. Runs
/// after every write of either record, since a date, venue, headliner or
/// external id change can make or break a match. An event that already has
/// duplicates folded onto it stays canonical.
async fn reconcile_duplicates(
    tx: &mut rocksky_db::tx::Tx<'_>,
    event_id: &str,
) -> Result<(), Error> {
    let dialect = tx.dialect();

    let row = Query::select()
        .expr(cast_text_expr(dialect, Expr::col(Events::StartsAt)))
        .expr(cast_text_expr(dialect, Expr::col(Events::Locations)))
        .expr(cast_text_expr(dialect, Expr::col(Events::ExternalIds)))
        .from(Events::Table)
        .and_where(Expr::col(Events::XataId).eq(event_id))
        .take();
    let Some((starts_at, locations, external)) = tx
        .fetch_optional::<(Option<String>, Option<String>, Option<String>)>(&row)
        .await?
    else {
        return Ok(());
    };

    let headliner_query = Query::select()
        .column(EventArtists::Name)
        .from(EventArtists::Table)
        .and_where(Expr::col(EventArtists::EventId).eq(event_id))
        .order_by(EventArtists::Position, Order::Asc)
        .limit(1)
        .take();
    let headliner: Option<String> = tx.fetch_scalar(&headliner_query).await?;

    // Both backends render the timestamp with the date first; the day is all
    // the fingerprint wants.
    let day = starts_at.as_deref().and_then(|s| s.get(..10));
    let venue = locations
        .as_deref()
        .and_then(|l| serde_json::from_str::<Value>(l).ok())
        .and_then(|l| venue_name(&l));
    let fp = headliner
        .as_deref()
        .and_then(|h| fingerprint(h, day, venue.as_deref()));
    let ids = external
        .as_deref()
        .and_then(|e| serde_json::from_str::<Value>(e).ok())
        .map(|e| external_ids(&e))
        .unwrap_or_default();

    let mut matches = Cond::any();
    if let Some(fp) = &fp {
        matches = matches.add(Expr::col(Events::Sha256).eq(fp.as_str()));
    }
    for (provider, value) in &ids {
        matches = matches.add(external_id_expr(dialect, provider).eq(value.as_str()));
    }

    let canonical: Option<String> = if fp.is_none() && ids.is_empty() {
        None
    } else {
        let find = Query::select()
            .column(Events::XataId)
            .from(Events::Table)
            .and_where(Expr::col(Events::XataId).ne(event_id))
            .and_where(Expr::col(Events::DuplicateOf).is_null())
            .cond_where(matches)
            .order_by(Events::XataCreatedat, Order::Asc)
            .limit(1)
            .take();
        tx.fetch_scalar(&find).await?
    };

    let dependents = Query::select()
        .expr(Expr::col(Events::XataId).count())
        .from(Events::Table)
        .and_where(Expr::col(Events::DuplicateOf).eq(event_id))
        .take();
    let has_dependents = tx.fetch_scalar::<i64>(&dependents).await?.unwrap_or(0) > 0;
    let duplicate_of = if has_dependents { None } else { canonical };

    if let Some(target) = &duplicate_of {
        tracing::info!(event = %event_id, canonical = %target, "Event folded onto an existing one");
    }

    let update = Query::update()
        .table(Events::Table)
        .value(Events::Sha256, fp)
        .value(Events::DuplicateOf, duplicate_of)
        .and_where(Expr::col(Events::XataId).eq(event_id))
        .to_owned();
    tx.execute(&update).await?;
    Ok(())
}

/// Loads a calendar event record from the repo's PDS.
async fn fetch_calendar_event(
    did: String,
    rkey: String,
) -> Result<Option<(Option<String>, CalendarEventRecord)>, Error> {
    let pds = did_to_pds(&did).await?;
    let response = reqwest::Client::new()
        .get(format!(
            "{}/xrpc/com.atproto.repo.getRecord",
            pds.trim_end_matches('/')
        ))
        .query(&[
            ("repo", did.as_str()),
            ("collection", CALENDAR_EVENT_NSID),
            ("rkey", rkey.as_str()),
        ])
        .header("Accept", "application/json")
        .send()
        .await?;
    if !response.status().is_success() {
        tracing::warn!(did = %did, rkey = %rkey, status = %response.status(), "Could not fetch calendar event");
        return Ok(None);
    }
    let body: Value = response.json().await?;
    let record: CalendarEventRecord = serde_json::from_value(body["value"].clone())?;
    Ok(Some((body["cid"].as_str().map(String::from), record)))
}

pub async fn delete_event_music(
    pool: &Backend,
    nc: &async_nats::Client,
    uri: &str,
) -> Result<(), Error> {
    if let Some(event_uri) = remove_event(pool, Events::MusicUri, uri).await? {
        tracing::info!(uri = %uri, event = %event_uri, "Music event deleted");
        publish(nc, "rocksky.event.deleted", &event_uri).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// community.lexicon.calendar.event
// ---------------------------------------------------------------------------

pub async fn save_calendar_event(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: CalendarEventRecord,
) -> Result<(), Error> {
    let Some(event_id) = refresh_calendar_event(pool, did, rkey, cid, record).await? else {
        return Ok(());
    };
    publish(nc, "rocksky.event.indexed", &event_id).await
}

/// Refreshes the calendar half of an indexed event. Returns `None`, writing
/// nothing, when the event is not indexed: without a music record it is not a
/// music event, and the music record fetches the latest calendar record when
/// it arrives anyway.
async fn refresh_calendar_event(
    pool: &Backend,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: CalendarEventRecord,
) -> Result<Option<String>, Error> {
    let uri = calendar_event_uri(did, rkey);
    if !is_allowed_publisher(did) {
        tracing::debug!(uri = %uri, "Calendar event from an unlisted publisher, ignoring");
        return Ok(None);
    }
    let Some(event) = load_event(pool, &uri).await? else {
        tracing::debug!(uri = %uri, "Calendar event has no music record, skipping");
        return Ok(None);
    };

    let mut tx = pool.begin().await?;
    let dialect = tx.dialect();
    let update = Query::update()
        .table(Events::Table)
        .values(calendar_values(dialect, cid, &record))
        .value(Events::XataUpdatedat, Expr::cust(now_sql(dialect)))
        .and_where(Expr::col(Events::XataId).eq(&event.id))
        .to_owned();
    tx.execute(&update).await?;
    reconcile_duplicates(&mut tx, &event.id).await?;
    tx.commit().await?;

    tracing::info!(name = %record.name.magenta(), uri = %uri, "Refreshed event");
    Ok(Some(event.id))
}

pub async fn delete_calendar_event(
    pool: &Backend,
    nc: &async_nats::Client,
    uri: &str,
) -> Result<(), Error> {
    if let Some(event_uri) = remove_event(pool, Events::Uri, uri).await? {
        tracing::info!(uri = %uri, "Calendar event deleted");
        publish(nc, "rocksky.event.deleted", &event_uri).await?;
    }
    Ok(())
}

/// Deletes the event one of its records names and returns the calendar
/// event's AT-URI. Lineup and RSVPs go with it through ON DELETE CASCADE.
async fn remove_event(pool: &Backend, by: Events, uri: &str) -> Result<Option<String>, Error> {
    let find = Query::select()
        .columns([Events::XataId, Events::Uri])
        .from(Events::Table)
        .and_where(Expr::col(by).eq(uri))
        .limit(1)
        .take();
    let Some((id, event_uri)) = sql::fetch_optional::<(String, String)>(pool, &find).await? else {
        return Ok(None);
    };
    let delete = Query::delete()
        .from_table(Events::Table)
        .and_where(Expr::col(Events::XataId).eq(&id))
        .to_owned();
    sql::execute(pool, &delete).await?;
    Ok(Some(event_uri))
}

// ---------------------------------------------------------------------------
// community.lexicon.calendar.rsvp
// ---------------------------------------------------------------------------

pub async fn save_rsvp(
    pool: &Backend,
    nc: &async_nats::Client,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: RsvpRecord,
) -> Result<(), Error> {
    let Some(event_id) = upsert_rsvp(pool, did, rkey, cid, record).await? else {
        return Ok(());
    };
    publish(nc, "rocksky.event.rsvp", &event_id).await
}

/// One row per (event, user): a user's newest rsvp record replaces their
/// earlier one. Returns the event id, or `None` when the subject is not an
/// indexed event.
async fn upsert_rsvp(
    pool: &Backend,
    did: &str,
    rkey: &str,
    cid: Option<&str>,
    record: RsvpRecord,
) -> Result<Option<String>, Error> {
    let uri = rsvp_uri(did, rkey);
    let Some(event) = load_event(pool, &record.subject.uri).await? else {
        tracing::debug!(uri = %uri, subject = %record.subject.uri, "RSVP to an event that is not indexed, skipping");
        return Ok(None);
    };
    let status = record
        .status
        .unwrap_or_else(|| DEFAULT_RSVP_STATUS.to_string());
    let user_id = save_user(pool, did).await?;

    let mut tx = pool.begin().await?;
    let dialect = tx.dialect();

    // The record re-pointed at another event: it no longer counts for the
    // old one, and keeping that row would trip the uri uniqueness below.
    let detach = Query::delete()
        .from_table(EventRsvps::Table)
        .and_where(Expr::col(EventRsvps::Uri).eq(&uri))
        .and_where(Expr::col(EventRsvps::EventId).ne(&event.id))
        .to_owned();
    tx.execute(&detach).await?;

    let upsert = Query::insert()
        .into_table(EventRsvps::Table)
        .columns([
            EventRsvps::XataId,
            EventRsvps::EventId,
            EventRsvps::UserId,
            EventRsvps::Uri,
            EventRsvps::Cid,
            EventRsvps::Status,
        ])
        .values_panic([
            rocksky_db::new_id().into(),
            event.id.clone().into(),
            user_id.into(),
            uri.clone().into(),
            cid.map(str::to_string).into(),
            status.clone().into(),
        ])
        .on_conflict(
            OnConflict::columns([EventRsvps::EventId, EventRsvps::UserId])
                .update_columns([EventRsvps::Uri, EventRsvps::Cid, EventRsvps::Status])
                .value(EventRsvps::XataUpdatedat, Expr::cust(now_sql(dialect)))
                .to_owned(),
        )
        .to_owned();
    tx.execute(&upsert).await?;
    tx.commit().await?;

    tracing::info!(uri = %uri, event = %record.subject.uri, status = %status, "Saved RSVP");
    Ok(Some(event.id))
}

pub async fn delete_rsvp(pool: &Backend, nc: &async_nats::Client, uri: &str) -> Result<(), Error> {
    let find = Query::select()
        .column(EventRsvps::EventId)
        .from(EventRsvps::Table)
        .and_where(Expr::col(EventRsvps::Uri).eq(uri))
        .limit(1)
        .take();
    let Some(event_id) = sql::fetch_scalar_optional::<String>(pool, &find).await? else {
        return Ok(());
    };
    let delete = Query::delete()
        .from_table(EventRsvps::Table)
        .and_where(Expr::col(EventRsvps::Uri).eq(uri))
        .to_owned();
    sql::execute(pool, &delete).await?;
    tracing::info!(uri = %uri, "Deleted RSVP");
    publish(nc, "rocksky.event.rsvp", &event_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_defaults_apply_when_nothing_is_configured() {
        assert_eq!(parse_publishers(None), DEFAULT_PUBLISHER_DIDS.to_vec());
        assert_eq!(
            parse_publishers(Some(" , ")),
            DEFAULT_PUBLISHER_DIDS.to_vec()
        );
    }

    #[test]
    fn a_configured_list_replaces_the_defaults() {
        let list = parse_publishers(Some("did:plc:a, did:plc:b,"));
        assert_eq!(list, vec!["did:plc:a", "did:plc:b"]);
        assert!(publisher_allowed(&list, "did:plc:a"));
        assert!(!publisher_allowed(&list, DEFAULT_PUBLISHER_DIDS[0]));
    }

    #[test]
    fn a_star_accepts_every_repo() {
        assert!(publisher_allowed(&["*".to_string()], "did:plc:anyone"));
    }

    #[test]
    fn the_event_collections_are_recognised() {
        assert!(is_event_collection("app.rocksky.event.music"));
        assert!(is_event_collection("community.lexicon.calendar.event"));
        assert!(is_event_collection("community.lexicon.calendar.rsvp"));
        assert!(!is_event_collection("app.rocksky.scrobble"));
    }

    #[test]
    fn the_fingerprint_ignores_case_and_needs_a_day() {
        let a = fingerprint("Calvin Harris", Some("2026-12-01"), Some("Le Trianon"));
        let b = fingerprint("calvin harris ", Some("2026-12-01"), Some("LE TRIANON"));
        assert_eq!(a, b);
        assert_ne!(
            a,
            fingerprint("Calvin Harris", Some("2026-12-02"), Some("Le Trianon"))
        );
        assert_eq!(fingerprint("Calvin Harris", None, Some("Le Trianon")), None);
    }

    #[test]
    fn only_known_external_id_providers_take_part() {
        let raw = serde_json::json!({ "ticketmaster": " tm-1 ", "unknown": "x", "dice": "" });
        assert_eq!(
            external_ids(&raw),
            vec![("ticketmaster", "tm-1".to_string())]
        );
    }

    #[test]
    fn the_venue_is_the_first_named_location() {
        let raw = serde_json::json!([
            { "$type": "community.lexicon.location.geo", "latitude": "1", "longitude": "2" },
            { "$type": "community.lexicon.location.address", "name": "Le Trianon", "country": "FR" }
        ]);
        assert_eq!(venue_name(&raw).as_deref(), Some("Le Trianon"));
    }

    #[test]
    fn splits_an_at_uri() {
        assert_eq!(
            split_at_uri("at://did:plc:abc/community.lexicon.calendar.event/3kx1"),
            Some(("did:plc:abc", "community.lexicon.calendar.event", "3kx1"))
        );
        assert_eq!(split_at_uri("https://example.com"), None);
    }
}

/// The write path against the in-memory SQLite backend: what a music record
/// does to `events`, `event_artists` and `artists`, what a calendar commit does
/// with and without it, and how RSVPs and deletes follow.
#[cfg(test)]
mod sqlite_behaviour {
    use super::*;
    use crate::schema::Users;
    use crate::types::StrongRef;
    use rocksky_db::sea_query::Query as SqQuery;

    const ORGANIZER: &str = DEFAULT_PUBLISHER_DIDS[0];
    const FAN: &str = "did:plc:fan";

    // `save_user` caches did → xata_id process-wide, so the same DID has to
    // map to the same id in every test database or a later test's foreign
    // keys point at a user that only existed in an earlier one.
    async fn db() -> Backend {
        let db = rocksky_db::connect_in_memory().await.unwrap();
        for (did, handle) in [(ORGANIZER, "organizer.test"), (FAN, "fan.test")] {
            let insert = SqQuery::insert()
                .into_table(Users::Table)
                .columns([
                    Users::XataId,
                    Users::Did,
                    Users::DisplayName,
                    Users::Handle,
                    Users::Avatar,
                ])
                .values_panic([
                    format!("rec_user_{handle}").into(),
                    did.into(),
                    handle.into(),
                    handle.into(),
                    "".into(),
                ])
                .to_owned();
            sql::execute(&db, &insert).await.unwrap();
        }
        db
    }

    async fn count(db: &Backend, table: &str) -> i64 {
        db.count(
            &SqQuery::select()
                .expr(Expr::col(Alias::new("xata_id")).count())
                .from(Alias::new(table))
                .to_owned(),
        )
        .await
        .unwrap()
    }

    fn calendar(name: &str) -> CalendarEventRecord {
        CalendarEventRecord {
            name: name.into(),
            description: Some("Doors at 8".into()),
            created_at: "2026-10-01T00:00:00.000Z".into(),
            starts_at: Some("2026-12-01T20:00:00.000Z".into()),
            ends_at: Some("2026-12-01T23:00:00.000Z".into()),
            mode: Some("community.lexicon.calendar.event#inperson".into()),
            status: Some("community.lexicon.calendar.event#scheduled".into()),
            locations: Some(vec![serde_json::json!({
                "$type": "community.lexicon.location.address",
                "name": "Le Trianon",
                "country": "FR",
                "locality": "Paris"
            })]),
            uris: None,
        }
    }

    fn music(subject: &str, artists: &[&str]) -> EventMusicRecord {
        EventMusicRecord {
            subject: StrongRef {
                uri: subject.into(),
                cid: "bafycal".into(),
            },
            kind: Some("concert".into()),
            artists: artists
                .iter()
                .enumerate()
                .map(|(i, name)| EventArtistRecord {
                    name: name.to_string(),
                    uri: None,
                    mbid: None,
                    role: Some(if i == 0 { "headliner" } else { "support" }.into()),
                    stage: None,
                    starts_at: None,
                })
                .collect(),
            genre: Some("Electronic".into()),
            tags: Some(vec!["tour".into()]),
            external_ids: Some(serde_json::json!({ "ticketmaster": "tm-1" })),
            tickets_url: None,
            image_url: None,
            created_at: "2026-10-01T00:00:00.000Z".into(),
        }
    }

    async fn fetched(
        _did: String,
        _rkey: String,
    ) -> Result<Option<(Option<String>, CalendarEventRecord)>, Error> {
        Ok(Some((
            Some("bafycal".into()),
            calendar("Calvin Harris live"),
        )))
    }

    async fn not_found(
        _did: String,
        _rkey: String,
    ) -> Result<Option<(Option<String>, CalendarEventRecord)>, Error> {
        Ok(None)
    }

    fn event_uri() -> String {
        calendar_event_uri(ORGANIZER, "ev1")
    }

    fn fetching(
        name: &'static str,
        day: &'static str,
    ) -> impl FnOnce(
        String,
        String,
    ) -> std::pin::Pin<
        Box<dyn Future<Output = Result<Option<(Option<String>, CalendarEventRecord)>, Error>>>,
    > {
        move |_, _| {
            Box::pin(async move {
                let mut record = calendar(name);
                record.starts_at = Some(format!("{day}T20:00:00.000Z"));
                record.ends_at = None;
                Ok(Some((None, record)))
            })
        }
    }

    async fn duplicate_of(db: &Backend, uri: &str) -> Option<String> {
        sql::fetch_one::<(Option<String>,)>(
            db,
            &SqQuery::select()
                .column(Events::DuplicateOf)
                .from(Events::Table)
                .and_where(Expr::col(Events::Uri).eq(uri))
                .take(),
        )
        .await
        .unwrap()
        .0
    }

    #[tokio::test]
    async fn a_music_record_indexes_its_calendar_event_and_lineup() {
        let db = db().await;
        let record = music(&event_uri(), &["Calvin Harris", "Fred again.."]);

        let id = index_music_event(&db, ORGANIZER, "mu1", Some("bafymu"), record, fetched)
            .await
            .unwrap()
            .expect("indexed");

        let row: (String, String, Option<String>, Option<String>) = sql::fetch_one(
            &db,
            &SqQuery::select()
                .columns([
                    Events::Name,
                    Events::MusicUri,
                    Events::Genre,
                    Events::Locations,
                ])
                .from(Events::Table)
                .and_where(Expr::col(Events::XataId).eq(&id))
                .take(),
        )
        .await
        .unwrap();
        assert_eq!(row.0, "Calvin Harris live");
        assert_eq!(row.1, music_uri(ORGANIZER, "mu1"));
        assert_eq!(row.2.as_deref(), Some("Electronic"));
        assert!(row.3.unwrap().contains("Le Trianon"));

        assert_eq!(count(&db, "events").await, 1);
        assert_eq!(count(&db, "event_artists").await, 2);
        assert_eq!(count(&db, "artists").await, 2);

        let lineup: Vec<(String, Option<String>, i32)> = sql::fetch_all(
            &db,
            &SqQuery::select()
                .columns([
                    EventArtists::Name,
                    EventArtists::Role,
                    EventArtists::Position,
                ])
                .from(EventArtists::Table)
                .order_by(EventArtists::Position, sea_query::Order::Asc)
                .take(),
        )
        .await
        .unwrap();
        assert_eq!(
            lineup,
            vec![
                (
                    "Calvin Harris".to_string(),
                    Some("headliner".to_string()),
                    0
                ),
                ("Fred again..".to_string(), Some("support".to_string()), 1),
            ]
        );
    }

    #[tokio::test]
    async fn the_lineup_reuses_a_scrobbled_artist_by_name_hash() {
        let db = db().await;
        let insert = SqQuery::insert()
            .into_table(Artists::Table)
            .columns([
                Artists::XataId,
                Artists::Name,
                Artists::Sha256,
                Artists::Picture,
            ])
            .values_panic([
                "rec_existing".into(),
                "Calvin Harris".into(),
                sha256::digest("calvin harris").into(),
                "".into(),
            ])
            .to_owned();
        sql::execute(&db, &insert).await.unwrap();

        let record = music(&event_uri(), &["CALVIN HARRIS"]);
        index_music_event(&db, ORGANIZER, "mu1", None, record, fetched)
            .await
            .unwrap();

        let linked: String = sql::fetch_scalar(
            &db,
            &SqQuery::select()
                .column(EventArtists::ArtistId)
                .from(EventArtists::Table)
                .take(),
        )
        .await
        .unwrap();
        assert_eq!(linked, "rec_existing");
        assert_eq!(count(&db, "artists").await, 1);
    }

    #[tokio::test]
    async fn a_republished_music_record_rewrites_the_lineup_in_place() {
        let db = db().await;
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["A", "B"]),
            fetched,
        )
        .await
        .unwrap();
        // The event is indexed now, so the second pass must not need the PDS.
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["B", "C"]),
            not_found,
        )
        .await
        .unwrap()
        .expect("still indexed");

        assert_eq!(count(&db, "events").await, 1);
        let names: Vec<String> = sql::fetch_scalars(
            &db,
            &SqQuery::select()
                .column(EventArtists::Name)
                .from(EventArtists::Table)
                .order_by(EventArtists::Position, sea_query::Order::Asc)
                .take(),
        )
        .await
        .unwrap();
        assert_eq!(names, vec!["B", "C"]);
    }

    #[tokio::test]
    async fn a_calendar_event_without_a_music_record_is_skipped() {
        let db = db().await;
        let out = refresh_calendar_event(&db, ORGANIZER, "ev1", None, calendar("Meetup"))
            .await
            .unwrap();
        assert!(out.is_none());
        assert_eq!(count(&db, "events").await, 0);
    }

    #[tokio::test]
    async fn a_calendar_commit_refreshes_an_indexed_event() {
        let db = db().await;
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["A"]),
            fetched,
        )
        .await
        .unwrap();

        let mut renamed = calendar("Calvin Harris live (moved)");
        renamed.status = Some("community.lexicon.calendar.event#rescheduled".into());
        refresh_calendar_event(&db, ORGANIZER, "ev1", Some("bafy2"), renamed)
            .await
            .unwrap()
            .expect("refreshed");

        let row: (String, Option<String>, Option<String>) = sql::fetch_one(
            &db,
            &SqQuery::select()
                .columns([Events::Name, Events::Status, Events::Cid])
                .from(Events::Table)
                .take(),
        )
        .await
        .unwrap();
        assert_eq!(row.0, "Calvin Harris live (moved)");
        assert_eq!(
            row.1.as_deref(),
            Some("community.lexicon.calendar.event#rescheduled")
        );
        assert_eq!(row.2.as_deref(), Some("bafy2"));
    }

    #[tokio::test]
    async fn a_music_record_whose_event_is_missing_from_the_pds_is_dropped() {
        let db = db().await;
        let out = index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["A"]),
            not_found,
        )
        .await
        .unwrap();
        assert!(out.is_none());
        assert_eq!(count(&db, "events").await, 0);
    }

    #[tokio::test]
    async fn a_music_record_from_an_unlisted_repo_is_ignored() {
        let db = db().await;
        let out = index_music_event(
            &db,
            "did:plc:stranger",
            "mu1",
            None,
            music(&event_uri(), &["A"]),
            fetched,
        )
        .await
        .unwrap();
        assert!(out.is_none());

        let foreign = calendar_event_uri("did:plc:stranger", "ev9");
        let out = index_music_event(
            &db,
            ORGANIZER,
            "mu2",
            None,
            music(&foreign, &["A"]),
            fetched,
        )
        .await
        .unwrap();
        assert!(
            out.is_none(),
            "an annotation cannot pull in a stranger's event"
        );
        assert_eq!(count(&db, "events").await, 0);
    }

    /// The fixture's music record carries a Ticketmaster id; these tests are
    /// about the fingerprint alone.
    fn music_without_ids(subject: &str, artists: &[&str]) -> EventMusicRecord {
        let mut record = music(subject, artists);
        record.external_ids = None;
        record
    }

    #[tokio::test]
    async fn a_second_record_for_the_same_show_is_folded_onto_the_first() {
        let db = db().await;
        let first = calendar_event_uri(ORGANIZER, "ev1");
        let second = calendar_event_uri(DEFAULT_PUBLISHER_DIDS[1], "ev7");

        let a = index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music_without_ids(&first, &["Calvin Harris"]),
            fetching("CH live", "2026-12-01"),
        )
        .await
        .unwrap()
        .unwrap();
        index_music_event(
            &db,
            DEFAULT_PUBLISHER_DIDS[1],
            "mu2",
            None,
            music_without_ids(&second, &["calvin harris"]),
            fetching("Calvin Harris @ Trianon", "2026-12-01"),
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(duplicate_of(&db, &first).await, None);
        assert_eq!(duplicate_of(&db, &second).await, Some(a.clone()));

        // A different night is a different show.
        let third = calendar_event_uri(ORGANIZER, "ev8");
        index_music_event(
            &db,
            ORGANIZER,
            "mu3",
            None,
            music_without_ids(&third, &["Calvin Harris"]),
            fetching("CH live", "2026-12-02"),
        )
        .await
        .unwrap();
        assert_eq!(duplicate_of(&db, &third).await, None);
    }

    #[tokio::test]
    async fn a_shared_external_id_folds_even_when_the_fingerprints_differ() {
        let db = db().await;
        let first = calendar_event_uri(ORGANIZER, "ev1");
        let second = calendar_event_uri(ORGANIZER, "ev2");

        let a = index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&first, &["A"]),
            fetching("Night one", "2026-12-01"),
        )
        .await
        .unwrap()
        .unwrap();
        // Different headliner spelling and venue, same Ticketmaster listing.
        index_music_event(
            &db,
            ORGANIZER,
            "mu2",
            None,
            music(&second, &["A & friends"]),
            fetching("Night one (resale)", "2026-12-01"),
        )
        .await
        .unwrap();
        assert_eq!(duplicate_of(&db, &second).await, Some(a));
    }

    #[tokio::test]
    async fn a_calendar_change_can_undo_a_match() {
        let db = db().await;
        let first = calendar_event_uri(ORGANIZER, "ev1");
        let second = calendar_event_uri(ORGANIZER, "ev2");
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music_without_ids(&first, &["A"]),
            fetching("One", "2026-12-01"),
        )
        .await
        .unwrap();
        index_music_event(
            &db,
            ORGANIZER,
            "mu2",
            None,
            music_without_ids(&second, &["A"]),
            fetching("One again", "2026-12-01"),
        )
        .await
        .unwrap();
        assert!(duplicate_of(&db, &second).await.is_some());

        let mut moved = calendar("One again");
        moved.starts_at = Some("2026-12-09T20:00:00.000Z".into());
        refresh_calendar_event(&db, ORGANIZER, "ev2", None, moved)
            .await
            .unwrap();
        assert_eq!(duplicate_of(&db, &second).await, None);
    }

    fn rsvp(subject: &str, status: Option<&str>) -> RsvpRecord {
        RsvpRecord {
            subject: StrongRef {
                uri: subject.into(),
                cid: "bafy".into(),
            },
            status: status.map(String::from),
        }
    }

    async fn statuses(db: &Backend) -> Vec<(String, String)> {
        sql::fetch_all(
            db,
            &SqQuery::select()
                .columns([EventRsvps::Uri, EventRsvps::Status])
                .from(EventRsvps::Table)
                .take(),
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn an_rsvp_links_to_the_event_and_a_newer_one_replaces_it() {
        let db = db().await;
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["A"]),
            fetched,
        )
        .await
        .unwrap();

        upsert_rsvp(&db, FAN, "r1", None, rsvp(&event_uri(), None))
            .await
            .unwrap()
            .expect("linked");
        assert_eq!(
            statuses(&db).await,
            vec![(rsvp_uri(FAN, "r1"), DEFAULT_RSVP_STATUS.to_string())]
        );

        // A later record from the same user, pointing at the music record
        // this time, is the one that counts.
        let via_music = music_uri(ORGANIZER, "mu1");
        upsert_rsvp(
            &db,
            FAN,
            "r2",
            None,
            rsvp(
                &via_music,
                Some("community.lexicon.calendar.rsvp#interested"),
            ),
        )
        .await
        .unwrap()
        .expect("linked");
        assert_eq!(
            statuses(&db).await,
            vec![(
                rsvp_uri(FAN, "r2"),
                "community.lexicon.calendar.rsvp#interested".to_string()
            )]
        );
    }

    #[tokio::test]
    async fn an_rsvp_to_an_unknown_event_is_skipped() {
        let db = db().await;
        let out = upsert_rsvp(&db, FAN, "r1", None, rsvp(&event_uri(), None))
            .await
            .unwrap();
        assert!(out.is_none());
        assert_eq!(count(&db, "event_rsvps").await, 0);
    }

    #[tokio::test]
    async fn deleting_the_music_record_drops_the_event_and_its_children() {
        let db = db().await;
        index_music_event(
            &db,
            ORGANIZER,
            "mu1",
            None,
            music(&event_uri(), &["A", "B"]),
            fetched,
        )
        .await
        .unwrap();
        upsert_rsvp(&db, FAN, "r1", None, rsvp(&event_uri(), None))
            .await
            .unwrap();

        let gone = remove_event(&db, Events::MusicUri, &music_uri(ORGANIZER, "mu1"))
            .await
            .unwrap();
        assert_eq!(gone, Some(event_uri()));
        assert_eq!(count(&db, "events").await, 0);
        assert_eq!(count(&db, "event_artists").await, 0);
        assert_eq!(count(&db, "event_rsvps").await, 0);
        // The artists themselves are catalogue rows and stay.
        assert_eq!(count(&db, "artists").await, 2);

        let again = remove_event(&db, Events::Uri, &event_uri()).await.unwrap();
        assert_eq!(again, None);
    }
}
