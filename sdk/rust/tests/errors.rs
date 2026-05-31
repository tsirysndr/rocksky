//! Error mapping tests.

mod common;

use common::mock_client;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn http_404_maps_to_not_found_error() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSong"))
        .respond_with(
            ResponseTemplate::new(404)
                .set_body_json(json!({"error": "NotFound", "message": "no such song"})),
        )
        .mount(&server)
        .await;

    let err = client.song().get("at://nope").await.unwrap_err();
    assert!(err.is_not_found());
    assert_eq!(err.status(), Some(404));
    match &err {
        rocksky::Error::Api {
            status,
            error,
            message,
            ..
        } => {
            assert_eq!(*status, 404);
            assert_eq!(error.as_deref(), Some("NotFound"));
            assert_eq!(message.as_deref(), Some("no such song"));
        }
        other => panic!("expected Api error, got {other:?}"),
    }
}

#[tokio::test]
async fn http_429_maps_to_rate_limited() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.search"))
        .respond_with(ResponseTemplate::new(429).set_body_string("slow down"))
        .mount(&server)
        .await;

    let err = client.feed().search("x").await.unwrap_err();
    assert!(err.is_rate_limited());
    assert_eq!(err.status(), Some(429));
}

#[tokio::test]
async fn http_500_maps_to_server_error() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.search"))
        .respond_with(ResponseTemplate::new(503).set_body_string("backend down"))
        .mount(&server)
        .await;

    let err = client.feed().search("x").await.unwrap_err();
    assert!(err.is_server_error());
    assert!(!err.is_client_error());
}

#[tokio::test]
async fn missing_token_error_doesnt_send_a_request() {
    // Point at an unroutable address — if the SDK tried to hit the network,
    // the test would fail with a transport error instead of MissingToken.
    let client = rocksky::Client::builder()
        .base_url("http://127.0.0.1:1")
        .build();
    let err = client.apikey().list().send().await.unwrap_err();
    assert!(matches!(err, rocksky::Error::MissingToken { .. }));
}

#[tokio::test]
async fn error_display_includes_status_and_method() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSong"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({
            "error": "BadRequest", "message": "bad uri"
        })))
        .mount(&server)
        .await;

    let err = client.song().get("at://x").await.unwrap_err();
    let s = format!("{err}");
    assert!(s.contains("400"));
    assert!(s.contains("app.rocksky.song.getSong"));
    assert!(s.contains("bad uri"));
}
