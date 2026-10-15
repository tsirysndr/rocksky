//! Public read-only operational views with allowlisted scrobble metadata.
//! Never return raw payloads, checkpoint results, or credentials.
use crate::{cleanup::CleanupSettings, service::Service, Queue};
use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

include!(concat!(env!("OUT_DIR"), "/dashboard_assets.rs"));

pub(crate) type CompletedCache = Mutex<Option<(Instant, Vec<Count>)>>;
pub(crate) type SearchCache = Mutex<Option<(Instant, Vec<(String, String)>)>>;
pub(crate) type Cache = Mutex<Option<(Instant, Overview)>>;

#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct Count {
    pub kind: String,
    pub status: String,
    pub count: i64,
    pub oldest_created_at: i64,
}
#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct Cursor {
    pub source: String,
    pub cursor_value: i64,
}
#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct Bucket {
    pub collection: String,
    pub minute: i64,
    pub kind: String,
    pub count: i64,
}
#[derive(Clone, Serialize)]
pub struct Overview {
    pub as_of: i64,
    pub backend: &'static str,
    pub counts: Vec<Count>,
    pub cursors: Vec<Cursor>,
    pub completions: Vec<Bucket>,
    pub cleanup: CleanupSettings,
}

#[derive(Default, Deserialize)]
pub struct JobFilter {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub jetstream_version: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub q: String,
    pub before: Option<String>,
    pub limit: Option<i64>,
}
#[derive(Serialize, sqlx::FromRow)]
pub struct JobSummary {
    pub id: String,
    pub source: String,
    pub started_at_ms: i64,
    pub kind: String,
    pub status: String,
    pub attempts: i64,
    pub available_at: i64,
    pub lease_until: i64,
    pub last_error: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub compacted_at: i64,
}
#[derive(Serialize)]
pub struct JobPage {
    pub jobs: Vec<JobSummary>,
    pub next: Option<String>,
}
#[derive(Serialize, sqlx::FromRow)]
pub struct Step {
    pub name: String,
    pub completed_at: i64,
}
const COLUMNS: &str = "id,kind,source,started_at_ms,status,attempts,available_at,lease_until,CASE WHEN last_error='' THEN '' ELSE 'Processing failed; operator inspection required' END AS last_error,created_at,updated_at,compacted_at";

impl JobFilter {
    fn validate(&self) -> anyhow::Result<(i64, i64, String)> {
        anyhow::ensure!(
            ["", "pending", "processing", "completed", "failed"].contains(&self.status.as_str()),
            "invalid status"
        );
        anyhow::ensure!(
            ["", "v1", "v2"].contains(&self.jetstream_version.as_str()),
            "invalid Jetstream version"
        );
        anyhow::ensure!(self.q.len() <= 200, "search too long");
        anyhow::ensure!(self.kind.len() <= 128, "kind too long");
        anyhow::ensure!(
            self.id.is_empty() || valid_id(&self.id),
            "enter a full 64-character job ID"
        );
        let limit = self.limit.unwrap_or(50);
        anyhow::ensure!((1..=100).contains(&limit), "limit must be 1..100");
        let (timestamp, id) = match &self.before {
            None => (i64::MAX, String::new()),
            Some(value) => {
                let (time, id) = value
                    .split_once(':')
                    .ok_or_else(|| anyhow::anyhow!("invalid cursor"))?;
                let time: i64 = time.parse()?;
                anyhow::ensure!(time >= 0 && valid_id(id), "invalid cursor");
                (time, id.to_owned())
            }
        };
        Ok((limit, timestamp, id))
    }
}
fn valid_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

