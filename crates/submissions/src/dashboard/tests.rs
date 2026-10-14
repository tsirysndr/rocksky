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
            StatusCode::UNAUTHORIZED
        );
    }
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
