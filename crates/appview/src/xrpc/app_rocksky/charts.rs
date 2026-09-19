//! `app.rocksky.charts.*`
//!
//! Every method here answers an empty list on failure, matching the
//! TypeScript's `catchAll` — a chart that renders empty beats a page that
//! errors.
//!
//! Two behaviours are shared across the "top" methods and easy to lose in a
//! port:
//!
//! - **The ranking column changes with `did`.** A global chart ranks by
//!   distinct listeners; a single user's chart ranks by play count, because a
//!   one-listener chart cannot rank by unique listeners (every row would tie
//!   at 1).
//! - **`startDate`/`endDate` switch the data source.** With no range,
//!   `getTopScrobblers` reads the precomputed `top_scrobblers_mv`; with one it
//!   aggregates `scrobbles` directly.

use crate::actors;
use crate::analytics;
use crate::db::loaders::{artists_by_id, tracks_by_id};
use crate::db::schema::{Albums, Artists, Scrobbles, TopScrobblersMv, Tracks, Users};
use crate::db::Backend;
use crate::error::XrpcResult;
use crate::sea_query::{
    Alias, Expr, Func, IntoTableRef, JoinType, Order, Query, SelectStatement, SimpleExpr,
};
use crate::state::AppState;
use crate::views::timestamp;
use crate::xrpc::{clamp_limit_or, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(
        cfg,
        "app.rocksky.charts.getTopScrobblers",
        get_top_scrobblers
    );
    xrpc_query!(cfg, "app.rocksky.charts.getTopArtists", get_top_artists);
    xrpc_query!(cfg, "app.rocksky.charts.getTopTracks", get_top_tracks);
    xrpc_query!(cfg, "app.rocksky.charts.getDecades", get_decades);
    xrpc_query!(
        cfg,
        "app.rocksky.charts.getScrobblesChart",
        get_scrobbles_chart
    );
}

/// `getTopScrobblers` defaults to 20; the artist and track charts to 50.
const SCROBBLER_LIMIT: i64 = 20;
const CHART_LIMIT: i64 = 50;

/// Albums tagged outside this range are bad metadata rather than real release
/// dates, and one stray row would stretch the decade axis across centuries.
const FIRST_YEAR: i64 = 1900;

