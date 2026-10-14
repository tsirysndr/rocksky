use super::*;
use crate::{cleanup::CleanupSettings, service::KIND};

async fn completed(queue: &Queue, kind: &str, key: &str, payload: &str, age: i64) -> Job {
    let accepted = queue.enqueue(kind, key, "hash", payload).await.unwrap();
    let job = queue.claim(kind, 60, 3).await.unwrap().unwrap();
    assert_eq!(accepted.id, job.id);
    queue
        .checkpoint(&job, "test-step", "confirmed")
        .await
        .unwrap();
    assert!(queue.finish(&job).await.unwrap());
    sqlx::query(&format!(
        "UPDATE rocksky_durable_jobs SET updated_at={}- $2 WHERE id=$1",
        queue.now()
    ))
    .bind(&job.id)
    .bind(age)
    .execute(&queue.pool)
    .await
    .unwrap();
    queue.get(&job.id).await.unwrap().unwrap()
}

async fn contract(queue: Queue) {
    let settings = CleanupSettings {
        completed_retention_seconds: 10,
        dedup_retention_seconds: 100,
        batch_size: 1,
        ..CleanupSettings::default()
    };
    let payload = r#"{"did":"did:plc:test","recordKey":"3mv234567abcd","track":{"timestamp":1234,"title":"private metadata"}}"#;
    let old = completed(&queue, KIND, "old", payload, 30).await;
    let event = completed(
        &queue,
        "jetstream.commit.v1",
        "event",
        "large event body",
        20,
    )
    .await;
    let other = completed(&queue, "other", "other", "large payload", 20).await;
    let fresh = completed(&queue, "fresh", "fresh", "fresh payload", 0).await;
    let pending = queue
        .enqueue("pending", "key", "hash", "keep pending")
        .await
        .unwrap();
    queue
        .enqueue("processing", "key", "hash", "keep processing")
        .await
        .unwrap();
    let processing = queue.claim("processing", 60, 3).await.unwrap().unwrap();
    queue
        .checkpoint(&processing, "test-step", "keep checkpoint")
        .await
        .unwrap();
    queue
        .enqueue("failed", "key", "hash", "keep failed")
        .await
        .unwrap();
    let failed = queue.claim("failed", 60, 3).await.unwrap().unwrap();
    queue
        .checkpoint(&failed, "test-step", "keep checkpoint")
        .await
        .unwrap();
    assert!(queue
        .fail(&failed, "operator investigation", true, 3)
        .await
        .unwrap());
    sqlx::query("UPDATE rocksky_durable_jobs SET updated_at=1 WHERE status <> 'completed'")
        .execute(&queue.pool)
        .await
        .unwrap();

    let disabled = queue
        .cleanup(CleanupSettings {
            enabled: false,
            ..settings
        })
        .await
        .unwrap();
    assert_eq!(disabled.compacted + disabled.deleted, 0);
    assert_eq!(queue.get(&old.id).await.unwrap().unwrap().payload, payload);
    // A failure after deleting checkpoints must roll back the entire pass.
    if queue.postgres {
        sqlx::query("CREATE FUNCTION reject_compaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cleanup failure'; END $$")
            .execute(&queue.pool).await.unwrap();
        sqlx::query("CREATE TRIGGER reject_compaction BEFORE UPDATE ON rocksky_durable_jobs FOR EACH ROW WHEN (NEW.compacted_at > 0) EXECUTE FUNCTION reject_compaction()")
            .execute(&queue.pool).await.unwrap();
    } else {
        sqlx::query("CREATE TRIGGER reject_compaction BEFORE UPDATE OF compacted_at ON rocksky_durable_jobs WHEN NEW.compacted_at > 0 BEGIN SELECT RAISE(ABORT, 'test cleanup failure'); END")
            .execute(&queue.pool).await.unwrap();
    }
    assert!(queue.cleanup(settings).await.is_err());
    assert_eq!(queue.get(&old.id).await.unwrap().unwrap().payload, payload);
    assert_eq!(
        queue.step(&old, "test-step").await.unwrap().as_deref(),
        Some("confirmed")
    );
    sqlx::query(if queue.postgres {
        "DROP TRIGGER reject_compaction ON rocksky_durable_jobs"
    } else {
        "DROP TRIGGER reject_compaction"
    })
    .execute(&queue.pool)
    .await
    .unwrap();
    if queue.postgres {
        sqlx::query("DROP FUNCTION reject_compaction()")
            .execute(&queue.pool)
            .await
            .unwrap();
    }
    let first = queue.cleanup(settings).await.unwrap();
    assert_eq!(first.compacted, 1);
    assert_eq!(first.deleted, 0);
    let compact = queue.get(&old.id).await.unwrap().unwrap();
    assert!(compact.compacted_at > 0);
    assert_eq!(
        compact.updated_at, old.updated_at,
        "retention is measured from completion"
    );
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&compact.payload).unwrap(),
        serde_json::json!({"recordKey":"3mv234567abcd","timestamp":1234})
    );
    assert!(queue.step(&old, "test-step").await.unwrap().is_none());
    assert!(!queue.retry(&old.id).await.unwrap());
    assert!(!queue.finish(&old).await.unwrap());
    assert!(queue.checkpoint(&old, "stale", "stale").await.is_err());

    // Independent cleaners and producers can race without resurrecting jobs.
    let (a, b, duplicate, ingested) = tokio::join!(
        queue.cleanup(settings),
        queue.cleanup(settings),
        queue.enqueue(KIND, "old", "hash", "new generated record key"),
        queue.ingest(
            "jetstream.commit.v1",
            "test-source",
            100,
            "event",
            "replayed event"
        ),
    );
    assert_eq!(a.unwrap().compacted + b.unwrap().compacted, 2);
    assert_eq!(duplicate.unwrap().status, "completed");
    ingested.unwrap();
    assert_eq!(
        queue.get(&event.id).await.unwrap().unwrap().status,
        "completed"
    );
    assert!(queue
        .claim("jetstream.commit.v1", 60, 3)
        .await
        .unwrap()
        .is_none());
    assert_eq!(queue.cursor("test-source").await.unwrap(), Some(100));
    assert!(queue
        .enqueue(KIND, "old", "changed hash", "payload")
        .await
        .unwrap_err()
        .is::<Conflict>());
    assert_eq!(queue.cleanup(settings).await.unwrap().compacted, 0);

    assert_eq!(
        queue.get(&pending.id).await.unwrap().unwrap().payload,
        "keep pending"
    );
    assert_eq!(
        queue.get(&processing.id).await.unwrap().unwrap().payload,
        "keep processing"
    );
    assert_eq!(
        queue
            .step(&processing, "test-step")
            .await
            .unwrap()
            .as_deref(),
        Some("keep checkpoint")
    );
    assert_eq!(
        queue.get(&failed.id).await.unwrap().unwrap().last_error,
        "operator investigation"
    );
    assert_eq!(
        queue.step(&failed, "test-step").await.unwrap().as_deref(),
        Some("keep checkpoint")
    );
    assert_eq!(
        queue.get(&fresh.id).await.unwrap().unwrap().payload,
        "fresh payload"
    );

    for id in [&old.id, &event.id, &other.id] {
        sqlx::query("UPDATE rocksky_durable_jobs SET updated_at=1 WHERE id=$1")
            .bind(id)
            .execute(&queue.pool)
            .await
            .unwrap();
    }
    assert_eq!(
        queue
            .cleanup(CleanupSettings {
                dedup_retention_seconds: 0,
                ..settings
            })
            .await
            .unwrap()
            .deleted,
        0
    );
    for remaining in (0..3).rev() {
        assert_eq!(queue.cleanup(settings).await.unwrap().deleted, 1);
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM rocksky_durable_jobs WHERE compacted_at>0")
                .fetch_one(&queue.pool)
                .await
                .unwrap();
        assert_eq!(count, remaining);
    }
    assert!(queue.get(&old.id).await.unwrap().is_none());
    assert_eq!(queue.cursor("test-source").await.unwrap(), Some(100));
    let replay = queue
        .enqueue(KIND, "old", "hash", "new identity after expiry")
        .await
        .unwrap();
    assert_eq!(replay.status, "pending");
    assert_eq!(replay.compacted_at, 0);
    assert_eq!(replay.payload, "new identity after expiry");
    assert!(queue.retry(&failed.id).await.unwrap());
    assert_eq!(
        queue.get(&failed.id).await.unwrap().unwrap().payload,
        "keep failed"
    );
    // More than one row exercises batched parameter numbering and limits.
    for n in 0..3 {
        completed(&queue, "bulk", &format!("bulk-{n}"), "bulk payload", 20).await;
    }
    let bulk = CleanupSettings {
        batch_size: 2,
        ..settings
    };
    assert_eq!(queue.cleanup(bulk).await.unwrap().compacted, 2);
    assert_eq!(queue.cleanup(bulk).await.unwrap().compacted, 1);
    sqlx::query("UPDATE rocksky_durable_jobs SET updated_at=1 WHERE kind='bulk'")
        .execute(&queue.pool)
        .await
        .unwrap();
    assert_eq!(queue.cleanup(bulk).await.unwrap().deleted, 2);
    assert_eq!(queue.cleanup(bulk).await.unwrap().deleted, 1);
}

