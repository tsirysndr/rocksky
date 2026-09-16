//! The login handshake, end to end against an in-memory PDS.
//!
//! This is the flow a self-hosted instance cannot do without, so it is tested
//! through the real HTTP surface rather than by calling the pieces:
//! `rocksky-mock-pds` stands in for the PLC directory, the handle resolver,
//! the Bluesky appview and `com.atproto.server.createSession`, and the
//! assertions run against `POST /login`, `GET /profile` and `POST /logout` as
//! a client would call them.

use actix_web::{web, App};
use rocksky_appview::atproto::session;
use rocksky_appview::state::AppState;
use rocksky_appview::Config;
use rocksky_mock_pds::MockPds;

const DID: &str = "did:plc:faketestuser";
const HANDLE: &str = "tester.example";
const GOOD_PASSWORD: &str = "correct-app-password";

/// A PDS holding one account that can sign in.
async fn stub_pds() -> MockPds {
    MockPds::builder()
        .account(DID, HANDLE, GOOD_PASSWORD)
        .profile(
            DID,
            serde_json::json!({
                "did": DID,
                "handle": HANDLE,
                "displayName": "Test Person",
                "avatar": "https://cdn.example/a.jpg",
            }),
        )
        .start()
        .await
}

async fn state_pointing_at(base: &str) -> AppState {
    let mut config = Config::for_test();
    config.plc_directory_url = base.to_string();
    config.bsky_appview_url = base.to_string();
    AppState::for_test_with(config).await.expect("state")
}

macro_rules! app {
    ($state:expr) => {
        actix_web::test::init_service(
            App::new()
                .app_data($state.clone())
                .app_data(web::Data::new($state.clone()))
                .configure(rocksky_appview::rest::configure)
                .configure(rocksky_appview::xrpc::configure),
        )
        .await
    };
}

#[actix_web::test]
async fn an_app_password_login_issues_a_usable_token() {
    let pds = stub_pds().await;
    let state = state_pointing_at(pds.url()).await;
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/login")
            .set_json(serde_json::json!({
                "handle": HANDLE,
                "password": GOOD_PASSWORD,
            }))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);

    // The UI does `data.split("jwt:")[1]`, so the prefix is load-bearing.
    let body = actix_web::test::read_body(res).await;
    let body = String::from_utf8(body.to_vec()).unwrap();
    assert!(body.starts_with("jwt:"), "{body}");
    let token = body.trim_start_matches("jwt:").to_string();
    assert!(!token.is_empty());

    // That token authenticates an XRPC call.
    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/xrpc/app.rocksky.scrobble.getScrobbles?limit=1")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);

    // And the profile is filled in from the stub appview.
    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::get()
            .uri("/profile")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);
    let profile: serde_json::Value = actix_web::test::read_body_json(res).await;
    assert_eq!(profile["did"], DID);
    assert_eq!(profile["handle"], HANDLE);
    assert_eq!(profile["displayName"], "Test Person");
    assert_eq!(profile["avatar"], "https://cdn.example/a.jpg");

    // The PDS session was stored, which is what lets the instance write
    // records on the user's behalf later.
    let stored = session::load(state.auth_db(), DID).await.unwrap();
    let stored = stored.expect("a session should be stored");
    assert_eq!(
        stored.access_jwt,
        pds.access_token(),
        "the token the PDS issued is the one that was kept"
    );
    assert_eq!(stored.handle, HANDLE);
}

#[actix_web::test]
async fn a_wrong_password_is_a_401_with_a_readable_message() {
    let pds = stub_pds().await;
    let state = state_pointing_at(pds.url()).await;
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/login")
            .set_json(serde_json::json!({ "handle": HANDLE, "password": "wrong" }))
            .to_request(),
    )
    .await;

    assert_eq!(res.status(), 401);
    let body: serde_json::Value = actix_web::test::read_body_json(res).await;
    // `Main.tsx` shows this text to the user verbatim.
    assert!(
        body["message"].as_str().unwrap().contains("app password"),
        "{body}"
    );
    // Nothing was stored for a failed login.
    assert!(session::load(state.auth_db(), DID).await.unwrap().is_none());
}

#[actix_web::test]
async fn logging_out_forgets_the_session_but_the_account_stays_indexed() {
    let pds = stub_pds().await;
    let state = state_pointing_at(pds.url()).await;
    let app = app!(state);

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/login")
            .set_json(serde_json::json!({
                "handle": HANDLE,
                "password": GOOD_PASSWORD,
            }))
            .to_request(),
    )
    .await;
    let body = actix_web::test::read_body(res).await;
    let token = String::from_utf8(body.to_vec())
        .unwrap()
        .trim_start_matches("jwt:")
        .to_string();

    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/logout")
            .insert_header(("authorization", format!("Bearer {token}")))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);

    assert!(
        session::load(state.auth_db(), DID).await.unwrap().is_none(),
        "the PDS session is gone"
    );
    // The user row is a public projection, not a credential, so signing out
    // must not delete someone's listening history.
    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM users"))
            .await
            .unwrap(),
        1
    );
}

#[actix_web::test]
async fn a_did_can_be_used_in_place_of_a_handle() {
    let pds = stub_pds().await;
    let state = state_pointing_at(pds.url()).await;
    let app = app!(state);

    // Signing in with a DID skips handle resolution entirely, which is the
    // path that works when a handle cannot be resolved.
    let res = actix_web::test::call_service(
        &app,
        actix_web::test::TestRequest::post()
            .uri("/login")
            .set_json(serde_json::json!({ "handle": DID, "password": GOOD_PASSWORD }))
            .to_request(),
    )
    .await;
    assert_eq!(res.status(), 200);
}

#[actix_web::test]
async fn logging_in_twice_replaces_the_session_rather_than_duplicating_it() {
    let pds = stub_pds().await;
    let state = state_pointing_at(pds.url()).await;
    let app = app!(state);

    for _ in 0..2 {
        let res = actix_web::test::call_service(
            &app,
            actix_web::test::TestRequest::post()
                .uri("/login")
                .set_json(serde_json::json!({
                    "handle": HANDLE,
                    "password": GOOD_PASSWORD,
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
    }

    let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_session")
        .fetch_one(state.auth_db())
        .await
        .unwrap();
    assert_eq!(sessions, 1);

    let db = state.db();
    assert_eq!(
        db.count(&db.sql("SELECT count(*) FROM users"))
            .await
            .unwrap(),
        1,
        "and only one account row"
    );
}
