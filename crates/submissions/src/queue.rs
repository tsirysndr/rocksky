use anyhow::{ensure, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{any::AnyPoolOptions, AnyPool};
use std::{str::FromStr, time::Duration};
use uuid::Uuid;

#[derive(Clone)]
pub struct Queue {
    pool: AnyPool,
    postgres: bool,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Job {
    pub id: String,
    pub kind: String,
    #[serde(skip)]
    pub request_hash: String,
    #[serde(skip)]
    pub payload: String,
    pub status: String,
    pub attempts: i64,
    pub available_at: i64,
    pub lease_until: i64,
    #[serde(skip)]
    pub lease_token: String,
    pub last_error: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug)]
pub struct Conflict;
impl std::fmt::Display for Conflict {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("idempotency key already belongs to a different submission")
    }
}
impl std::error::Error for Conflict {}

pub fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

impl Queue {
    pub async fn connect(url: &str) -> Result<Self> {
        let postgres = url.starts_with("postgres://") || url.starts_with("postgresql://");
        ensure!(
            postgres || url.starts_with("sqlite:"),
            "expected postgres:// or sqlite:// URL"
        );
        ensure!(
            !postgres || cfg!(feature = "postgres"),
            "Postgres support was not compiled in"
        );
        ensure!(
            postgres || cfg!(feature = "sqlite"),
            "SQLite support was not compiled in"
        );
        if !postgres {
            ensure!(
                !url.contains(":memory:") && !url.contains("mode=memory"),
                "a durable queue requires a file-backed SQLite database"
            );
        }
        sqlx::any::install_default_drivers();
        let options = sqlx::any::AnyConnectOptions::from_str(url)?;
        let pool = AnyPoolOptions::new()
            .max_connections(if postgres { 10 } else { 4 })
            .acquire_timeout(Duration::from_secs(10))
            .after_connect(move |connection, _| {
                Box::pin(async move {
                    if postgres {
                        sqlx::query("SET synchronous_commit = on")
                            .execute(&mut *connection)
                            .await?;
                        sqlx::query("SET statement_timeout = '10s'")
                            .execute(&mut *connection)
                            .await?;
                    } else {
                        // Set on EVERY connection; synchronous and busy_timeout are
                        // connection-local. Never acknowledge a NORMAL-mode commit.
                        for pragma in [
                            "PRAGMA busy_timeout = 5000",
                            "PRAGMA journal_mode = WAL",
                            "PRAGMA synchronous = FULL",
                            "PRAGMA foreign_keys = ON",
                        ] {
                            sqlx::query(pragma).execute(&mut *connection).await?;
                        }
                    }
                    Ok(())
                })
            })
            .connect_with(options)
            .await
            .context("connect durable queue")?;
        let queue = Self { pool, postgres };
        let mut tx = queue.pool.begin().await?;
        if postgres {
            // Serialize startup migrations across replicas.
            sqlx::query("SELECT pg_advisory_xact_lock(729411068)")
                .execute(&mut *tx)
                .await?;
        }
        for statement in include_str!("schema.sql")
            .split(';')
            .filter(|s| !s.trim().is_empty())
        {
            sqlx::query(statement).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(queue)
    }

    pub async fn from_env() -> Result<Self> {
        let url = std::env::var("SUBMISSIONS_DATABASE_URL")
            .context("SUBMISSIONS_DATABASE_URL must explicitly name the durable queue database")?;
        Self::connect(&url).await
    }

    fn now(&self) -> &'static str {
        if self.postgres {
            "CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) AS BIGINT)"
        } else {
            "CAST(strftime('%s', 'now') AS BIGINT)"
        }
    }

    /// The caller freezes generated timestamps and IDs in payload. On duplicate
    /// delivery the original payload is retained, never replaced by a retry.
    pub async fn enqueue(
        &self,
        kind: &str,
        key: &str,
        request_hash: &str,
        payload: &str,
    ) -> Result<Job> {
        let id = digest(&serde_json::to_string(&(kind, key))?);
        let now = self.now();
        let sql = format!("INSERT INTO rocksky_durable_jobs (id, kind, request_hash, payload, status, available_at, created_at, updated_at) VALUES ($1,$2,$3,$4,'pending',{now},{now},{now}) ON CONFLICT (id) DO NOTHING");
        sqlx::query(&sql)
            .bind(&id)
            .bind(kind)
            .bind(request_hash)
            .bind(payload)
            .execute(&self.pool)
            .await?;
        let job = self.get(&id).await?.context("enqueued job missing")?;
        if job.request_hash != request_hash {
            return Err(Conflict.into());
        }
        Ok(job)
    }