async fn upgrade(url: &str) -> Queue {
    let queue = Queue::connect(url).await.unwrap();
    let job = queue
        .enqueue("legacy", "key", "hash", "preserve legacy payload")
        .await
        .unwrap();
    // Reproduce the exact pre-retention table shape with existing data.
    for statement in [
        "DROP INDEX rocksky_durable_jobs_compact",
        "DROP INDEX rocksky_durable_jobs_retire",
        "ALTER TABLE rocksky_durable_jobs DROP COLUMN compacted_at",
    ] {
        sqlx::query(statement).execute(&queue.pool).await.unwrap();
    }
    queue.pool.close().await;
    let migrated = Queue::connect(url).await.unwrap();
    let restored = migrated.get(&job.id).await.unwrap().unwrap();
    assert_eq!(restored.payload, "preserve legacy payload");
    assert_eq!(restored.compacted_at, 0);
    // Repeated startup is safe, too.
    let second = Queue::connect(url).await.unwrap();
    second.pool.close().await;
    migrated
}

#[cfg(feature = "sqlite")]
#[tokio::test]
async fn sqlite_cleanup_and_upgrade_contract() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!(
        "sqlite://{}?mode=rwc",
        dir.path().join("cleanup.sqlite").display()
    );
    contract(upgrade(&url).await).await;
}

#[cfg(feature = "postgres")]
#[tokio::test]
#[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL pointing to a disposable Postgres database"]
async fn postgres_cleanup_and_upgrade_contract() {
    let url = std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").unwrap();
    let admin = Queue::connect(&url).await.unwrap();
    let schema = format!("cleanup_test_{}", Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE SCHEMA {schema}"))
        .execute(&admin.pool)
        .await
        .unwrap();
    let mut scoped = reqwest::Url::parse(&url).unwrap();
    scoped
        .query_pairs_mut()
        .append_pair("options", &format!("-csearch_path={schema}"));
    let queue = upgrade(scoped.as_str()).await;
    let pool = queue.pool.clone();
    contract(queue).await;
    pool.close().await;
    sqlx::query(&format!("DROP SCHEMA {schema} CASCADE"))
        .execute(&admin.pool)
        .await
        .unwrap();
}