impl Queue {
    pub async fn dashboard_overview(&self) -> anyhow::Result<Overview> {
        // Shared by all Actix workers: one live snapshot per five seconds regardless of viewer count.
        let mut cache = self.dashboard_cache.lock().await;
        if let Some((at, value)) = cache.as_ref() {
            if at.elapsed() < Duration::from_secs(5) {
                return Ok(value.clone());
            }
        }
        let as_of: i64 = sqlx::query_scalar(&format!("SELECT {}", self.now()))
            .fetch_one(&self.pool)
            .await?;
        let mut counts = sqlx::query_as::<_, Count>("SELECT kind,status,count(*) AS count,min(created_at) AS oldest_created_at FROM rocksky_durable_jobs WHERE status<>'completed' GROUP BY kind,status").fetch_all(&self.pool).await?;
        let mut completed = self.dashboard_completed_cache.lock().await;
        if completed
            .as_ref()
            .is_none_or(|(at, _)| at.elapsed() >= Duration::from_secs(60))
        {
            let totals = sqlx::query_as::<_, Count>("SELECT kind,status,count(*) AS count,min(created_at) AS oldest_created_at FROM rocksky_durable_jobs WHERE status='completed' GROUP BY kind,status").fetch_all(&self.pool).await?;
            *completed = Some((Instant::now(), totals));
        }
        counts.extend(completed.as_ref().unwrap().1.clone());
        drop(completed);
        let cursors = sqlx::query_as::<_, Cursor>(
            "SELECT source,cursor_value FROM rocksky_durable_cursors ORDER BY source",
        )
        .fetch_all(&self.pool)
        .await?;
        let completions = sqlx::query_as::<_, Bucket>("SELECT CAST(updated_at / 60 AS BIGINT) * 60 AS minute,kind,collection,count(*) AS count FROM rocksky_durable_jobs WHERE status='completed' AND updated_at >= $1 GROUP BY CAST(updated_at / 60 AS BIGINT),kind,collection ORDER BY minute")
            .bind((as_of / 60 - 59) * 60).fetch_all(&self.pool).await?;
        let value = Overview {
            as_of,
            backend: if self.postgres {
                "PostgreSQL"
            } else {
                "SQLite"
            },
            counts,
            cursors,
            completions,
            cleanup: CleanupSettings::from_env()?,
        };
        *cache = Some((Instant::now(), value.clone()));
        Ok(value)
    }
    pub async fn dashboard_jobs(&self, filter: &JobFilter) -> anyhow::Result<JobPage> {
        let (limit, before, before_id) = filter.validate()?;
        // Bound payload decoding independently of queue size. Only allowlisted fields are searchable.
        let needle = filter.q.trim().to_lowercase();
        let mut search_ids = Vec::new();
        if !needle.is_empty() {
            let mut cache = self.dashboard_search_cache.lock().await;
            if cache
                .as_ref()
                .is_none_or(|(at, _)| at.elapsed() >= Duration::from_secs(5))
            {
                let recent: Vec<(String, String)> = sqlx::query_as("SELECT id,payload FROM rocksky_durable_jobs ORDER BY created_at DESC,id DESC LIMIT 2000").fetch_all(&self.pool).await?;
                let searchable = recent
                    .into_iter()
                    .map(|(id, payload)| {
                        let metadata =
                            scrobble_metadata(&payload).unwrap_or(serde_json::Value::Null);
                        let haystack = format!("{} {}", id, metadata).to_lowercase();
                        (id, haystack)
                    })
                    .collect();
                *cache = Some((Instant::now(), searchable));
            }
            for (id, haystack) in &cache.as_ref().unwrap().1 {
                if needle
                    .split_whitespace()
                    .all(|word| haystack.contains(word))
                {
                    search_ids.push(id.clone());
                }
            }
            if search_ids.is_empty() {
                return Ok(JobPage {
                    jobs: vec![],
                    next: None,
                });
            }
        }
        // IDs come exclusively from the database and are validated before interpolation.
        let search_clause = if needle.is_empty() {
            String::new()
        } else {
            let ids = search_ids
                .iter()
                .filter(|id| valid_id(id))
                .map(|id| format!("'{id}'"))
                .collect::<Vec<_>>()
                .join(",");
            format!(" AND id IN ({ids})")
        };
        let sql = format!("SELECT {COLUMNS} FROM rocksky_durable_jobs WHERE ($1='' OR status=$1) AND ($2='' OR kind=$2) AND ($3='' OR id=$3) AND (created_at < $4 OR (created_at=$4 AND id<$5)) AND ($7='' OR source LIKE $7) {search_clause} ORDER BY created_at DESC,id DESC LIMIT $6");
        let mut jobs: Vec<JobSummary> = sqlx::query_as(&sql)
            .bind(&filter.status)
            .bind(&filter.kind)
            .bind(&filter.id)
            .bind(before)
            .bind(before_id)
            .bind(limit + 1)
            .bind(if filter.jetstream_version.is_empty() {
                String::new()
            } else {
                format!("jetstream:{}:%", filter.jetstream_version)
            })
            .fetch_all(&self.pool)
            .await?;
        let more = jobs.len() > limit as usize;
        jobs.truncate(limit as usize);
        let next = if more {
            jobs.last()
                .map(|job| format!("{}:{}", job.created_at, job.id))
        } else {
            None
        };
        Ok(JobPage { jobs, next })
    }
}

