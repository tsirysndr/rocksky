use crate::{queue::ClaimLane, Job, Queue};
use futures_util::FutureExt;
use std::{future::Future, panic::AssertUnwindSafe, time::Duration};
use tokio_util::sync::CancellationToken;

#[derive(Debug)]
pub struct Failure {
    pub message: String,
    pub permanent: bool,
}

impl From<anyhow::Error> for Failure {
    fn from(error: anyhow::Error) -> Self {
        // An unhandled uniqueness conflict will not be repaired by retrying the
        // same payload. Inspect typed causes, including errors wrapped in context;
        // connectivity, deadlocks, serialization and foreign-key errors still retry.
        let permanent = error.chain().any(|cause| {
            cause
                .downcast_ref::<sqlx::Error>()
                .and_then(sqlx::Error::as_database_error)
                .is_some_and(|error| error.is_unique_violation())
        });
        Self {
            message: error.to_string(),
            permanent,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Settings {
    pub lease_seconds: i64,
    pub max_attempts: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            lease_seconds: 120,
            max_attempts: 20,
        }
    }
}

/// One dispatcher per queue kind and process. Empty-queue polling does not
/// multiply with execution concurrency. Shutdown drains jobs with heartbeats;
/// forced termination recovers through lease expiry.
pub async fn run<F, Fut>(
    queue: Queue,
    kind: &str,
    concurrency: usize,
    settings: Settings,
    shutdown: CancellationToken,
    process: F,
) where
    F: Fn(Job) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<(), Failure>> + Send + 'static,
{
    run_lane(
        queue,
        kind,
        ClaimLane::All,
        concurrency,
        settings,
        shutdown,
        process,
    )
    .await;
}

/// A dedicated lane cannot be occupied by another collection's backlog.
pub async fn run_lane<F, Fut>(
    queue: Queue,
    kind: &str,
    lane: ClaimLane,
    concurrency: usize,
    settings: Settings,
    shutdown: CancellationToken,
    process: F,
) where
    F: Fn(Job) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<(), Failure>> + Send + 'static,
{
    run_dispatcher(
        queue,
        kind,
        lane,
        concurrency,
        None,
        settings,
        shutdown,
        process,
    )
    .await;
}

/// Fair capacity is enforced by live leases in the database, across replicas.
pub async fn run_fair_lane<F, Fut>(
    queue: Queue,
    kind: &str,
    lane: ClaimLane,
    concurrency: usize,
    per_actor: i64,
    borrow_idle: bool,
    settings: Settings,
    shutdown: CancellationToken,
    process: F,
) where
    F: Fn(Job) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<(), Failure>> + Send + 'static,
{
    run_dispatcher(
        queue,
        kind,
        lane,
        concurrency,
        Some((per_actor, borrow_idle)),
        settings,
        shutdown,
        process,
    )
    .await;
}

async fn run_dispatcher<F, Fut>(
    queue: Queue,
    kind: &str,
    lane: ClaimLane,
    concurrency: usize,
    per_actor: Option<(i64, bool)>,
    settings: Settings,
    shutdown: CancellationToken,
    process: F,
) where
    F: Fn(Job) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Result<(), Failure>> + Send + 'static,
{
    assert!(concurrency > 0 && settings.lease_seconds >= 3 && settings.max_attempts > 0);
    let mut active = tokio::task::JoinSet::new();
    while !shutdown.is_cancelled() {
        while active.try_join_next().is_some() {}
        if active.len() >= concurrency {
            tokio::select! {
                _ = shutdown.cancelled() => break,
                _ = active.join_next() => {}
            }
            continue;
        }
        let limit = (concurrency - active.len()).min(32) as i64;
        let mut result = match per_actor {
            Some((cap, _)) => {
                queue
                    .claim_fair_batch(
                        kind,
                        settings.lease_seconds,
                        settings.max_attempts,
                        limit,
                        lane,
                        cap,
                    )
                    .await
            }
            None => {
                queue
                    .claim_batch_in_lane(
                        kind,
                        settings.lease_seconds,
                        settings.max_attempts,
                        limit,
                        lane,
                    )
                    .await
            }
        };
        if let (Some((cap, true)), Ok(jobs)) = (per_actor, &mut result) {
            // Count this turn's leases before borrowing. A partially filled fair
            // claim must also borrow: fast jobs may otherwise keep every normal
            // claim nonempty and prevent the dispatcher ever reaching burst mode.
            let burst_capacity = concurrency.saturating_sub(cap as usize);
            let free = borrow_limit(
                concurrency,
                active.len(),
                jobs.len(),
                cap as usize,
                limit as usize,
            );
            if free > 0 {
                match queue
                    .claim_fair_batch(
                        kind,
                        settings.lease_seconds,
                        settings.max_attempts,
                        free as i64,
                        lane,
                        burst_capacity.min(256) as i64,
                    )
                    .await
                {
                    Ok(borrowed) => jobs.extend(borrowed),
                    // Normal claims already own durable leases. Never discard
                    // those jobs if the optional capacity top-up fails.
                    Err(error) => {
                        tracing::warn!(%error, kind, "durable idle-capacity claim failed")
                    }
                }
            }
        }
        match result {
            Ok(jobs) if !jobs.is_empty() => {
                for job in jobs {
                    let (queue, process) = (queue.clone(), process.clone());
                    active.spawn(async move {
                        execute(queue, job, settings, process).await;
                    });
                }
            }
            result => {
                let delay = if let Err(error) = result {
                    tracing::error!(%error, kind, "durable job claim failed");
                    Duration::from_secs(2)
                } else {
                    Duration::from_millis(500)
                };
                tokio::select! {
                    _ = shutdown.cancelled() => break,
                    _ = queue.notified() => {},
                    _ = active.join_next(), if !active.is_empty() => {},
                    _ = tokio::time::sleep(delay) => {}
                }
            }
        }
    }
    while active.join_next().await.is_some() {}
}

/// Leave a normal DID allocation free, and bound the combined normal and
/// borrowed claims to the dispatcher's batch limit.
fn borrow_limit(
    concurrency: usize,
    active: usize,
    claimed: usize,
    cap: usize,
    limit: usize,
) -> usize {
    let burst = concurrency.saturating_sub(cap);
    if burst <= cap {
        return 0;
    }
    burst
        .saturating_sub(active + claimed)
        .min(limit.saturating_sub(claimed))
}

async fn execute<F, Fut>(queue: Queue, job: Job, settings: Settings, process: F)
where
    F: Fn(Job) -> Fut,
    Fut: Future<Output = Result<(), Failure>>,
{
    let processing_job = job.clone();
    let work = AssertUnwindSafe(async move { process(processing_job).await }).catch_unwind();
    tokio::pin!(work);
    let mut heartbeat =
        tokio::time::interval(Duration::from_secs((settings.lease_seconds / 3) as u64));
    heartbeat.tick().await;
    loop {
        tokio::select! {
            result = &mut work => {
                let result = match result {
                    Ok(result) => result,
                    Err(_) => Err(Failure { message: "processor panicked".into(), permanent: false }),
                };
                let saved = match result {
                    Ok(()) => queue.finish(&job).await,
                    Err(error) => {
                        tracing::warn!(job_id=%job.id, attempt=job.attempts, error=%error.message, "durable job failed");
                        queue.fail(&job, &error.message, error.permanent, settings.max_attempts).await
                    }
                };
                if !matches!(saved, Ok(true)) {
                    tracing::warn!(job_id=%job.id, "could not finalize job; lease recovery will retry it");
                }
                break;
            }
            _ = heartbeat.tick() => {
                if !matches!(queue.renew(&job, settings.lease_seconds).await, Ok(true)) {
                    // Dropping the local future cannot undo a remote write.
                    // Stable side-effect IDs are required even with fencing.
                    tracing::warn!(job_id=%job.id, "lost lease; cancelling local processing");
                    break;
                }
            }
        }
    }
}

#[cfg(all(test, feature = "sqlite"))]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    #[test]
    fn partial_fair_claims_borrow_only_unreserved_capacity() {
        // Production background lane: four normal claims must immediately
        // borrow another 24, without waiting for a completely empty claim.
        assert_eq!(borrow_limit(32, 0, 4, 4, 32), 24);
        assert_eq!(borrow_limit(32, 3, 1, 4, 29), 24);
        assert_eq!(borrow_limit(32, 24, 4, 4, 8), 0);
        assert_eq!(borrow_limit(96, 0, 4, 4, 32), 28);
        assert_eq!(borrow_limit(96, 0, 32, 4, 32), 0);
        assert_eq!(borrow_limit(8, 0, 0, 2, 8), 6);
        assert_eq!(borrow_limit(4, 0, 1, 4, 4), 0);
        assert_eq!(borrow_limit(8, 0, 2, 4, 8), 0);
    }

