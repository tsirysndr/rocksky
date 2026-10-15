//! Small synthetic releases exercise the official nested dump layout, including
//! repeated recordings on multiple releases. No network or production database.
use actix_web::{test, web, App};
use duckdb::Connection;
use riff::mb::{self, import};
use serde_json::{json, Value};

#[actix_web::test]
async fn release_dump_expands_recordings_and_is_repeatable_and_atomic() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("mb.duckdb");
    let file = dir.path().join("release.jsonl");
    let recording = json!({"id":"recording-one","title":"Song","length":123000,
        "isrcs":["TEST00000001"], "artist-credit":[{"name":"Artist","artist":{"id":"artist-one","name":"Artist"}}]});
    let releases: Vec<Value> = ["Official", "Bootleg"].iter().enumerate().map(|(i,status)| json!({
        "id":format!("release-{i}"),"title":format!("Album {i}"),"date":"2020-01-01","status":status,
        "release-group":{"id":"group-one","primary-type":"Album"},
        "media":[{"tracks":[{"id":format!("track-{i}"),"recording":recording}]}]
    })).collect();
    std::fs::write(
        &file,
        releases
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n"),
    )
    .unwrap();
    let conn = Connection::open(&path).unwrap();
    let standalone = dir.path().join("recording.jsonl");
    std::fs::write(
        &standalone,
        json!({"id":"standalone","title":"Standalone Song"}).to_string(),
    )
    .unwrap();
    import::create_shared_tables(&conn).unwrap();
    import::import_entity(
        &conn,
        mb::entity("recording").unwrap(),
        &standalone,
        import::DEFAULT_MAX_OBJECT_SIZE,
    )
    .unwrap();
    assert_eq!(
        import::import_release_recordings(&conn, &file, import::DEFAULT_MAX_OBJECT_SIZE).unwrap(),
        2
    );
    assert_eq!(
        import::import_release_recordings(&conn, &file, import::DEFAULT_MAX_OBJECT_SIZE).unwrap(),
        2
    );
    let links: u64 = conn
        .query_row("SELECT count(*) FROM mb_recording_release", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(links, 2);
    let credits:u64=conn.query_row("SELECT count(*) FROM mb_artist_credit WHERE entity='recording' AND artist_id='artist-one'",[],|r|r.get(0)).unwrap();
    assert_eq!(credits, 1);
    let isrcs: u64 = conn
        .query_row(
            "SELECT count(*) FROM mb_recording_isrc WHERE isrc='TEST00000001'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(isrcs, 1);
    std::fs::write(&file, "not json").unwrap();
    assert!(
        import::import_release_recordings(&conn, &file, import::DEFAULT_MAX_OBJECT_SIZE).is_err()
    );
    let remaining: u64 = conn
        .query_row("SELECT count(*) FROM mb_release", [], |r| r.get(0))
        .unwrap();
    assert_eq!(remaining, 2);
    drop(conn);
    let (catalog, _) = mb::db::open(&mb::db::Settings {
        db_path: path,
        pool_size: 2,
        pool_timeout: std::time::Duration::from_secs(5),
        writable: false,
    })
    .unwrap();
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(catalog))
            .configure(mb::routes::configure),
    )
    .await;
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/ws/2/recording/recording-one")
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    let body: Value = test::read_body_json(response).await;
    assert_eq!(body["title"], "Song");
    assert_eq!(body["releases"].as_array().unwrap().len(), 2);
    assert_eq!(body["releases"][0]["status"], "Official");
    let response = test::call_service(
        &app,
        test::TestRequest::get()
            .uri("/ws/2/release/release-0")
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), 200);
    let body: Value = test::read_body_json(response).await;
    assert_eq!(body, releases[0]);
}