fn unavailable(error: anyhow::Error) -> HttpResponse {
    tracing::warn!(%error, "dashboard query failed");
    HttpResponse::ServiceUnavailable()
        .insert_header(("Cache-Control", "no-store"))
        .json(serde_json::json!({"error":"Queue data is temporarily unavailable"}))
}
async fn overview(state: web::Data<Service>) -> HttpResponse {
    match state.queue.dashboard_overview().await {
        Ok(data) => HttpResponse::Ok()
            .insert_header(("Cache-Control", "no-store"))
            .json(data),
        Err(error) => unavailable(error),
    }
}
async fn jobs(state: web::Data<Service>, filter: web::Query<JobFilter>) -> HttpResponse {
    if let Err(error) = filter.validate() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error":error.to_string()}));
    }
    match state.queue.dashboard_jobs(&filter).await {
        Ok(data) => HttpResponse::Ok()
            .insert_header(("Cache-Control", "no-store"))
            .json(data),
        Err(error) => unavailable(error),
    }
}
async fn detail(state: web::Data<Service>, id: web::Path<String>) -> HttpResponse {
    if !valid_id(&id) {
        return HttpResponse::BadRequest().finish();
    }
    let result = async {
        let job: Option<JobSummary> = sqlx::query_as(&format!("SELECT {COLUMNS} FROM rocksky_durable_jobs WHERE id=$1")).bind(id.as_str()).fetch_optional(&state.queue.pool).await?;
        let steps: Vec<Step> = sqlx::query_as("SELECT name,completed_at FROM rocksky_durable_steps WHERE job_id=$1 ORDER BY completed_at,name").bind(id.as_str()).fetch_all(&state.queue.pool).await?;
        let raw: Option<(String, String)> = sqlx::query_as("SELECT payload,attempt_history FROM rocksky_durable_jobs WHERE id=$1").bind(id.as_str()).fetch_optional(&state.queue.pool).await?;
        let (scrobble, attempts) = raw.map(|(payload, history)| (
            scrobble_metadata(&payload), serde_json::from_str::<serde_json::Value>(&history).unwrap_or_else(|_| serde_json::json!([]))
        )).unwrap_or((None, serde_json::json!([])));
        Ok::<_, anyhow::Error>((job,steps,scrobble,attempts))
    }.await;
    match result {
        Ok((Some(job), steps, scrobble, attempts)) => HttpResponse::Ok()
            .insert_header(("Cache-Control", "no-store"))
            .json(serde_json::json!({"job":job,"steps":steps,"scrobble":scrobble,"attempts":attempts})),
        Ok((None, _, _, _)) => HttpResponse::NotFound().finish(),
        Err(error) => unavailable(error),
    }
}
// Explicit field allowlist: inspection must never expose arbitrary queue data.
fn scrobble_metadata(payload: &str) -> Option<serde_json::Value> {
    let root: serde_json::Value = serde_json::from_str(payload).ok()?;
    let track = root
        .get("track")
        .or_else(|| root.get("commit")?.get("record"))?;
    if !track.is_object() {
        return None;
    }
    let mut result = serde_json::Map::new();
    for key in [
        "title",
        "artist",
        "album",
        "albumArtist",
        "duration",
        "trackNumber",
        "discNumber",
        "timestamp",
        "createdAt",
        "releaseDate",
        "year",
        "isrc",
        "mbId",
        "mbid",
        "spotifyLink",
        "albumArt",
        "albumArtUrl",
    ] {
        if let Some(value) = track
            .get(key)
            .filter(|v| v.is_string() || v.is_number() || v.is_null())
        {
            result.insert(key.into(), value.clone());
        }
    }
    // Teal jobs retain only these public music fields in dashboard responses.
    if track["$type"] == "fm.teal.feed.play" {
        for (from, to) in [
            ("trackName", "title"),
            ("releaseName", "album"),
            ("playedTime", "createdAt"),
            ("recordingMbId", "mbId"),
        ] {
            if let Some(value) = track.get(from).filter(|v| v.is_string()) {
                result.insert(to.into(), value.clone());
            }
        }
        if let Some(artists) = track["artists"].as_array() {
            let names: Vec<&str> = artists
                .iter()
                .filter_map(|a| a["artistName"].as_str())
                .collect();
            result.insert("artist".into(), names.join(", ").into());
        }
        // The dashboard displays durations in milliseconds; Teal stores seconds.
        if let Some(duration) = track["duration"].as_i64().and_then(|n| n.checked_mul(1000)) {
            result.insert("duration".into(), duration.into());
        }
    }
    for key in ["did", "recordKey"] {
        if let Some(value) = root.get(key).filter(|v| v.is_string()) {
            result.insert(key.into(), value.clone());
        }
    }
    Some(serde_json::Value::Object(result))
}

async fn redirect() -> HttpResponse {
    HttpResponse::TemporaryRedirect()
        .insert_header(("Location", "/dashboard/"))
        .finish()
}
async fn index() -> HttpResponse {
    asset_response("index.html")
}
async fn asset(path: web::Path<String>) -> HttpResponse {
    asset_response(&path)
}
fn asset_response(path: &str) -> HttpResponse {
    let Some(bytes) = embedded_asset(path) else {
        return HttpResponse::NotFound().finish();
    };
    let content_type = match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("svg") => "image/svg+xml",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
    HttpResponse::Ok().content_type(content_type)
        .insert_header(("Cache-Control", if path == "index.html" { "no-cache" } else { "public, max-age=31536000, immutable" }))
        .insert_header(("X-Content-Type-Options", "nosniff"))
        .insert_header(("Referrer-Policy", "no-referrer"))
        .insert_header(("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"))
        .body(bytes)
}
pub fn routes(config: &mut web::ServiceConfig) {
    config
        .route("/", web::get().to(redirect))
        .route("/dashboard", web::get().to(redirect))
        .route("/dashboard/", web::get().to(index))
        .route("/dashboard/{path:.*}", web::get().to(asset))
        .route("/v1/dashboard/overview", web::get().to(overview))
        .route("/v1/dashboard/jobs", web::get().to(jobs))
        .route("/v1/dashboard/jobs/{id}", web::get().to(detail));
}

#[cfg(test)]
mod tests;
