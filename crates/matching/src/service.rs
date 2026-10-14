use crate::{cache::MatchCache, providers::Provider, resolve, MatchRequest};
use actix_web::{web, HttpResponse};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

pub struct Service {
    pub cache: Option<MatchCache>,
    pub providers: Vec<Arc<dyn Provider>>,
    pub deadline: Duration,
    pub capacity: Semaphore,
}
impl Service {
    pub fn new(providers: Vec<Arc<dyn Provider>>) -> Self {
        Self {
            cache: None,
            providers,
            deadline: Duration::from_secs(8),
            capacity: Semaphore::new(32),
        }
    }
}

pub fn routes(config: &mut web::ServiceConfig) {
    config
        .app_data(web::JsonConfig::default().limit(16 * 1024))
        .route(
            "/health",
            web::get().to(|| async { HttpResponse::Ok().json(serde_json::json!({"status":"ok"})) }),
        )
        .route("/v1/match", web::post().to(match_track));
}

async fn match_track(
    service: web::Data<Service>,
    request: web::Json<MatchRequest>,
) -> HttpResponse {
    if let Err(error) = request.validate() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error":error}));
    }
    let cache_key = service.cache.as_ref().map(|cache| {
        cache.key(
            &request,
            &service
                .providers
                .iter()
                .map(|p| p.name())
                .collect::<Vec<_>>(),
        )
    });
    if let (Some(cache), Some(key)) = (&service.cache, &cache_key) {
        if let Some(response) = cache.get(key).await {
            return HttpResponse::Ok()
                .insert_header(("x-matching-cache", "HIT"))
                .json(response);
        }
    }
    let Ok(_permit) = service.capacity.try_acquire() else {
        return HttpResponse::TooManyRequests()
            .json(serde_json::json!({"error":"matching service busy"}));
    };
    let request = Arc::new(request.into_inner());
    let mut tasks = tokio::task::JoinSet::new();
    for provider in &service.providers {
        let provider = provider.clone();
        let request = request.clone();
        let deadline = service.deadline;
        tasks.spawn(async move {
            let name = provider.name();
            (
                name,
                tokio::time::timeout(deadline, provider.candidates(&request)).await,
            )
        });
    }
    let mut candidates = vec![];
    let mut failed = vec![];
    while let Some(result) = tasks.join_next().await {
        match result {
            Ok((_, Ok(Ok(mut items)))) => candidates.append(&mut items),
            Ok((name, _)) => failed.push(name),
            Err(_) => failed.push("provider_task"),
        }
    }
    match resolve(&request, candidates) {
        Ok(mut response) => {
            // An unavailable provider is different from a completed no-match.
            // Validated candidates from healthy providers still provide fallback.
            if service.providers.is_empty()
                || (!failed.is_empty() && response.candidates.is_empty())
            {
                return HttpResponse::ServiceUnavailable().json(serde_json::json!({"error":"candidate retrieval incomplete","failedProviders":failed}));
            }
            response.warnings = failed
                .into_iter()
                .map(|name| format!("{name}_unavailable"))
                .collect();
            response.warnings.sort();
            if let Some(track) = response.track.as_mut() {
                if let Some(provider) = service.providers.iter().find(|p| p.name() == track.source)
                {
                    // Preserve the validated match even if optional metadata is slow.
                    let _ =
                        tokio::time::timeout(Duration::from_secs(1), provider.enrich(track)).await;
                }
            }
            if let (Some(cache), Some(key)) = (&service.cache, &cache_key) {
                cache.put(key, &response).await;
            }
            HttpResponse::Ok()
                .insert_header((
                    "x-matching-cache",
                    if service.cache.is_some() {
                        "MISS"
                    } else {
                        "BYPASS"
                    },
                ))
                .json(response)
        }
        Err(error) => HttpResponse::BadRequest().json(serde_json::json!({"error":error})),
    }
}
