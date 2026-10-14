use actix_web::{web, App, HttpResponse, HttpServer};
use rocksky_matching::{
    client::{spotify_track_id, MatchingClient},
    MatchRequest,
};
use serde_json::json;
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
};

#[actix_web::test]
async fn consumers_only_use_selected_track_and_propagate_failures() {
    let response = Arc::new(Mutex::new((200, json!({}))));
    let state = response.clone();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = HttpServer::new(move || {
        let state = state.clone();
        App::new().route(
            "/v1/match",
            web::post().to(move |r: web::Json<MatchRequest>| {
                assert_eq!(r.album.as_deref(), Some("Album"));
                assert_eq!(r.identifiers.isrc.as_deref(), Some("GBBPW9800019"));
                let (status, body) = state.lock().unwrap().clone();
                async move {
                    HttpResponse::build(actix_web::http::StatusCode::from_u16(status).unwrap())
                        .json(body)
                }
            }),
        )
    })
    .workers(1)
    .listen(listener)
    .unwrap()
    .run();
    let handle = server.handle();
    actix_web::rt::spawn(server);
    let client = MatchingClient::new(&format!("http://{address}")).unwrap();
    let request: MatchRequest = serde_json::from_value(json!({"title":"Song","artists":["Artist"],"album":"Album","identifiers":{"isrc":"GBBPW9800019"}})).unwrap();
    for status in ["ambiguous", "unmatched"] {
        *response.lock().unwrap() = (
            200,
            json!({"policyVersion":"1","status":status,"track":null,"candidates":[],"rejected":[]}),
        );
        assert!(client.match_track(&request).await.unwrap().is_none());
    }
    *response.lock().unwrap() = (503, json!({"error":"provider unavailable"}));
    assert!(client.match_track(&request).await.is_err());
    *response.lock().unwrap() = (
        200,
        json!({"policyVersion":"1","status":"matched","track":null,"candidates":[],"rejected":[]}),
    );
    assert!(client.match_track(&request).await.is_err());
    handle.stop(true).await;
}

#[test]
fn spotify_ids_must_be_explicit_and_provider_specific() {
    let id = "2XQSgmtEY2titXhfY414dy";
    for value in [
        id.to_owned(),
        format!("spotify:track:{id}"),
        format!("https://open.spotify.com/track/{id}?si=x"),
    ] {
        assert_eq!(spotify_track_id(&value).as_deref(), Some(id));
    }
    for value in [
        "1234".to_owned(),
        format!("https://evil.example/track/{id}"),
        format!("https://open.spotify.com/album/{id}"),
    ] {
        assert!(spotify_track_id(&value).is_none());
    }
}