    pub async fn get(&self, id: &str) -> Result<Option<Job>> {
        Ok(
            sqlx::query_as("SELECT * FROM rocksky_durable_jobs WHERE id=$1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    /// Commit an upstream event and its source-specific receive cursor together.
    /// Processing may lag behind this cursor: the inbox, not RAM, owns that work.
    pub async fn ingest(
        &self,
        kind: &str,
        source: &str,
        cursor: i64,
        key: &str,
        payload: &str,
    ) -> Result<()> {
        let id = digest(&serde_json::to_string(&(kind, key))?);
        let now = self.now();
        let mut tx = self.pool.begin().await?;
        sqlx::query(&format!("INSERT INTO rocksky_durable_jobs (id, kind, request_hash, payload, status, available_at, created_at, updated_at) VALUES ($1,$2,$3,$4,'pending',{now},{now},{now}) ON CONFLICT (id) DO NOTHING"))
            .bind(id).bind(kind).bind(digest(payload)).bind(payload).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO rocksky_durable_cursors (source,cursor_value) VALUES ($1,$2) ON CONFLICT (source) DO UPDATE SET cursor_value=CASE WHEN excluded.cursor_value>rocksky_durable_cursors.cursor_value THEN excluded.cursor_value ELSE rocksky_durable_cursors.cursor_value END")
            .bind(source).bind(cursor).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn cursor(&self, source: &str) -> Result<Option<i64>> {
        Ok(
            sqlx::query_scalar("SELECT cursor_value FROM rocksky_durable_cursors WHERE source=$1")
                .bind(source)
                .fetch_optional(&self.pool)
                .await?,
        )
    }

    pub async fn claim(
        &self,
        kind: &str,
        lease_seconds: i64,
        max_attempts: i64,
    ) -> Result<Option<Job>> {
        ensure!(
            lease_seconds > 0 && max_attempts > 0,
            "invalid lease or attempt limit"
        );
        let now = self.now();
        // A crash on the final attempt must become visible, not remain stuck.
        sqlx::query(&format!("UPDATE rocksky_durable_jobs SET status='failed', last_error='lease expired on final attempt', updated_at={now} WHERE kind=$1 AND status='processing' AND lease_until<={now} AND attempts >= $2"))
            .bind(kind).bind(max_attempts).execute(&self.pool).await?;
        let lock = if self.postgres {
            " FOR UPDATE SKIP LOCKED"
        } else {
            ""
        };
        // SQLite serializes this single UPDATE; no SELECT-then-UPDATE race and
        // no network calls or user code under its writer lock.
        let sql = format!("UPDATE rocksky_durable_jobs SET status='processing', attempts=attempts+1, lease_token=$2, lease_until={now}+$3, updated_at={now} WHERE id=(SELECT id FROM rocksky_durable_jobs WHERE kind=$1 AND attempts<$4 AND ((status='pending' AND available_at<={now}) OR (status='processing' AND lease_until<={now})) ORDER BY available_at, created_at, id LIMIT 1{lock}) RETURNING *");
        Ok(sqlx::query_as(&sql)
            .bind(kind)
            .bind(Uuid::new_v4().to_string())
            .bind(lease_seconds)
            .bind(max_attempts)
            .fetch_optional(&self.pool)
            .await?)
    }

    pub async fn renew(&self, job: &Job, lease_seconds: i64) -> Result<bool> {
        let now = self.now();
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET lease_until={now}+$3, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
            .bind(&job.id).bind(&job.lease_token).bind(lease_seconds).execute(&self.pool).await?.rows_affected() == 1)
    }

    pub async fn finish(&self, job: &Job) -> Result<bool> {
        let now = self.now();
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET status='completed', last_error='', lease_token='', lease_until=0, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
            .bind(&job.id).bind(&job.lease_token).execute(&self.pool).await?.rows_affected() == 1)
    }

    pub async fn fail(
        &self,
        job: &Job,
        error: &str,
        permanent: bool,
        max_attempts: i64,
    ) -> Result<bool> {
        let now = self.now();
        let status = if permanent || job.attempts >= max_attempts {
            "failed"
        } else {
            "pending"
        };
        let delay = retry_delay(job.attempts);
        // Callers supply sanitized errors: never persist bearer tokens/HTTP bodies.
        let error: String = error.chars().take(2000).collect();
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET status=$3, last_error=$4, available_at={now}+$5, lease_token='', lease_until=0, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
            .bind(&job.id).bind(&job.lease_token).bind(status).bind(error).bind(delay).execute(&self.pool).await?.rows_affected() == 1)
    }

    pub async fn retry(&self, id: &str) -> Result<bool> {
        let now = self.now();
        // Preserve checkpoints, payload and stable record key on manual replay.
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET status='pending', attempts=0, available_at={now}, updated_at={now}, last_error='' WHERE id=$1 AND status='failed'"))
            .bind(id).execute(&self.pool).await?.rows_affected() == 1)
    }

