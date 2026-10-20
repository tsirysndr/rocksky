//! Isolated PostgreSQL queue benchmark. No API, PDS, or catalog work.
//! cargo run --release -p rocksky-submissions --example queue_bench -- \
//!   postgres://queuebench@127.0.0.1:55439/rocksky_queue_bench 5000 2
//! Destructively resets queue tables between cases; refuses other database names.
use anyhow::{ensure, Context, Result};
use rocksky_submissions::{queue::ClaimLane, worker, Job, Queue};
use sqlx::postgres::PgPoolOptions;
use std::{
    sync::atomic::{AtomicUsize, Ordering},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .init();
    let args: Vec<String> = std::env::args().collect();
    let url = args
        .get(1)
        .context("expected isolated local PostgreSQL URL")?;
    let count: usize = args.get(2).map(|s| s.parse()).transpose()?.unwrap_or(5000);
    let repeats: usize = args.get(3).map(|s| s.parse()).transpose()?.unwrap_or(2);
    ensure!(
        count > 0 && repeats > 0,
        "count and repeats must be positive"
    );
    let options: sqlx::postgres::PgConnectOptions = url.parse()?;
    ensure!(
        matches!(options.get_host(), "localhost" | "127.0.0.1" | "::1")
            && options.get_database() == Some("rocksky_queue_bench"),
        "requires localhost database named rocksky_queue_bench; queue tables will be reset"
    );
    let queue = Queue::connect(url).await?;
    let monitor = PgPoolOptions::new().max_connections(1).connect(url).await?;
    let settings: (String, String, String, String) = sqlx::query_as(
        "SELECT current_setting('server_version'), current_setting('fsync'), current_setting('synchronous_commit'), current_setting('full_page_writes')"
    ).fetch_one(&monitor).await?;
    println!("postgres={} fsync={} synchronous_commit={} full_page_writes={} queue_pool=10 producers=32 actors=64 payload=~256B", settings.0, settings.1, settings.2, settings.3);
    println!("trial,mode,workers,jobs,enqueue_seconds,enqueue_per_sec,drain_seconds,completed_per_sec,total_per_sec,failed,retried");
    // Warm up code paths and connections before measured cases.
    let cases = std::iter::once((0, "noop", 8, 500)).chain((1..=repeats).flat_map(|trial| {
        ["noop", "checkpoint", "fair_checkpoint"]
            .into_iter()
            .flat_map(move |mode| {
                [8, 32, 128]
                    .into_iter()
                    .map(move |workers| (trial, mode, workers, count))
            })
    }));
    for (trial, mode, concurrency, n) in cases {
        sqlx::query("TRUNCATE rocksky_durable_steps, rocksky_durable_jobs, rocksky_durable_actors, rocksky_durable_cursors")
            .execute(&monitor).await?;
        let kind = "jetstream.commit.v1";
        let enqueue_start = Instant::now();
        let mut producers = tokio::task::JoinSet::new();
        for producer in 0..32 {
            let q = queue.clone();
            producers.spawn(async move {
                for i in (producer..n).step_by(32) {
                    let payload = serde_json::json!({"did": format!("did:bench:{}", i % 64),
                        "commit": {"collection": "app.rocksky.scrobble"}, "padding": "x".repeat(160)}).to_string();
                    q.enqueue(kind, &i.to_string(), &rocksky_submissions::queue::digest(&payload), &payload).await?;
                }
                Ok::<_, anyhow::Error>(())
            });
        }
        while let Some(result) = producers.join_next().await {
            result??;
        }
        let enqueue_seconds = enqueue_start.elapsed().as_secs_f64();
        for statement in [
            "ANALYZE rocksky_durable_jobs",
            "ANALYZE rocksky_durable_actors",
        ] {
            sqlx::query(statement).execute(&monitor).await?;
        }
        let shutdown = CancellationToken::new();
        let invoked = Arc::new(AtomicUsize::new(0));
        let process_queue = queue.clone();
        let calls = invoked.clone();
        let checkpoint = mode != "noop";
        let process = move |job: Job| {
            let (q, calls) = (process_queue.clone(), calls.clone());
            async move {
                if checkpoint && q.step(&job, "bench.v1").await?.is_none() {
                    q.checkpoint(&job, "bench.v1", "{}").await?;
                }
                calls.fetch_add(1, Ordering::Relaxed);
                Ok::<_, worker::Failure>(())
            }
        };
        let start = Instant::now();
        let runner = if mode == "fair_checkpoint" {
            tokio::spawn(worker::run_fair_lane(
                queue.clone(),
                kind,
                ClaimLane::Scrobbles,
                concurrency,
                4,
                true,
                worker::Settings::default(),
                shutdown.clone(),
                process,
            ))
        } else {
            tokio::spawn(worker::run(
                queue.clone(),
                kind,
                concurrency,
                worker::Settings::default(),
                shutdown.clone(),
                process,
            ))
        };
        let result = tokio::time::timeout(Duration::from_secs(180), async {
            // Avoid repeated full-table counts throughout the timed run. A handler
            // finishing is not a durable completion; verify committed final states.
            loop {
                if invoked.load(Ordering::Relaxed) >= n {
                    let completed: i64 = sqlx::query_scalar(
                        "SELECT count(*) FROM rocksky_durable_jobs WHERE status='completed'",
                    )
                    .fetch_one(&monitor)
                    .await?;
                    if completed == n as i64 {
                        break;
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            Ok::<_, anyhow::Error>(())
        })
        .await;
        let seconds = start.elapsed().as_secs_f64();
        shutdown.cancel();
        runner.await?;
        result.context("benchmark timed out")??;
        let (failed, retried): (i64, i64) = sqlx::query_as("SELECT count(*) FILTER (WHERE status='failed'), count(*) FILTER (WHERE attempts>1) FROM rocksky_durable_jobs")
            .fetch_one(&monitor).await?;
        ensure!(
            failed == 0 && retried == 0,
            "unexpected failures or retries"
        );
        println!("{trial},{mode},{concurrency},{n},{enqueue_seconds:.4},{:.1},{seconds:.4},{:.1},{:.1},{failed},{retried}",
            n as f64 / enqueue_seconds, n as f64 / seconds, n as f64 / (enqueue_seconds + seconds));
    }
    Ok(())
}
