//! Actor resource tests.

mod common;

use common::mock_client;
use serde_json::json;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn get_profile_parses_camelcase() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.actor.getProfile"))
        .and(query_param("did", "alice.bsky.social"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "u1",
            "did": "did:plc:alice",
            "handle": "alice.bsky.social",
            "displayName": "Alice",
            "spotifyConnected": true,
            "createdAt": "2024-01-01T00:00:00Z",
        })))
        .mount(&server)
        .await;

    let p = client.actor().get_profile("alice.bsky.social").await.unwrap();
    assert_eq!(p.did.as_deref(), Some("did:plc:alice"));
    assert_eq!(p.display_name.as_deref(), Some("Alice"));
    assert_eq!(p.spotify_connected, Some(true));
    assert!(p.created_at.is_some());
}

#[tokio::test]
async fn get_actor_albums_unwraps_envelope() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.actor.getActorAlbums"))
        .and(query_param("did", "did:plc:alice"))
        .and(query_param("limit", "5"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "albums": [
                {"id": "a1", "title": "Hounds of Love", "artist": "Kate Bush", "year": 1985},
                {"id": "a2", "title": "Pony", "artist": "Orville Peck"},
            ],
        })))
        .mount(&server)
        .await;

    let albums = client
        .actor()
        .get_albums("did:plc:alice")
        .limit(5)
        .send()
        .await
        .unwrap();
    assert_eq!(albums.len(), 2);
    assert_eq!(albums[0].title.as_deref(), Some("Hounds of Love"));
    assert_eq!(albums[0].year, Some(1985));
}

#[tokio::test]
async fn loved_songs_accepts_either_envelope_key() {
    let (server, client) = mock_client().await;
    // Server returns under "songs" (alias), not "lovedSongs".
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.actor.getActorLovedSongs"))
        .and(query_param("did", "did:plc:alice"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "songs": [
                {"id": "s1", "title": "Heaven", "artist": "Bring Me The Horizon"},
            ],
        })))
        .mount(&server)
        .await;

    let songs = client
        .actor()
        .get_loved_songs("did:plc:alice")
        .send()
        .await
        .unwrap();
    assert_eq!(songs.len(), 1);
    assert_eq!(songs[0].title.as_deref(), Some("Heaven"));
}

#[tokio::test]
async fn empty_envelope_decodes_as_empty_vec() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.actor.getActorArtists"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({})))
        .mount(&server)
        .await;

    let artists = client
        .actor()
        .get_artists("did:plc:alice")
        .send()
        .await
        .unwrap();
    assert!(artists.is_empty());
}
