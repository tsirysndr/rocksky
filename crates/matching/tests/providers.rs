use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use rocksky_matching::{
    providers::{HttpProvider, Provider, ProviderKind},
    resolve, MatchRequest, Status,
};
use serde_json::{json, Value};
use std::{
    net::TcpListener,
    sync::{Arc, Mutex},
};
fn request() -> MatchRequest {
    serde_json::from_value(json!({"title":"Beat It","artists":["Michael Jackson"]})).unwrap()
}
async fn provider(
    kind: ProviderKind,
    value: Value,
    status: u16,
) -> (
    HttpProvider,
    actix_web::dev::ServerHandle,
    Arc<Mutex<Vec<String>>>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let paths = Arc::new(Mutex::new(vec![]));
    let log = paths.clone();
    let server = HttpServer::new(move || {
        let response = value.clone();
        let log = log.clone();
        App::new().default_service(web::to(move |req: HttpRequest| {
            let value = response.clone();
            log.lock().unwrap().push(req.path().into());
            async move {
                HttpResponse::build(actix_web::http::StatusCode::from_u16(status).unwrap())
                    .json(value)
            }
        }))
    })
    .workers(1)
    .listen(listener)
    .unwrap()
    .run();
    let handle = server.handle();
    actix_web::rt::spawn(server);
    (
        HttpProvider::new(kind, format!("http://{addr}"), Some("test".into())).unwrap(),
        handle,
        paths,
    )
}
#[actix_web::test]
async fn deezer_search_score_cannot_override_album() {
    let(p,h,_)=provider(ProviderKind::Deezer,json!({"track":null,"matches":[{"id":1,"title":"Beat It","artist":"Michael Jackson","album":"Bad","score":1.0}]}),200).await;
    let mut r = request();
    r.album = Some("Thriller".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Unmatched);
    h.stop(true).await;
}
#[actix_web::test]
async fn deezer_exact_id_uses_direct_endpoint_and_actual_id() {
    let(p,h,paths)=provider(ProviderKind::Deezer,json!({"id":123,"title":"Beat It (Remastered)","artist":{"name":"Michael Jackson"},"album":{"title":"Thriller (Remastered)"},"duration":240}),200).await;
    let mut r = request();
    r.identifiers.deezer_track_id = Some("123".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(c[0].duration_ms, Some(240000));
    assert_eq!(resolve(&r, c).unwrap().status, Status::Matched);
    assert_eq!(*paths.lock().unwrap(), vec!["/track/123"]);
    h.stop(true).await;
}
#[actix_web::test]
async fn spotify_search_preserves_all_artist_credits() {
    let(p,h,_)=provider(ProviderKind::Spotify,json!({"tracks":{"items":[{"id":"abc","name":"Beat It","artists":[{"name":"Michael Jackson"},{"name":"Guest"}],"album":{"name":"Thriller","album_type":"album"},"duration_ms":240000}]}}),200).await;
    let mut r = request();
    r.artists.push("Guest".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Matched);
    h.stop(true).await;
}
#[actix_web::test]
async fn spotify_id_does_not_echo_requested_id() {
    let(p,h,paths)=provider(ProviderKind::Spotify,json!({"id":"wrong","name":"Beat It","artists":[{"name":"Michael Jackson"}],"album":{"name":"Thriller"}}),200).await;
    let mut r = request();
    r.identifiers.spotify_track_id = Some("wanted".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Unmatched);
    assert_eq!(*paths.lock().unwrap(), vec!["/tracks/wanted"]);
    h.stop(true).await;
}
#[actix_web::test]
async fn musicbrainz_raw_title_cannot_be_replaced_by_requested_title() {
    let(p,h,paths)=provider(ProviderKind::Musicbrainz,json!([{"id":"rec","title":"Thriller","artist-credit":[{"name":"Michael Jackson"}],"releases":[{"id":"rel","title":"Thriller","status":"Official"}]}]),200).await;
    let r = request();
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Unmatched);
    assert_eq!(*paths.lock().unwrap(), vec!["/search"]);
    h.stop(true).await;
}
#[actix_web::test]
async fn musicbrainz_keeps_all_release_candidates() {
    let(p,h,_)=provider(ProviderKind::Musicbrainz,json!([{"id":"rec","title":"Beat It","artist-credit":[{"name":"Michael Jackson"}],"releases":[{"id":"wrong","title":"Bad"},{"id":"right","title":"Thriller"}]}]),200).await;
    let mut r = request();
    r.album = Some("Thriller".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(c.len(), 2);
    assert_eq!(
        resolve(&r, c)
            .unwrap()
            .track
            .unwrap()
            .identifiers
            .musicbrainz_release_id
            .as_deref(),
        Some("right")
    );
    h.stop(true).await;
}
#[actix_web::test]
async fn musicbrainz_verifies_any_observed_isrc() {
    let(p,h,_)=provider(ProviderKind::Musicbrainz,json!([{"id":"rec","title":"Beat It","isrcs":["FIRST","USABC1234567"],"artist-credit":[{"name":"Michael Jackson"}]}]),200).await;
    let mut r = request();
    r.identifiers.isrc = Some("USABC1234567".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(resolve(&r, c).unwrap().status, Status::Matched);
    h.stop(true).await;
}
#[actix_web::test]
async fn musicbrainz_direct_lookup_preserves_release_and_duration() {
    let(p,h,paths)=provider(ProviderKind::Musicbrainz,json!({"trackMBID":"rec","releaseMBID":"rel","name":"Beat It (Remastered)","artist":[{"name":"Michael Jackson"}],"album":"Thriller (Remastered)","durationMs":240000}),200).await;
    let mut r = request();
    r.identifiers.musicbrainz_recording_id = Some("rec".into());
    let c = p.candidates(&r).await.unwrap();
    assert_eq!(
        c[0].identifiers.musicbrainz_release_id.as_deref(),
        Some("rel")
    );
    assert_eq!(resolve(&r, c).unwrap().status, Status::Matched);
    assert_eq!(*paths.lock().unwrap(), vec!["/recording/rec"]);
    h.stop(true).await;
}
#[actix_web::test]
async fn provider_http_failure_is_error() {
    let (p, h, _) = provider(ProviderKind::Spotify, json!({"error":"rate limited"}), 429).await;
    assert!(p.candidates(&request()).await.is_err());
    h.stop(true).await;
}
#[actix_web::test]
async fn malformed_provider_response_is_error() {
    let (p, h, _) = provider(ProviderKind::Spotify, json!({"surprise":[]}), 200).await;
    assert!(p.candidates(&request()).await.is_err());
    h.stop(true).await;
}
#[actix_web::test]
async fn rust_client_calls_service_and_provider_end_to_end() {
    use rocksky_matching::{
        client::MatchingClient,
        service::{routes, Service},
    };
    let (upstream,upstream_handle,_)=provider(ProviderKind::Deezer,json!({"track":null,"matches":[{"id":1,"title":"Beat It","artist":"Michael Jackson","album":"Thriller"}]}),200).await;
    let state = web::Data::new(Service::new(vec![Arc::new(upstream)]));
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = HttpServer::new(move || App::new().app_data(state.clone()).configure(routes))
        .workers(1)
        .listen(listener)
        .unwrap()
        .run();
    let handle = server.handle();
    actix_web::rt::spawn(server);
    let client = MatchingClient::new(&format!("http://{address}")).unwrap();
    let response = client.resolve(&request()).await.unwrap();
    assert_eq!(response.status, Status::Matched);
    assert_eq!(response.track.unwrap().album.as_deref(), Some("Thriller"));
    handle.stop(true).await;
    upstream_handle.stop(true).await;
}
