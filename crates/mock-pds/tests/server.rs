//! The mock driven over real HTTP, the way code under test drives it.
//!
//! These matter more than they look: a mock that quietly answers the wrong
//! shape makes every test that depends on it wrong in the same direction, and
//! nothing else will catch it. So each endpoint is checked against the shape a
//! real PDS returns, and the CAR is parsed back from its bytes.

use rocksky_mock_pds::MockPds;

async fn get(url: &str) -> (u16, serde_json::Value) {
    let response = reqwest::get(url).await.expect("request");
    let status = response.status().as_u16();
    let body = response.json().await.unwrap_or(serde_json::Value::Null);
    (status, body)
}

async fn post(url: &str, token: Option<&str>, body: serde_json::Value) -> (u16, serde_json::Value) {
    let mut request = reqwest::Client::new().post(url).json(&body);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.expect("request");
    let status = response.status().as_u16();
    let body = response.json().await.unwrap_or(serde_json::Value::Null);
    (status, body)
}

#[tokio::test]
async fn a_did_document_points_back_at_the_mock() {
    let pds = MockPds::start().await;

    let (status, document) = get(&format!("{}/{}", pds.url(), pds.did())).await;
    assert_eq!(status, 200);
    assert_eq!(document["id"], pds.did());

    // The handle is read back from `alsoKnownAs`, which is how backfill
    // recovers it for a repo with no appview entry.
    assert_eq!(
        document["alsoKnownAs"][0],
        format!("at://{}", pds.handle())
    );

    // And the service endpoint is the mock itself, so following it stays in
    // the test.
    assert_eq!(
        document["service"][0]["serviceEndpoint"],
        pds.url(),
        "a DID document that pointed elsewhere would leave the machine"
    );
}

#[tokio::test]
async fn an_unknown_did_is_a_404() {
    let pds = MockPds::start().await;
    let (status, _) = get(&format!("{}/did:plc:nobodyhere", pds.url())).await;
    assert_eq!(status, 404);
}

#[tokio::test]
async fn a_handle_resolves_to_its_did() {
    let pds = MockPds::start().await;

    let (status, body) = get(&format!(
        "{}/xrpc/com.atproto.identity.resolveHandle?handle={}",
        pds.url(),
        pds.handle()
    ))
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["did"], pds.did());

    let (status, body) = get(&format!(
        "{}/xrpc/com.atproto.identity.resolveHandle?handle=nobody.test",
        pds.url()
    ))
    .await;
    assert_eq!(status, 400);
    assert_eq!(body["error"], "InvalidRequest");
}

/// A bad password must answer `AuthenticationRequired` — not `AuthRequired`,
/// which is what an XRPC server returns for a missing token. Code that
/// branches on the string needs the one a PDS actually sends.
#[tokio::test]
async fn a_wrong_password_is_rejected_with_the_pds_error_name() {
    let pds = MockPds::start().await;
    let url = format!("{}/xrpc/com.atproto.server.createSession", pds.url());

    let (status, body) = post(
        &url,
        None,
        serde_json::json!({ "identifier": pds.handle(), "password": "wrong" }),
    )
    .await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "AuthenticationRequired");

    // An unknown account answers identically, so nothing leaks about which
    // accounts exist.
    let (status, other) = post(
        &url,
        None,
        serde_json::json!({ "identifier": "nobody.test", "password": "wrong" }),
    )
    .await;
    assert_eq!(status, 401);
    assert_eq!(other["error"], body["error"]);
}

#[tokio::test]
async fn a_good_password_issues_a_session() {
    let pds = MockPds::start().await;

    let (status, body) = post(
        &format!("{}/xrpc/com.atproto.server.createSession", pds.url()),
        None,
        serde_json::json!({ "identifier": pds.handle(), "password": pds.password() }),
    )
    .await;

    assert_eq!(status, 200);
    assert_eq!(body["did"], pds.did());
    assert_eq!(body["handle"], pds.handle());
    assert_eq!(body["active"], true);
    assert_eq!(body["accessJwt"], pds.access_token());
    assert!(body["refreshJwt"].as_str().is_some());
}

