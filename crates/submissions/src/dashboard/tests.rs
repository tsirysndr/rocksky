use super::*;
use actix_web::{http::StatusCode, test, App};
use serde_json::Value;

async fn contract(queue: Queue) {
    let secret = "dashboard-test-secret-not-for-production";
    let mut ids = Vec::new();
    for n in 0..4 {
        ids.push(
            queue
                .enqueue(
                    "dashboard.test",
                    &n.to_string(),
                    "fingerprint",
                    "PRIVATE-PAYLOAD",
                )
                .await
                .unwrap()
                .id,
        );
    }
    // Force equal timestamps to test the stable ID tie-breaker.
    sqlx::query("UPDATE rocksky_durable_jobs SET created_at=100 WHERE kind='dashboard.test'")
        .execute(&queue.pool)
        .await
        .unwrap();
    let claimed = queue.claim("dashboard.test", 60, 5).await.unwrap().unwrap();
    queue
        .checkpoint(&claimed, "step.v1", "PRIVATE-RESULT")
        .await
        .unwrap();
    queue.finish(&claimed).await.unwrap();
    let failed = queue.claim("dashboard.test", 60, 5).await.unwrap().unwrap();
    queue.fail(&failed, "test error", true, 5).await.unwrap();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(Service {
                queue: queue.clone(),
                secret: secret.into(),
            }))
            .configure(crate::service::routes),
    )
    .await;
    for path in [
        "/v1/dashboard/overview",
        "/v1/dashboard/jobs",
        &format!("/v1/dashboard/jobs/{}", claimed.id),
    ] {
        assert_eq!(
            test::call_service(&app, test::TestRequest::get().uri(path).to_request())
                .await
                .status(),
            StatusCode::OK
        );
    }
    assert_eq!(
        test::call_service(
            &app,
            test::TestRequest::post()
                .uri(&format!("/v1/jobs/{}/retry", failed.id))
                .to_request()
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let first: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/v1/dashboard/jobs?limit=2")
            .insert_header(("x-rocksky-submissions-secret", secret))
            .to_request(),
    )
    .await;
    let cursor = first["next"].as_str().unwrap();
    let second: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri(&format!("/v1/dashboard/jobs?limit=2&before={cursor}"))
            .insert_header(("x-rocksky-submissions-secret", secret))
            .to_request(),
    )
    .await;
    assert!(second["next"].is_null());
    let mut actual: Vec<String> = first["jobs"]
        .as_array()
        .unwrap()
        .iter()
        .chain(second["jobs"].as_array().unwrap())
        .map(|j| j["id"].as_str().unwrap().into())
        .collect();
    actual.sort();
    ids.sort();
    assert_eq!(actual, ids);
    assert!(!first.to_string().contains("PRIVATE"));
    assert!(first["jobs"][0].get("payload").is_none());
    assert!(first["jobs"][0].get("request_hash").is_none());
    for query in [
        "limit=0",
        "limit=101",
        "status=invalid",
        "before=bad",
        "id=bad",
        "jetstream_version=v3",
        "jetstream_version=%25",
        "kind=%27%20OR%201=1--",
    ] {
        let response = test::call_service(
            &app,
            test::TestRequest::get()
                .uri(&format!("/v1/dashboard/jobs?{query}"))
                .insert_header(("x-rocksky-submissions-secret", secret))
                .to_request(),
        )
        .await;
        if query.starts_with("kind") {
            let value: Value = test::read_body_json(response).await;
            assert_eq!(value["jobs"].as_array().unwrap().len(), 0);
        } else {
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
    }
    let filtered: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/v1/dashboard/jobs?status=failed&kind=dashboard.test")
            .insert_header(("x-rocksky-submissions-secret", secret))
            .to_request(),
    )
    .await;
    assert_eq!(filtered["jobs"].as_array().unwrap().len(), 1);
    let detail: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri(&format!("/v1/dashboard/jobs/{}", claimed.id))
            .insert_header(("x-rocksky-submissions-secret", secret))
            .to_request(),
    )
    .await;
    assert_eq!(detail["steps"][0]["name"], "step.v1");
    assert_eq!(detail["attempts"][0]["outcome"], "completed");
    assert!(detail["attempts"][0]["duration_ms"].as_i64().unwrap() >= 0);
    assert!(detail["attempts"][0]["started_at_ms"].as_i64().unwrap() > 0);
    assert!(!detail.to_string().contains("PRIVATE"));
    let overview = queue.dashboard_overview().await.unwrap();
    assert_eq!(overview.counts.iter().map(|c| c.count).sum::<i64>(), 4);
    assert_eq!(overview.completions.iter().map(|c| c.count).sum::<i64>(), 1);
    assert_eq!(
        queue.dashboard_overview().await.unwrap().as_of,
        overview.as_of
    );
    for (path, status, mime) in [
        ("/dashboard/", StatusCode::OK, "text/html"),
        ("/dashboard/missing.js", StatusCode::NOT_FOUND, ""),
    ] {
        let response =
            test::call_service(&app, test::TestRequest::get().uri(path).to_request()).await;
        assert_eq!(response.status(), status);
        if status == StatusCode::OK {
            assert!(response
                .headers()
                .get("content-type")
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with(mime));
            assert!(response.headers().get("content-security-policy").is_some());
            let html = String::from_utf8(test::read_body(response).await.to_vec()).unwrap();
            let script = html
                .split("src=\"")
                .nth(1)
                .unwrap()
                .split('"')
                .next()
                .unwrap();
            let asset =
                test::call_service(&app, test::TestRequest::get().uri(script).to_request()).await;
            assert_eq!(asset.status(), StatusCode::OK);
            assert!(asset
                .headers()
                .get("content-type")
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with("text/javascript"));
        }
    }
    let mut protocol_ids = Vec::new();
    for (n, version) in ["v1", "v2", "v2"].iter().enumerate() {
        let job = queue
            .enqueue(
                "jetstream.commit.v1",
                &format!("protocol-{n}"),
                "hash",
                r#"{"commit":{"record":{"title":"Protocol fixture"}}}"#,
            )
            .await
            .unwrap();
        sqlx::query("UPDATE rocksky_durable_jobs SET source=$1 WHERE id=$2")
            .bind(format!("jetstream:{version}:wss://example.test"))
            .bind(&job.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        protocol_ids.push(job.id);
    }
    let v1 = queue
        .dashboard_jobs(&JobFilter {
            jetstream_version: "v1".into(),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(v1.jobs.len(), 1);
    assert_eq!(v1.jobs[0].id, protocol_ids[0]);
    let filter = JobFilter {
        jetstream_version: "v2".into(),
        kind: "jetstream.commit.v1".into(),
        status: "pending".into(),
        q: "Protocol fixture".into(),
        limit: Some(1),
        ..Default::default()
    };
    let page1 = queue.dashboard_jobs(&filter).await.unwrap();
    assert_eq!(page1.jobs.len(), 1);
    assert!(page1.next.is_some());
    let page2 = queue
        .dashboard_jobs(&JobFilter {
            before: page1.next,
            ..filter
        })
        .await
        .unwrap();
    assert_eq!(page2.jobs.len(), 1);
    assert!(page2.next.is_none());
    assert_ne!(page1.jobs[0].id, page2.jobs[0].id);
    assert!(page1
        .jobs
        .iter()
        .chain(&page2.jobs)
        .all(|job| protocol_ids[1..].contains(&job.id)));
    assert!(queue
        .dashboard_jobs(&JobFilter {
            jetstream_version: "v2".into(),
            id: protocol_ids[0].clone(),
            ..Default::default()
        })
        .await
        .unwrap()
        .jobs
        .is_empty());
    let response: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri("/v1/dashboard/jobs?jetstream_version=v1")
            .to_request(),
    )
    .await;
    assert_eq!(response["jobs"][0]["id"], protocol_ids[0]);
    assert_eq!(response["jobs"].as_array().unwrap().len(), 1);
    queue.dashboard_search_cache.lock().await.take();
    let metadata_job = queue.enqueue("scrobble.publish.v1", "metadata", "hash", r#"{"did":"did:plc:listener","secret":"PRIVATE","track":{"title":"Blue Cheese","artist":"2 Chainz","album":"Pretty Girls Like Trap Music","token":"PRIVATE"}}"#).await.unwrap();
    let search = queue
        .dashboard_jobs(&JobFilter {
            q: "blue chainz".into(),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(search.jobs.len(), 1);
    assert_eq!(search.jobs[0].id, metadata_job.id);
    assert!(queue
        .dashboard_jobs(&JobFilter {
            q: "PRIVATE".into(),
            ..Default::default()
        })
        .await
        .unwrap()
        .jobs
        .is_empty());
    let metadata: Value = test::call_and_read_body_json(
        &app,
        test::TestRequest::get()
            .uri(&format!("/v1/dashboard/jobs/{}", metadata_job.id))
            .to_request(),
    )
    .await;
    assert_eq!(metadata["scrobble"]["title"], "Blue Cheese");
    assert!(!metadata.to_string().contains("PRIVATE"));
    // Same commit from multiple feeds counts once; grouping shares the chart window.
    use crate::queue::InboxEvent;
    let event = |source: &str, key: &str, payload: &str| InboxEvent {
        source: source.into(),
        cursor: 100,
        key: key.into(),
        payload: payload.into(),
    };
    queue
        .ingest_batch(
            "jetstream.commit.v1",
            &[
                event(
                    "jetstream:v1:wss://one.test",
                    "breakdown-scrobble",
                    r#"{"commit":{"collection":"app.rocksky.scrobble"}}"#,
                ),
                event(
                    "jetstream:v2:wss://two.test",
                    "breakdown-scrobble",
                    r#"{"commit":{"collection":"app.rocksky.scrobble"}}"#,
                ),
                event(
                    "jetstream:v1:wss://one.test",
                    "breakdown-song",
                    r#"{"commit":{"collection":"app.rocksky.song"}}"#,
                ),
                event(
                    "jetstream:v1:wss://one.test",
                    "breakdown-unknown",
                    "malformed",
                ),
            ],
        )
        .await
        .unwrap();
    while let Some(job) = queue.claim("jetstream.commit.v1", 60, 5).await.unwrap() {
        assert!(queue.finish(&job).await.unwrap());
    }
    for id in &protocol_ids {
        sqlx::query("UPDATE rocksky_durable_jobs SET updated_at=1 WHERE id=$1")
            .bind(id)
            .execute(&queue.pool)
            .await
            .unwrap();
    }
    // Payload compaction must not change this breakdown.
    sqlx::query("UPDATE rocksky_durable_jobs SET payload='{}' WHERE kind='jetstream.commit.v1' AND status='completed'").execute(&queue.pool).await.unwrap();
    queue.dashboard_cache.lock().await.take();
    let overview = queue.dashboard_overview().await.unwrap();
    let buckets: Vec<_> = overview
        .completions
        .iter()
        .filter(|b| b.kind == "jetstream.commit.v1")
        .collect();
    assert_eq!(buckets.iter().map(|b| b.count).sum::<i64>(), 3);
    for collection in ["app.rocksky.scrobble", "app.rocksky.song", ""] {
        assert_eq!(
            buckets
                .iter()
                .filter(|b| b.collection == collection)
                .map(|b| b.count)
                .sum::<i64>(),
            1
        );
    }
    // Regression: additive migration with warm prepared statements must not halt
    // older active connections. Repeated reads/claims use stable projections.
    sqlx::query(
        "ALTER TABLE rocksky_durable_jobs ADD COLUMN future_column BIGINT NOT NULL DEFAULT 0",
    )
    .execute(&queue.pool)
    .await
    .unwrap();
    for _ in 0..12 {
        assert!(queue.get(&claimed.id).await.unwrap().is_some());
        queue
            .enqueue("dashboard.test", "0", "fingerprint", "PRIVATE-PAYLOAD")
            .await
            .unwrap();
        if let Some(job) = queue.claim("dashboard.test", 60, 5).await.unwrap() {
            queue.finish(&job).await.unwrap();
        }
    }
}
#[cfg(feature = "sqlite")]
#[actix_web::test]
async fn sqlite_dashboard_contract() {
    let dir = tempfile::tempdir().unwrap();
    contract(
        Queue::connect(&format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("dashboard.sqlite").display()
        ))
        .await
        .unwrap(),
    )
    .await;
}
#[cfg(feature = "postgres")]
#[actix_web::test]
#[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL"]
async fn postgres_dashboard_and_additive_migration_contract() {
    let url = std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").unwrap();
    let admin = Queue::connect(&url).await.unwrap();
    let schema = format!("dashboard_test_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin.pool)
        .await
        .unwrap();
    let mut scoped = reqwest::Url::parse(&url).unwrap();
    scoped
        .query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    let queue = Queue::connect(scoped.as_str()).await.unwrap();
    let pool = queue.pool.clone();
    contract(queue).await;
    pool.close().await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&admin.pool)
        .await
        .unwrap();
}

#[actix_web::test]
async fn teal_metadata_is_searchable_without_exposing_private_fields() {
    let value = super::scrobble_metadata(
        &serde_json::json!({
            "did":"did:plc:test", "recordKey":"stable", "secret":"private",
            "track":{"$type":"fm.teal.feed.play", "trackName":"Song", "releaseName":"Album",
                "artists":[{"artistName":"Artist"}], "playedTime":"2026-10-15T00:00:00Z",
                "duration":180, "secret":"private"}
        })
        .to_string(),
    )
    .unwrap();
    assert_eq!(value["title"], "Song");
    assert_eq!(value["artist"], "Artist");
    assert_eq!(value["duration"], 180000);
    assert_eq!(value["did"], "did:plc:test");
    assert!(!value.to_string().contains("private"));
}
