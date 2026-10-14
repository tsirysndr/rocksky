use super::*;

async fn contract(queue: Queue) {
    let kind = format!("batch-{}", Uuid::new_v4().simple());
    let mut events = Vec::new();
    for n in 0..64 {
        for source in 0..4 {
            events.push(InboxEvent {
                source: format!("{kind}-{source}"),
                cursor: n + 1,
                key: format!("event-{n}"),
                payload: format!("payload-{n}"),
            });
        }
    }
    queue.ingest_batch(&kind, &events).await.unwrap();
    queue.ingest_batch(&kind, &events).await.unwrap();
    for source in 0..4 {
        assert_eq!(
            queue.cursor(&format!("{kind}-{source}")).await.unwrap(),
            Some(64)
        );
    }
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rocksky_durable_jobs WHERE kind=$1")
        .bind(&kind)
        .fetch_one(&queue.pool)
        .await
        .unwrap();
    assert_eq!(count, 64, "four sources and replay must deduplicate");
    let (a, b, c) = tokio::join!(
        queue.claim_batch(&kind, 60, 3, 32),
        queue.claim_batch(&kind, 60, 3, 32),
        queue.claim_batch(&kind, 60, 3, 32)
    );
    let jobs = [a.unwrap(), b.unwrap(), c.unwrap()].concat();
    let ids: std::collections::HashSet<_> = jobs.iter().map(|j| &j.id).collect();
    assert_eq!(jobs.len(), 64);
    assert_eq!(
        ids.len(),
        64,
        "competing consumers must never share a live lease"
    );
    assert!(queue
        .claim_batch(&kind, 60, 3, 32)
        .await
        .unwrap()
        .is_empty());
    assert!(queue.claim_batch(&kind, 60, 3, 0).await.is_err());

    // Failure writing a cursor rolls back the jobs from the same batch.
    let bad_source = format!("{kind}-reject");
    let trigger = format!("reject_{}", Uuid::new_v4().simple());
    if queue.postgres {
        sqlx::query(&format!("CREATE FUNCTION {trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cursor failure'; END $$")).execute(&queue.pool).await.unwrap();
        sqlx::query(&format!("CREATE TRIGGER {trigger} BEFORE INSERT ON rocksky_durable_cursors FOR EACH ROW WHEN (NEW.source='{bad_source}') EXECUTE FUNCTION {trigger}()"))
            .execute(&queue.pool).await.unwrap();
    } else {
        sqlx::query(&format!("CREATE TRIGGER {trigger} BEFORE INSERT ON rocksky_durable_cursors WHEN NEW.source='{bad_source}' BEGIN SELECT RAISE(ABORT, 'injected cursor failure'); END"))
            .execute(&queue.pool).await.unwrap();
    }
    let batch = vec![
        InboxEvent {
            source: format!("{kind}-0"),
            cursor: 999,
            key: "rollback-a".into(),
            payload: "rollback".into(),
        },
        InboxEvent {
            source: bad_source.clone(),
            cursor: 999,
            key: "rollback-b".into(),
            payload: "rollback".into(),
        },
    ];
    assert!(queue.ingest_batch(&kind, &batch).await.is_err());
    assert_eq!(queue.cursor(&format!("{kind}-0")).await.unwrap(), Some(64));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rocksky_durable_jobs WHERE kind=$1")
        .bind(&kind)
        .fetch_one(&queue.pool)
        .await
        .unwrap();
    assert_eq!(count, 64, "failed atomic statement must not leak jobs");
    sqlx::query(&if queue.postgres {
        format!("DROP TRIGGER {trigger} ON rocksky_durable_cursors")
    } else {
        format!("DROP TRIGGER {trigger}")
    })
    .execute(&queue.pool)
    .await
    .unwrap();
    if queue.postgres {
        sqlx::query(&format!("DROP FUNCTION {trigger}()"))
            .execute(&queue.pool)
            .await
            .unwrap();
    }
    sqlx::query("DELETE FROM rocksky_durable_jobs WHERE kind=$1")
        .bind(&kind)
        .execute(&queue.pool)
        .await
        .unwrap();
    for source in 0..4 {
        sqlx::query("DELETE FROM rocksky_durable_cursors WHERE source=$1")
            .bind(format!("{kind}-{source}"))
            .execute(&queue.pool)
            .await
            .unwrap();
    }
}

#[cfg(feature = "sqlite")]
#[tokio::test]
async fn sqlite_batch_contract() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!(
        "sqlite://{}?mode=rwc",
        dir.path().join("batch.sqlite").display()
    );
    contract(Queue::connect(&url).await.unwrap()).await;
}

#[cfg(feature = "postgres")]
#[tokio::test]
#[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL"]
async fn postgres_batch_contract() {
    contract(
        Queue::connect(&std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").unwrap())
            .await
            .unwrap(),
    )
    .await;
}
