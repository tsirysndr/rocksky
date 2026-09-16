//! `app.rocksky.stats.*`

use crate::actors;
use crate::db::loaders::{albums_by_id, artists_by_id, tracks_by_id};
use crate::db::schema::{Albums, Artists, LovedTracks, Scrobbles, Tracks, Users};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{
    Alias, Asterisk, Expr, Func, FunctionCall, IntoTableRef, JoinType, Order, Query,
    SelectStatement, SimpleExpr,
};
use crate::state::AppState;
use crate::views::timestamp;
use crate::xrpc::json;
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.stats.getGlobalStats", get_global_stats);
    xrpc_query!(cfg, "app.rocksky.stats.getStats", get_stats);
    xrpc_query!(cfg, "app.rocksky.stats.getWrapped", get_wrapped);
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct GlobalStatsView {
    pub scrobbles: i64,
    pub users: i64,
    pub artists: i64,
    pub albums: i64,
    pub tracks: i64,
}

/// `app.rocksky.stats.getGlobalStats`
///
/// Answers zeroes on failure, as the TypeScript `catchAll(() => defaultStats)`
/// does — a stats banner showing 0 is better than a broken page.
async fn get_global_stats(state: web::Data<AppState>) -> XrpcResult<HttpResponse> {
    match load_global_stats(state.db()).await {
        Ok(view) => json(view),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve global stats");
            json(GlobalStatsView::default())
        }
    }
}

/// `count(*)` over a whole table.
fn count_all(table: impl IntoTableRef) -> SelectStatement {
    Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(table)
        .to_owned()
}

