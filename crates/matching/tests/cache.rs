mod support;
use actix_web::{test, web, App};
use rocksky_matching::{
    cache::{response_ttl, MatchCache},
    providers::{CandidateFuture, Provider},
    resolve,
    service::{routes, Service},
    Candidate, MatchRequest, MatchResponse,
};
use serde_json::json;
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

fn request() -> MatchRequest {
    serde_json::from_value(
        json!({"title":"Beat It","artists":["Michael Jackson"],"album":"Thriller"}),
    )
    .unwrap()
}
fn track() -> Candidate {
    Candidate {
        source: "fake".into(),
        id: "one".into(),
        title: "Beat It".into(),
        artists: vec!["Michael Jackson".into()],
        album: Some("Thriller".into()),
        provider_score: Some(87.0),
        provider_rank: Some(307167),
        ..Default::default()
    }
}
struct Fake {
    calls: AtomicUsize,
    fail: bool,
}
impl Provider for Fake {
    fn name(&self) -> &'static str {
        "fake"
    }
    fn candidates<'a>(&'a self, _: &'a MatchRequest) -> CandidateFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::Relaxed);
            if self.fail {
                anyhow::bail!("upstream unavailable");
            }
            Ok(vec![track()])
        })
    }
}
#[actix_web::test]
async fn repeated_http_request_uses_redis_even_when_provider_capacity_is_full() {
    let redis = support::Redis::start().await;
    let provider = Arc::new(Fake {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let mut service = Service::new(vec![provider.clone()]);
    service.cache = Some(MatchCache::new(&redis.url, "test", 86400, 300).unwrap());
    let service = web::Data::new(service);
    let app = test::init_service(App::new().app_data(service.clone()).configure(routes)).await;
    let first = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(request())
            .to_request(),
    )
    .await;
    assert_eq!(first.headers().get("x-matching-cache").unwrap(), "MISS");
    let first: serde_json::Value = test::read_body_json(first).await;
    let _permits = service.capacity.acquire_many(32).await.unwrap();
    let second = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(request())
            .to_request(),
    )
    .await;
    assert_eq!(second.headers().get("x-matching-cache").unwrap(), "HIT");
    let second: serde_json::Value = test::read_body_json(second).await;
    assert_eq!(first, second);
    assert_eq!(second["track"]["providerScore"], 87.0);
    assert_eq!(provider.calls.load(Ordering::Relaxed), 1);
}
#[actix_web::test]
async fn keys_include_all_constraints_provider_set_and_configuration() {
    let cache = MatchCache::new("redis://127.0.0.1", "test", 86400, 300).unwrap();
    let base = serde_json::to_value(request()).unwrap();
    let key = cache.key(&request(), &["fake"]);
    for (field, value) in [
        ("title", json!("Beat It (Live)")),
        ("artists", json!(["Other"])),
        ("album", json!("Bad")),
        ("albumArtist", json!("Other")),
        ("durationMs", json!(1000)),
    ] {
        let mut changed = base.clone();
        changed[field] = value;
        assert_ne!(
            key,
            cache.key(&serde_json::from_value(changed).unwrap(), &["fake"])
        );
    }
    for id in [
        "musicbrainzRecordingId",
        "musicbrainzReleaseId",
        "isrc",
        "spotifyTrackId",
        "deezerTrackId",
    ] {
        let mut changed = base.clone();
        changed["identifiers"][id] = json!("different");
        assert_ne!(
            key,
            cache.key(&serde_json::from_value(changed).unwrap(), &["fake"])
        );
    }
    assert_ne!(key, cache.key(&request(), &["other"]));
    assert_ne!(
        key,
        MatchCache::new("redis://127.0.0.1", "other", 86400, 300)
            .unwrap()
            .key(&request(), &["fake"])
    );
}
#[actix_web::test]
async fn expiry_and_corrupt_payloads_become_misses() {
    let redis = support::Redis::start().await;
    let cache = MatchCache::new(&redis.url, "test", 1, 1).unwrap();
    let response = resolve(&request(), vec![track()]).unwrap();
    let key = cache.key(&request(), &["fake"]);
    cache.put(&key, &response).await;
    assert!(cache.get(&key).await.is_some());
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert!(cache.get(&key).await.is_none());
    for value in [
        "not JSON".to_owned(),
        serde_json::to_string(&MatchResponse {
            policy_version: "old".into(),
            ..response.clone()
        })
        .unwrap(),
    ] {
        redis.entries.lock().unwrap().insert(
            key.clone(),
            (value, Instant::now() + Duration::from_secs(5)),
        );
        assert!(cache.get(&key).await.is_none());
    }
}
#[actix_web::test]
async fn provider_failures_and_partial_results_are_not_cached() {
    let redis = support::Redis::start().await;
    let good = Arc::new(Fake {
        calls: AtomicUsize::new(0),
        fail: false,
    });
    let bad = Arc::new(Fake {
        calls: AtomicUsize::new(0),
        fail: true,
    });
    for providers in [
        vec![bad.clone() as Arc<dyn Provider>],
        vec![good.clone() as Arc<dyn Provider>, bad.clone()],
    ] {
        let mut service = Service::new(providers);
        service.cache = Some(MatchCache::new(&redis.url, "test", 86400, 300).unwrap());
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(service))
                .configure(routes),
        )
        .await;
        for _ in 0..2 {
            let _ = test::call_service(
                &app,
                test::TestRequest::post()
                    .uri("/v1/match")
                    .set_json(request())
                    .to_request(),
            )
            .await;
        }
        assert!(redis.entries.lock().unwrap().is_empty());
    }
    assert_eq!(bad.calls.load(Ordering::Relaxed), 4);
}
#[actix_web::test]
async fn redis_outage_does_not_fail_matching_or_delay_it_indefinitely() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("redis://{}", listener.local_addr().unwrap());
    drop(listener);
    let mut service = Service::new(vec![Arc::new(Fake {
        calls: AtomicUsize::new(0),
        fail: false,
    })]);
    service.cache = Some(MatchCache::new(&url, "test", 86400, 300).unwrap());
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(service))
            .configure(routes),
    )
    .await;
    let result = tokio::time::timeout(
        Duration::from_secs(1),
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/v1/match")
                .set_json(request())
                .to_request(),
        ),
    )
    .await
    .unwrap();
    assert!(result.status().is_success());
}
#[actix_web::test]
async fn preview_expiry_caps_long_ttl_and_negative_results_use_short_ttl() {
    let mut response = resolve(&request(), vec![track()]).unwrap();
    assert_eq!(response_ttl(&response, 86400, 300, 1000), 86400);
    response.candidates[0].track.preview =
        Some("https://cdn.example/preview.mp3?hdnea=exp=2000~acl=/*~hmac=test".into());
    assert_eq!(response_ttl(&response, 86400, 300, 1000), 940);
    assert_eq!(response_ttl(&response, 86400, 300, 2000), 0);
    response.candidates[0].track.preview = Some("https://cdn.example/preview.mp3".into());
    assert_eq!(response_ttl(&response, 86400, 300, 1000), 300);
    let unmatched = resolve(&request(), vec![]).unwrap();
    assert_eq!(response_ttl(&unmatched, 86400, 300, 1000), 300);
}

#[actix_web::test]
async fn stalled_redis_is_bounded() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let cache = MatchCache::new(
        &format!("redis://{}", listener.local_addr().unwrap()),
        "test",
        86400,
        300,
    )
    .unwrap();
    let server = tokio::spawn(async move {
        let (_stream, _) = listener.accept().await.unwrap();
        tokio::time::sleep(Duration::from_secs(5)).await;
    });
    assert!(
        tokio::time::timeout(Duration::from_secs(1), cache.get("test"))
            .await
            .unwrap()
            .is_none()
    );
    server.abort();
}
