//! Scrobble resource tests.

mod common;

use common::{mock_client, mock_client_with_token};
use serde_json::{Value, json};
use wiremock::matchers::{body_partial_json, header, method, path, query_param};
use wiremock::{Mock, Request, ResponseTemplate};

#[tokio::test]
async fn list_scrobbles_parses_envelope() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.scrobble.getScrobbles"))
        .and(query_param("did", "did:plc:abc"))
        .and(query_param("limit", "5"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "scrobbles": [{
                "id": "s1",
                "user": "alice.bsky.social",
                "title": "Heaven",
                "artist": "Bring Me The Horizon",
                "date": "2026-05-30T12:00:00Z",
                "likesCount": 3,
                "liked": true,
            }],
        })))
        .mount(&server)
        .await;

    let items = client
        .scrobble()
        .list()
        .did("did:plc:abc")
        .limit(5)
        .send()
        .await
        .unwrap();
    assert_eq!(items.len(), 1);
    let s = &items[0];
    assert_eq!(s.likes_count, Some(3));
    assert_eq!(s.liked, Some(true));
    assert_eq!(s.user.as_deref(), Some("alice.bsky.social"));
    assert!(s.date.is_some());
}

#[tokio::test]
async fn get_scrobble_decodes_nested_artists() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.scrobble.getScrobble"))
        .and(query_param("uri", "at://scrobble1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "s1",
            "title": "Sk8er Boi",
            "artist": "Avril Lavigne",
            "scrobbles": 12,
            "listeners": 4,
            "artists": [{"id": "ar1", "name": "Avril Lavigne", "uri": "at://artist"}],
        })))
        .mount(&server)
        .await;

    let s = client.scrobble().get("at://scrobble1").await.unwrap();
    assert_eq!(s.scrobbles, Some(12));
    let artists = s.artists.expect("artists missing");
    assert_eq!(artists[0].name.as_deref(), Some("Avril Lavigne"));
}

#[tokio::test]
async fn create_scrobble_omits_none_fields() {
    let (server, client) = mock_client_with_token("tok").await;
    Mock::given(method("POST"))
        .and(path("/xrpc/app.rocksky.scrobble.createScrobble"))
        .and(header("authorization", "Bearer tok"))
        .and(body_partial_json(json!({
            "title": "Hounds of Love",
            "artist": "Kate Bush",
            "album": "Hounds of Love",
            "duration": 180000,
            "timestamp": 1717000000,
        })))
        .and(verify_no_extra_fields())
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;

    client
        .scrobble()
        .create("Hounds of Love", "Kate Bush")
        .album("Hounds of Love")
        .duration(180_000)
        .timestamp(1_717_000_000)
        .send()
        .await
        .unwrap();
}

/// Custom matcher that fails the test if the request body has any field we
/// didn't pass (catches accidental `null` serialization).
fn verify_no_extra_fields() -> impl wiremock::Match {
    struct M;
    impl wiremock::Match for M {
        fn matches(&self, req: &Request) -> bool {
            let body: Value = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(_) => return false,
            };
            let Value::Object(map) = body else {
                return false;
            };
            let expected: std::collections::HashSet<&str> =
                ["title", "artist", "album", "duration", "timestamp"]
                    .iter()
                    .copied()
                    .collect();
            map.keys().all(|k| expected.contains(k.as_str()))
        }
    }
    M
}

#[tokio::test]
async fn following_requires_auth_header() {
    let (server, client) = mock_client_with_token("tok").await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.scrobble.getScrobbles"))
        .and(header("authorization", "Bearer tok"))
        .and(query_param("following", "true"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"scrobbles": []})))
        .mount(&server)
        .await;

    client.scrobble().list().following(true).send().await.unwrap();
}

#[tokio::test]
async fn following_without_token_returns_missing_token() {
    let client = rocksky::Client::builder()
        .base_url("http://127.0.0.1:1")
        .build();
    let err = client
        .scrobble()
        .list()
        .following(true)
        .send()
        .await
        .unwrap_err();
    assert!(err.is_unauthorized());
    assert!(matches!(err, rocksky::Error::MissingToken { .. }));
}
