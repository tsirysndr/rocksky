use actix_web::{http::StatusCode, test, web, App};
use rocksky_matching::{
    providers::{CandidateFuture, Provider},
    service::{routes, Service},
    Candidate, MatchRequest, MatchResponse, Status,
};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
struct Fake {
    items: Vec<Candidate>,
    fail: bool,
    delay: Duration,
    calls: Arc<AtomicUsize>,
}
impl Provider for Fake {
    fn name(&self) -> &'static str {
        "fake"
    }
    fn candidates<'a>(&'a self, _: &'a MatchRequest) -> CandidateFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::Relaxed);
            tokio::time::sleep(self.delay).await;
            if self.fail {
                anyhow::bail!("private upstream details");
            }
            Ok(self.items.clone())
        })
    }
}
fn track() -> Candidate {
    Candidate {
        source: "fake".into(),
        id: "one".into(),
        title: "Beat It".into(),
        artists: vec!["Michael Jackson".into()],
        album: Some("Thriller".into()),
        ..Default::default()
    }
}
fn fake(items: Vec<Candidate>, fail: bool) -> Arc<Fake> {
    Arc::new(Fake {
        items,
        fail,
        delay: Duration::ZERO,
        calls: Arc::new(AtomicUsize::new(0)),
    })
}
fn body() -> serde_json::Value {
    serde_json::json!({"title":"Beat It","artists":["Michael Jackson"],"album":"Thriller"})
}
#[actix_web::test]
async fn full_http_match_contract() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![fake(
                vec![track()],
                false,
            )])))
            .configure(routes),
    )
    .await;
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(body())
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::OK);
    let result: MatchResponse = test::read_body_json(res).await;
    assert_eq!(result.status, Status::Matched);
    assert_eq!(result.track.unwrap().album.as_deref(), Some("Thriller"));
}
#[actix_web::test]
async fn invalid_request_never_calls_provider() {
    let provider = fake(vec![], false);
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![provider.clone()])))
            .configure(routes),
    )
    .await;
    for bad in [
        serde_json::json!({"title":"A"}),
        serde_json::json!({"title":" ","artists":["B"]}),
        serde_json::json!({"title":"A","artists":[]}),
        serde_json::json!({"title":"A","artists":["B"],"album":""}),
    ] {
        let res = test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/v1/match")
                .set_json(bad)
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    }
    assert_eq!(provider.calls.load(Ordering::Relaxed), 0);
}
#[actix_web::test]
async fn wrong_album_is_successful_unmatched_response() {
    let mut t = track();
    t.album = Some("Bad".into());
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![fake(vec![t], false)])))
            .configure(routes),
    )
    .await;
    let res: MatchResponse = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(body())
            .to_request(),
    )
    .await;
    assert_eq!(res.status, Status::Unmatched);
    assert!(res.track.is_none());
    assert_eq!(res.rejected[0].reasons, vec!["album_mismatch"]);
}
#[actix_web::test]
async fn upstream_failure_is_not_unmatched_or_leaked() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![fake(vec![], true)])))
            .configure(routes),
    )
    .await;
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(body())
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert!(!String::from_utf8(test::read_body(res).await.to_vec())
        .unwrap()
        .contains("private"));
}
#[actix_web::test]
async fn provider_timeout_is_bounded() {
    let mut state = Service::new(vec![Arc::new(Fake {
        items: vec![],
        fail: false,
        delay: Duration::from_secs(60),
        calls: Arc::default(),
    })]);
    state.deadline = Duration::from_millis(10);
    let app =
        test::init_service(App::new().app_data(web::Data::new(state)).configure(routes)).await;
    let res = tokio::time::timeout(
        Duration::from_secs(1),
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri("/v1/match")
                .set_json(body())
                .to_request(),
        ),
    )
    .await
    .unwrap();
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
}
#[actix_web::test]
async fn admission_control_returns_429() {
    let state = web::Data::new(Service::new(vec![fake(vec![], false)]));
    let _permit = state.capacity.acquire_many(32).await.unwrap();
    let app = test::init_service(App::new().app_data(state.clone()).configure(routes)).await;
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(body())
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
}
#[actix_web::test]
async fn oversized_json_rejected() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![])))
            .configure(routes),
    )
    .await;
    let res = test::call_service(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(serde_json::json!({"title":"a".repeat(20000),"artists":["B"]}))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::PAYLOAD_TOO_LARGE);
}
#[actix_web::test]
async fn ids_do_not_allow_album_filter_bypass_over_http() {
    let mut t = track();
    t.album = Some("Thriller (Remastered)".into());
    t.identifiers.isrc = Some("USABC1234567".into());
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![fake(vec![t], false)])))
            .configure(routes),
    )
    .await;
    let mut input = body();
    input["identifiers"] = serde_json::json!({"isrc":"USABC1234567"});
    let res: MatchResponse = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(input)
            .to_request(),
    )
    .await;
    assert_eq!(res.status, Status::Unmatched);
}
#[actix_web::test]
async fn healthy_provider_fallback_is_validated_and_flagged() {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service::new(vec![
                fake(vec![], true),
                fake(vec![track()], false),
            ])))
            .configure(routes),
    )
    .await;
    let result: MatchResponse = test::call_and_read_body_json(
        &app,
        test::TestRequest::post()
            .uri("/v1/match")
            .set_json(body())
            .to_request(),
    )
    .await;
    assert_eq!(result.status, Status::Matched);
    assert_eq!(result.warnings, vec!["fake_unavailable"]);
}
