//! The Spotify authorization-code handshake, end to end over the HTTP surface.
//!
//! `[spotify].accounts_url` points at a stub standing in for
//! `accounts.spotify.com`, so the exchange is exercised for real — the form
//! this sends, the JSON it reads back, and the row it writes — without
//! reaching the network.
//!
//! The assertion that matters most is not the redirect: it is that the stored
//! tokens decrypt with AES-256-CTR under the configured key and IV. That is
//! the contract with `crates/spotify`, which reads these rows, and getting it
//! wrong would leave the poller decrypting rubbish rather than failing.

use actix_web::{web, App};
use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use std::io::{Read, Write};

const DID: &str = "did:plc:faketestuser";
/// 32 bytes and 16 bytes, as hex — the sizes AES-256-CTR requires.
const KEY: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const IV: &str = "000102030405060708090a0b0c0d0e0f";

const ACCESS_TOKEN: &str = "BQD-access-token";
const REFRESH_TOKEN: &str = "AQC-refresh-token";

macro_rules! app {
    ($state:expr) => {
        actix_web::test::init_service(
            App::new()
                .app_data($state.clone())
                .app_data(web::Data::new($state.clone()))
                .configure(rocksky_appview::rest::configure),
        )
        .await
    };
}

/// A stand-in for `accounts.spotify.com`, answering `POST /api/token`.
///
/// Serves `bodies` in order, repeating the last one, so a test can make a
/// second exchange answer differently from the first — which is how Spotify
/// behaves on a re-authorization.
fn stub_spotify(bodies: &[&'static str]) -> String {
    let bodies: Vec<&'static str> = bodies.to_vec();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        let mut call = 0usize;
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut request = String::new();
            let mut buf = [0u8; 8192];
            loop {
                match stream.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => request.push_str(&String::from_utf8_lossy(&buf[..n])),
                }
                // The form body is the last thing to arrive.
                if request.contains("grant_type") {
                    break;
                }
            }
            let body = bodies[call.min(bodies.len() - 1)];
            call += 1;
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\
                 Content-Length: {}\r\n\r\n{body}",
                body.len()
            );
        }
    });
    format!("http://{addr}")
}

/// Runs `/spotify/login` and yields the `state` it issued.
///
/// A macro rather than a function: `init_service` returns an anonymous
/// `Service` whose type cannot be named without depending on `actix-http`
/// directly.
macro_rules! issued_state {
    ($app:expr, $token:expr) => {{
        let body: serde_json::Value = actix_web::test::call_and_read_body_json(
            &$app,
            actix_web::test::TestRequest::get()
                .uri("/spotify/login")
                .insert_header(("Authorization", format!("Bearer {}", $token)))
                .to_request(),
        )
        .await;
        let url =
            reqwest::Url::parse(body["redirectUrl"].as_str().expect("a redirectUrl")).unwrap();
        url.query_pairs()
            .find(|(key, _)| key == "state")
            .map(|(_, value)| value.to_string())
            .expect("a state")
    }};
}

async fn state_with_spotify(accounts_url: &str) -> AppState {
    let mut config = Config::for_test();
    config.spotify_client_id = Some("test-client-id".into());
    config.spotify_client_secret = Some("test-client-secret".into());
    config.spotify_redirect_uri = Some("https://rocksky.test/spotify/callback".into());
    config.spotify_encryption_key = Some(KEY.into());
    config.spotify_encryption_iv = Some(IV.into());
    config.spotify_accounts_url = accounts_url.to_string();
    AppState::for_test_with(config).await.expect("state")
}

async fn indexed_user(state: &AppState) -> String {
    rocksky_appview::ingest::upsert_user(state.db(), DID)
        .await
        .expect("user")
}

fn token_for(state: &AppState) -> String {
    rocksky_appview::rest::auth::mint_token(&state.config().jwt_secret, DID).expect("token")
}

/// The stored ciphertext, as the poller would read it.
async fn stored_tokens(state: &AppState) -> Option<(String, String)> {
    let db = state.db();
    db.fetch_optional::<(String, String)>(
        &db.sql("SELECT access_token, refresh_token FROM spotify_tokens"),
    )
    .await
    .expect("query")
}

#[actix_web::test]
async fn login_without_a_configured_application_says_so() {
    // `Config::for_test` leaves the Spotify settings unset, which is what a
    // self-hosted instance that never filled them in looks like.
    let state = AppState::for_test().await.expect("state");
    indexed_user(&state).await;
    let token = token_for(&state);
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/spotify/login")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;

    // Not a 500, and not a redirect to a broken consent screen.
    assert_eq!(res.status(), 501, "an unconfigured instance must say so");
}

#[actix_web::test]
async fn login_is_refused_without_a_token() {
    let state = state_with_spotify("http://unused.invalid").await;
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/spotify/login")
            .to_request(),
    )
    .await;

    assert!(
        res.status().is_client_error(),
        "anonymous callers cannot connect somebody's Spotify: {}",
        res.status()
    );
}