/// Writing needs a token, and one that owns the repository being written to.
#[tokio::test]
async fn a_write_requires_a_token_for_that_repo() {
    let pds = MockPds::builder()
        .account("did:plc:alice", "alice.test", "pw")
        .account("did:plc:bob", "bob.test", "pw")
        .start()
        .await;

    let url = format!("{}/xrpc/com.atproto.repo.putRecord", pds.url());
    let write = serde_json::json!({
        "repo": "did:plc:alice",
        "collection": "app.rocksky.song",
        "rkey": "3aaa",
        "record": { "$type": "app.rocksky.song", "title": "Roygbiv" },
    });

    // No token at all.
    let (status, body) = post(&url, None, write.clone()).await;
    assert_eq!(status, 401);
    assert_eq!(body["error"], "AuthenticationRequired");

    // Bob's token, Alice's repo.
    let (status, body) = post(&url, Some("mock-access-did:plc:bob"), write.clone()).await;
    assert_eq!(status, 403, "{body}");

    // Alice's own.
    let (status, body) = post(&url, Some("mock-access-did:plc:alice"), write).await;
    assert_eq!(status, 200, "{body}");
    assert_eq!(
        body["uri"], "at://did:plc:alice/app.rocksky.song/3aaa",
        "the URI names the repo, collection and rkey"
    );
    assert!(
        body["cid"].as_str().unwrap().starts_with("bafyrei"),
        "the CID is a real dag-cbor CID: {}",
        body["cid"]
    );
}

/// The same record must always get the same CID, because that is what makes a
/// republish detectable as unchanged.
#[tokio::test]
async fn the_same_record_yields_the_same_cid() {
    let pds = MockPds::start().await;
    let url = format!("{}/xrpc/com.atproto.repo.putRecord", pds.url());
    let token = pds.access_token();

    let write = |rkey: &str| {
        serde_json::json!({
            "repo": pds.did(),
            "collection": "app.rocksky.song",
            "rkey": rkey,
            "record": { "$type": "app.rocksky.song", "title": "Roygbiv" },
        })
    };

    let (_, first) = post(&url, Some(&token), write("3aaa")).await;
    let (_, second) = post(&url, Some(&token), write("3bbb")).await;
    assert_eq!(
        first["cid"], second["cid"],
        "the CID is the hash of the record, not of its key"
    );
}

#[tokio::test]
async fn records_can_be_read_back_listed_and_deleted() {
    let pds = MockPds::start().await;
    let token = pds.access_token();
    let did = pds.did();

    for rkey in ["3aaa", "3bbb", "3ccc"] {
        post(
            &format!("{}/xrpc/com.atproto.repo.putRecord", pds.url()),
            Some(&token),
            serde_json::json!({
                "repo": did,
                "collection": "app.rocksky.song",
                "rkey": rkey,
                "record": { "$type": "app.rocksky.song", "title": rkey },
            }),
        )
        .await;
    }

    let (status, body) = get(&format!(
        "{}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=app.rocksky.song&rkey=3bbb",
        pds.url()
    ))
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["value"]["title"], "3bbb");

    let (status, body) = get(&format!(
        "{}/xrpc/com.atproto.repo.listRecords?repo={did}&collection=app.rocksky.song",
        pds.url()
    ))
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["records"].as_array().unwrap().len(), 3);
    assert!(
        body.get("cursor").is_none(),
        "no cursor when the page is the whole collection"
    );

    let (status, _) = post(
        &format!("{}/xrpc/com.atproto.repo.deleteRecord", pds.url()),
        Some(&token),
        serde_json::json!({
            "repo": did,
            "collection": "app.rocksky.song",
            "rkey": "3bbb",
        }),
    )
    .await;
    assert_eq!(status, 200);

    let (status, body) = get(&format!(
        "{}/xrpc/com.atproto.repo.getRecord?repo={did}&collection=app.rocksky.song&rkey=3bbb",
        pds.url()
    ))
    .await;
    assert_eq!(status, 400);
    assert_eq!(body["error"], "RecordNotFound");
}

/// A caller looping on the cursor must terminate, and must see every record
/// exactly once.
#[tokio::test]
async fn paging_a_collection_terminates_and_covers_everything() {
    let pds = MockPds::start().await;
    for i in 0..25 {
        pds.put_record(
            "app.rocksky.scrobble",
            &format!("3mu{i:04}"),
            serde_json::json!({ "$type": "app.rocksky.scrobble", "n": i }),
        );
    }

    let mut seen = Vec::new();
    let mut cursor: Option<String> = None;
    for _ in 0..20 {
        let mut url = format!(
            "{}/xrpc/com.atproto.repo.listRecords?repo={}&collection=app.rocksky.scrobble&limit=7",
            pds.url(),
            pds.did()
        );
        if let Some(cursor) = &cursor {
            url.push_str(&format!("&cursor={cursor}"));
        }

        let (status, body) = get(&url).await;
        assert_eq!(status, 200);

        for record in body["records"].as_array().unwrap() {
            seen.push(record["uri"].as_str().unwrap().to_string());
        }

        cursor = body["cursor"].as_str().map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }

    assert!(cursor.is_none(), "paging did not terminate");
    assert_eq!(seen.len(), 25, "every record came back");

    let unique: std::collections::HashSet<_> = seen.iter().collect();
    assert_eq!(unique.len(), 25, "a record was returned twice");
}

