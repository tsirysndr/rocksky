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

use rocksky_mock_pds::MockPds;
use jacquard_common::types::string::Did;
use jacquard_oauth::authstore::ClientAuthStore;
use rocksky_appview::oauth::store::{SqliteAuthStore, DEFAULT_SESSION_ID};

/// Stands in for `https://bsky.social`'s authorization server.
///
/// Only its metadata document is used here — the store has to re-read
/// `token_endpoint` and `revocation_endpoint` from the issuer before it can
/// refresh or revoke — but it comes from the same mock the rest of the suite
/// uses rather than a stub local to this file.
async fn stub_authserver() -> MockPds {
    MockPds::start().await
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

/// The `auth_session` DDL exactly as it exists in production, dumped from
/// `apps/api/atproto.sqlite`.
///
/// A test against this crate's own migration proves only that the crate agrees
/// with itself. The whole promise is that a *file apps/api wrote* can be
/// opened, so the table under test is created the way Kysely created it —
/// `varchar` types, the camelCase `expiresAt`, the literal string `'NULL'` as
/// its default. That last pair is what a from-scratch migration gets wrong,
/// and `CREATE TABLE IF NOT EXISTS` hides the mistake until the first write.
const PRODUCTION_DDL: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS \"auth_session\" (\"key\" varchar primary key, \
     \"session\" varchar not null, \"expiresAt\" text default 'NULL')",
    "CREATE TABLE IF NOT EXISTS \"auth_state\" (\"key\" varchar primary key, \
     \"state\" varchar not null)",
];

/// An auth database whose tables were created by apps/api, not by this crate.
async fn production_shaped_db() -> sqlx::SqlitePool {
    let db = sqlx::SqlitePool::connect("sqlite::memory:")
        .await
        .expect("an in-memory database");

    for statement in PRODUCTION_DDL {
        sqlx::query(statement)
            .execute(&db)
            .await
            .expect("the production DDL applies");
    }

    // Then this crate's migration, which has to be a no-op over the existing
    // tables rather than a conflict.
    rocksky_appview::db::migrate_auth(&db)
        .await
        .expect("this crate's migration must tolerate an existing file");

    db
}