// ------------------------------------------------------- getTopScrobblers

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RangeParams {
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ScrobblerViewBasic {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
    pub scrobbles: i64,
    pub unique_artists: i64,
    pub unique_tracks: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TopScrobblersOutput {
    pub scrobblers: Vec<ScrobblerViewBasic>,
}

async fn get_top_scrobblers(
    state: web::Data<AppState>,
    params: web::Query<RangeParams>,
) -> XrpcResult<HttpResponse> {
    match load_top_scrobblers(state.db(), &params).await {
        Ok(scrobblers) => json(TopScrobblersOutput { scrobblers }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve top scrobblers");
            json(TopScrobblersOutput::default())
        }
    }
}

async fn load_top_scrobblers(
    db: &Backend,
    params: &RangeParams,
) -> Result<Vec<ScrobblerViewBasic>, sqlx::Error> {
    let limit = clamp_limit_or(params.limit, SCROBBLER_LIMIT);
    let offset = clamp_offset(params.offset);

    let u = Alias::new("u");

    let mut query = Query::select();
    query
        .expr_as(Expr::col((u.clone(), Users::XataId)), Alias::new("id"))
        .columns([
            (u.clone(), Users::Did),
            (u.clone(), Users::Handle),
            (u.clone(), Users::DisplayName),
            (u.clone(), Users::Avatar),
        ]);

    if params.start_date.is_some() || params.end_date.is_some() {
        // A date range has to aggregate the scrobbles themselves.
        let s = Alias::new("s");
        query
            .expr_as(
                db.cast_int(Func::count(Expr::col((s.clone(), Scrobbles::XataId)))),
                Alias::new("scrobbles"),
            )
            .expr_as(
                db.cast_int(Func::count_distinct(Expr::col((
                    s.clone(),
                    Scrobbles::ArtistId,
                )))),
                Alias::new("unique_artists"),
            )
            .expr_as(
                db.cast_int(Func::count_distinct(Expr::col((
                    s.clone(),
                    Scrobbles::TrackId,
                )))),
                Alias::new("unique_tracks"),
            )
            .from_as(Scrobbles::Table, s.clone())
            .join_as(
                JoinType::InnerJoin,
                Users::Table,
                u.clone(),
                Expr::col((u.clone(), Users::XataId)).equals((s.clone(), Scrobbles::UserId)),
            )
            .and_where(Expr::col((u.clone(), Users::IsBot)).eq(false));

        push_range(
            db,
            &mut query,
            (s.clone(), Scrobbles::Timestamp),
            params.start_date.as_deref(),
            params.end_date.as_deref(),
        );

        query
            // Postgres requires every selected column that is not aggregated.
            .group_by_columns([
                (u.clone(), Users::XataId),
                (u.clone(), Users::Did),
                (u.clone(), Users::Handle),
                (u.clone(), Users::DisplayName),
                (u.clone(), Users::Avatar),
            ])
            .order_by_expr(
                Func::count(Expr::col((s, Scrobbles::XataId))).into(),
                Order::Desc,
            )
            .order_by((u, Users::XataId), Order::Asc);
    } else {
        // No range: read the precomputed all-time totals.
        let m = Alias::new("m");
        query
            .expr_as(
                db.cast_int(Expr::col((m.clone(), TopScrobblersMv::Scrobbles))),
                Alias::new("scrobbles"),
            )
            .expr_as(
                db.cast_int(Expr::col((m.clone(), TopScrobblersMv::UniqueArtists))),
                Alias::new("unique_artists"),
            )
            .expr_as(
                db.cast_int(Expr::col((m.clone(), TopScrobblersMv::UniqueTracks))),
                Alias::new("unique_tracks"),
            )
            .from_as(TopScrobblersMv::Table, m.clone())
            .join_as(
                JoinType::InnerJoin,
                Users::Table,
                u.clone(),
                Expr::col((u.clone(), Users::XataId)).equals((m.clone(), TopScrobblersMv::UserId)),
            )
            .and_where(Expr::col((u.clone(), Users::IsBot)).eq(false))
            .order_by((m, TopScrobblersMv::Scrobbles), Order::Desc)
            .order_by((u, Users::XataId), Order::Asc);
    }

    query.limit(limit as u64).offset(offset as u64);
    db.fetch_all(&query).await
}

/// Adds the optional `startDate`/`endDate` bounds to a query.
fn push_range(
    db: &Backend,
    query: &mut SelectStatement,
    column: (Alias, Scrobbles),
    start: Option<&str>,
    end: Option<&str>,
) {
    if let Some(start) = start {
        query.and_where(Expr::col(column.clone()).gte(db.timestamp_value(normalize_date(start))));
    }
    if let Some(end) = end {
        query.and_where(Expr::col(column).lte(db.timestamp_value(normalize_date(end))));
    }
}

/// `new Date("2026-01-01")` in JavaScript is midnight UTC, so a bare date is
/// expanded the same way rather than left for the database to interpret.
fn normalize_date(raw: &str) -> String {
    let raw = raw.trim();
    if raw.len() == 10 && raw.matches('-').count() == 2 {
        format!("{raw}T00:00:00.000Z")
    } else {
        raw.to_string()
    }
}

// ---------------------------------------------------------- getTopArtists

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartParams {
    /// A DID or handle. Present means "this listener's chart", which also
    /// switches the ranking column.
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistViewBasic {
    pub id: String,
    pub name: String,
    pub picture: Option<String>,
    pub sha256: String,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub play_count: i64,
    pub unique_listeners: i64,
    /// `artist.genres || []`, so always an array here — unlike the artist
    /// record embedded in a scrobble detail, which reports `null`.
    pub tags: Vec<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TopArtistsOutput {
    pub artists: Vec<ArtistViewBasic>,
}

async fn get_top_artists(
    state: web::Data<AppState>,
    params: web::Query<ChartParams>,
) -> XrpcResult<HttpResponse> {
    match load_top_artists(state.db(), &params).await {
        Ok(artists) => json(TopArtistsOutput { artists }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve top artists");
            json(TopArtistsOutput::default())
        }
    }
}

/// One row of a grouped chart query: the entity id and its two counts.
#[derive(Debug, sqlx::FromRow)]
struct ChartRow {
    entity_id: Option<String>,
    plays: i64,
    unique_listeners: i64,
}

/// Which of a scrobble's foreign keys a chart groups on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChartOf {
    Artists,
    Tracks,
}

impl ChartOf {
    fn column(self) -> Scrobbles {
        match self {
            Self::Artists => Scrobbles::ArtistId,
            Self::Tracks => Scrobbles::TrackId,
        }
    }
}

/// Builds the grouped aggregate shared by the artist and track charts.
async fn chart_rows(
    db: &Backend,
    params: &ChartParams,
    of: ChartOf,
    default_limit: i64,
) -> Result<Option<Vec<ChartRow>>, sqlx::Error> {
    // Resolving the actor first: an unknown one means an empty chart, not an
    // unfiltered one.
    let user_id = match params.did.as_deref() {
        Some(did) => match actors::find_user_id(db, did).await? {
            Some(id) => Some(id),
            None => return Ok(None),
        },
        None => None,
    };

    let s = Alias::new("s");
    let group = (s.clone(), of.column());

    let mut query = Query::select();
    query
        .expr_as(Expr::col(group.clone()), Alias::new("entity_id"))
        .expr_as(
            db.cast_int(Func::count(Expr::col((s.clone(), Scrobbles::XataId)))),
            Alias::new("plays"),
        )
        .expr_as(
            db.cast_int(Func::count_distinct(Expr::col((
                s.clone(),
                Scrobbles::UserId,
            )))),
            Alias::new("unique_listeners"),
        )
        .from_as(Scrobbles::Table, s.clone());

    if of == ChartOf::Artists {
        let a = Alias::new("a");
        query
            .join_as(
                JoinType::LeftJoin,
                Artists::Table,
                a.clone(),
                Expr::col((a.clone(), Artists::XataId)).equals((s.clone(), Scrobbles::ArtistId)),
            )
            // "Various Artists" is a compilation placeholder, not an artist.
            .and_where(Expr::col((a, Artists::Name)).ne("Various Artists"));
    }

    push_range(
        db,
        &mut query,
        (s.clone(), Scrobbles::Timestamp),
        params.start_date.as_deref(),
        params.end_date.as_deref(),
    );
    if let Some(user_id) = &user_id {
        query.and_where(Expr::col((s.clone(), Scrobbles::UserId)).eq(user_id));
    }

    // A one-listener chart cannot rank by unique listeners.
    let ranking = if user_id.is_some() {
        Func::count(Expr::col((s.clone(), Scrobbles::XataId)))
    } else {
        Func::count_distinct(Expr::col((s, Scrobbles::UserId)))
    };

    query
        .group_by_col(group)
        .order_by_expr(ranking.into(), Order::Desc)
        .limit(clamp_limit_or(params.limit, default_limit) as u64)
        .offset(clamp_offset(params.offset) as u64);

    Ok(Some(db.fetch_all(&query).await?))
}

async fn load_top_artists(
    db: &Backend,
    params: &ChartParams,
) -> Result<Vec<ArtistViewBasic>, sqlx::Error> {
    let Some(rows) = chart_rows(db, params, ChartOf::Artists, CHART_LIMIT).await? else {
        return Ok(Vec::new());
    };
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let details = artists_by_id(db, rows.iter().map(|row| row.entity_id.clone())).await?;

    // The aggregate's order is the chart's order, so the details are mapped
    // back onto it rather than re-sorted.
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let detail = details.get(row.entity_id.as_deref()?)?;
            Some(ArtistViewBasic {
                id: detail.id.clone(),
                name: detail.name.clone(),
                picture: detail.picture.clone(),
                sha256: detail.sha256.clone(),
                uri: detail.uri.clone(),
                play_count: row.plays,
                unique_listeners: row.unique_listeners,
                tags: detail.genres(),
            })
        })
        .collect())
}