#[actix_web::test]
async fn login_answers_a_consent_url_carrying_the_state() {
    let state = state_with_spotify("https://accounts.example").await;
    indexed_user(&state).await;
    let token = token_for(&state);
    let app = app!(state);

    let body: serde_json::Value = actix_web::test::call_and_read_body_json(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/spotify/login")
            .insert_header(("Authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;

    let url = body["redirectUrl"].as_str().expect("a redirectUrl");
    let parsed = reqwest::Url::parse(url).expect("a URL");
    let params: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();

    assert_eq!(parsed.host_str(), Some("accounts.example"));
    assert_eq!(parsed.path(), "/authorize");
    assert_eq!(
        params.get("client_id").map(String::as_str),
        Some("test-client-id")
    );
    assert_eq!(
        params.get("response_type").map(String::as_str),
        Some("code")
    );
    assert_eq!(
        params.get("redirect_uri").map(String::as_str),
        Some("https://rocksky.test/spotify/callback"),
        "the redirect URI has to survive escaping intact or Spotify refuses it"
    );
    assert!(
        params
            .get("scope")
            .is_some_and(|scope| scope.contains("user-read-currently-playing")),
        "the poller cannot work without it"
    );
    assert!(
        params.get("state").is_some_and(|state| !state.is_empty()),
        "the callback has nothing to resolve the listener from without it"
    );
}

#[actix_web::test]
async fn the_callback_stores_tokens_the_poller_can_decrypt() {
    let accounts = stub_spotify(&[
        r#"{"access_token":"BQD-access-token","refresh_token":"AQC-refresh-token","expires_in":3600}"#,
    ]);
    let state = state_with_spotify(&accounts).await;
    indexed_user(&state).await;
    let token = token_for(&state);
    let app = app!(state);

    // Login first, because the callback only accepts a state it issued.
    let issued = issued_state!(app, token);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri(&format!("/spotify/callback?code=the-code&state={issued}"))
            .to_request(),
    )
    .await;

    assert_eq!(res.status(), 302);
    let location = res
        .headers()
        .get("location")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    assert!(
        location.contains("spotify=connected"),
        "the UI reads the outcome off the redirect: {location}"
    );

    // The contract with `crates/spotify`: the rows decrypt under the
    // configured key and IV, back to exactly what Spotify returned.
    let (access, refresh) = stored_tokens(&state).await.expect("a token row");
    assert_ne!(access, ACCESS_TOKEN, "stored in the clear");
    assert_eq!(
        rocksky_appview::rest::spotify::decrypt(KEY, IV, &access).unwrap(),
        ACCESS_TOKEN
    );
    assert_eq!(
        rocksky_appview::rest::spotify::decrypt(KEY, IV, &refresh).unwrap(),
        REFRESH_TOKEN
    );
}

#[actix_web::test]
async fn a_state_the_instance_never_issued_is_refused() {
    let accounts = stub_spotify(&[r#"{"access_token":"a","refresh_token":"b"}"#]);
    let state = state_with_spotify(&accounts).await;
    indexed_user(&state).await;
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/spotify/callback?code=the-code&state=forged")
            .to_request(),
    )
    .await;

    assert_eq!(res.status(), 302);
    assert!(
        stored_tokens(&state).await.is_none(),
        "a forged state must not connect an account"
    );
}

/// The state is single use: replaying a callback must not work.
#[actix_web::test]
async fn a_state_cannot_be_redeemed_twice() {
    let accounts = stub_spotify(&[
        r#"{"access_token":"BQD-access-token","refresh_token":"AQC-refresh-token"}"#,
    ]);
    let state = state_with_spotify(&accounts).await;
    indexed_user(&state).await;
    let token = token_for(&state);
    let app = app!(state);

    let issued = issued_state!(app, token);
    let uri = format!("/spotify/callback?code=the-code&state={issued}");
    for _ in 0..2 {
        actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::get().uri(&uri).to_request(),
        )
        .await;
    }

    // One row, not two: the second attempt found no state to redeem.
    let count = state
        .db()
        .count(&state.db().sql("SELECT count(*) FROM spotify_tokens"))
        .await
        .unwrap();
    assert_eq!(count, 1, "a replayed callback must not write a second row");
}

/// Spotify omits `refresh_token` when it chooses not to rotate one.
///
/// Writing the empty string over a working refresh token would strand the
/// account: the poller could not renew, and only another trip through the
/// consent screen would fix it.
#[actix_web::test]
async fn a_reconnect_keeps_a_refresh_token_spotify_did_not_resend() {
    // The second exchange answers with an access token and nothing else.
    let accounts = stub_spotify(&[
        r#"{"access_token":"BQD-access-token","refresh_token":"AQC-refresh-token"}"#,
        r#"{"access_token":"BQD-second-access-token"}"#,
    ]);
    let state = state_with_spotify(&accounts).await;
    indexed_user(&state).await;
    let token = token_for(&state);
    let app = app!(state);

    for code in ["one", "two"] {
        let issued = issued_state!(app, token);
        actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::get()
                .uri(&format!("/spotify/callback?code={code}&state={issued}"))
                .to_request(),
        )
        .await;
    }

    let (access, refresh) = stored_tokens(&state).await.expect("a token row");
    assert_eq!(
        rocksky_appview::rest::spotify::decrypt(KEY, IV, &access).unwrap(),
        "BQD-second-access-token",
        "the newer access token replaces the older one"
    );
    assert_eq!(
        rocksky_appview::rest::spotify::decrypt(KEY, IV, &refresh).unwrap(),
        REFRESH_TOKEN,
        "the refresh token must survive; losing it strands the account"
    );
}