async fn load_global_stats(db: &Backend) -> Result<GlobalStatsView, sqlx::Error> {
    Ok(GlobalStatsView {
        scrobbles: db.count(&count_all(Scrobbles::Table)).await?,
        users: db.count(&count_all(Users::Table)).await?,
        artists: db.count(&count_all(Artists::Table)).await?,
        albums: db.count(&count_all(Albums::Table)).await?,
        tracks: db.count(&count_all(Tracks::Table)).await?,
    })
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetStatsParams {
    /// A DID or a handle; see [`crate::actors`].
    pub did: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatsView {
    pub scrobbles: i64,
    pub artists: i64,
    pub loved_tracks: i64,
    pub albums: i64,
    pub tracks: i64,
}

/// `app.rocksky.stats.getStats`
///
/// One listener's totals. An unknown actor answers zeroes rather than 404,
/// matching the TypeScript handler's early return.
async fn get_stats(
    state: web::Data<AppState>,
    params: web::Query<GetStatsParams>,
) -> XrpcResult<HttpResponse> {
    match load_stats(state.db(), &params.did).await {
        Ok(view) => json(view),
        Err(err) => {
            tracing::error!(error = %err, did = %params.did, "failed to retrieve stats");
            json(StatsView::default())
        }
    }
}

async fn load_stats(db: &Backend, did_or_handle: &str) -> Result<StatsView, sqlx::Error> {
    let Some(user_id) = actors::find_user_id(db, did_or_handle).await? else {
        return Ok(StatsView::default());
    };

    // `artists`, `albums` and `tracks` are distinct counts over the user's
    // scrobbles — not row counts of those tables.
    let scoped = |aggregate: FunctionCall| {
        Query::select()
            .expr(aggregate)
            .from(Scrobbles::Table)
            .and_where(Expr::col(Scrobbles::UserId).eq(&user_id))
            .to_owned()
    };

    let loved = count_all(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(&user_id))
        .to_owned();

    Ok(StatsView {
        scrobbles: db.count(&scoped(Func::count(Expr::col(Asterisk)))).await?,
        artists: db
            .count(&scoped(Func::count_distinct(Expr::col(
                Scrobbles::ArtistId,
            ))))
            .await?,
        loved_tracks: db.count(&loved).await?,
        albums: db
            .count(&scoped(Func::count_distinct(Expr::col(Scrobbles::AlbumId))))
            .await?,
        tracks: db
            .count(&scoped(Func::count_distinct(Expr::col(Scrobbles::TrackId))))
            .await?,
    })
}

// ------------------------------------------------------------- getWrapped

/// How many entries each "top" list holds, as the lexicon describes them.
const TOP_N: u64 = 5;

/// A compilation credit is not an artist anyone chose to listen to, so it is
/// kept out of the artist and genre figures — as the TypeScript query does.
const VARIOUS_ARTISTS: &str = "Various Artists";

/// The lexicon's `minimum: 2000`, and a ceiling so `year + 1` cannot overflow
/// while building the window.
const MIN_YEAR: i64 = 2000;
const MAX_YEAR: i64 = 9999;

/// How many artist rows are fetched per statement when expanding genres.
///
/// Both backends cap how many parameters one statement may bind — SQLite at
/// 32766 by default — and a heavy year can name thousands of artists.
const ARTIST_BATCH: usize = 500;

/// A wrapped is held for half an hour, as the TypeScript handler's
/// `Cache.make({ timeToLive: Duration.minutes(30) })` does.
///
/// It is the most expensive read in this file — a whole year of one listener's
/// scrobbles, aggregated nine ways — and the page it feeds does not change
/// meaningfully within half an hour, least of all for a year already over.
const WRAPPED_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Deserialize)]
pub struct GetWrappedParams {
    /// A DID or a handle; see [`crate::actors`].
    pub did: String,
    #[serde(default)]
    pub year: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    pub play_count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedArtist {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub play_count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedAlbum {
    pub id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub play_count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct WrappedGenreCount {
    pub genre: String,
    pub count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct WrappedMonthCount {
    /// 1-12.
    pub month: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct WrappedDayCount {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedMilestone {
    pub track_title: String,
    pub artist_name: String,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedView {
    pub year: i64,
    pub total_scrobbles: i64,
    pub total_listening_time_minutes: i64,
    pub top_artists: Vec<WrappedArtist>,
    pub top_tracks: Vec<WrappedTrack>,
    pub top_albums: Vec<WrappedAlbum>,
    pub top_genres: Vec<WrappedGenreCount>,
    pub scrobbles_per_month: Vec<WrappedMonthCount>,
    /// Absent rather than null for a year with no plays, which is how
    /// `JSON.stringify` drops the TypeScript handler's `undefined`. `default`
    /// so a cached copy, which was written without the key, reads back.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub most_active_day: Option<WrappedDayCount>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub most_active_hour: Option<i64>,
    pub new_artists_count: i64,
    pub longest_streak: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_scrobble: Option<WrappedMilestone>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scrobble: Option<WrappedMilestone>,
}

impl WrappedView {
    fn empty(year: i64) -> Self {
        Self {
            year,
            ..Default::default()
        }
    }
}

/// `app.rocksky.stats.getWrapped`
///
/// A year with nothing in it, or an unknown actor, answers an empty wrapped
/// for that year rather than 404 — matching the TypeScript handler, which the
/// year-in-review page renders directly.
async fn get_wrapped(
    state: web::Data<AppState>,
    params: web::Query<GetWrappedParams>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let year = match params.year {
        Some(year) if !(MIN_YEAR..=MAX_YEAR).contains(&year) => {
            return Err(XrpcError::invalid_request(format!(
                "year must be between {MIN_YEAR} and {MAX_YEAR}"
            )));
        }
        Some(year) => year,
        None => current_year(db).await?,
    };

    let key = format!("wrapped:{year}:{}", params.did);
    if let Some(cached) = state.cache().get_json::<WrappedView>(&key).await {
        return json(cached);
    }

    match load_wrapped(db, &params.did, year).await {
        Ok(view) => {
            state.cache().set_json(&key, WRAPPED_CACHE_TTL, &view).await;
            json(view)
        }
        Err(err) => {
            tracing::error!(error = %err, did = %params.did, year, "failed to retrieve wrapped stats");
            json(WrappedView::empty(year))
        }
    }
}

/// The year the database calls current, so an omitted `year` means the same
/// thing on either backend.
async fn current_year(db: &Backend) -> Result<i64, sqlx::Error> {
    // `EXTRACT(...)` is `int4` on Postgres, which sqlx will not hand back as
    // an `i64`.
    let query = Query::select().expr(db.cast_int(db.current_year())).take();
    Ok(db.fetch_scalar::<i64>(&query).await?.unwrap_or(MIN_YEAR))
}

/// Midnight UTC on 1 January, in the shape [`crate::db::format_timestamp`]
/// writes.
fn year_start(year: i64) -> String {
    format!("{year}-01-01T00:00:00.000Z")
}

/// `timestamp >= <year> AND timestamp < <year + 1>`.
///
/// Both bounds go through `timestamp_value`: a bound parameter is typed `text`
/// on Postgres and `timestamptz >= text` has no operator, so the cast has to
/// come from the backend rather than from binding a `DateTime` natively. The
/// upper bound is exclusive so a play at 23:59:59.9999 on New Year's Eve lands
/// in exactly one year.
fn within_year(db: &Backend, column: (Alias, Scrobbles), year: i64) -> SimpleExpr {
    Expr::col(column.clone())
        .gte(db.timestamp_value(year_start(year)))
        .and(Expr::col(column).lt(db.timestamp_value(year_start(year + 1))))
}

async fn load_wrapped(
    db: &Backend,
    did_or_handle: &str,
    year: i64,
) -> Result<WrappedView, sqlx::Error> {
    let Some(user_id) = actors::find_user_id(db, did_or_handle).await? else {
        return Ok(WrappedView::empty(year));
    };

    let s = Alias::new("s");
    let scoped = || {
        let mut query = Query::select();
        query
            .from_as(Scrobbles::Table, s.clone())
            .and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(&user_id))
            .and_where(within_year(db, (s.clone(), Scrobbles::Timestamp), year));
        query
    };

    let mut total = scoped();
    total.expr(Func::count(Expr::col(Asterisk)));
    let total_scrobbles = db.count(&total).await?;

    let t = Alias::new("t");
    let mut listened = scoped();
    listened
        .expr(db.cast_int(Func::coalesce([
            Func::sum(Expr::col((t.clone(), Tracks::Duration))).into(),
            Expr::val(0).into(),
        ])))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            t.clone(),
            Expr::col((t.clone(), Tracks::XataId)).equals((s.clone(), Scrobbles::TrackId)),
        );
    let listened_ms = db.fetch_scalar::<i64>(&listened).await?.unwrap_or(0);

    let times = play_times(db, &user_id, year).await?;
    let calendar = summarize(&times);

    Ok(WrappedView {
        year,
        total_scrobbles,
        // `tracks.duration` is milliseconds.
        total_listening_time_minutes: listened_ms / 60_000,
        top_artists: top_artists(db, &user_id, year).await?,
        top_tracks: top_tracks(db, &user_id, year).await?,
        top_albums: top_albums(db, &user_id, year).await?,
        top_genres: top_genres(db, &user_id, year).await?,
        scrobbles_per_month: calendar.scrobbles_per_month,
        most_active_day: calendar.most_active_day,
        most_active_hour: calendar.most_active_hour,
        new_artists_count: new_artists_count(db, &user_id, year).await?,
        longest_streak: calendar.longest_streak,
        first_scrobble: milestone(db, &user_id, year, Order::Asc).await?,
        last_scrobble: milestone(db, &user_id, year, Order::Desc).await?,
    })
}

/// `(id, plays)` for the five most played values of one `scrobbles` column.
///
/// Ties break by id, so the same year always answers the same five; the
/// TypeScript queries omit that and can reorder between calls.
async fn top_by_plays(
    db: &Backend,
    column: Scrobbles,
    user_id: &str,
    year: i64,
    exclude_various_artists: bool,
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    let s = Alias::new("s");
    let plays = db.cast_int(Func::count(Expr::col(Asterisk)));

    let mut query = Query::select();
    query
        .column((s.clone(), column))
        .expr_as(plays, Alias::new("plays"))
        .from_as(Scrobbles::Table, s.clone())
        .and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(user_id))
        .and_where(within_year(db, (s.clone(), Scrobbles::Timestamp), year))
        // A NULL grouped on its own would produce an entry with no row to
        // hydrate.
        .and_where(Expr::col((s.clone(), column)).is_not_null());

    if exclude_various_artists {
        let a = Alias::new("a");
        query
            .join_as(
                JoinType::InnerJoin,
                Artists::Table,
                a.clone(),
                Expr::col((a.clone(), Artists::XataId)).equals((s.clone(), Scrobbles::ArtistId)),
            )
            .and_where(Expr::col((a, Artists::Name)).ne(VARIOUS_ARTISTS));
    }

    query
        .group_by_col((s.clone(), column))
        .order_by(Alias::new("plays"), Order::Desc)
        .order_by((s, column), Order::Asc)
        .limit(TOP_N);

    db.fetch_all(&query).await
}

async fn top_tracks(
    db: &Backend,
    user_id: &str,
    year: i64,
) -> Result<Vec<WrappedTrack>, sqlx::Error> {
    let ranked = top_by_plays(db, Scrobbles::TrackId, user_id, year, false).await?;
    let details = tracks_by_id(db, ranked.iter().map(|(id, _)| Some(id.clone()))).await?;

    Ok(ranked
        .into_iter()
        .filter_map(|(id, play_count)| {
            let track = details.get(&id)?;
            Some(WrappedTrack {
                id: track.id.clone(),
                title: track.title.clone(),
                artist: track.artist.clone(),
                album_art: track.album_art.clone(),
                uri: track.uri.clone(),
                artist_uri: track.artist_uri.clone(),
                album_uri: track.album_uri.clone(),
                play_count,
            })
        })
        .collect())
}

async fn top_artists(
    db: &Backend,
    user_id: &str,
    year: i64,
) -> Result<Vec<WrappedArtist>, sqlx::Error> {
    let ranked = top_by_plays(db, Scrobbles::ArtistId, user_id, year, true).await?;
    let details = artists_by_id(db, ranked.iter().map(|(id, _)| Some(id.clone()))).await?;

    Ok(ranked
        .into_iter()
        .filter_map(|(id, play_count)| {
            let artist = details.get(&id)?;
            Some(WrappedArtist {
                id: artist.id.clone(),
                name: artist.name.clone(),
                picture: artist.picture.clone(),
                uri: artist.uri.clone(),
                play_count,
            })
        })
        .collect())
}

async fn top_albums(
    db: &Backend,
    user_id: &str,
    year: i64,
) -> Result<Vec<WrappedAlbum>, sqlx::Error> {
    let ranked = top_by_plays(db, Scrobbles::AlbumId, user_id, year, false).await?;
    let details = albums_by_id(db, ranked.iter().map(|(id, _)| Some(id.clone()))).await?;

    Ok(ranked
        .into_iter()
        .filter_map(|(id, play_count)| {
            let album = details.get(&id)?;
            Some(WrappedAlbum {
                id: album.id.clone(),
                title: album.title.clone(),
                artist: album.artist.clone(),
                album_art: album.album_art.clone(),
                uri: album.uri.clone(),
                play_count,
            })
        })
        .collect())
}

/// Genre counts: every play counts once towards each genre its artist carries.
///
/// The TypeScript query does this with `unnest(artists.genres)`, which only
/// Postgres has. Here the plays come back per artist and the genres are
/// expanded in Rust, which also gets the SQLite backend — where the column is
/// a JSON array rather than a `text[]` — the same answer.
async fn top_genres(
    db: &Backend,
    user_id: &str,
    year: i64,
) -> Result<Vec<WrappedGenreCount>, sqlx::Error> {
    let s = Alias::new("s");
    let a = Alias::new("a");

    let mut query = Query::select();
    query
        .column((s.clone(), Scrobbles::ArtistId))
        .expr(db.cast_int(Func::count(Expr::col(Asterisk))))
        .from_as(Scrobbles::Table, s.clone())
        .join_as(
            JoinType::InnerJoin,
            Artists::Table,
            a.clone(),
            Expr::col((a.clone(), Artists::XataId)).equals((s.clone(), Scrobbles::ArtistId)),
        )
        .and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(user_id))
        .and_where(within_year(db, (s.clone(), Scrobbles::Timestamp), year))
        .and_where(Expr::col((a, Artists::Name)).ne(VARIOUS_ARTISTS))
        .group_by_col((s, Scrobbles::ArtistId));

    let plays: Vec<(String, i64)> = db.fetch_all(&query).await?;

    let mut counts: HashMap<String, i64> = HashMap::new();
    for chunk in plays.chunks(ARTIST_BATCH) {
        let artists = artists_by_id(db, chunk.iter().map(|(id, _)| Some(id.clone()))).await?;
        for (artist_id, artist_plays) in chunk {
            let Some(artist) = artists.get(artist_id) else {
                continue;
            };
            for genre in artist.genres() {
                let genre = genre.trim();
                if genre.is_empty() {
                    continue;
                }
                *counts.entry(genre.to_string()).or_default() += artist_plays;
            }
        }
    }

    let mut ranked: Vec<WrappedGenreCount> = counts
        .into_iter()
        .map(|(genre, count)| WrappedGenreCount { genre, count })
        .collect();
    ranked.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.genre.cmp(&right.genre))
    });
    ranked.truncate(TOP_N as usize);
    Ok(ranked)
}