// ----------------------------------------------------------- getTopTracks

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongViewBasic {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album_art: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub album: String,
    pub duration: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub play_count: i64,
    pub unique_listeners: i64,
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    pub sha256: String,
    /// The track's single genre wrapped in a list, or empty.
    pub tags: Vec<String>,
    #[serde(with = "timestamp::required")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TopTracksOutput {
    pub tracks: Vec<SongViewBasic>,
}

async fn get_top_tracks(
    state: web::Data<AppState>,
    params: web::Query<ChartParams>,
) -> XrpcResult<HttpResponse> {
    match load_top_tracks(state.db(), &params).await {
        Ok(tracks) => json(TopTracksOutput { tracks }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve top tracks");
            json(TopTracksOutput::default())
        }
    }
}

async fn load_top_tracks(
    db: &Backend,
    params: &ChartParams,
) -> Result<Vec<SongViewBasic>, sqlx::Error> {
    let Some(rows) = chart_rows(db, params, ChartOf::Tracks, CHART_LIMIT).await? else {
        return Ok(Vec::new());
    };
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let details = tracks_by_id(db, rows.iter().map(|row| row.entity_id.clone())).await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let detail = details.get(row.entity_id.as_deref()?)?;
            Some(SongViewBasic {
                id: detail.id.clone(),
                title: detail.title.clone(),
                artist: detail.artist.clone(),
                album_artist: detail.album_artist.clone(),
                album_art: detail.album_art.clone(),
                uri: detail.uri.clone(),
                album: detail.album.clone(),
                duration: detail.duration,
                track_number: detail.track_number,
                disc_number: detail.disc_number,
                play_count: row.plays,
                unique_listeners: row.unique_listeners,
                album_uri: detail.album_uri.clone(),
                artist_uri: detail.artist_uri.clone(),
                sha256: detail.sha256.clone(),
                tags: detail.genre.clone().map(|g| vec![g]).unwrap_or_default(),
                created_at: detail.created_at,
            })
        })
        .collect())
}

