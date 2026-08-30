use crate::error::{ApiError, ApiResult};
use crate::models::{Recommendation, RecommendationsResponse, StatusResponse};
use crate::store::Store;
use crate::{refresh, Config};
use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use std::sync::{Arc, Mutex};

const BANNER: &str = r#"
     _      _  __ _
  __| |_ __(_)/ _| |_
 / _` | '__| | |_| __|
| (_| | |  | |  _| |_
 \__,_|_|  |_|_|  \__|

Precomputed music recommendations for Rocksky.

GET  /health
GET  /v1/status
GET  /v1/recommendations?did=<did-or-handle>&limit=50
POST /v1/refresh
"#;

/// Shared handle for refreshes. The mutex serializes them; try_lock means a
/// second trigger reports 409 instead of queueing.
pub struct Refresher {
    pub db_url: String,
    pub running: Mutex<()>,
}

#[get("/")]
pub async fn index() -> HttpResponse {
    HttpResponse::Ok().content_type("text/plain").body(BANNER)
}

#[get("/health")]
pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

#[get("/v1/status")]
pub async fn status(store: web::Data<Arc<Store>>, cfg: web::Data<Config>) -> HttpResponse {
    let store = Arc::clone(&store);
    let s = web::block(move || store.status()).await.ok().flatten();
    HttpResponse::Ok().json(StatusResponse {
        refreshed_at: s.map(|v| v.0),
        refresh_took_ms: s.map(|v| v.1),
        users: s.map(|v| v.2).unwrap_or(0),
        rows: s.map(|v| v.3).unwrap_or(0),
        refresh_interval_secs: cfg.refresh_interval_secs,
    })
}

#[derive(Deserialize)]
pub struct RecommendationsQuery {
    did: Option<String>,
    limit: Option<usize>,
}

#[get("/v1/recommendations")]
pub async fn recommendations(
    query: web::Query<RecommendationsQuery>,
    store: web::Data<Arc<Store>>,
    cfg: web::Data<Config>,
) -> ApiResult<HttpResponse> {
    let key = query
        .did
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("missing required parameter: did".into()))?
        .to_string();

    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let ratio = cfg.serendipity_ratio;

    let store = Arc::clone(&store);
    let recs = web::block(move || {
        if !store.is_ready() {
            return Err(ApiError::Unavailable(
                "no snapshot yet — first refresh has not completed".into(),
            ));
        }
        let recs = store.get(&key).map_err(ApiError::Internal)?;
        if recs.is_empty() {
            return Err(ApiError::NotFound(format!("no recommendations for {key}")));
        }
        Ok(blend(&recs, limit, ratio))
    })
    .await
    .map_err(|e| ApiError::Internal(format!("query task panicked: {e}")))??;

    Ok(HttpResponse::Ok().json(RecommendationsResponse {
        recommendations: recs,
    }))
}

/// Trims the precomputed list to the requested size: mostly ranked picks, a
/// fixed ratio of serendipity at the tail, then whatever is left if either
/// pool runs short.
fn blend(recs: &[Recommendation], limit: usize, serendipity_ratio: f64) -> Vec<Recommendation> {
    let ser_target = ((limit as f64) * serendipity_ratio).ceil() as usize;
    let main_target = limit.saturating_sub(ser_target);

    let (main, ser): (Vec<&Recommendation>, Vec<&Recommendation>) =
        recs.iter().partition(|r| r.source != "serendipity");

    let mut out: Vec<Recommendation> = main.iter().take(main_target).map(|r| (*r).clone()).collect();
    out.extend(ser.iter().take(ser_target).map(|r| (*r).clone()));
    if out.len() < limit {
        out.extend(
            main.iter()
                .skip(main_target)
                .take(limit - out.len())
                .map(|r| (*r).clone()),
        );
    }
    if out.len() < limit {
        out.extend(
            ser.iter()
                .skip(ser_target)
                .take(limit - out.len())
                .map(|r| (*r).clone()),
        );
    }
    out
}

#[post("/v1/refresh")]
pub async fn trigger_refresh(
    store: web::Data<Arc<Store>>,
    refresher: web::Data<Arc<Refresher>>,
    cfg: web::Data<Config>,
) -> ApiResult<HttpResponse> {
    let store = Arc::clone(&store);
    let refresher = Arc::clone(&refresher);
    let cfg = cfg.get_ref().clone();

    // POST is an explicit ask, so it forces past the nothing-changed skip.
    let outcome = web::block(move || {
        let Ok(_guard) = refresher.running.try_lock() else {
            return Err(ApiError::Conflict("a refresh is already running".into()));
        };
        refresh::refresh(&cfg, &refresher.db_url, &store, true)
            .map_err(|e| ApiError::Internal(format!("refresh failed: {e}")))
    })
    .await
    .map_err(|e| ApiError::Internal(format!("refresh task panicked: {e}")))??;

    Ok(match outcome {
        refresh::RefreshOutcome::Completed {
            users,
            rows,
            took_ms,
        } => HttpResponse::Ok().json(serde_json::json!({
            "status": "refreshed",
            "users": users,
            "rows": rows,
            "tookMs": took_ms,
        })),
        refresh::RefreshOutcome::Skipped => {
            HttpResponse::Ok().json(serde_json::json!({ "status": "skipped" }))
        }
    })
}
