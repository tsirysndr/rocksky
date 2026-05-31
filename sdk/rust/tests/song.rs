//! Song resource tests.

mod common;

use common::mock_client;
use serde_json::json;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn get_song_by_uri() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSong"))
        .and(query_param("uri", "at://song1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "s1",
            "title": "Sk8er Boi",
            "artist": "Avril Lavigne",
            "isrc": "USRC10100001",
            "playCount": 4242,
        })))
        .mount(&server)
        .await;

    let s = client.song().get("at://song1").await.unwrap();
    assert_eq!(s.title.as_deref(), Some("Sk8er Boi"));
    assert_eq!(s.isrc.as_deref(), Some("USRC10100001"));
    assert_eq!(s.play_count, Some(4242));
}

#[tokio::test]
async fn get_song_by_isrc() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSong"))
        .and(query_param("isrc", "USRC10100001"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "s1"})))
        .mount(&server)
        .await;

    let s = client.song().get_by_isrc("USRC10100001").await.unwrap();
    assert_eq!(s.id.as_deref(), Some("s1"));
}

#[tokio::test]
async fn match_song_supports_optional_identifiers() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.matchSong"))
        .and(query_param("title", "Heaven"))
        .and(query_param("artist", "Bring Me The Horizon"))
        .and(query_param("mbId", "abc"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "s1"})))
        .mount(&server)
        .await;

    let s = client
        .song()
        .match_song("Heaven", "Bring Me The Horizon")
        .mb_id("abc")
        .send()
        .await
        .unwrap();
    assert_eq!(s.id.as_deref(), Some("s1"));
}

#[tokio::test]
async fn list_songs_with_filters() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSongs"))
        .and(query_param("limit", "10"))
        .and(query_param("genre", "indie"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "songs": [{"id": "s1", "title": "T", "artist": "A"}],
        })))
        .mount(&server)
        .await;

    let songs = client
        .song()
        .list()
        .limit(10)
        .genre("indie")
        .send()
        .await
        .unwrap();
    assert_eq!(songs.len(), 1);
}