// ------------------------------------------------------------ getDecades

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DecadeViewBasic {
    pub decade: i64,
    pub scrobbles: i64,
    pub unique_albums: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct DecadesOutput {
    pub decades: Vec<DecadeViewBasic>,
}

async fn get_decades(
    state: web::Data<AppState>,
    params: web::Query<ChartParams>,
) -> XrpcResult<HttpResponse> {
    match load_decades(state.db(), &params).await {
        Ok(decades) => json(DecadesOutput { decades }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve decades");
            json(DecadesOutput::default())
        }
    }
}

async fn load_decades(
    db: &Backend,
    params: &ChartParams,
) -> Result<Vec<DecadeViewBasic>, sqlx::Error> {
    let user_id = match params.did.as_deref() {
        Some(did) => match actors::find_user_id(db, did).await? {
            Some(id) => Some(id),
            None => return Ok(Vec::new()),
        },
        None => None,
    };

    let s = Alias::new("s");
    let al = Alias::new("al");
    // Integer division truncates to the decade on both backends, since `year`
    // is an integer column.
    let decade = Expr::col((al.clone(), Albums::Year)).div(10).mul(10);

    let mut query = Query::select();
    query
        .expr_as(db.cast_int(decade.clone()), Alias::new("decade"))
        .expr_as(
            db.cast_int(Func::count(Expr::col((s.clone(), Scrobbles::XataId)))),
            Alias::new("scrobbles"),
        )
        .expr_as(
            db.cast_int(Func::count_distinct(Expr::col((
                s.clone(),
                Scrobbles::AlbumId,
            )))),
            Alias::new("unique_albums"),
        )
        .from_as(Scrobbles::Table, s.clone())
        .join_as(
            JoinType::InnerJoin,
            Albums::Table,
            al.clone(),
            Expr::col((al.clone(), Albums::XataId)).equals((s.clone(), Scrobbles::AlbumId)),
        )
        .and_where(Expr::col((al.clone(), Albums::Year)).is_not_null())
        .and_where(Expr::col((al.clone(), Albums::Year)).gte(FIRST_YEAR))
        .and_where(Expr::col((al, Albums::Year)).lte(db.current_year()));

    push_range(
        db,
        &mut query,
        (s.clone(), Scrobbles::Timestamp),
        params.start_date.as_deref(),
        params.end_date.as_deref(),
    );
    if let Some(user_id) = &user_id {
        query.and_where(Expr::col((s, Scrobbles::UserId)).eq(user_id));
    }

    query
        .add_group_by([decade.clone()])
        .order_by_expr(decade, Order::Asc);
    db.fetch_all(&query).await
}

// ------------------------------------------------------ getScrobblesChart

#[derive(Debug, Clone, Deserialize)]
pub struct ScrobblesChartParams {
    #[serde(default)]
    pub did: Option<String>,
    /// Lowercase on the wire, as the lexicon declares them.
    #[serde(default)]
    pub artisturi: Option<String>,
    #[serde(default)]
    pub albumuri: Option<String>,
    #[serde(default)]
    pub songuri: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, PartialEq, Eq)]
