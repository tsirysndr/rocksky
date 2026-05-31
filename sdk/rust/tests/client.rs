//! Smoke tests for the client wiring + escape-hatch `call`/`procedure`.

mod common;

use common::{mock_client, mock_client_with_token};
use serde_json::json;
use wiremock::matchers::{body_json, header, header_exists, method, path, query_param};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn builder_defaults_resolve() {
    let client = rocksky::Client::new();
    assert_eq!(client.base_url(), "https://api.rocksky.app");
    assert!(client.token().await.is_none());
}

#[tokio::test]
async fn builder_overrides_apply() {
    let client = rocksky::Client::builder()
        .base_url("https://api.example.invalid")
        .token("tok-1")
        .user_agent("custom/0.1")
        .build();
    assert_eq!(client.base_url(), "https://api.example.invalid");
    assert_eq!(client.token().await.as_deref(), Some("tok-1"));
}

#[tokio::test]
async fn set_token_round_trips() {
    let client = rocksky::Client::new();
    assert!(client.token().await.is_none());
    client.set_token(Some("abc".to_string())).await;
    assert_eq!(client.token().await.as_deref(), Some("abc"));
    client.set_token(None).await;
    assert!(client.token().await.is_none());
}

#[tokio::test]
async fn try_build_rejects_invalid_base_url() {
    let err = rocksky::Client::builder().base_url("not a url").try_build();
    assert!(matches!(
        err,
        Err(rocksky::Error::InvalidConfig(_))
    ));
}

#[tokio::test]
async fn call_query_returns_parsed_json() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.describeFeedGenerator"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"did": "did:plc:abc"})))
        .mount(&server)
        .await;

    let result = client
        .call("app.rocksky.feed.describeFeedGenerator")
        .await
        .unwrap();
    assert_eq!(result["did"], "did:plc:abc");
}

#[tokio::test]
async fn procedure_sends_json_body_and_auth_header() {
    let (server, client) = mock_client_with_token("tok").await;
    Mock::given(method("POST"))
        .and(path("/xrpc/app.rocksky.shout.createShout"))
        .and(header("authorization", "Bearer tok"))
        .and(body_json(json!({"message": "hi"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "shout1"})))
        .mount(&server)
        .await;

    let body = json!({"message": "hi"});
    let result = client
        .procedure(
            "app.rocksky.shout.createShout",
            None::<&()>,
            Some(&body),
            true,
        )
        .await
        .unwrap();
    assert_eq!(result["id"], "shout1");
}

#[tokio::test]
async fn missing_token_returns_typed_error() {
    let (_server, client) = mock_client().await;
    let err = client
        .procedure::<(), _>("app.rocksky.shout.createShout", None, Some(&json!({"m": 1})), true)
        .await
        .unwrap_err();
    assert!(err.is_unauthorized());
    assert!(format!("{err}").contains("missing token"));
}

#[tokio::test]
async fn boolean_params_serialize_as_strings() {
    let (server, client) = mock_client_with_token("tok").await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.scrobble.getScrobbles"))
        .and(query_param("following", "true"))
        .and(header("authorization", "Bearer tok"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"scrobbles": []})))
        .mount(&server)
        .await;

    client.scrobble().list().following(true).send().await.unwrap();
}

#[tokio::test]
async fn user_agent_header_is_sent() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.search"))
        .and(header_exists("user-agent"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"hits": []})))
        .mount(&server)
        .await;

    client.feed().search("kate bush").await.unwrap();
}