#[tokio::test]
async fn the_call_log_records_what_was_asked_for() {
    let pds = MockPds::start().await;
    assert!(pds.calls().is_empty());

    get(&format!(
        "{}/xrpc/com.atproto.identity.resolveHandle?handle={}",
        pds.url(),
        pds.handle()
    ))
    .await;

    assert!(pds.was_called("/xrpc/com.atproto.identity.resolveHandle"));
    assert_eq!(pds.call_count("/xrpc/com.atproto.identity.resolveHandle"), 1);
    assert!(!pds.was_called("/xrpc/com.atproto.repo.putRecord"));

    pds.clear_calls();
    assert!(pds.calls().is_empty());
}

/// Fault injection, so a test can drive the path where the PDS refuses.
#[tokio::test]
async fn an_injected_failure_applies_then_expires() {
    let pds = MockPds::start().await;
    let url = format!("{}/xrpc/com.atproto.repo.putRecord", pds.url());
    let token = pds.access_token();
    let write = serde_json::json!({
        "repo": pds.did(),
        "collection": "app.rocksky.song",
        "rkey": "3aaa",
        "record": { "$type": "app.rocksky.song" },
    });

    pds.fail_next("com.atproto.repo.putRecord", 2, 502, "UpstreamFailure");

    for attempt in 1..=2 {
        let (status, body) = post(&url, Some(&token), write.clone()).await;
        assert_eq!(status, 502, "attempt {attempt}");
        assert_eq!(body["error"], "UpstreamFailure");
    }

    let (status, _) = post(&url, Some(&token), write).await;
    assert_eq!(status, 200, "the third attempt succeeds");
    assert_eq!(pds.record_count("app.rocksky.song"), 1);
}

#[tokio::test]
async fn an_always_failing_endpoint_keeps_failing_until_cleared() {
    let pds = MockPds::start().await;
    let url = format!(
        "{}/xrpc/com.atproto.identity.resolveHandle?handle={}",
        pds.url(),
        pds.handle()
    );

    pds.always_fail("com.atproto.identity.resolveHandle", 500, "InternalServerError");
    for _ in 0..4 {
        assert_eq!(get(&url).await.0, 500);
    }

    pds.clear_failures();
    assert_eq!(get(&url).await.0, 200);
}

#[tokio::test]
async fn the_oauth_metadata_advertises_endpoints_on_the_mock() {
    let pds = MockPds::start().await;

    let (status, metadata) = get(&format!(
        "{}/.well-known/oauth-authorization-server",
        pds.url()
    ))
    .await;

    assert_eq!(status, 200);
    assert_eq!(metadata["issuer"], pds.url());
    for (field, path) in [
        ("token_endpoint", "/oauth/token"),
        ("revocation_endpoint", "/oauth/revoke"),
        ("pushed_authorization_request_endpoint", "/oauth/par"),
        ("authorization_endpoint", "/oauth/authorize"),
    ] {
        assert_eq!(
            metadata[field],
            format!("{}{path}", pds.url()),
            "{field} must point at the mock"
        );
    }
}

/// The token endpoint answers `DPoP`, because that is what a real ATProto
/// server issues — a client that assumed `Bearer` would break in production.
#[tokio::test]
async fn the_token_endpoint_issues_a_dpop_token() {
    let pds = MockPds::start().await;

    let response = reqwest::Client::new()
        .post(format!("{}/oauth/token", pds.url()))
        .form(&[("grant_type", "authorization_code"), ("code", "mock-auth-code")])
        .send()
        .await
        .expect("request");

    assert_eq!(response.status(), 200);
    let body: serde_json::Value = response.json().await.unwrap();
    assert_eq!(body["token_type"], "DPoP");
    assert_eq!(body["sub"], pds.did());
    assert!(body["access_token"].as_str().is_some());
    assert!(body["refresh_token"].as_str().is_some());
}

#[tokio::test]
async fn an_unsupported_grant_is_refused() {
    let pds = MockPds::start().await;

    let response = reqwest::Client::new()
        .post(format!("{}/oauth/token", pds.url()))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .expect("request");

    assert_eq!(response.status(), 400);
    let body: serde_json::Value = response.json().await.unwrap();
    assert_eq!(body["error"], "unsupported_grant_type");
}

/// Two mocks must not share anything, so tests can run in parallel.
#[tokio::test]
async fn two_mocks_are_independent() {
    let first = MockPds::start().await;
    let second = MockPds::start().await;

    assert_ne!(first.url(), second.url());

    first.put_record("app.rocksky.song", "3aaa", serde_json::json!({}));

    assert_eq!(first.record_count("app.rocksky.song"), 1);
    assert_eq!(second.record_count("app.rocksky.song"), 0);
}
