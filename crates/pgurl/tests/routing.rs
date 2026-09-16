//! End-to-end check that `Db` opens the endpoints it claims to.
//!
//! Needs a reachable Postgres; set `PGURL_TEST_POSTGRES_URL` to run it,
//! otherwise it skips. A second, distinct URL in `PGURL_TEST_REPLICA_URL`
//! exercises the split path — pointing it at the same server via a different
//! database or query string is enough.

use rocksky_pgurl::Db;

fn base_url() -> Option<String> {
    std::env::var("PGURL_TEST_POSTGRES_URL")
        .ok()
        .filter(|u| !u.is_empty())
}

async fn application_name(pool: &sqlx::PgPool) -> String {
    sqlx::query_scalar::<_, String>("select current_setting('application_name')")
        .fetch_one(pool)
        .await
        .expect("query application_name")
}

#[tokio::test]
async fn collapses_to_one_pool_without_a_replica_and_splits_with_one() {
    let Some(url) = base_url() else {
        eprintln!("skipping: PGURL_TEST_POSTGRES_URL not set");
        return;
    };

    // --- no replica configured: both roles must land on the primary ---------
    std::env::set_var("XATA_POSTGRES_URL", &url);
    std::env::remove_var("XATA_READ_POSTGRES_URL");
    std::env::remove_var("XATA_WRITE_POSTGRES_URL");

    let db = Db::connect("pgurl-test", |o| o.max_connections(2))
        .await
        .expect("connect without a replica");

    assert_eq!(
        application_name(db.replica()).await,
        "pgurl-test:primary",
        "without a replica, reads must land on the primary"
    );
    assert_eq!(application_name(db.primary()).await, "pgurl-test:primary");

    // The pools are the same handle, so a process does not silently double its
    // connection count against one server just by adopting Db.
    assert_eq!(
        db.replica().size(),
        db.primary().size(),
        "unsplit Db must share one pool"
    );

    // --- a distinct replica configured: the roles must diverge --------------
    let Ok(replica_url) = std::env::var("PGURL_TEST_REPLICA_URL") else {
        eprintln!("skipping split half: PGURL_TEST_REPLICA_URL not set");
        return;
    };
    std::env::set_var("XATA_WRITE_POSTGRES_URL", &url);
    std::env::set_var("XATA_READ_POSTGRES_URL", &replica_url);

    let db = Db::connect("pgurl-test", |o| o.max_connections(2))
        .await
        .expect("connect with a replica");

    assert_eq!(application_name(db.replica()).await, "pgurl-test:replica");
    assert_eq!(application_name(db.primary()).await, "pgurl-test:primary");

    // And the primary really can write.
    sqlx::query("create temporary table pgurl_probe (n int)")
        .execute(db.primary())
        .await
        .expect("primary must accept writes");
}
