//! ws/2 handlers: lookup, search, browse-by-artist, ISRC.
//!
//! Responses are JSON only — every Rocksky client sends `fmt=json`, so `fmt`
//! and `inc` are accepted and ignored: the stored documents already carry
//! every inline expansion the dump had (aliases, tags, genres, ratings,
//! relations, artist credits, ISRCs). What the dump does not have — releases —
//! no `inc` can conjure.

use crate::error::ApiError;
use crate::mb::db::{MbCatalog, PooledConn};
use crate::mb::{entity, search, EntitySpec};
use actix_web::{http::StatusCode, web, HttpResponse, Responder, ResponseError};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::fmt;

const DEFAULT_PAGE: u32 = 25;
const MAX_PAGE: u32 = 100;

/// MusicBrainz's error envelope: `{"error": "...", "help": "..."}`.
#[derive(Debug)]
pub struct MbError(ApiError);

impl fmt::Display for MbError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl ResponseError for MbError {
    fn status_code(&self) -> StatusCode {
        self.0.status_code()
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        if status == StatusCode::INTERNAL_SERVER_ERROR {
            log::error!("{}", self.0);
        }
        HttpResponse::build(status).json(json!({
            "error": self.0.to_string(),
            "help": "For usage, please see https://musicbrainz.org/development/mmd",
        }))
    }
}

impl From<ApiError> for MbError {
    fn from(e: ApiError) -> Self {
        MbError(e)
    }
}

impl From<actix_web::error::BlockingError> for MbError {
    fn from(e: actix_web::error::BlockingError) -> Self {
        MbError(e.into())
    }
}

type MbResult<T> = Result<T, MbError>;

/// Same rationale as `routes::blocking`: DuckDB calls are synchronous, so they
/// run on the blocking pool with a per-call connection.
async fn blocking<T, F>(catalog: web::Data<MbCatalog>, f: F) -> MbResult<T>
where
    F: FnOnce(&PooledConn) -> Result<T, ApiError> + Send + 'static,
    T: Send + 'static,
{
    web::block(move || {
        let conn = catalog.get()?;
        f(&conn)
    })
    .await?
    .map_err(MbError)
}

// ------------------------------------------------------------------- index

const BANNER: &str = r"
██████╗ ██╗███████╗███████╗      ███╗   ███╗██████╗
██╔══██╗██║██╔════╝██╔════╝      ████╗ ████║██╔══██╗
██████╔╝██║█████╗  █████╗  █████╗██╔████╔██║██████╔╝
██╔══██╗██║██╔══╝  ██╔══╝  ╚════╝██║╚██╔╝██║██╔══██╗
██║  ██║██║██║     ██║           ██║ ╚═╝ ██║██████╔╝
╚═╝  ╚═╝╚═╝╚═╝     ╚═╝           ╚═╝     ╚═╝╚═════╝
";

pub async fn index() -> impl Responder {
    let body = format!(
        r#"{BANNER}
riff-mb v{version} — the MusicBrainz ws/2 API served from the JSON dumps via DuckDB.

WHAT THIS IS

  The MusicBrainz NDJSON dumps, imported into one DuckDB file and answered on
  ws/2's own paths with ws/2's own JSON shapes. No rate limit, no egress.

  Pointing a client at it is a base-URL change:

      MUSICBRAINZ_API_URL=http://localhost:{port}/ws/2

ENDPOINTS

  GET  /                             this page
  GET  /health                       liveness probe

  GET  /ws/2/{{entity}}/{{mbid}}         lookup — entity is one of:
                                       area artist event instrument label
                                       place recording release-group work
  GET  /ws/2/{{entity}}?query=&limit=&offset=
                                     search (Lucene-lite, see below)
  GET  /ws/2/recording?artist={{mbid}} browse recordings by artist
  GET  /ws/2/release-group?artist={{mbid}}
                                     browse release groups by artist
  GET  /ws/2/isrc/{{isrc}}             recordings carrying an ISRC

SEARCH

  The dialect Rocksky actually emits is supported:

      query=recording:"So What" AND artist:"Miles Davis" AND status:Official

  Recognized: recording: release-group: work: label: area: place: event:
  artist: artistname: arid: isrc: rgid: type: — plus bare terms, which match
  the entity's name. Matching is EXACT (case-insensitive, aliases included).
  status:, country:, tag: and other unsupported clauses are accepted and
  ignored. Responses are JSON only; `fmt` and `inc` are accepted and ignored —
  documents already carry aliases, tags, genres, ratings, relations, artist
  credits and ISRCs. The dumps contain no releases, so `releases` is never
  present in a response; keep the rate-limited upstream as fallback when
  release data matters.
"#,
        version = env!("CARGO_PKG_VERSION"),
        port = crate::listen_port(),
    );
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(body)
}

pub async fn health() -> impl Responder {
    HttpResponse::Ok().json(json!({ "status": "ok" }))
}

