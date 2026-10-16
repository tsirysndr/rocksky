use super::*;

async fn contract(queue: Queue) {
    priority_contract(&queue).await;
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

async fn priority_contract(queue: &Queue) {
    let kind = format!("priority-{}", Uuid::new_v4().simple());
    for n in 0..48 {
        queue
            .enqueue(&kind, &format!("album-{n}"), "hash", "{}")
            .await
            .unwrap();
    }
    sqlx::query("UPDATE rocksky_durable_jobs SET available_at=available_at-100, created_at=created_at-100 WHERE kind=$1")
        .bind(&kind).execute(&queue.pool).await.unwrap();
    let mut scrobbles = std::collections::HashSet::new();
    for n in 0..8 {
        let job = queue
            .enqueue(&kind, &format!("scrobble-{n}"), "hash", "{}")
            .await
            .unwrap();
        sqlx::query(
            "UPDATE rocksky_durable_jobs SET collection='app.rocksky.scrobble' WHERE id=$1",
        )
        .bind(&job.id)
        .execute(&queue.pool)
        .await
        .unwrap();
        scrobbles.insert(job.id);
    }
    let delayed = queue
        .enqueue_after(&kind, "delayed", "hash", "{}", 600)
        .await
        .unwrap();
    sqlx::query("UPDATE rocksky_durable_jobs SET collection='app.rocksky.scrobble' WHERE id=$1")
        .bind(&delayed.id)
        .execute(&queue.pool)
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        queue.claim_batch_in_lane(&kind, 60, 3, 4, ClaimLane::Scrobbles),
        queue.claim_batch_in_lane(&kind, 60, 3, 4, ClaimLane::Scrobbles)
    );
    let claimed = [a.unwrap(), b.unwrap()].concat();
    assert_eq!(claimed.len(), 8);
    assert_eq!(
        claimed
            .iter()
            .map(|j| j.id.clone())
            .collect::<std::collections::HashSet<_>>(),
        scrobbles,
        "new scrobbles bypass the older metadata backlog without double leasing"
    );
    assert!(
        queue
            .claim_batch_in_lane(&kind, 60, 3, 4, ClaimLane::Scrobbles)
            .await
            .unwrap()
            .is_empty(),
        "future retries must not be claimed early"
    );
    let background = queue
        .claim_batch_in_lane(&kind, 60, 3, 4, ClaimLane::Background)
        .await
        .unwrap();
    assert_eq!(
        background.len(),
        4,
        "metadata must retain its own processing capacity"
    );
    assert!(background.iter().all(|job| !scrobbles.contains(&job.id)));
    // Expired priority leases recover within their lane; final attempts fail.
    sqlx::query("UPDATE rocksky_durable_jobs SET lease_until=0 WHERE id=$1")
        .bind(&claimed[0].id)
        .execute(&queue.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE rocksky_durable_jobs SET lease_until=0,attempts=3 WHERE id=$1")
        .bind(&claimed[1].id)
        .execute(&queue.pool)
        .await
        .unwrap();
    let recovered = queue
        .claim_batch_in_lane(&kind, 60, 3, 4, ClaimLane::Scrobbles)
        .await
        .unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(recovered[0].id, claimed[0].id);
    assert_eq!(recovered[0].attempts, 2);
    assert_eq!(
        queue.get(&claimed[1].id).await.unwrap().unwrap().status,
        "failed"
    );
    sqlx::query("DELETE FROM rocksky_durable_jobs WHERE kind=$1")
        .bind(&kind)
        .execute(&queue.pool)
        .await
        .unwrap();
}