pub struct ChartPoint {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ChartsView {
    pub scrobbles: Vec<ChartPoint>,
}

async fn get_scrobbles_chart(
    state: web::Data<AppState>,
    params: web::Query<ScrobblesChartParams>,
) -> XrpcResult<HttpResponse> {
    if let Some(scrobbles) = from_analytics(&state, &params).await {
        return json(ChartsView { scrobbles });
    }

    match load_scrobbles_chart(state.db(), &params).await {
        Ok(scrobbles) => json(ChartsView { scrobbles }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve scrobbles chart");
            json(ChartsView::default())
        }
    }
}

/// The chart from the analytics service, when one is configured.
///
/// The selector order is the one `apps/api` checks in — `did`, then artist,
/// album, song — with `genre` added, which this API has and that one does not.
/// `None` for any reason at all sends the caller to the database.
async fn from_analytics(
    state: &AppState,
    params: &ScrobblesChartParams,
) -> Option<Vec<ChartPoint>> {
    if !analytics::configured(state) {
        return None;
    }

    let (from, to) = default_range(params);
    let point = |day: analytics::DayCount| ChartPoint {
        date: day.date,
        count: day.count,
    };

    let days = if let Some(did) = params.did.as_deref() {
        analytics::scrobbles_per_day(state, Some(did), None, &from, &to).await?
    } else if let Some(uri) = params.artisturi.as_deref() {
        analytics::artist_scrobbles(state, uri, &from, &to).await?
    } else if let Some(uri) = params.albumuri.as_deref() {
        analytics::album_scrobbles(state, uri, &from, &to).await?
    } else if let Some(uri) = params.songuri.as_deref() {
        // A scrobble URI names a play, not a song, and the service matches
        // neither — so that one case is resolved here first. Song URIs go
        // straight through: `t.id = ? OR t.uri = ?` accepts them as they are.
        let track = if uri.contains("app.rocksky.scrobble") {
            resolve_track(state.db(), uri).await.ok().flatten()?
        } else {
            uri.to_string()
        };
        analytics::track_scrobbles(state, &track, &from, &to).await?
    } else if let Some(genre) = params.genre.as_deref() {
        analytics::scrobbles_per_day(state, None, Some(genre), &from, &to).await?
    } else {
        analytics::scrobbles_per_day(state, None, None, &from, &to).await?
    };

    Some(days.into_iter().map(point).collect())
}

/// The six-month window the chart defaults to, as `YYYY-MM-DD` bounds.
fn default_range(params: &ScrobblesChartParams) -> (String, String) {
    let today = Utc::now();
    let to = params
        .to
        .clone()
        .unwrap_or_else(|| today.format("%Y-%m-%d").to_string());
    let from = params.from.clone().unwrap_or_else(|| {
        (today - chrono::Duration::days(183))
            .format("%Y-%m-%d")
            .to_string()
    });
    (from, to)
}

/// `YYYY-MM-DD` day bounds as the half-open timestamp range covering them.
///
/// The upper bound is midnight of the following day, so the whole of `to` is
/// included without a `23:59:59.999` that would drop the last millisecond.
/// An unparseable bound falls back to the day itself at midnight, which is
/// what the string already meant.
fn timestamp_bounds(from: &str, to: &str) -> (String, String) {
    let midnight = |day: &str| {
        chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d")
            .ok()
            .map(|date| date.and_hms_opt(0, 0, 0).unwrap_or_default())
    };
    let start = midnight(from)
        .map(|at| rocksky_db::format_timestamp(at.and_utc()))
        .unwrap_or_else(|| format!("{from}T00:00:00.000Z"));
    let end = midnight(to)
        .map(|at| rocksky_db::format_timestamp((at + chrono::Duration::days(1)).and_utc()))
        .unwrap_or_else(|| format!("{to}T00:00:00.000Z"));
    (start, end)
}

/// The unfiltered chart, read from the precomputed per-day counts.
///
/// This is the homepage chart and by far the most requested. Aggregated live
/// it is a full pass over `scrobbles` — measured at 26s against the hosted
/// Postgres, almost all of it I/O, because grouping 1.6M rows by day has to
/// read 1.6M rows. The materialized view holds one row per day instead, so the
/// same answer is a few thousand rows.
///
/// The view excludes today, deliberately: a day still accumulating would be
/// cached at a partial count. Today is therefore added from the live table,
/// which is one day's range on an indexed column and costs nothing.
async fn precomputed_chart(
    db: &Backend,
    from: &str,
    to: &str,
) -> Result<Vec<ChartPoint>, sqlx::Error> {
    let day = Expr::col((Alias::new("m"), crate::db::schema::ScrobblesPerDayMv::Day));

    let mut query = Query::select();
    query
        .expr_as(db.cast_text(day.clone()), Alias::new("date"))
        .expr_as(
            db.cast_int(Expr::col((
                Alias::new("m"),
                crate::db::schema::ScrobblesPerDayMv::Count,
            ))),
            Alias::new("count"),
        )
        .from_as(crate::db::schema::ScrobblesPerDayMv::Table, Alias::new("m"))
        .and_where(day.clone().gte(db.date_value(from)))
        .and_where(day.clone().lte(db.date_value(to)))
        .order_by_expr(day.into(), Order::Asc);

    db.fetch_all(&query).await
}

async fn load_scrobbles_chart(
    db: &Backend,
    params: &ScrobblesChartParams,
) -> Result<Vec<ChartPoint>, sqlx::Error> {
    let (from, to) = default_range(params);

    let s = Alias::new("s");
    let t = Alias::new("t");

    // The first matching selector wins, in the same order the TypeScript
    // checks them. Each resolves to a scrobbles condition, and a selector that
    // resolves to nothing yields an empty chart.
    let condition: Option<SimpleExpr> = if let Some(did) = params.did.as_deref() {
        match actors::find_user_id(db, did).await? {
            Some(id) => Some(Expr::col((s.clone(), Scrobbles::UserId)).eq(id)),
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.artisturi.as_deref() {
        match lookup_id(db, Artists::Table, uri).await? {
            Some(id) => Some(Expr::col((s.clone(), Scrobbles::ArtistId)).eq(id)),
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.albumuri.as_deref() {
        match lookup_id(db, Albums::Table, uri).await? {
            Some(id) => Some(Expr::col((s.clone(), Scrobbles::AlbumId)).eq(id)),
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.songuri.as_deref() {
        match resolve_track(db, uri).await? {
            Some(id) => Some(Expr::col((s.clone(), Scrobbles::TrackId)).eq(id)),
            None => return Ok(Vec::new()),
        }
    } else if let Some(genre) = params.genre.as_deref() {
        Some(Expr::col((t.clone(), Tracks::Genre)).eq(genre))
    } else {
        // No selector: the homepage chart, which is the one worth not
        // computing. Everything below aggregates the whole of `scrobbles`.
        let mut points = precomputed_chart(db, &from, &to).await?;

        // The view stops before today, so the current day is counted live —
        // one day's range on an indexed column.
        let today = Utc::now().format("%Y-%m-%d").to_string();
        if today.as_str() >= from.as_str() && today.as_str() <= to.as_str() {
            let (start, end) = timestamp_bounds(&today, &today);
            let mut live = Query::select();
            live.expr_as(
                db.cast_int(Func::count(Expr::col(Scrobbles::XataId))),
                Alias::new("count"),
            )
            .from(Scrobbles::Table)
            .and_where(Expr::col(Scrobbles::Timestamp).gte(db.timestamp_value(start)))
            .and_where(Expr::col(Scrobbles::Timestamp).lt(db.timestamp_value(end)));

            if let Some(count) = db.fetch_scalar::<i64>(&live).await? {
                if count > 0 {
                    points.push(ChartPoint { date: today, count });
                }
            }
        }
        return Ok(points);
    };

    // DATE() truncates a timestamp on Postgres and ISO text on SQLite, and
    // both yield 'YYYY-MM-DD'.
    let date = Func::cust(Alias::new("DATE")).arg(Expr::col((s.clone(), Scrobbles::Timestamp)));

    let mut query = Query::select();
    query
        .expr_as(date.clone(), Alias::new("date"))
        .expr_as(
            db.cast_int(Func::count(Expr::col((s.clone(), Scrobbles::XataId)))),
            Alias::new("count"),
        )
        .from_as(Scrobbles::Table, s.clone());

    // Only the genre selector needs the tracks join.
    if params.genre.is_some() && params.did.is_none() {
        query.join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            t.clone(),
            Expr::col((t, Tracks::XataId)).equals((s.clone(), Scrobbles::TrackId)),
        );
    }

    // Filtered on the raw column, never on `DATE(timestamp)`.
    //
    // Two reasons, and the first one broke production. `DATE(...)` yields a
    // `date` on Postgres while the bounds bind as `text`, so the comparison is
    // `date >= text` — an operator that does not exist, and the chart answered
    // empty on every request.
    //
    // The second is why it was slow even where it worked: wrapping the column
    // in a function makes the predicate unusable by
    // `idx_scrobbles_ts_id (timestamp DESC, xata_id DESC)`, so every request
    // scanned all 1.6M rows. The analytics service this replaces filters
    // `created_at BETWEEN ? AND ?` on the bare column for exactly this reason.
    //
    // The upper bound is exclusive at midnight of the day *after* `to`, which
    // is how a half-open range over timestamps includes the whole final day
    // without naming 23:59:59.999.
    let (from_ts, to_ts) = timestamp_bounds(&from, &to);
    query
        .and_where(Expr::col((s.clone(), Scrobbles::Timestamp)).gte(db.timestamp_value(from_ts)))
        .and_where(Expr::col((s.clone(), Scrobbles::Timestamp)).lt(db.timestamp_value(to_ts)));
    if let Some(condition) = condition {
        query.and_where(condition);
    }

    query
        .add_group_by([date.clone().into()])
        .order_by_expr(date.into(), Order::Asc);
    db.fetch_all(&query).await
}

/// Row id of a record by its AT-URI.
///
/// Every catalogue table names these columns the same way, so one statement
/// serves all of them with only the table varying.
async fn lookup_id(
    db: &Backend,
    table: impl IntoTableRef,
    uri: &str,
) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(Alias::new("xata_id"))
        .from(table)
        .and_where(Expr::col(Alias::new("uri")).eq(uri))
        .limit(1)
        .to_owned();
    db.fetch_scalar(&query).await
}

/// `songuri` accepts either a song URI or a scrobble URI, so which table to
/// look in depends on the collection in the URI.
async fn resolve_track(db: &Backend, uri: &str) -> Result<Option<String>, sqlx::Error> {
    if uri.contains("app.rocksky.scrobble") {
        let query = Query::select()
            .column(Scrobbles::TrackId)
            .from(Scrobbles::Table)
            .and_where(Expr::col(Scrobbles::Uri).eq(uri))
            .limit(1)
            .to_owned();
        return db.fetch_scalar(&query).await;
    }
    lookup_id(db, Tracks::Table, uri).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Alice plays three tracks, Bob one, and one user is flagged as a bot so
    /// the bot exclusion has something to drop.
    async fn fixture() -> Backend {
        let backend = db::connect_in_memory().await.unwrap();
        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar, is_bot) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a', 0), \
             ('rec_bob',   'did:plc:bob',   'bob.test',   'b', 0), \
             ('rec_bot',   'did:plc:bot',   'bot.test',   'c', 1)",
            "INSERT INTO artists (xata_id, name, sha256, uri, genres) VALUES \
             ('rec_boc', 'Boards of Canada', 'sha-boc', 'at://did:plc:svc/app.rocksky.artist/boc', '[\"electronic\"]'), \
             ('rec_va',  'Various Artists',  'sha-va',  'at://did:plc:svc/app.rocksky.artist/va',  NULL)",
            "INSERT INTO albums (xata_id, title, artist, sha256, uri, year) VALUES \
             ('rec_al1', 'MHTRTC', 'Boards of Canada', 'sha-al1', 'at://did:plc:alice/app.rocksky.album/1', 1998), \
             ('rec_al2', 'Geogaddi', 'Boards of Canada', 'sha-al2', 'at://did:plc:alice/app.rocksky.album/2', 2002), \
             ('rec_al3', 'Bad Year', 'Nobody', 'sha-al3', 'at://did:plc:alice/app.rocksky.album/3', 1200)",
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, uri, genre) VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1000, 'sha-t1', 'at://did:plc:alice/app.rocksky.song/1', 'electronic'), \
             ('rec_t2', 'Olson', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 2000, 'sha-t2', 'at://did:plc:alice/app.rocksky.song/2', NULL), \
             ('rec_t3', 'Comp', 'Various Artists', 'Various Artists', 'Comp', 3000, 'sha-t3', 'at://did:plc:alice/app.rocksky.song/3', NULL)",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) VALUES \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_al1', 'rec_boc', 'at://did:plc:alice/app.rocksky.scrobble/1', '2026-01-01T10:00:00.000Z'), \
             ('rec_s2', 'rec_alice', 'rec_t1', 'rec_al1', 'rec_boc', 'at://did:plc:alice/app.rocksky.scrobble/2', '2026-01-01T11:00:00.000Z'), \
             ('rec_s3', 'rec_alice', 'rec_t2', 'rec_al2', 'rec_boc', 'at://did:plc:alice/app.rocksky.scrobble/3', '2026-02-01T10:00:00.000Z'), \
             ('rec_s4', 'rec_bob',   'rec_t1', 'rec_al1', 'rec_boc', 'at://did:plc:alice/app.rocksky.scrobble/4', '2026-02-02T10:00:00.000Z'), \
             ('rec_s5', 'rec_bot',   'rec_t1', 'rec_al1', 'rec_boc', 'at://did:plc:alice/app.rocksky.scrobble/5', '2026-02-03T10:00:00.000Z'), \
             ('rec_s6', 'rec_bob',   'rec_t3', 'rec_al3', 'rec_va',  'at://did:plc:alice/app.rocksky.scrobble/6', '2026-02-04T10:00:00.000Z')",
        ];
        for text in statements {
            backend.execute(&backend.sql(text)).await.expect(text);
        }
        backend
    }

    fn range(start: Option<&str>, end: Option<&str>) -> RangeParams {
        RangeParams {
            start_date: start.map(str::to_string),
            end_date: end.map(str::to_string),
            limit: None,
            offset: None,
        }
    }

    fn chart(did: Option<&str>) -> ChartParams {
        ChartParams {
            did: did.map(str::to_string),
            start_date: None,
            end_date: None,
            limit: None,
            offset: None,
        }
    }

    #[tokio::test]
    async fn top_scrobblers_all_time_reads_the_view_and_excludes_bots() {
        let db = fixture().await;
        let rows = load_top_scrobblers(&db, &range(None, None)).await.unwrap();

        let handles: Vec<&str> = rows.iter().map(|r| r.handle.as_str()).collect();
        assert_eq!(handles, vec!["alice.test", "bob.test"], "bots are excluded");

        let alice = &rows[0];
        assert_eq!(alice.scrobbles, 3);
        assert_eq!(alice.unique_tracks, 2);
        assert_eq!(alice.unique_artists, 1);
    }

    #[tokio::test]
    async fn top_scrobblers_in_a_range_aggregates_directly() {
        let db = fixture().await;
        // Only February: Alice has one play, Bob two.
        let rows = load_top_scrobblers(&db, &range(Some("2026-02-01"), Some("2026-02-28")))
            .await
            .unwrap();

        let by_handle: std::collections::HashMap<&str, i64> = rows
            .iter()
            .map(|r| (r.handle.as_str(), r.scrobbles))
            .collect();
        assert_eq!(by_handle.get("bob.test"), Some(&2));
        assert_eq!(by_handle.get("alice.test"), Some(&1));
        assert!(!by_handle.contains_key("bot.test"), "bots stay excluded");
        // Ranked by play count, so Bob leads.
        assert_eq!(rows[0].handle, "bob.test");
    }

    #[tokio::test]
    async fn a_bare_start_date_is_read_as_midnight_utc() {
        let db = fixture().await;
        // 2026-02-01T10:00 is included by a start of 2026-02-01.
        let rows = load_top_scrobblers(&db, &range(Some("2026-02-01"), None))
            .await
            .unwrap();
        let total: i64 = rows.iter().map(|r| r.scrobbles).sum();
        assert_eq!(total, 3, "alice 1 + bob 2, bot excluded");
    }

    #[tokio::test]
    async fn top_artists_excludes_various_artists() {
        let db = fixture().await;
        let artists = load_top_artists(&db, &chart(None)).await.unwrap();

        let names: Vec<&str> = artists.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["Boards of Canada"]);
        assert_eq!(artists[0].tags, vec!["electronic"]);
        // Alice, Bob and the bot all played it. The chart does not filter bots.
        assert_eq!(artists[0].unique_listeners, 3);
        assert_eq!(artists[0].play_count, 5);
    }