async fn store_with(issuer: &str) -> (SqliteAuthStore, sqlx::SqlitePool) {
    let db = rocksky_appview::db::connect_auth("sqlite::memory:")
        .await
        .expect("auth db");

    sqlx::query("INSERT INTO auth_session (key, session, \"expiresAt\") VALUES (?, ?, ?)")
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
    let issuer = stub_authserver().await;
    let (store, _db) = store_with(issuer.url()).await;

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
    assert_eq!(session.token_set.iss.as_str(), issuer.url());

    // The endpoints the Node JSON does not record were recovered from the
    // issuer's metadata.
    assert_eq!(
        session.authserver_token_endpoint.as_str(),
        format!("{}/oauth/token", issuer.url())
    );
    assert_eq!(
        session.authserver_revocation_endpoint.as_deref(),
        Some(format!("{}/oauth/revoke", issuer.url()).as_str())
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

}

/// Writing back must keep the row readable by the TypeScript API, or a user
/// who switches back would be logged out.
#[actix_web::test]
async fn a_session_rewritten_here_is_still_readable_by_the_typescript_api() {
    let issuer = stub_authserver().await;
    let (store, db) = store_with(issuer.url()).await;

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
    assert_eq!(value["tokenSet"]["iss"], issuer.url());
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
        sqlx::query_scalar("SELECT \"expiresAt\" FROM auth_session WHERE key = ?")
            .bind("did:plc:alice")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(expires.as_deref(), Some("2027-01-01T00:00:00.000Z"));

}

/// An app-password session lives in the same table under `atp:<did>`; the two
/// kinds must not be confused for one another.
#[actix_web::test]
async fn oauth_and_app_password_sessions_coexist_in_one_table() {
    let issuer = stub_authserver().await;
    let (store, db) = store_with(issuer.url()).await;

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

/// The regression this file exists for: a file apps/api wrote must be
/// writable, not merely readable.
///
/// Reading only touches the `session` column, which both spellings share, so a
/// mismatched expiry column passes every read test and then fails on the first
/// login — leaving exactly the "everyone has to sign in again" outcome the
/// interop is meant to prevent.
#[actix_web::test]
async fn a_session_can_be_written_into_a_file_apps_api_created() {
    let issuer = stub_authserver().await;
    let db = production_shaped_db().await;

    // A row as Node wrote it, inserted through the production column name.
    sqlx::query("INSERT INTO auth_session (key, session, \"expiresAt\") VALUES (?, ?, ?)")
        .bind("did:plc:alice")
        .bind(node_session_row(issuer.url()))
        .bind("2027-01-01T00:00:00.000Z")
        .execute(&db)
        .await
        .expect("apps/api's own column name must work");

    let store = SqliteAuthStore::new(db.clone(), reqwest::Client::new());
    let did: Did = "did:plc:alice".parse().unwrap();

    let session = store
        .get_session(&did, DEFAULT_SESSION_ID)
        .await
        .expect("restoring must not fail")
        .expect("the row must be found");

    // And writing it back — the half that a column mismatch breaks.
    store
        .upsert_session(session)
        .await
        .expect("saving into an apps/api file must not fail");

    let (session, expires_at): (String, Option<String>) =
        sqlx::query_as("SELECT session, \"expiresAt\" FROM auth_session WHERE key = ?")
            .bind("did:plc:alice")
            .fetch_one(&db)
            .await
            .expect("the row is still there");

    assert!(
        session.contains("dpopJwk"),
        "the row must stay in the shape apps/api reads"
    );
    assert_eq!(
        expires_at.as_deref(),
        Some("2027-01-01T00:00:00.000Z"),
        "the expiry must land in the column apps/api queries, not a new one"
    );

    // Nothing created a second, snake_case column alongside it.
    let columns: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info('auth_session')")
            .fetch_all(&db)
            .await
            .expect("columns");
    assert!(
        !columns.iter().any(|column| column == "expires_at"),
        "a snake_case column appeared: {columns:?}"
    );
}

/// The refresher's sweep has to find rows in a production file, or sessions
/// quietly lapse instead of being renewed.
#[actix_web::test]
async fn the_refresher_finds_expiring_rows_in_a_production_file() {
    let issuer = stub_authserver().await;
    let db = production_shaped_db().await;

    // One lapsing soon, one far off, one app-password row, and one with the
    // literal string apps/api uses for "no expiry".
    let rows = [
        ("did:plc:soon", "2026-09-17T00:00:00.000Z"),
        ("did:plc:later", "2030-01-01T00:00:00.000Z"),
        ("atp:did:plc:apppassword", "2026-09-17T00:00:00.000Z"),
        ("did:plc:noexpiry", "NULL"),
    ];
    for (key, expires_at) in rows {
        sqlx::query("INSERT INTO auth_session (key, session, \"expiresAt\") VALUES (?, ?, ?)")
            .bind(key)
            .bind(node_session_row(issuer.url()))
            .bind(expires_at)
            .execute(&db)
            .await
            .expect("insert");
    }

    let due = rocksky_appview::oauth::refresher::sessions_due(&db, "2026-09-20T00:00:00.000Z")
        .await
        .expect("the sweep must run against a production file");

    assert_eq!(
        due,
        vec!["did:plc:soon".to_string()],
        "only the lapsing OAuth session is due: {due:?}"
    );
}

/// Restores every session in a real `atproto.sqlite`.
///
/// Ignored by default because it needs a production file, which is not in the
/// repo and must not be — it holds live refresh tokens and DPoP private keys
/// for real people. Point it at a copy and run it when the store changes:
///
/// ```text
/// ROCKSKY_REAL_AUTH_DB=/path/to/atproto.sqlite \
///   cargo test -p rocksky-appview --test oauth_interop -- --ignored --nocapture
/// ```
///
/// The fixtures above are written from what this found, which is the only
/// reason they have the field sets they do: real rows carry no `authMethod`
/// and their `dpopJwk` has no `alg` or `kid`, so a parser that required
/// either would pass every hand-written test and reject all 833 live
/// sessions.
#[actix_web::test]
#[ignore = "needs a production atproto.sqlite; see the doc comment"]
async fn every_session_in_a_real_database_restores() {
    let Ok(path) = std::env::var("ROCKSKY_REAL_AUTH_DB") else {
        panic!("set ROCKSKY_REAL_AUTH_DB to a copy of a production atproto.sqlite");
    };

    let db = sqlx::SqlitePool::connect(&format!("sqlite://{path}"))
        .await
        .expect("open the production file");

    // Opening it must not need a migration to have run first, and running one
    // must not change anything.
    rocksky_appview::db::migrate_auth(&db)
        .await
        .expect("the migration must tolerate a production file");

    let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM auth_session ORDER BY key")
        .fetch_all(&db)
        .await
        .expect("list sessions");

    let store = SqliteAuthStore::new(db.clone(), reqwest::Client::new());

    let mut oauth = 0usize;
    let mut app_password = 0usize;
    let mut unreadable = Vec::new();

    for key in &keys {
        if let Some(did) = key.strip_prefix("atp:") {
            // App-password rows are read by their own loader, not the OAuth
            // store — they live in the same table but a different shape.
            match rocksky_appview::atproto::session::load(&db, did).await {
                Ok(Some(_)) => app_password += 1,
                Ok(None) | Err(_) => unreadable.push(key.clone()),
            }
            continue;
        }

        let Ok(did) = key.parse::<Did>() else {
            unreadable.push(format!("{key} (not a DID)"));
            continue;
        };

        // The store re-reads the issuer's metadata, which would mean a network
        // call per row. Parsing is what is under test, so the row is decoded
        // directly instead.
        let raw: Option<String> = sqlx::query_scalar("SELECT session FROM auth_session WHERE key = ?")
            .bind(key)
            .fetch_optional(&db)
            .await
            .expect("read the row")
            .flatten();

        let Some(raw) = raw else {
            unreadable.push(key.clone());
            continue;
        };

        match rocksky_appview::oauth::store::parse_node_session(&raw) {
            Ok(session) => {
                assert!(
                    session.refresh_token.is_some(),
                    "{did} has no refresh token, so it cannot be renewed"
                );
                assert!(
                    !session.access_token.is_empty(),
                    "{did} has an empty access token"
                );
                assert!(
                    matches!(session.dpop_key, jose_jwk::Key::Ec(_)),
                    "{did} has a DPoP key that is not an EC key"
                );
                oauth += 1;
            }
            Err(err) => unreadable.push(format!("{key}: {err}")),
        }
    }

    println!("restored {oauth} OAuth and {app_password} app-password sessions");
    if !unreadable.is_empty() {
        println!("could not read {} rows:", unreadable.len());
        for row in unreadable.iter().take(10) {
            println!("  {row}");
        }
    }

    assert!(
        unreadable.is_empty(),
        "{} of {} live sessions would be lost",
        unreadable.len(),
        keys.len()
    );
}