// ------------------------------------------------------------------ lookup

fn require_entity(path: &str) -> MbResult<&'static EntitySpec> {
    entity(path).ok_or_else(|| ApiError::NotFound(format!("Invalid entity: {path}")).into())
}

pub async fn lookup(
    catalog: web::Data<MbCatalog>,
    path: web::Path<(String, String)>,
) -> MbResult<HttpResponse> {
    let (kind, mbid) = path.into_inner();
    let spec = require_entity(&kind)?;

    let data = blocking(catalog, move |conn| {
        let mut stmt = conn.prepare(&format!("SELECT data FROM {} WHERE id = ?", spec.table))?;
        let mut rows = stmt.query([&mbid])?;
        match rows.next()? {
            Some(row) => Ok(row.get::<_, String>(0)?),
            None => Err(ApiError::NotFound("Not Found".into())),
        }
    })
    .await?;

    Ok(HttpResponse::Ok()
        .content_type("application/json; charset=utf-8")
        .body(data))
}

// ---------------------------------------------------------- search / browse

#[derive(Deserialize)]
pub struct CollectionParams {
    query: Option<String>,
    artist: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}

fn page(limit: Option<u32>, offset: Option<u32>) -> (u32, u32) {
    (limit.unwrap_or(DEFAULT_PAGE).clamp(1, MAX_PAGE), offset.unwrap_or(0))
}

pub async fn collection(
    catalog: web::Data<MbCatalog>,
    path: web::Path<String>,
    params: web::Query<CollectionParams>,
) -> MbResult<HttpResponse> {
    let spec = require_entity(&path.into_inner())?;
    let (limit, offset) = page(params.limit, params.offset);

    if let Some(query) = params.query.clone() {
        return search_entity(catalog, spec, query, limit, offset).await;
    }
    if let Some(artist_mbid) = params.artist.clone() {
        return browse_by_artist(catalog, spec, artist_mbid, limit, offset).await;
    }
    Err(ApiError::BadRequest(
        "One of `query` (search) or `artist` (browse) is required".into(),
    )
    .into())
}

/// `data` rows → JSON values with a search `score` attached.
fn scored(rows: Vec<String>) -> Result<Vec<Value>, ApiError> {
    rows.iter()
        .map(|data| {
            let mut doc: Map<String, Value> = serde_json::from_str(data)
                .map_err(|e| ApiError::Internal(format!("stored document is not JSON: {e}")))?;
            doc.insert("score".into(), json!(100));
            Ok(Value::Object(doc))
        })
        .collect()
}

/// RFC 3339 UTC "now", without pulling in a date crate for one field.
fn created_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let (h, m, s) = {
        let t = secs.rem_euclid(86_400);
        (t / 3600, (t % 3600) / 60, t % 60)
    };
    // Civil-from-days (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };
    format!("{y:04}-{mth:02}-{d:02}T{h:02}:{m:02}:{s:02}.000Z")
}

struct SearchSql {
    where_clause: String,
    binds: Vec<String>,
}

/// Builds the WHERE clause for a parsed query against one entity table.
/// Every clause is an index probe or a semi-join over an indexed side table.
fn search_sql(spec: &EntitySpec, q: &search::Query) -> SearchSql {
    let mut conds = Vec::new();
    let mut binds = Vec::new();
    let path = spec.path;

    if !q.name.is_empty() {
        let phrase = q.name.join(" ").to_lowercase();
        conds.push(format!(
            "(t.name_lc = ? OR t.id IN \
             (SELECT entity_id FROM mb_alias WHERE entity = '{path}' AND name_lc = ?))"
        ));
        binds.push(phrase.clone());
        binds.push(phrase);
    }
    if !q.artist.is_empty() {
        let phrase = q.artist.join(" ").to_lowercase();
        conds.push(format!(
            "t.id IN (SELECT entity_id FROM mb_artist_credit \
             WHERE entity = '{path}' AND (credit_name_lc = ? \
                OR artist_id IN (SELECT id FROM mb_artist WHERE name_lc = ?)))"
        ));
        binds.push(phrase.clone());
        binds.push(phrase);
    }
    for arid in &q.arid {
        conds.push(format!(
            "t.id IN (SELECT entity_id FROM mb_artist_credit \
             WHERE entity = '{path}' AND artist_id = ?)"
        ));
        binds.push(arid.clone());
    }
    for isrc in &q.isrc {
        conds.push(
            "t.id IN (SELECT recording_id FROM mb_recording_isrc WHERE isrc = ?)".into(),
        );
        binds.push(isrc.clone());
    }
    for id in &q.id {
        conds.push("t.id = ?".into());
        binds.push(id.clone());
    }
    for kind in &q.kind {
        conds.push("lower(coalesce(t.type, '')) = lower(?)".into());
        binds.push(kind.clone());
    }

    SearchSql {
        where_clause: conds.join(" AND "),
        binds,
    }
}

