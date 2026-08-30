use crate::error::{ApiError, ApiResult};
use crate::models::{
    RecommendationsResponse, RecommendedAlbumsResponse, RecommendedArtistsResponse, StatusResponse,
};
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
GET  /v1/recommendations/artists?did=<did-or-handle>&limit=50
GET  /v1/recommendations/albums?did=<did-or-handle>&limit=50
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

impl RecommendationsQuery {
    fn key(&self) -> ApiResult<String> {
        self.did
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .ok_or_else(|| ApiError::BadRequest("missing required parameter: did".into()))
    }
}

#[get("/v1/recommendations")]
pub async fn recommendations(
    query: web::Query<RecommendationsQuery>,
    store: web::Data<Arc<Store>>,
    cfg: web::Data<Config>,
) -> ApiResult<HttpResponse> {
    let key = query.key()?;
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
        Ok(blend(&recs, limit, ratio, |r| r.source == "serendipity"))
    })
    .await
    .map_err(|e| ApiError::Internal(format!("query task panicked: {e}")))??;

    Ok(HttpResponse::Ok().json(RecommendationsResponse {
        recommendations: recs,
    }))
}

#[get("/v1/recommendations/artists")]
pub async fn artist_recommendations(
    query: web::Query<RecommendationsQuery>,
    store: web::Data<Arc<Store>>,
    cfg: web::Data<Config>,
) -> ApiResult<HttpResponse> {
    let key = query.key()?;
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let ratio = cfg.serendipity_ratio;

    let store = Arc::clone(&store);
    let artists = web::block(move || {
        if !store.has_table("artist_recommendations") {
            return Err(ApiError::Unavailable(
                "no artist snapshot yet — first refresh has not completed".into(),
            ));
        }
        let recs = store.get_artists(&key).map_err(ApiError::Internal)?;
        if recs.is_empty() {
            return Err(ApiError::NotFound(format!(
                "no artist recommendations for {key}"
            )));
        }
        Ok(blend(&recs, limit, ratio, |r| r.source == "serendipity"))
    })
    .await
    .map_err(|e| ApiError::Internal(format!("query task panicked: {e}")))??;

    Ok(HttpResponse::Ok().json(RecommendedArtistsResponse { artists }))
}

#[get("/v1/recommendations/albums")]
pub async fn album_recommendations(
    query: web::Query<RecommendationsQuery>,
    store: web::Data<Arc<Store>>,
) -> ApiResult<HttpResponse> {
    let key = query.key()?;
    let limit = query.limit.unwrap_or(50).clamp(1, 100);

    let store = Arc::clone(&store);
    let albums = web::block(move || {
        if !store.has_table("album_recommendations") {
            return Err(ApiError::Unavailable(
                "no album snapshot yet — first refresh has not completed".into(),
            ));
        }
        let recs = store.get_albums(&key).map_err(ApiError::Internal)?;
        if recs.is_empty() {
            return Err(ApiError::NotFound(format!(
                "no album recommendations for {key}"
            )));
        }
        // Albums have no serendipity pool — plain rank-order truncation.
        Ok(recs.into_iter().take(limit).collect::<Vec<_>>())
    })
    .await
    .map_err(|e| ApiError::Internal(format!("query task panicked: {e}")))??;

    Ok(HttpResponse::Ok().json(RecommendedAlbumsResponse { albums }))
}

/// Trims the precomputed list to the requested size: mostly ranked picks, a
/// fixed ratio of serendipity at the tail, then whatever is left if either
/// pool runs short.
fn blend<T: Clone>(
    recs: &[T],
    limit: usize,
    serendipity_ratio: f64,
    is_ser: impl Fn(&T) -> bool,
) -> Vec<T> {
    let ser_target = ((limit as f64) * serendipity_ratio).ceil() as usize;
    let main_target = limit.saturating_sub(ser_target);

    let (main, ser): (Vec<&T>, Vec<&T>) = recs.iter().partition(|r| !is_ser(r));

    let mut out: Vec<T> = main
        .iter()
        .take(main_target)
        .map(|r| (*r).clone())
        .collect();
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
