use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use rocksky_matching::{
    providers::{HttpProvider, Provider, ProviderKind},
    spotify_auth::SpotifyAuth,
    MatchRequest,
};
use serde_json::json;
use std::{
    net::TcpListener,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
struct State {
    calls: AtomicUsize,
    expiry: u64,
    fail: bool,
    reject_first: bool,
}
async fn fixture(
    expiry: u64,
    fail: bool,
    reject_first: bool,
) -> (String, Arc<State>, actix_web::dev::ServerHandle) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let state = Arc::new(State {
        calls: AtomicUsize::new(0),
        expiry,
        fail,
        reject_first,
    });
    let data = state.clone();
    let server=HttpServer::new(move||App::new().app_data(web::Data::new(data.clone()))
        .route("/token",web::post().to(|state:web::Data<Arc<State>>,request:HttpRequest,body:String|async move {
            assert_eq!(request.headers().get("authorization").unwrap(),"Basic aWQ6c2VjcmV0");
            assert_eq!(body,"grant_type=client_credentials");
            let n=state.calls.fetch_add(1,Ordering::SeqCst)+1;
            if state.fail {return HttpResponse::Unauthorized().json(json!({"error":"secret response must not leak"}));}
            HttpResponse::Ok().json(json!({"access_token":format!("token{n}"),"token_type":"Bearer","expires_in":state.expiry}))
        }))
        .route("/search",web::get().to(|state:web::Data<Arc<State>>,request:HttpRequest|async move {
            if state.reject_first && request.headers().get("authorization").unwrap()=="Bearer token1" {return HttpResponse::Unauthorized().finish();}
            HttpResponse::Ok().json(json!({"tracks":{"items":[]}}))
        }))).workers(1).listen(listener).unwrap().run();
    let handle = server.handle();
    actix_web::rt::spawn(server);
    (format!("http://{address}"), state, handle)
}
fn auth(base: &str) -> SpotifyAuth {
    SpotifyAuth::client_credentials("id".into(), "secret".into(), format!("{base}/token")).unwrap()
}
#[actix_web::test]
async fn valid_token_is_reused() {
    let (base, state, h) = fixture(3600, false, false).await;
    let auth = auth(&base);
    let client = reqwest::Client::new();
    assert_eq!(auth.token(&client).await.unwrap(), "token1");
    assert_eq!(auth.token(&client).await.unwrap(), "token1");
    assert_eq!(state.calls.load(Ordering::SeqCst), 1);
    h.stop(true).await;
}
#[actix_web::test]
async fn concurrent_requests_share_one_renewal() {
    let (base, state, h) = fixture(3600, false, false).await;
    let auth = auth(&base);
    let client = reqwest::Client::new();
    let (a, b) = tokio::join!(auth.token(&client), auth.token(&client));
    assert_eq!(a.unwrap(), b.unwrap());
    assert_eq!(state.calls.load(Ordering::SeqCst), 1);
    h.stop(true).await;
}
#[actix_web::test]
async fn near_expiry_tokens_are_renewed() {
    let (base, state, h) = fixture(20, false, false).await;
    let auth = auth(&base);
    let client = reqwest::Client::new();
    assert_eq!(auth.token(&client).await.unwrap(), "token1");
    assert_eq!(auth.token(&client).await.unwrap(), "token2");
    assert_eq!(state.calls.load(Ordering::SeqCst), 2);
    h.stop(true).await;
}
#[actix_web::test]
async fn expired_response_is_rejected() {
    let (base, _, h) = fixture(0, false, false).await;
    assert!(auth(&base).token(&reqwest::Client::new()).await.is_err());
    h.stop(true).await;
}
#[actix_web::test]
async fn failure_does_not_leak_response_or_credentials() {
    let (base, _, h) = fixture(3600, true, false).await;
    let error = auth(&base)
        .token(&reqwest::Client::new())
        .await
        .unwrap_err()
        .to_string();
    assert!(!error.contains("secret"));
    assert!(error.contains("401"));
    h.stop(true).await;
}
#[actix_web::test]
async fn rejected_access_token_renews_and_retries_once() {
    let (base, state, h) = fixture(3600, false, true).await;
    let provider = HttpProvider::new(ProviderKind::Spotify, base.clone(), None)
        .unwrap()
        .with_spotify_auth(auth(&base));
    let request: MatchRequest =
        serde_json::from_value(json!({"title":"Roygbiv","artists":["Boards of Canada"]})).unwrap();
    assert!(provider.candidates(&request).await.unwrap().is_empty());
    assert_eq!(state.calls.load(Ordering::SeqCst), 2);
    h.stop(true).await;
}
#[actix_web::test]
async fn stale_rejection_does_not_remove_new_token() {
    let (base, state, h) = fixture(3600, false, false).await;
    let auth = auth(&base);
    let client = reqwest::Client::new();
    auth.token(&client).await.unwrap();
    auth.invalidate("old-token").await;
    auth.token(&client).await.unwrap();
    assert_eq!(state.calls.load(Ordering::SeqCst), 1);
    h.stop(true).await;
}
#[test]
fn credentials_require_https_outside_loopback() {
    assert!(SpotifyAuth::client_credentials(
        "id".into(),
        "secret".into(),
        "http://example.com/token".into()
    )
    .is_err());
}
#[test]
fn blank_credentials_rejected() {
    assert!(SpotifyAuth::client_credentials(
        " ".into(),
        "secret".into(),
        "https://accounts.spotify.com/api/token".into()
    )
    .is_err());
}