/// Every play in the year, oldest first.
///
/// The month, day, hour and streak figures all come out of this one column
/// scan: `DATE(...)` and `EXTRACT(HOUR FROM ...)` have no spelling both
/// backends accept, so the bucketing happens in Rust rather than in five
/// dialect-specific queries. Both read UTC, as the TypeScript ones do.
async fn play_times(
    db: &Backend,
    user_id: &str,
    year: i64,
) -> Result<Vec<DateTime<Utc>>, sqlx::Error> {
    let s = Alias::new("s");
    let mut query = Query::select();
    query
        .expr(db.cast_timestamp(Expr::col((s.clone(), Scrobbles::Timestamp))))
        .from_as(Scrobbles::Table, s.clone())
        .and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(user_id))
        .and_where(within_year(db, (s.clone(), Scrobbles::Timestamp), year))
        .order_by((s, Scrobbles::Timestamp), Order::Asc);

    db.fetch_scalars(&query).await
}

/// What [`play_times`] adds up to.
#[derive(Debug, Default, PartialEq, Eq)]
struct Calendar {
    scrobbles_per_month: Vec<WrappedMonthCount>,
    most_active_day: Option<WrappedDayCount>,
    most_active_hour: Option<i64>,
    longest_streak: i64,
}

/// Buckets the year's plays by month, day and hour.
///
/// Ties go to the earliest month, day or hour, so the answer does not move
/// between calls; the TypeScript `ORDER BY count DESC LIMIT 1` leaves that to
/// the planner.
fn summarize(times: &[DateTime<Utc>]) -> Calendar {
    let mut per_month: BTreeMap<u32, i64> = BTreeMap::new();
    let mut per_day: BTreeMap<NaiveDate, i64> = BTreeMap::new();
    let mut per_hour: BTreeMap<u32, i64> = BTreeMap::new();

    for at in times {
        *per_month.entry(at.month()).or_default() += 1;
        *per_day.entry(at.date_naive()).or_default() += 1;
        *per_hour.entry(at.hour()).or_default() += 1;
    }

    Calendar {
        scrobbles_per_month: per_month
            .into_iter()
            .map(|(month, count)| WrappedMonthCount {
                month: month as i64,
                count,
            })
            .collect(),
        most_active_day: per_day
            .iter()
            .max_by_key(|(date, count)| (**count, std::cmp::Reverse(**date)))
            .map(|(date, count)| WrappedDayCount {
                date: date.format("%Y-%m-%d").to_string(),
                count: *count,
            }),
        most_active_hour: per_hour
            .iter()
            .max_by_key(|(hour, count)| (**count, std::cmp::Reverse(**hour)))
            .map(|(hour, _)| *hour as i64),
        longest_streak: longest_streak(per_day.keys().copied()),
    }
}

