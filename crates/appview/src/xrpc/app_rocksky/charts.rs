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
use crate::db::models::{cast_int, current_year, json_array};
use crate::db::query::Sql;
use crate::db::Backend;
use crate::error::XrpcResult;
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
    let dialect = db.dialect();

    let mut sql = if params.start_date.is_some() || params.end_date.is_some() {
        // A date range has to aggregate the scrobbles themselves.
        let mut sql = db.sql(format!(
            "SELECT u.xata_id AS id, u.did, u.handle, u.display_name, u.avatar, \
             {} AS scrobbles, \
             {} AS unique_artists, \
             {} AS unique_tracks \
             FROM scrobbles s \
             INNER JOIN users u ON u.xata_id = s.user_id \
             WHERE u.is_bot = ",
            cast_int(dialect, "count(s.xata_id)"),
            cast_int(dialect, "count(DISTINCT s.artist_id)"),
            cast_int(dialect, "count(DISTINCT s.track_id)"),
        ));
        sql.bind(false);
        push_range(
            &mut sql,
            "s.timestamp",
            params.start_date.as_deref(),
            params.end_date.as_deref(),
        );
        sql.push(
            " GROUP BY u.xata_id, u.did, u.handle, u.display_name, u.avatar \
             ORDER BY count(s.xata_id) DESC, u.xata_id",
        );
        sql
    } else {
        // No range: read the precomputed all-time totals.
        let mut sql = db.sql(format!(
            "SELECT u.xata_id AS id, u.did, u.handle, u.display_name, u.avatar, \
             {} AS scrobbles, \
             {} AS unique_artists, \
             {} AS unique_tracks \
             FROM top_scrobblers_mv m \
             JOIN users u ON u.xata_id = m.user_id \
             WHERE u.is_bot = ",
            cast_int(dialect, "m.scrobbles"),
            cast_int(dialect, "m.unique_artists"),
            cast_int(dialect, "m.unique_tracks"),
        ));
        sql.bind(false);
        sql.push(" ORDER BY m.scrobbles DESC, u.xata_id");
        sql
    };

    sql.push(" LIMIT ")
        .bind(limit)
        .push(" OFFSET ")
        .bind(offset);
    db.fetch_all(&sql).await
}

