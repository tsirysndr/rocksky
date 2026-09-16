//! Reusing an `auth.db` written by the TypeScript API.
//!
//! The promise being tested: point this binary at the SQLite file `apps/api`
//! has been writing and nobody has to sign in again. That only holds if a
//! session row written by `@atproto/oauth-client-node` can be restored here —
//! including the DPoP private key, without which the session can be read but
//! not used.
//!
//! A stub authorization server stands in for the issuer, because the Node JSON
//! records `iss` but not the token endpoint, so restoring a session involves
//! fetching that issuer's metadata.

use actix_web::{web, App, HttpResponse, HttpServer};
use jacquard_common::types::string::Did;
use jacquard_oauth::authstore::ClientAuthStore;
use rocksky_appview::oauth::store::{SqliteAuthStore, DEFAULT_SESSION_ID};

/// Stands in for `https://bsky.social`'s authorization server metadata.
async fn stub_authserver() -> (String, actix_web::dev::ServerHandle) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().unwrap().port();
    let base = format!("http://127.0.0.1:{port}");
    let advertised = base.clone();

    let server = HttpServer::new(move || {
        let advertised = advertised.clone();
        App::new().route(
            "/.well-known/oauth-authorization-server",
            web::get().to(move || {
                let advertised = advertised.clone();
                async move {
                    HttpResponse::Ok().json(serde_json::json!({
                        "issuer": advertised,
                        "authorization_endpoint": format!("{advertised}/oauth/authorize"),
                        "token_endpoint": format!("{advertised}/oauth/token"),
                        "revocation_endpoint": format!("{advertised}/oauth/revoke"),
                        "pushed_authorization_request_endpoint": format!("{advertised}/oauth/par"),
                    }))
                }
            }),
        )
    })
    .listen(listener)
    .expect("listen")
    .run();

    let handle = server.handle();
    tokio::spawn(server);
    (base, handle)
}

/// A session row exactly as `@atproto/oauth-client-node` persists one: keyed
/// by the bare DID, with `dpopJwk` and a `tokenSet`.
fn node_session_row(issuer: &str) -> String {
    serde_json::json!({
        "dpopJwk": {
            "kty": "EC",
            "crv": "P-256",
            "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
            "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
            "d": "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
            "alg": "ES256",
            "use": "sig",
            "kid": "node-written-key"
        },
        "authMethod": "private_key_jwt",
        "tokenSet": {
            "iss": issuer,
            "sub": "did:plc:alice",
            "aud": "https://shimeji.us-east.host.bsky.network",
            "scope": "atproto repo:app.rocksky.scrobble repo:app.rocksky.song",
            "refresh_token": "node-refresh-token",
            "access_token": "node-access-token",
            "token_type": "DPoP",
            "expires_at": "2027-01-01T00:00:00.000Z"
        }
    })
    .to_string()
}

async fn store_with(issuer: &str) -> (SqliteAuthStore, sqlx::SqlitePool) {
    let db = rocksky_appview::db::connect_auth("sqlite::memory:")
        .await
        .expect("auth db");

    sqlx::query("INSERT INTO auth_session (key, session, expires_at) VALUES (?, ?, ?)")
        .bind("did:plc:alice")
        .bind(node_session_row(issuer))
        .bind("2027-01-01T00:00:00.000Z")
        .execute(&db)
        .await
        .expect("insert the Node-written row");

    (SqliteAuthStore::new(db.clone(), reqwest::Client::new()), db)
}

#[actix_web::test]
async fn a_session_written_by_the_typescript_api_is_restored_here() {
    let (issuer, server) = stub_authserver().await;
    let (store, _db) = store_with(&issuer).await;

    let did: Did = "did:plc:alice".parse().unwrap();
    let session = store
        .get_session(&did, DEFAULT_SESSION_ID)
        .await
        .expect("restoring must not fail")
        .expect("the row written by apps/api must be found");

    // Identity and tokens survive.
    assert_eq!(session.account_did.to_string(), "did:plc:alice");
    assert_eq!(session.token_set.access_token.as_str(), "node-access-token");
    assert_eq!(
        session.token_set.refresh_token.as_deref(),
        Some("node-refresh-token"),
        "without the refresh token the session cannot be renewed"
    );
    assert_eq!(
        session.token_set.aud.as_str(),
        "https://shimeji.us-east.host.bsky.network"
    );
    assert_eq!(session.token_set.iss.as_str(), issuer);

    // The endpoints the Node JSON does not record were recovered from the
    // issuer's metadata.
    assert_eq!(
        session.authserver_token_endpoint.as_str(),
        format!("{issuer}/oauth/token")
    );
    assert_eq!(
        session.authserver_revocation_endpoint.as_deref(),
        Some(format!("{issuer}/oauth/revoke").as_str())
    );

    // And the DPoP key came back as a usable EC key — this is the part that
    // makes the session actually usable rather than merely readable.
    assert!(
        matches!(session.dpop_data.dpop_key, jose_jwk::Key::Ec(_)),
        "the DPoP key must be restored"
    );

    // Scopes are recovered from the token set.
    let scopes = session.scopes.to_normalized_string();
    assert!(scopes.contains("atproto"), "{scopes}");
    assert!(scopes.contains("repo:app.rocksky.scrobble"), "{scopes}");

    server.stop(false).await;
}