    #[tokio::test]
    async fn bulk_actor_borrows_idle_capacity_but_leaves_room_for_quiet_accounts() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::connect(&format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("borrow.sqlite").display()
        ))
        .await
        .unwrap();
        for n in 0..30 {
            queue
                .enqueue("borrow", &format!("bulk-{n}"), "hash", r#"{"did":"bulk"}"#)
                .await
                .unwrap();
        }
        let stop = CancellationToken::new();
        let gate = Arc::new(tokio::sync::Semaphore::new(0));
        let (started, mut received) = tokio::sync::mpsc::unbounded_channel();
        let processor_gate = gate.clone();
        let worker = tokio::spawn(run_fair_lane(
            queue.clone(),
            "borrow",
            ClaimLane::Background,
            8,
            2,
            true,
            Settings::default(),
            stop.clone(),
            move |job| {
                let (gate, started) = (processor_gate.clone(), started.clone());
                async move {
                    started.send(crate::queue::job_actor(&job.payload)).unwrap();
                    gate.acquire().await.unwrap().forget();
                    Ok(())
                }
            },
        ));
        for _ in 0..6 {
            assert_eq!(
                tokio::time::timeout(Duration::from_secs(3), received.recv())
                    .await
                    .unwrap()
                    .unwrap(),
                "bulk"
            );
        }
        assert!(
            tokio::time::timeout(Duration::from_millis(100), received.recv())
                .await
                .is_err(),
            "bulk must leave two slots free"
        );
        for n in 0..2 {
            queue
                .enqueue(
                    "borrow",
                    &format!("quiet-{n}"),
                    "hash",
                    r#"{"did":"quiet"}"#,
                )
                .await
                .unwrap();
        }
        for _ in 0..2 {
            assert_eq!(
                tokio::time::timeout(Duration::from_secs(3), received.recv())
                    .await
                    .unwrap()
                    .unwrap(),
                "quiet"
            );
        }
        stop.cancel();
        gate.add_permits(8);
        tokio::time::timeout(Duration::from_secs(3), worker)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn unique_conflicts_fail_on_first_attempt_and_keep_job_data() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::connect(&format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("unique.sqlite").display()
        ))
        .await
        .unwrap();
        let job = queue
            .enqueue("unique.v1", "key", "hash", "original")
            .await
            .unwrap();
        let stop = CancellationToken::new();
        let processor_queue = queue.clone();
        let processor_stop = stop.clone();
        let worker = tokio::spawn(run(
            queue.clone(),
            "unique.v1",
            1,
            Settings::default(),
            stop.clone(),
            move |job| {
                let queue = processor_queue.clone();
                let done = processor_stop.clone();
                async move {
                    let error = sqlx::query("INSERT INTO rocksky_durable_jobs (id,kind,request_hash,payload,status,available_at,created_at,updated_at) SELECT id,kind,request_hash,payload,status,available_at,created_at,updated_at FROM rocksky_durable_jobs WHERE id=$1")
                    .bind(&job.id).execute(&queue.pool).await.unwrap_err();
                    let failure =
                        Failure::from(anyhow::Error::new(error).context("catalog insert failed"));
                    assert!(failure.permanent);
                    done.cancel();
                    Err(failure)
                }
            },
        ));
        tokio::time::timeout(Duration::from_secs(5), worker)
            .await
            .unwrap()
            .unwrap();
        let failed = queue.get(&job.id).await.unwrap().unwrap();
        assert_eq!(failed.status, "failed");
        assert_eq!(failed.attempts, 1);
        assert_eq!(failed.payload, "original");
        assert_eq!(failed.last_error, "catalog insert failed");
        assert!(queue.claim("unique.v1", 60, 20).await.unwrap().is_none());
        assert!(queue.retry(&job.id).await.unwrap());
        assert_eq!(queue.get(&job.id).await.unwrap().unwrap().status, "pending");
    }

    #[cfg(feature = "postgres")]
    #[tokio::test]
    #[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL"]
    async fn postgres_unique_errors_are_permanent_but_other_database_errors_retry() {
        use sqlx::Connection;
        let mut connection =
            sqlx::PgConnection::connect(&std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").unwrap())
                .await
                .unwrap();
        sqlx::query("CREATE TEMP TABLE failure_classification (id BIGINT PRIMARY KEY, parent BIGINT REFERENCES failure_classification(id))").execute(&mut connection).await.unwrap();
        sqlx::query("INSERT INTO failure_classification(id) VALUES (1)")
            .execute(&mut connection)
            .await
            .unwrap();
        for (statement, permanent) in [
            ("INSERT INTO failure_classification(id) VALUES (1)", true),
            ("INSERT INTO failure_classification VALUES (2,999)", false),
            ("SELECT 1/0", false),
        ] {
            let error = sqlx::query(statement)
                .execute(&mut connection)
                .await
                .unwrap_err();
            let failure = Failure::from(anyhow::Error::new(error).context("catalog operation"));
            assert_eq!(failure.permanent, permanent, "{statement}");
        }
    }

    #[test]
    fn transient_errors_and_untyped_messages_still_retry() {
        assert!(!Failure::from(anyhow::Error::new(sqlx::Error::PoolTimedOut)).permanent);
        assert!(
            !Failure::from(anyhow::anyhow!(
                "duplicate key value violates unique constraint"
            ))
            .permanent
        );
        assert!(!Failure::from(anyhow::anyhow!("upstream HTTP 503")).permanent);
    }

    #[tokio::test]
    async fn retries_failed_processors_without_losing_the_job() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("retry.sqlite").display()
        );
        let queue = Queue::connect(&url).await.unwrap();
        let job = queue
            .enqueue("retry.v1", "key", "hash", "original")
            .await
            .unwrap();
        let stop = CancellationToken::new();
        let done = stop.clone();
        let worker = tokio::spawn(run(
            queue.clone(),
            "retry.v1",
            1,
            Settings::default(),
            stop.clone(),
            move |job| {
                let done = done.clone();
                async move {
                    assert_eq!(job.payload, "original");
                    if job.attempts == 1 {
                        return Err(Failure {
                            message: "temporary failure".into(),
                            permanent: false,
                        });
                    }
                    done.cancel();
                    Ok(())
                }
            },
        ));
        tokio::time::timeout(Duration::from_secs(8), worker)
            .await
            .unwrap()
            .unwrap();
        let result = queue.get(&job.id).await.unwrap().unwrap();
        assert_eq!(result.status, "completed");
        assert_eq!(result.attempts, 2);
    }

    #[tokio::test]
    async fn scrobble_lane_runs_while_background_capacity_is_busy() {
        let dir = tempfile::tempdir().unwrap();
        let queue = Queue::connect(&format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("priority.sqlite").display()
        ))
        .await
        .unwrap();
        let kind = "jetstream.commit.v1";
        queue
            .enqueue(
                kind,
                "album",
                "hash",
                r#"{"commit":{"collection":"app.rocksky.album"}}"#,
            )
            .await
            .unwrap();
        let stop = CancellationToken::new();
        let entered = std::sync::Arc::new(tokio::sync::Notify::new());
        let release = CancellationToken::new();
        let (entered_worker, release_worker) = (entered.clone(), release.clone());
        let background = tokio::spawn(run_lane(
            queue.clone(),
            kind,
            ClaimLane::Background,
            1,
            Settings::default(),
            stop.clone(),
            move |_| {
                let (entered, release) = (entered_worker.clone(), release_worker.clone());
                async move {
                    entered.notify_one();
                    release.cancelled().await;
                    Ok(())
                }
            },
        ));
        tokio::time::timeout(Duration::from_secs(3), entered.notified())
            .await
            .unwrap();
        let scrobble = queue
            .enqueue(
                kind,
                "scrobble",
                "hash",
                r#"{"commit":{"collection":"app.rocksky.scrobble"}}"#,
            )
            .await
            .unwrap();
        let priority = tokio::spawn(run_lane(
            queue.clone(),
            kind,
            ClaimLane::Scrobbles,
            1,
            Settings::default(),
            stop.clone(),
            |_| async { Ok(()) },
        ));
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if queue.get(&scrobble.id).await.unwrap().unwrap().status == "completed" {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert!(
            !background.is_finished(),
            "scrobble did not wait for the busy background lane"
        );
        stop.cancel();
        release.cancel();
        background.await.unwrap();
        priority.await.unwrap();
    }

    #[tokio::test]
    async fn bounds_concurrency_renews_leases_and_drains_on_shutdown() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("worker.sqlite").display()
        );
        let queue = Queue::connect(&url).await.unwrap();
        let mut ids = vec![];
        for n in 0..4 {
            ids.push(
                queue
                    .enqueue("work.v1", &n.to_string(), "hash", "payload")
                    .await
                    .unwrap()
                    .id,
            );
        }
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let stop = CancellationToken::new();
        let (a, p, q) = (active.clone(), peak.clone(), queue.clone());
        let handle = tokio::spawn(run(
            queue.clone(),
            "work.v1",
            2,
            Settings {
                lease_seconds: 3,
                max_attempts: 3,
            },
            stop.clone(),
            move |job| {
                let (a, p, q) = (a.clone(), p.clone(), q.clone());
                async move {
                    let current = a.fetch_add(1, Ordering::SeqCst) + 1;
                    p.fetch_max(current, Ordering::SeqCst);
                    // Longer than the lease: completion needs successful renewal.
                    tokio::time::sleep(Duration::from_secs(4)).await;
                    q.checkpoint(&job, "done.v1", "{}").await?;
                    a.fetch_sub(1, Ordering::SeqCst);
                    Ok(())
                }
            },
        ));
        tokio::time::timeout(Duration::from_secs(3), async {
            while active.load(Ordering::SeqCst) != 2 {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        stop.cancel();
        tokio::time::timeout(Duration::from_secs(6), handle)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(peak.load(Ordering::SeqCst), 2);
        assert_eq!(active.load(Ordering::SeqCst), 0);
        let mut completed = 0;
        for id in ids {
            let job = queue.get(&id).await.unwrap().unwrap();
            if job.status == "completed" {
                completed += 1;
                assert_eq!(job.attempts, 1);
            }
        }
        assert_eq!(completed, 2);
    }
}