/// Appends the optional `startDate`/`endDate` bounds to a query.
///
/// The values arrive as ISO strings and are bound as timestamps, so Postgres
/// gets its `::timestamptz` cast and SQLite compares the text directly.
fn push_range(sql: &mut Sql, column: &str, start: Option<&str>, end: Option<&str>) {
    if let Some(start) = start {
        sql.push(format!(" AND {column} >= "));
        sql.bind_timestamp_text(normalize_date(start));
    }
    if let Some(end) = end {
        sql.push(format!(" AND {column} <= "));
        sql.bind_timestamp_text(normalize_date(end));
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

/// Builds the grouped aggregate shared by the artist and track charts.
async fn chart_rows(
    db: &Backend,
    params: &ChartParams,
    group_column: &str,
    extra_from: &str,
    extra_condition: Option<&str>,
    default_limit: i64,
) -> Result<Option<Vec<ChartRow>>, sqlx::Error> {
    let dialect = db.dialect();

    // Resolving the actor first: an unknown one means an empty chart, not an
    // unfiltered one.
    let user_id = match params.did.as_deref() {
        Some(did) => match actors::find_user_id(db, did).await? {
            Some(id) => Some(id),
            None => return Ok(None),
        },
        None => None,
    };

    let mut sql = db.sql(format!(
        "SELECT {group_column} AS entity_id, \
         {} AS plays, \
         {} AS unique_listeners \
         FROM scrobbles s{extra_from} WHERE 1 = 1",
        cast_int(dialect, "count(s.xata_id)"),
        cast_int(dialect, "count(DISTINCT s.user_id)"),
    ));

    if let Some(condition) = extra_condition {
        sql.push(format!(" AND {condition}"));
    }
    push_range(
        &mut sql,
        "s.timestamp",
        params.start_date.as_deref(),
        params.end_date.as_deref(),
    );
    if let Some(user_id) = &user_id {
        sql.push(" AND s.user_id = ").bind(user_id);
    }

    // A one-listener chart cannot rank by unique listeners.
    let ranking = if user_id.is_some() {
        "count(s.xata_id) DESC"
    } else {
        "count(DISTINCT s.user_id) DESC"
    };

    sql.push(format!(
        " GROUP BY {group_column} ORDER BY {ranking} LIMIT "
    ))
    .bind(clamp_limit_or(params.limit, default_limit))
    .push(" OFFSET ")
    .bind(clamp_offset(params.offset));

    Ok(Some(db.fetch_all(&sql).await?))
}

async fn load_top_artists(
    db: &Backend,
    params: &ChartParams,
) -> Result<Vec<ArtistViewBasic>, sqlx::Error> {
    let Some(rows) = chart_rows(
        db,
        params,
        "s.artist_id",
        " LEFT JOIN artists a ON a.xata_id = s.artist_id",
        // "Various Artists" is a compilation placeholder, not an artist.
        Some("a.name <> 'Various Artists'"),
        CHART_LIMIT,
    )
    .await?
    else {
        return Ok(Vec::new());
    };
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = rows
        .iter()
        .filter_map(|row| row.entity_id.clone())
        .collect();
    let mut sql =
        db.sql("SELECT xata_id, name, picture, sha256, uri, genres FROM artists WHERE xata_id IN ");
    sql.bind_list(ids.iter().map(|id| id.as_str()));

    #[derive(sqlx::FromRow)]
    struct Row {
        xata_id: String,
        name: String,
        picture: Option<String>,
        sha256: String,
        uri: Option<String>,
        genres: Option<String>,
    }
    let details: std::collections::HashMap<String, Row> = db
        .fetch_all::<Row>(&sql)
        .await?
        .into_iter()
        .map(|row| (row.xata_id.clone(), row))
        .collect();

    // The aggregate's order is the chart's order, so the details are mapped
    // back onto it rather than re-sorted.
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let detail = details.get(row.entity_id.as_deref()?)?;
            Some(ArtistViewBasic {
                id: detail.xata_id.clone(),
                name: detail.name.clone(),
                picture: detail.picture.clone(),
                sha256: detail.sha256.clone(),
                uri: detail.uri.clone(),
                play_count: row.plays,
                unique_listeners: row.unique_listeners,
                tags: json_array(detail.genres.as_deref()),
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
    pub uri: Option<String>,
    pub album: String,
    pub duration: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub play_count: i64,
    pub unique_listeners: i64,
    pub album_uri: Option<String>,
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
    let Some(rows) = chart_rows(db, params, "s.track_id", "", None, CHART_LIMIT).await? else {
        return Ok(Vec::new());
    };
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<String> = rows
        .iter()
        .filter_map(|row| row.entity_id.clone())
        .collect();
    let dialect = db.dialect();
    let mut sql = db.sql(format!(
        "SELECT xata_id, title, artist, album_artist, album_art, uri, album, \
         {} AS duration, \
         {} AS track_number, \
         {} AS disc_number, \
         album_uri, artist_uri, sha256, genre, \
         {} AS created_at \
         FROM tracks WHERE xata_id IN ",
        cast_int(dialect, "duration"),
        cast_int(dialect, "track_number"),
        cast_int(dialect, "disc_number"),
        match dialect {
            crate::db::Dialect::Sqlite => "xata_createdat",
            crate::db::Dialect::Postgres => "xata_createdat::timestamptz",
        },
    ));
    sql.bind_list(ids.iter().map(|id| id.as_str()));

    #[derive(sqlx::FromRow)]
    struct Row {
        xata_id: String,
        title: String,
        artist: String,
        album_artist: String,
        album_art: Option<String>,
        uri: Option<String>,
        album: String,
        duration: i64,
        track_number: Option<i64>,
        disc_number: Option<i64>,
        album_uri: Option<String>,
        artist_uri: Option<String>,
        sha256: String,
        genre: Option<String>,
        created_at: DateTime<Utc>,
    }
    let details: std::collections::HashMap<String, Row> = db
        .fetch_all::<Row>(&sql)
        .await?
        .into_iter()
        .map(|row| (row.xata_id.clone(), row))
        .collect();

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let detail = details.get(row.entity_id.as_deref()?)?;
            Some(SongViewBasic {
                id: detail.xata_id.clone(),
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
    let dialect = db.dialect();

    let user_id = match params.did.as_deref() {
        Some(did) => match actors::find_user_id(db, did).await? {
            Some(id) => Some(id),
            None => return Ok(Vec::new()),
        },
        None => None,
    };

    // Integer division truncates to the decade on both backends, since `year`
    // is an integer column.
    let decade = "((al.year / 10) * 10)";
    let mut sql = db.sql(format!(
        "SELECT {} AS decade, \
         {} AS scrobbles, \
         {} AS unique_albums \
         FROM scrobbles s \
         INNER JOIN albums al ON al.xata_id = s.album_id \
         WHERE al.year IS NOT NULL AND al.year >= ",
        cast_int(dialect, decade),
        cast_int(dialect, "count(s.xata_id)"),
        cast_int(dialect, "count(DISTINCT s.album_id)"),
    ));
    sql.bind(FIRST_YEAR)
        .push(format!(" AND al.year <= {}", current_year(dialect)));

    push_range(
        &mut sql,
        "s.timestamp",
        params.start_date.as_deref(),
        params.end_date.as_deref(),
    );
    if let Some(user_id) = &user_id {
        sql.push(" AND s.user_id = ").bind(user_id);
    }

    sql.push(format!(" GROUP BY {decade} ORDER BY {decade}"));
    db.fetch_all(&sql).await
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
    match load_scrobbles_chart(state.db(), &params).await {
        Ok(scrobbles) => json(ChartsView { scrobbles }),
        Err(err) => {
            tracing::error!(error = %err, "failed to retrieve scrobbles chart");
            json(ChartsView::default())
        }
    }
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

async fn load_scrobbles_chart(
    db: &Backend,
    params: &ScrobblesChartParams,
) -> Result<Vec<ChartPoint>, sqlx::Error> {
    let (from, to) = default_range(params);

    // The first matching selector wins, in the same order the TypeScript
    // checks them. Each resolves to a scrobbles condition, and a selector that
    // resolves to nothing yields an empty chart.
    let condition: Option<Sql> = if let Some(did) = params.did.as_deref() {
        match actors::find_user_id(db, did).await? {
            Some(id) => {
                let mut sql = db.sql("s.user_id = ");
                sql.bind(id);
                Some(sql)
            }
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.artisturi.as_deref() {
        match lookup_id(db, "artists", uri).await? {
            Some(id) => {
                let mut sql = db.sql("s.artist_id = ");
                sql.bind(id);
                Some(sql)
            }
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.albumuri.as_deref() {
        match lookup_id(db, "albums", uri).await? {
            Some(id) => {
                let mut sql = db.sql("s.album_id = ");
                sql.bind(id);
                Some(sql)
            }
            None => return Ok(Vec::new()),
        }
    } else if let Some(uri) = params.songuri.as_deref() {
        match resolve_track(db, uri).await? {
            Some(id) => {
                let mut sql = db.sql("s.track_id = ");
                sql.bind(id);
                Some(sql)
            }
            None => return Ok(Vec::new()),
        }
    } else if let Some(genre) = params.genre.as_deref() {
        let mut sql = db.sql("t.genre = ");
        sql.bind(genre);
        Some(sql)
    } else {
        None
    };

    // Only the genre selector needs the tracks join.
    let join = if params.genre.is_some() && params.did.is_none() {
        " INNER JOIN tracks t ON t.xata_id = s.track_id"
    } else {
        ""
    };

    // DATE() truncates a timestamp on Postgres and ISO text on SQLite, and
    // both yield 'YYYY-MM-DD'.
    let mut sql = db.sql(format!(
        "SELECT DATE(s.timestamp) AS date, {} AS count \
         FROM scrobbles s{join} WHERE DATE(s.timestamp) BETWEEN ",
        cast_int(db.dialect(), "count(s.xata_id)"),
    ));
    sql.bind(from).push(" AND ").bind(to);

    if let Some(condition) = condition {
        sql.push(" AND ");
        sql.append(condition);
    }

    sql.push(" GROUP BY DATE(s.timestamp) ORDER BY DATE(s.timestamp)");
    db.fetch_all(&sql).await
}

/// Row id of a record by its AT-URI.
async fn lookup_id(db: &Backend, table: &str, uri: &str) -> Result<Option<String>, sqlx::Error> {
    let mut sql = db.sql(format!("SELECT xata_id FROM {table} WHERE uri = "));
    sql.bind(uri).push(" LIMIT 1");
    db.fetch_scalar(&sql).await
}

/// `songuri` accepts either a song URI or a scrobble URI, so which table to
/// look in depends on the collection in the URI.
async fn resolve_track(db: &Backend, uri: &str) -> Result<Option<String>, sqlx::Error> {
    if uri.contains("app.rocksky.scrobble") {
        let mut sql = db.sql("SELECT track_id FROM scrobbles WHERE uri = ");
        sql.bind(uri).push(" LIMIT 1");
        return db.fetch_scalar(&sql).await;
    }
    lookup_id(db, "tracks", uri).await
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