fn run_collection_query(
    conn: &PooledConn,
    spec: &EntitySpec,
    sql: &SearchSql,
    limit: u32,
    offset: u32,
) -> Result<(Vec<String>, u32), ApiError> {
    let count_sql = format!(
        "SELECT count(*) FROM {} t WHERE {}",
        spec.table, sql.where_clause
    );
    let total: u32 = conn.query_row(
        &count_sql,
        duckdb::params_from_iter(sql.binds.iter()),
        |r| r.get(0),
    )?;

    let page_sql = format!(
        "SELECT data FROM {} t WHERE {} ORDER BY t.name_lc, t.id LIMIT {limit} OFFSET {offset}",
        spec.table, sql.where_clause
    );
    let mut stmt = conn.prepare(&page_sql)?;
    let rows = stmt.query_map(duckdb::params_from_iter(sql.binds.iter()), |r| {
        r.get::<_, String>(0)
    })?;
    let docs = rows.collect::<Result<Vec<_>, _>>()?;
    Ok((docs, total))
}

async fn search_entity(
    catalog: web::Data<MbCatalog>,
    spec: &'static EntitySpec,
    query: String,
    limit: u32,
    offset: u32,
) -> MbResult<HttpResponse> {
    let parsed = search::parse_for(spec.path, &query);
    if parsed.is_empty() {
        return Err(ApiError::BadRequest(format!("Unparseable query: {query}")).into());
    }

    let (docs, total) = blocking(catalog, move |conn| {
        let sql = search_sql(spec, &parsed);
        run_collection_query(conn, spec, &sql, limit, offset)
    })
    .await?;

    let mut body = Map::new();
    body.insert("created".into(), json!(created_now()));
    body.insert("count".into(), json!(total));
    body.insert("offset".into(), json!(offset));
    body.insert(
        spec.plural.into(),
        Value::Array(scored(docs).map_err(MbError::from)?),
    );
    Ok(HttpResponse::Ok().json(Value::Object(body)))
}

async fn browse_by_artist(
    catalog: web::Data<MbCatalog>,
    spec: &'static EntitySpec,
    artist_mbid: String,
    limit: u32,
    offset: u32,
) -> MbResult<HttpResponse> {
    if !matches!(spec.path, "recording" | "release-group") {
        return Err(ApiError::BadRequest(format!(
            "Browsing {} by artist is not supported",
            spec.path
        ))
        .into());
    }

    let (docs, total) = blocking(catalog, move |conn| {
        let sql = SearchSql {
            where_clause: format!(
                "t.id IN (SELECT entity_id FROM mb_artist_credit \
                 WHERE entity = '{}' AND artist_id = ?)",
                spec.path
            ),
            binds: vec![artist_mbid],
        };
        run_collection_query(conn, spec, &sql, limit, offset)
    })
    .await?;

    let items: Vec<Value> = docs
        .iter()
        .map(|d| serde_json::from_str(d))
        .collect::<Result<_, _>>()
        .map_err(|e| MbError(ApiError::Internal(format!("stored document is not JSON: {e}"))))?;

    let mut body = Map::new();
    body.insert(format!("{}-count", spec.path), json!(total));
    body.insert(format!("{}-offset", spec.path), json!(offset));
    body.insert(spec.plural.into(), Value::Array(items));
    Ok(HttpResponse::Ok().json(Value::Object(body)))
}

// -------------------------------------------------------------------- isrc

pub async fn isrc(
    catalog: web::Data<MbCatalog>,
    path: web::Path<String>,
) -> MbResult<HttpResponse> {
    let code = path.into_inner().to_ascii_uppercase();
    let code_out = code.clone();

    let docs = blocking(catalog, move |conn| {
        let mut stmt = conn.prepare(
            "SELECT data FROM mb_recording WHERE id IN \
             (SELECT recording_id FROM mb_recording_isrc WHERE isrc = ?)",
        )?;
        let rows = stmt.query_map([&code], |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    })
    .await?;

    if docs.is_empty() {
        return Err(ApiError::NotFound("Not Found".into()).into());
    }
    let recordings: Vec<Value> = docs
        .iter()
        .map(|d| serde_json::from_str(d))
        .collect::<Result<_, _>>()
        .map_err(|e| MbError(ApiError::Internal(format!("stored document is not JSON: {e}"))))?;

    Ok(HttpResponse::Ok().json(json!({
        "isrc": code_out,
        "recordings": recordings,
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.route("/", web::get().to(index))
        .route("/health", web::get().to(health))
        .service(
            web::scope("/ws/2")
                .route("/isrc/{isrc}", web::get().to(isrc))
                .route("/{entity}", web::get().to(collection))
                .route("/{entity}/{mbid}", web::get().to(lookup)),
        );
}