    #[tokio::test]
    async fn a_per_user_artist_chart_ranks_by_play_count() {
        let db = fixture().await;
        let artists = load_top_artists(&db, &chart(Some("did:plc:alice")))
            .await
            .unwrap();
        assert_eq!(artists.len(), 1);
        assert_eq!(artists[0].play_count, 3, "only Alice's plays");
        assert_eq!(artists[0].unique_listeners, 1);
    }

    #[tokio::test]
    async fn an_unknown_actor_gets_an_empty_chart() {
        let db = fixture().await;
        assert!(load_top_artists(&db, &chart(Some("did:plc:nobody")))
            .await
            .unwrap()
            .is_empty());
        assert!(load_top_tracks(&db, &chart(Some("did:plc:nobody")))
            .await
            .unwrap()
            .is_empty());
        assert!(load_decades(&db, &chart(Some("did:plc:nobody")))
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn top_tracks_carry_genre_as_a_single_tag() {
        let db = fixture().await;
        let tracks = load_top_tracks(&db, &chart(None)).await.unwrap();

        let roygbiv = tracks.iter().find(|t| t.title == "Roygbiv").unwrap();
        assert_eq!(roygbiv.tags, vec!["electronic"]);
        assert_eq!(roygbiv.play_count, 4);
        assert_eq!(roygbiv.unique_listeners, 3);

        let olson = tracks.iter().find(|t| t.title == "Olson").unwrap();
        assert!(olson.tags.is_empty(), "a NULL genre is an empty list");
    }

    #[tokio::test]
    async fn top_tracks_preserve_the_ranking_order() {
        let db = fixture().await;
        let tracks = load_top_tracks(&db, &chart(None)).await.unwrap();
        // Roygbiv has three distinct listeners, the others one each.
        assert_eq!(tracks[0].title, "Roygbiv");
    }

    #[tokio::test]
    async fn decades_group_by_ten_years_and_drop_impossible_ones() {
        let db = fixture().await;
        let decades = load_decades(&db, &chart(None)).await.unwrap();

        assert_eq!(
            decades,
            vec![
                DecadeViewBasic {
                    decade: 1990,
                    scrobbles: 4,
                    unique_albums: 1
                },
                DecadeViewBasic {
                    decade: 2000,
                    scrobbles: 1,
                    unique_albums: 1
                },
            ],
            "the year-1200 album is excluded and the rest bucket by decade"
        );
    }

    #[tokio::test]
    async fn the_scrobbles_chart_groups_by_day() {
        let db = fixture().await;
        let params = ScrobblesChartParams {
            did: Some("did:plc:alice".into()),
            artisturi: None,
            albumuri: None,
            songuri: None,
            genre: None,
            from: Some("2026-01-01".into()),
            to: Some("2026-12-31".into()),
        };
        let points = load_scrobbles_chart(&db, &params).await.unwrap();
        assert_eq!(
            points,
            vec![
                ChartPoint {
                    date: "2026-01-01".into(),
                    count: 2
                },
                ChartPoint {
                    date: "2026-02-01".into(),
                    count: 1
                },
            ]
        );
    }

    #[tokio::test]
    async fn the_chart_selectors_resolve_by_uri() {
        let db = fixture().await;
        let base = ScrobblesChartParams {
            did: None,
            artisturi: None,
            albumuri: None,
            songuri: None,
            genre: None,
            from: Some("2026-01-01".into()),
            to: Some("2026-12-31".into()),
        };

        let total = |points: Vec<ChartPoint>| points.iter().map(|p| p.count).sum::<i64>();

        let by_artist = ScrobblesChartParams {
            artisturi: Some("at://did:plc:svc/app.rocksky.artist/boc".into()),
            ..base.clone()
        };
        assert_eq!(
            total(load_scrobbles_chart(&db, &by_artist).await.unwrap()),
            5
        );

        let by_album = ScrobblesChartParams {
            albumuri: Some("at://did:plc:alice/app.rocksky.album/1".into()),
            ..base.clone()
        };
        assert_eq!(
            total(load_scrobbles_chart(&db, &by_album).await.unwrap()),
            4
        );

        let by_song = ScrobblesChartParams {
            songuri: Some("at://did:plc:alice/app.rocksky.song/2".into()),
            ..base.clone()
        };
        assert_eq!(total(load_scrobbles_chart(&db, &by_song).await.unwrap()), 1);

        // `songuri` also accepts a scrobble URI, resolving through it.
        let by_scrobble = ScrobblesChartParams {
            songuri: Some("at://did:plc:alice/app.rocksky.scrobble/3".into()),
            ..base.clone()
        };
        assert_eq!(
            total(load_scrobbles_chart(&db, &by_scrobble).await.unwrap()),
            1,
            "a scrobble URI resolves to its track"
        );

        let by_genre = ScrobblesChartParams {
            genre: Some("electronic".into()),
            ..base
        };
        assert_eq!(
            total(load_scrobbles_chart(&db, &by_genre).await.unwrap()),
            4
        );
    }

    #[tokio::test]
    async fn an_unresolvable_selector_yields_an_empty_chart() {
        let db = fixture().await;
        let params = ScrobblesChartParams {
            did: None,
            artisturi: Some("at://did:plc:svc/app.rocksky.artist/nope".into()),
            albumuri: None,
            songuri: None,
            genre: None,
            from: None,
            to: None,
        };
        assert!(load_scrobbles_chart(&db, &params).await.unwrap().is_empty());
    }

    #[test]
    fn the_default_range_is_about_six_months() {
        let params = ScrobblesChartParams {
            did: None,
            artisturi: None,
            albumuri: None,
            songuri: None,
            genre: None,
            from: None,
            to: None,
        };
        let (from, to) = default_range(&params);
        assert_eq!(from.len(), 10, "{from}");
        assert_eq!(to.len(), 10, "{to}");
        assert!(from < to, "{from} .. {to}");
    }

    #[test]
    fn bare_dates_expand_and_full_timestamps_pass_through() {
        assert_eq!(normalize_date("2026-01-01"), "2026-01-01T00:00:00.000Z");
        assert_eq!(
            normalize_date("2026-01-01T12:00:00Z"),
            "2026-01-01T12:00:00Z"
        );
    }

    #[test]
    fn view_keys_are_camel_cased() {
        let view = DecadeViewBasic {
            decade: 1990,
            scrobbles: 1,
            unique_albums: 1,
        };
        let json = serde_json::to_string(&view).unwrap();
        assert!(json.contains("\"uniqueAlbums\""), "{json}");
        assert!(!json.contains("unique_albums"), "{json}");
    }
}