/// Writing back must keep the row readable by the TypeScript API, or a user
/// who switches back would be logged out.
#[actix_web::test]
async fn a_session_rewritten_here_is_still_readable_by_the_typescript_api() {
    let (issuer, server) = stub_authserver().await;
    let (store, db) = store_with(&issuer).await;

    let did: Did = "did:plc:alice".parse().unwrap();
    let session = store
        .get_session(&did, DEFAULT_SESSION_ID)
        .await
        .unwrap()
        .unwrap();

    // Round-trip it through the store, as a token refresh would.
    store.upsert_session(session).await.expect("upsert");

    let raw: String = sqlx::query_scalar("SELECT session FROM auth_session WHERE key = ?")
        .bind("did:plc:alice")
        .fetch_one(&db)
        .await
        .unwrap();
    let value: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

    // The shape `@atproto/oauth-client-node` expects.
    assert!(value["dpopJwk"].is_object(), "{value}");
    assert_eq!(value["tokenSet"]["sub"], "did:plc:alice");
    assert_eq!(value["tokenSet"]["access_token"], "node-access-token");
    assert_eq!(value["tokenSet"]["refresh_token"], "node-refresh-token");
    assert_eq!(value["tokenSet"]["token_type"], "DPoP");
    assert_eq!(value["tokenSet"]["iss"], issuer);
    assert_eq!(value["authMethod"], "private_key_jwt");

    // The private half of the DPoP key must still be there, and carry an
    // explicit algorithm so the TypeScript side does not have to guess.
    assert!(value["dpopJwk"]["d"].is_string(), "{value}");
    assert_eq!(value["dpopJwk"]["alg"], "ES256");
    assert_eq!(value["dpopJwk"]["kty"], "EC");
    assert_eq!(value["dpopJwk"]["crv"], "P-256");

    // The same EC point, not a regenerated key.
    assert_eq!(
        value["dpopJwk"]["x"],
        "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU"
    );

    // And the expiry is mirrored into its own column, as apps/api expects.
    let expires: Option<String> =
        sqlx::query_scalar("SELECT expires_at FROM auth_session WHERE key = ?")
            .bind("did:plc:alice")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(expires.as_deref(), Some("2027-01-01T00:00:00.000Z"));

    server.stop(false).await;
}

/// An app-password session lives in the same table under `atp:<did>`; the two
/// kinds must not be confused for one another.
#[actix_web::test]
async fn oauth_and_app_password_sessions_coexist_in_one_table() {
    let (issuer, server) = stub_authserver().await;
    let (store, db) = store_with(&issuer).await;

    sqlx::query("INSERT INTO auth_session (key, session) VALUES (?, ?)")
        .bind("atp:did:plc:bob")
        .bind(r#"{"did":"did:plc:bob","handle":"bob.test","accessJwt":"a","refreshJwt":"r","active":true}"#)
        .execute(&db)
        .await
        .unwrap();

    // The OAuth store sees only the OAuth session.
    let keys = store.list_session_keys().await.unwrap();
    assert_eq!(keys.len(), 1, "{keys:?}");
    assert_eq!(keys[0].did.to_string(), "did:plc:alice");

    // And the app-password reader sees only its own.
    let bob = rocksky_appview::atproto::session::load(&db, "did:plc:bob")
        .await
        .unwrap()
        .expect("the app-password session is still there");
    assert_eq!(bob.handle, "bob.test");

    // Deleting the OAuth session leaves the other alone.
    let did: Did = "did:plc:alice".parse().unwrap();
    store
        .delete_session(&did, DEFAULT_SESSION_ID)
        .await
        .unwrap();
    assert!(rocksky_appview::atproto::session::load(&db, "did:plc:bob")
        .await
        .unwrap()
        .is_some());

    server.stop(false).await;
}

/// If the issuer cannot be reached the session must be reported as a failure,
/// not as "no session" — answering the latter would silently sign the user out
/// over a transient network problem.
#[actix_web::test]
async fn an_unreachable_issuer_is_an_error_rather_than_a_silent_logout() {
    // Port 1 refuses connections.
    let (store, _db) = store_with("http://127.0.0.1:1").await;

    let did: Did = "did:plc:alice".parse().unwrap();
    let result = store.get_session(&did, DEFAULT_SESSION_ID).await;
    assert!(
        result.is_err(),
        "a reachability failure must not look like a missing session"
    );
}