/// The longest run of consecutive days with at least one play.
fn longest_streak(days: impl IntoIterator<Item = NaiveDate>) -> i64 {
    let mut longest = 0;
    let mut current = 0;
    let mut previous: Option<NaiveDate> = None;

    for day in days {
        current = match previous {
            Some(earlier) if day.signed_duration_since(earlier).num_days() == 1 => current + 1,
            _ => 1,
        };
        longest = longest.max(current);
        previous = Some(day);
    }

    longest
}

/// The year's first or last play, with the track it was.
async fn milestone(
    db: &Backend,
    user_id: &str,
    year: i64,
    order: Order,
) -> Result<Option<WrappedMilestone>, sqlx::Error> {
    let s = Alias::new("s");
    let t = Alias::new("t");

    let mut query = Query::select();
    query
        .column((t.clone(), Tracks::Title))
        .column((t.clone(), Tracks::Artist))
        .expr(db.cast_timestamp(Expr::col((s.clone(), Scrobbles::Timestamp))))
        .column((t.clone(), Tracks::Uri))
        .from_as(Scrobbles::Table, s.clone())
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            t.clone(),
            Expr::col((t.clone(), Tracks::XataId)).equals((s.clone(), Scrobbles::TrackId)),
        )
        .and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(user_id))
        .and_where(within_year(db, (s.clone(), Scrobbles::Timestamp), year))
        .order_by((s, Scrobbles::Timestamp), order)
        .limit(1);

    type MilestoneRow = (String, String, DateTime<Utc>, Option<String>);
    Ok(db.fetch_optional::<MilestoneRow>(&query).await?.map(
        |(track_title, artist_name, at, track_uri)| WrappedMilestone {
            track_title,
            artist_name,
            timestamp: timestamp::to_iso8601(&at),
            track_uri,
        },
    ))
}

