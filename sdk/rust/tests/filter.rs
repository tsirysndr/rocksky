//! RSQL `filter` parameter integration tests.

mod common;

use common::mock_client;
use rocksky::Filter;
use serde_json::json;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn list_songs_sends_filter_param() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.song.getSongs"))
        .and(query_param("limit", "10"))
        .and(query_param(
            "filter",
            "artist==\"Daft Punk\";duration=gt=200000",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "songs": [{"id": "s1", "title": "T", "artist": "A"}],
        })))
        .mount(&server)
        .await;

    let filter = Filter::eq("artist", "Daft Punk").and(Filter::gt("duration", 200_000));
    let songs = client
        .song()
        .list()
        .limit(10)
        .filter(filter)
        .send()
        .await
        .unwrap();
    assert_eq!(songs.len(), 1);
}

#[tokio::test]
async fn list_scrobbles_sends_filter_param_without_auth() {
    // No token on the client: a filter alone must not flip the auth flag,
    // so this request succeeds anonymously.
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.scrobble.getScrobbles"))
        .and(query_param(
            "filter",
            "track.artist==Radiohead,track.artist==Muse",
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "scrobbles": [{"id": "sc1", "title": "T", "artist": "A"}],
        })))
        .mount(&server)
        .await;

    let filter = Filter::eq("track.artist", "Radiohead").or(Filter::eq("track.artist", "Muse"));
    let scrobbles = client
        .scrobble()
        .list()
        .filter(filter)
        .send()
        .await
        .unwrap();
    assert_eq!(scrobbles.len(), 1);
}

#[tokio::test]
async fn list_albums_sends_filter_param() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.album.getAlbums"))
        .and(query_param("filter", "year=ge=2000"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "albums": [{"id": "a1", "title": "T", "artist": "A"}],
        })))
        .mount(&server)
        .await;

    let albums = client
        .album()
        .list()
        .filter(Filter::ge("year", 2000))
        .send()
        .await
        .unwrap();
    assert_eq!(albums.len(), 1);
}

#[tokio::test]
async fn list_artists_sends_filter_param() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.artist.getArtists"))
        .and(query_param("filter", "genres=in=(house,electro)"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "artists": [{"id": "ar1", "name": "N"}],
        })))
        .mount(&server)
        .await;

    let artists = client
        .artist()
        .list()
        .filter(Filter::is_in("genres", ["house", "electro"]))
        .send()
        .await
        .unwrap();
    assert_eq!(artists.len(), 1);
}