    pub async fn step(&self, job: &Job, name: &str) -> Result<Option<String>> {
        Ok(sqlx::query_scalar(
            "SELECT result FROM rocksky_durable_steps WHERE job_id=$1 AND name=$2",
        )
        .bind(&job.id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn checkpoint(&self, job: &Job, name: &str, result: &str) -> Result<()> {
        // Lock/fence the job before recording a completed step. A stale worker
        // must not write checkpoints belonging to its replacement's attempt.
        let now = self.now();
        let mut tx = self.pool.begin().await?;
        let owned = sqlx::query(&format!("UPDATE rocksky_durable_jobs SET updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
            .bind(&job.id).bind(&job.lease_token).execute(&mut *tx).await?.rows_affected();
        ensure!(owned == 1, "job lease lost before checkpoint");
        sqlx::query(&format!("INSERT INTO rocksky_durable_steps (job_id,name,result,completed_at) VALUES ($1,$2,$3,{now}) ON CONFLICT (job_id,name) DO NOTHING"))
            .bind(&job.id).bind(name).bind(result).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}

fn retry_delay(attempts: i64) -> i64 {
    let base = (2_i64.pow(attempts.clamp(1, 10) as u32)).min(900);
    base + i64::from(Uuid::new_v4().as_bytes()[0]) % (base / 4 + 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    async fn contract(queue: Queue) {
        let kind = format!("test-{}", Uuid::new_v4());
        let first = queue
            .enqueue(&kind, "same", "hash", "original payload")
            .await
            .unwrap();
        let again = queue
            .enqueue(
                &kind,
                "same",
                "hash",
                "retry generated a different timestamp",
            )
            .await
            .unwrap();
        assert_eq!(first.id, again.id);
        assert_eq!(again.payload, "original payload");
        assert!(queue
            .enqueue(&kind, "same", "different", "changed")
            .await
            .unwrap_err()
            .is::<Conflict>());
        for n in 0..23 {
            queue
                .enqueue(&kind, &n.to_string(), "hash", "payload")
                .await
                .unwrap();
        }

        // Competing consumers never claim the same live lease.
        let mut tasks = tokio::task::JoinSet::new();
        for _ in 0..32 {
            let (queue, kind) = (queue.clone(), kind.clone());
            tasks.spawn(async move { queue.claim(&kind, 60, 3).await.unwrap() });
        }
        let mut ids = HashSet::new();
        let mut jobs = vec![];
        while let Some(result) = tasks.join_next().await {
            if let Some(job) = result.unwrap() {
                assert!(ids.insert(job.id.clone()), "duplicate claim");
                jobs.push(job);
            }
        }
        assert_eq!(ids.len(), 24);

        let old = &jobs[0];
        queue
            .checkpoint(old, "publish.v1", "confirmed-pds-uri")
            .await
            .unwrap();
        // Simulate a worker dying after checkpoint, before job completion.
        sqlx::query("UPDATE rocksky_durable_jobs SET lease_until=0 WHERE id=$1")
            .bind(&old.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        let replacement = queue.claim(&kind, 60, 3).await.unwrap().unwrap();
        assert_eq!(replacement.id, old.id);
        assert_ne!(replacement.lease_token, old.lease_token);
        assert_eq!(
            queue
                .step(&replacement, "publish.v1")
                .await
                .unwrap()
                .as_deref(),
            Some("confirmed-pds-uri")
        );
        assert!(!queue.renew(old, 60).await.unwrap());
        assert!(!queue.finish(old).await.unwrap());
        assert!(!queue.fail(old, "stale", true, 3).await.unwrap());
        assert!(queue.checkpoint(old, "other", "stale").await.is_err());
        assert!(queue.finish(&replacement).await.unwrap());

        let retryable = &jobs[1];
        assert!(queue.fail(retryable, "temporary", false, 3).await.unwrap());
        let pending = queue.get(&retryable.id).await.unwrap().unwrap();
        assert_eq!(pending.status, "pending");
        assert!(pending.available_at > pending.updated_at);
        assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());
        assert!(queue
            .fail(&jobs[2], "invalid input", true, 3)
            .await
            .unwrap());
        assert_eq!(
            queue.get(&jobs[2].id).await.unwrap().unwrap().status,
            "failed"
        );
        assert!(queue.retry(&jobs[2].id).await.unwrap());
        let replay = queue.claim(&kind, 60, 3).await.unwrap().unwrap();
        assert_eq!(replay.id, jobs[2].id);
        assert_eq!(replay.attempts, 1);

        // Expired final attempts are dead-lettered, never silently stranded.
        sqlx::query("UPDATE rocksky_durable_jobs SET attempts=3, lease_until=0 WHERE id=$1")
            .bind(&replay.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());
        assert_eq!(
            queue.get(&replay.id).await.unwrap().unwrap().status,
            "failed"
        );

        let source_a = format!("{kind}:source-a");
        let source_b = format!("{kind}:source-b");
        queue
            .ingest(&kind, &source_a, 100, "event", "first source payload")
            .await
            .unwrap();
        queue
            .ingest(&kind, &source_b, 20, "event", "second source payload")
            .await
            .unwrap();
        queue
            .ingest(&kind, &source_a, 90, "event", "replay")
            .await
            .unwrap();
        assert_eq!(queue.cursor(&source_a).await.unwrap(), Some(100));
        assert_eq!(queue.cursor(&source_b).await.unwrap(), Some(20));
        let captured = queue.claim(&kind, 60, 3).await.unwrap().unwrap();
        assert_eq!(captured.payload, "first source payload");
        assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());
        // The transaction must not advance a cursor if its inbox INSERT fails.
        let mut tx = queue.pool.begin().await.unwrap();
        sqlx::query("UPDATE rocksky_durable_cursors SET cursor_value=999 WHERE source=$1")
            .bind(&source_a)
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.rollback().await.unwrap();
        assert_eq!(queue.cursor(&source_a).await.unwrap(), Some(100));
        for source in [&source_a, &source_b] {
            sqlx::query("DELETE FROM rocksky_durable_cursors WHERE source=$1")
                .bind(source)
                .execute(&queue.pool)
                .await
                .unwrap();
        }

        sqlx::query("DELETE FROM rocksky_durable_steps WHERE job_id IN (SELECT id FROM rocksky_durable_jobs WHERE kind=$1)")
            .bind(&kind).execute(&queue.pool).await.unwrap();
        sqlx::query("DELETE FROM rocksky_durable_jobs WHERE kind=$1")
            .bind(&kind)
            .execute(&queue.pool)
            .await
            .unwrap();
    }

    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn sqlite_queue_contract() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("jobs.sqlite").display()
        );
        contract(Queue::connect(&url).await.unwrap()).await;
    }

    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn sqlite_survives_reopen_with_full_durability() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("jobs.sqlite").display()
        );
        let queue = Queue::connect(&url).await.unwrap();
        let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&queue.pool)
            .await
            .unwrap();
        let sync: i64 = sqlx::query_scalar("PRAGMA synchronous")
            .fetch_one(&queue.pool)
            .await
            .unwrap();
        assert_eq!(mode, "wal");
        assert_eq!(sync, 2);
        let job = queue
            .enqueue("publish.v1", "key", "hash", "payload")
            .await
            .unwrap();
        queue.pool.close().await;
        let reopened = Queue::connect(&url).await.unwrap();
        assert_eq!(
            reopened.get(&job.id).await.unwrap().unwrap().payload,
            "payload"
        );
        assert_eq!(
            reopened
                .claim("publish.v1", 60, 3)
                .await
                .unwrap()
                .unwrap()
                .id,
            job.id
        );
        assert!(Queue::connect("sqlite::memory:").await.is_err());
    }

    // Spawn this exact test in a child process to prove recovery does not rely
    // on graceful pool close, destructors, or a normal SQLite checkpoint.
    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn abrupt_exit_child() {
        let Ok(url) = std::env::var("ROCKSKY_CRASH_TEST_URL") else {
            return;
        };
        let queue = Queue::connect(&url).await.unwrap();
        queue
            .enqueue("crash.v1", "key", "hash", "payload")
            .await
            .unwrap();
        let job = queue.claim("crash.v1", 1, 3).await.unwrap().unwrap();
        queue
            .checkpoint(&job, "publish.v1", "remote-write-confirmed")
            .await
            .unwrap();
        std::process::exit(42);
    }

    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn recovers_after_abrupt_process_exit() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("crash.sqlite").display()
        );
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "queue::tests::abrupt_exit_child", "--nocapture"])
            .env("ROCKSKY_CRASH_TEST_URL", &url)
            .status()
            .unwrap();
        assert_eq!(status.code(), Some(42));
        tokio::time::sleep(Duration::from_secs(2)).await;
        let queue = Queue::connect(&url).await.unwrap();
        let recovered = queue.claim("crash.v1", 60, 3).await.unwrap().unwrap();
        assert_eq!(recovered.attempts, 2);
        assert_eq!(
            queue
                .step(&recovered, "publish.v1")
                .await
                .unwrap()
                .as_deref(),
            Some("remote-write-confirmed")
        );
    }

    #[cfg(feature = "postgres")]
    #[tokio::test]
    #[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL pointing to a disposable Postgres database"]
    async fn postgres_queue_contract() {
        let url = std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").expect("test database URL");
        contract(Queue::connect(&url).await.unwrap()).await;
    }
}