/// Artists whose first play *by this listener* falls inside the year.
///
/// The whole history is grouped and the window then applied to the earliest
/// play, so an artist first heard last year is not new this year however much
/// they were played in it.
async fn new_artists_count(db: &Backend, user_id: &str, year: i64) -> Result<i64, sqlx::Error> {
    let first_play = || Func::min(Expr::col(Scrobbles::Timestamp));

    let mut earliest = Query::select();
    earliest
        .column(Scrobbles::ArtistId)
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(user_id))
        .and_where(Expr::col(Scrobbles::ArtistId).is_not_null())
        .group_by_col(Scrobbles::ArtistId)
        .and_having(
            Expr::expr(first_play())
                .gte(db.timestamp_value(year_start(year)))
                .and(Expr::expr(first_play()).lt(db.timestamp_value(year_start(year + 1)))),
        );

    let query = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from_subquery(earliest, Alias::new("artist_first"))
        .to_owned();

    db.count(&query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Alice scrobbles three plays across two tracks by one artist on one
    /// album, and loves one track. Bob scrobbles once, so the per-user counts
    /// have something to exclude.
    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            "INSERT INTO artists (xata_id, name, sha256) VALUES \
             ('rec_artist', 'Boards of Canada', 'sha-artist')",
            "INSERT INTO albums (xata_id, title, artist, sha256) VALUES \
             ('rec_album', 'MHTRTC', 'Boards of Canada', 'sha-album')",
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t1'), \
             ('rec_t2', 'Olson', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t2')",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) \
             VALUES \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_album', 'rec_artist', 'at://1', '2026-01-01T00:00:00.000Z'), \
             ('rec_s2', 'rec_alice', 'rec_t1', 'rec_album', 'rec_artist', 'at://2', '2026-01-02T00:00:00.000Z'), \
             ('rec_s3', 'rec_alice', 'rec_t2', 'rec_album', 'rec_artist', 'at://3', '2026-01-03T00:00:00.000Z'), \
             ('rec_s4', 'rec_bob',   'rec_t1', 'rec_album', 'rec_artist', 'at://4', '2026-01-04T00:00:00.000Z')",
            "INSERT INTO loved_tracks (xata_id, user_id, track_id) VALUES \
             ('rec_l1', 'rec_alice', 'rec_t1')",
        ];

        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    #[tokio::test]
    async fn global_stats_count_whole_tables() {
        let db = fixture().await;
        let view = load_global_stats(&db).await.unwrap();
        assert_eq!(
            view,
            GlobalStatsView {
                scrobbles: 4,
                users: 2,
                artists: 1,
                albums: 1,
                tracks: 2,
            }
        );
    }

    #[tokio::test]
    async fn global_stats_on_an_empty_instance_are_zero() {
        let db = db::connect_in_memory().await.unwrap();
        assert_eq!(
            load_global_stats(&db).await.unwrap(),
            GlobalStatsView::default()
        );
    }

    #[tokio::test]
    async fn per_user_stats_count_distinctly_and_exclude_other_users() {
        let db = fixture().await;
        let view = load_stats(&db, "did:plc:alice").await.unwrap();
        assert_eq!(
            view,
            StatsView {
                // Three plays, but two distinct tracks and one distinct artist
                // and album. Bob's play is not counted.
                scrobbles: 3,
                artists: 1,
                loved_tracks: 1,
                albums: 1,
                tracks: 2,
            }
        );
    }

    #[tokio::test]
    async fn per_user_stats_accept_a_handle() {
        let db = fixture().await;
        assert_eq!(
            load_stats(&db, "alice.test").await.unwrap(),
            load_stats(&db, "did:plc:alice").await.unwrap()
        );
    }

    #[tokio::test]
    async fn an_unknown_actor_gets_zeroes_not_an_error() {
        let db = fixture().await;
        assert_eq!(
            load_stats(&db, "did:plc:nobody").await.unwrap(),
            StatsView::default()
        );
    }

    #[test]
    fn loved_tracks_is_camel_cased_on_the_wire() {
        // The Rust field is snake_case but the lexicon key is `lovedTracks`.
        let json = serde_json::to_string(&StatsView::default()).unwrap();
        assert!(json.contains("\"lovedTracks\":0"), "{json}");
        assert!(!json.contains("loved_tracks"), "{json}");
    }

    // --------------------------------------------------------- getWrapped

    /// Alice plays through three years, so every figure has something it must
    /// leave out. Her 2026:
    ///
    /// | when                     | track | artist          |
    /// |--------------------------|-------|-----------------|
    /// | 2026-01-01T10:00:00.000Z | t1    | Boards of Canada|
    /// | 2026-01-02T10:00:00.000Z | t1    | Boards of Canada|
    /// | 2026-01-02T11:00:00.000Z | t2    | Boards of Canada|
    /// | 2026-03-05T22:00:00.000Z | t2    | Boards of Canada|
    /// | 2026-03-05T22:30:00.000Z | t1    | Various Artists |
    ///
    /// plus one play on 2025-12-31 and one on 2027-01-01, which are the rows
    /// the year window has to exclude, and one of Bob's.
    async fn wrapped_fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            "INSERT INTO artists (xata_id, name, sha256, picture, uri, genres) VALUES \
             ('rec_boc', 'Boards of Canada', 'sha-boc', 'boc.jpg', \
              'at://did:plc:alice/app.rocksky.artist/boc', '[\"electronic\",\"ambient\"]'), \
             ('rec_va', 'Various Artists', 'sha-va', NULL, NULL, '[\"compilation\"]')",
            "INSERT INTO albums (xata_id, title, artist, sha256, album_art, uri) VALUES \
             ('rec_album', 'MHTRTC', 'Boards of Canada', 'sha-album', 'art.jpg', \
              'at://did:plc:alice/app.rocksky.album/1')",
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, album_art, uri, \
              artist_uri, album_uri) VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', \
              120000, 'sha-t1', 'art.jpg', 'at://did:plc:alice/app.rocksky.song/1', \
              'at://did:plc:alice/app.rocksky.artist/boc', \
              'at://did:plc:alice/app.rocksky.album/1'), \
             ('rec_t2', 'Olson', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', \
              60000, 'sha-t2', 'art.jpg', 'at://did:plc:alice/app.rocksky.song/2', \
              'at://did:plc:alice/app.rocksky.artist/boc', \
              'at://did:plc:alice/app.rocksky.album/1')",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) \
             VALUES \
             ('rec_before', 'rec_alice', 'rec_t1', 'rec_album', 'rec_boc', 'at://0', '2025-12-31T23:00:00.000Z'), \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_album', 'rec_boc', 'at://1', '2026-01-01T10:00:00.000Z'), \
             ('rec_s2', 'rec_alice', 'rec_t1', 'rec_album', 'rec_boc', 'at://2', '2026-01-02T10:00:00.000Z'), \
             ('rec_s3', 'rec_alice', 'rec_t2', 'rec_album', 'rec_boc', 'at://3', '2026-01-02T11:00:00.000Z'), \
             ('rec_s4', 'rec_alice', 'rec_t2', 'rec_album', 'rec_boc', 'at://4', '2026-03-05T22:00:00.000Z'), \
             ('rec_s5', 'rec_alice', 'rec_t1', 'rec_album', 'rec_va',  'at://5', '2026-03-05T22:30:00.000Z'), \
             ('rec_after', 'rec_alice', 'rec_t1', 'rec_album', 'rec_boc', 'at://6', '2027-01-01T00:00:00.000Z'), \
             ('rec_bobs', 'rec_bob', 'rec_t1', 'rec_album', 'rec_boc', 'at://7', '2026-06-01T00:00:00.000Z')",
        ];

        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    #[tokio::test]
    async fn the_year_window_bounds_every_figure() {
        let db = wrapped_fixture().await;
        let view = load_wrapped(&db, "did:plc:alice", 2026).await.unwrap();

        // Seven of Alice's plays exist; five are in 2026.
        assert_eq!(view.total_scrobbles, 5);
        // 3 x 120000ms + 2 x 60000ms = 8 minutes.
        assert_eq!(view.total_listening_time_minutes, 8);

        // Bob's June play is not Alice's, and the 2025 and 2027 plays are not
        // this year's.
        assert_eq!(
            view.scrobbles_per_month,
            vec![
                WrappedMonthCount { month: 1, count: 3 },
                WrappedMonthCount { month: 3, count: 2 },
            ]
        );

        let neighbouring_years = [
            load_wrapped(&db, "did:plc:alice", 2025).await.unwrap(),
            load_wrapped(&db, "did:plc:alice", 2027).await.unwrap(),
        ];
        for other in neighbouring_years {
            assert_eq!(other.total_scrobbles, 1, "{other:?}");
        }

        // A year she was not listening in is empty, not an error.
        assert_eq!(
            load_wrapped(&db, "did:plc:alice", 2024).await.unwrap(),
            WrappedView::empty(2024)
        );
    }

    #[tokio::test]
    async fn the_top_lists_rank_by_plays_within_the_year() {
        let db = wrapped_fixture().await;
        let view = load_wrapped(&db, "did:plc:alice", 2026).await.unwrap();

        assert_eq!(
            view.top_tracks,
            vec![
                WrappedTrack {
                    id: "rec_t1".into(),
                    title: "Roygbiv".into(),
                    artist: "Boards of Canada".into(),
                    album_art: Some("art.jpg".into()),
                    uri: Some("at://did:plc:alice/app.rocksky.song/1".into()),
                    artist_uri: Some("at://did:plc:alice/app.rocksky.artist/boc".into()),
                    album_uri: Some("at://did:plc:alice/app.rocksky.album/1".into()),
                    play_count: 3,
                },
                WrappedTrack {
                    id: "rec_t2".into(),
                    title: "Olson".into(),
                    artist: "Boards of Canada".into(),
                    album_art: Some("art.jpg".into()),
                    uri: Some("at://did:plc:alice/app.rocksky.song/2".into()),
                    artist_uri: Some("at://did:plc:alice/app.rocksky.artist/boc".into()),
                    album_uri: Some("at://did:plc:alice/app.rocksky.album/1".into()),
                    play_count: 2,
                },
            ]
        );

        // Four plays, not five: the Various Artists credit is excluded.
        assert_eq!(
            view.top_artists,
            vec![WrappedArtist {
                id: "rec_boc".into(),
                name: "Boards of Canada".into(),
                picture: Some("boc.jpg".into()),
                uri: Some("at://did:plc:alice/app.rocksky.artist/boc".into()),
                play_count: 4,
            }]
        );

        assert_eq!(
            view.top_albums,
            vec![WrappedAlbum {
                id: "rec_album".into(),
                title: "MHTRTC".into(),
                artist: "Boards of Canada".into(),
                album_art: Some("art.jpg".into()),
                uri: Some("at://did:plc:alice/app.rocksky.album/1".into()),
                play_count: 5,
            }]
        );

        // Both of Boards of Canada's genres get its four plays; the
        // compilation credit's genre is excluded with the artist. Equal counts
        // order by name.
        assert_eq!(
            view.top_genres,
            vec![
                WrappedGenreCount {
                    genre: "ambient".into(),
                    count: 4
                },
                WrappedGenreCount {
                    genre: "electronic".into(),
                    count: 4
                },
            ]
        );
    }

    #[tokio::test]
    async fn the_calendar_figures_come_out_of_the_year() {
        let db = wrapped_fixture().await;
        let view = load_wrapped(&db, "did:plc:alice", 2026).await.unwrap();

        // 2026-01-02 and 2026-03-05 both have two plays; the earlier day wins
        // so the answer does not move between calls.
        assert_eq!(
            view.most_active_day,
            Some(WrappedDayCount {
                date: "2026-01-02".into(),
                count: 2
            })
        );
        // Hours 10 and 22 both have two; likewise the earlier.
        assert_eq!(view.most_active_hour, Some(10));
        // 1 and 2 January are consecutive; 5 March is not.
        assert_eq!(view.longest_streak, 2);

        // Boards of Canada was first heard in 2025, so only the compilation
        // credit is new in 2026.
        assert_eq!(view.new_artists_count, 1);

        assert_eq!(
            view.first_scrobble,
            Some(WrappedMilestone {
                track_title: "Roygbiv".into(),
                artist_name: "Boards of Canada".into(),
                timestamp: "2026-01-01T10:00:00.000Z".into(),
                track_uri: Some("at://did:plc:alice/app.rocksky.song/1".into()),
            })
        );
        assert_eq!(
            view.last_scrobble.as_ref().map(|m| m.timestamp.as_str()),
            Some("2026-03-05T22:30:00.000Z")
        );
    }

    #[tokio::test]
    async fn a_handle_resolves_and_an_unknown_actor_is_empty() {
        let db = wrapped_fixture().await;
        assert_eq!(
            load_wrapped(&db, "alice.test", 2026).await.unwrap(),
            load_wrapped(&db, "did:plc:alice", 2026).await.unwrap()
        );
        assert_eq!(
            load_wrapped(&db, "did:plc:nobody", 2026).await.unwrap(),
            WrappedView::empty(2026)
        );
    }

    #[tokio::test]
    async fn the_year_defaults_to_the_one_the_database_calls_current() {
        let db = db::connect_in_memory().await.unwrap();
        let year = current_year(&db).await.unwrap();
        assert_eq!(year, chrono::Utc::now().year() as i64);
    }

    /// Every key the lexicon declares, spelled as the lexicon spells it, and
    /// nothing it does not.
    #[tokio::test]
    async fn the_response_shape_matches_the_lexicon() {
        let db = wrapped_fixture().await;
        let value =
            serde_json::to_value(load_wrapped(&db, "did:plc:alice", 2026).await.unwrap()).unwrap();

        let object = value.as_object().unwrap();
        let expected = [
            "year",
            "totalScrobbles",
            "totalListeningTimeMinutes",
            "topArtists",
            "topTracks",
            "topAlbums",
            "topGenres",
            "scrobblesPerMonth",
            "mostActiveDay",
            "mostActiveHour",
            "newArtistsCount",
            "longestStreak",
            "firstScrobble",
            "lastScrobble",
        ];
        for key in expected {
            assert!(object.contains_key(key), "missing {key}: {value}");
        }
        assert_eq!(object.len(), expected.len(), "{value}");

        for key in [
            "id",
            "title",
            "artist",
            "albumArt",
            "uri",
            "artistUri",
            "albumUri",
            "playCount",
        ] {
            assert!(
                value["topTracks"][0].get(key).is_some(),
                "topTracks.{key}: {value}"
            );
        }
        for key in ["id", "name", "picture", "uri", "playCount"] {
            assert!(
                value["topArtists"][0].get(key).is_some(),
                "topArtists.{key}: {value}"
            );
        }
        for key in ["id", "title", "artist", "albumArt", "uri", "playCount"] {
            assert!(
                value["topAlbums"][0].get(key).is_some(),
                "topAlbums.{key}: {value}"
            );
        }
        assert!(value["topGenres"][0]["genre"].is_string(), "{value}");
        assert!(value["topGenres"][0]["count"].is_i64(), "{value}");
        assert!(value["scrobblesPerMonth"][0]["month"].is_i64(), "{value}");
        assert_eq!(value["mostActiveDay"]["date"], "2026-01-02");
        for key in ["trackTitle", "artistName", "timestamp", "trackUri"] {
            assert!(
                value["firstScrobble"].get(key).is_some(),
                "firstScrobble.{key}: {value}"
            );
        }
    }

    /// The optional members are absent rather than null, which is how
    /// `JSON.stringify` drops the TypeScript handler's `undefined`.
    #[test]
    fn an_empty_year_omits_what_it_has_nothing_for() {
        let value = serde_json::to_value(WrappedView::empty(2026)).unwrap();

        assert_eq!(value["year"], 2026);
        assert_eq!(value["totalScrobbles"], 0);
        assert_eq!(value["longestStreak"], 0);
        assert_eq!(value["topTracks"], serde_json::json!([]));
        for key in [
            "mostActiveDay",
            "mostActiveHour",
            "firstScrobble",
            "lastScrobble",
        ] {
            assert!(value.get(key).is_none(), "{key}: {value}");
        }
    }

    /// The reply is also what goes in the cache, so the keys it omits have to
    /// read back as absent rather than as a deserialization failure.
    #[tokio::test]
    async fn a_wrapped_survives_the_cache_encoding() {
        let db = wrapped_fixture().await;

        for view in [
            load_wrapped(&db, "did:plc:alice", 2026).await.unwrap(),
            WrappedView::empty(2026),
        ] {
            let encoded = serde_json::to_string(&view).unwrap();
            let decoded: WrappedView = serde_json::from_str(&encoded).unwrap();
            assert_eq!(decoded, view, "{encoded}");
        }
    }

    #[test]
    fn a_streak_counts_consecutive_days_only() {
        let day = |text: &str| NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap();

        assert_eq!(longest_streak(std::iter::empty()), 0);
        assert_eq!(longest_streak([day("2026-01-01")]), 1);
        assert_eq!(
            longest_streak([day("2026-01-01"), day("2026-01-03")]),
            1,
            "a gap resets the run"
        );
        assert_eq!(
            longest_streak([
                day("2026-01-01"),
                day("2026-01-02"),
                day("2026-01-03"),
                day("2026-02-01"),
                day("2026-02-02"),
            ]),
            3,
            "the longest run wins, not the last"
        );
        // Across a month boundary, and across the leap day.
        assert_eq!(longest_streak([day("2026-01-31"), day("2026-02-01")]), 2);
        assert_eq!(
            longest_streak([day("2024-02-28"), day("2024-02-29"), day("2024-03-01")]),
            3
        );
    }
}
