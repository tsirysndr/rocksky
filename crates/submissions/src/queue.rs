use anyhow::{ensure, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{any::AnyPoolOptions, Any, AnyPool, Row};
use std::{str::FromStr, time::Duration};
use uuid::Uuid;

#[derive(Clone)]
pub struct Queue {
    pub(crate) pool: AnyPool,
    pub(crate) postgres: bool,
    wake: std::sync::Arc<tokio::sync::Notify>,
    pub(crate) dashboard_completed_cache: std::sync::Arc<crate::dashboard::CompletedCache>,
    pub(crate) dashboard_search_cache: std::sync::Arc<crate::dashboard::SearchCache>,
    pub(crate) dashboard_cache: std::sync::Arc<crate::dashboard::Cache>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Job {
    pub id: String,
    pub kind: String,
    /// First inbox source to capture this job; empty for legacy/non-inbox jobs.
    pub source: String,
    pub started_at_ms: i64,
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
    pub compacted_at: i64,
}

// Explicit projections keep prepared result types stable during additive migrations.
const JOB_COLUMNS: &str = "id,kind,source,started_at_ms,request_hash,payload,status,attempts,available_at,lease_until,lease_token,last_error,created_at,updated_at,compacted_at";

/// One source delivery; its cursor advances only with the durable inbox write.
#[derive(Clone, Debug)]
pub struct InboxEvent {
    pub source: String,
    pub cursor: i64,
    pub key: String,
    pub payload: String,
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

/// Disjoint claim lanes reserve worker capacity for latency-sensitive scrobbles.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimLane {
    All,
    Scrobbles,
    Background,
}
impl ClaimLane {
    fn predicate(self) -> &'static str {
        match self {
            Self::All => "",
            Self::Scrobbles => " AND collection='app.rocksky.scrobble'",
            Self::Background => " AND collection<>'app.rocksky.scrobble'",
        }
    }
}

fn job_collection(kind: &str, payload: &str) -> String {
    if kind != "jetstream.commit.v1" {
        return String::new();
    }
    serde_json::from_str::<serde_json::Value>(payload)
        .ok()
        .and_then(|value| {
            value
                .pointer("/commit/collection")
                .and_then(|v| v.as_str())
                .filter(|s| s.len() <= 512)
                .map(str::to_owned)
        })
        .unwrap_or_default()
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
        let queue = Self {
            pool,
            postgres,
            dashboard_cache: Default::default(),
            dashboard_search_cache: Default::default(),
            dashboard_completed_cache: Default::default(),
            wake: std::sync::Arc::new(tokio::sync::Notify::new()),
        };
        let mut tx = queue
            .pool
            .begin_with(if postgres { "BEGIN" } else { "BEGIN IMMEDIATE" })
            .await?;
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
        // Additive upgrades preserve job IDs and the first capturing source.
        for (column, definition) in [
            ("compacted_at", "BIGINT NOT NULL DEFAULT 0"),
            ("source", "TEXT NOT NULL DEFAULT ''"),
            ("collection", "TEXT NOT NULL DEFAULT ''"),
            ("started_at_ms", "BIGINT NOT NULL DEFAULT 0"),
            ("attempt_history", "TEXT NOT NULL DEFAULT '[]'"),
        ] {
            let exists = if postgres {
                sqlx::query_scalar::<_, i64>("SELECT count(*) FROM pg_attribute WHERE attrelid='rocksky_durable_jobs'::regclass AND attname=$1 AND NOT attisdropped")
                    .bind(column).fetch_one(&mut *tx).await? > 0
            } else {
                sqlx::query("PRAGMA table_info(rocksky_durable_jobs)")
                    .fetch_all(&mut *tx)
                    .await?
                    .iter()
                    .any(|row| row.get::<String, _>("name") == column)
            };
            if !exists {
                sqlx::query(&format!(
                    "ALTER TABLE rocksky_durable_jobs ADD COLUMN {column} {definition}"
                ))
                .execute(&mut *tx)
                .await?;
            }
        }
        for statement in [
            "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_scrobble_ready ON rocksky_durable_jobs (kind,status,available_at,created_at,id) WHERE collection='app.rocksky.scrobble'",
            "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_compact ON rocksky_durable_jobs (updated_at,id) WHERE status='completed' AND compacted_at=0",
            "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_retire ON rocksky_durable_jobs (updated_at,id) WHERE status='completed' AND compacted_at>0",
        ] {
            sqlx::query(statement).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(queue)
    }

    /// Compact completed rows in place: the primary key and request hash remain
    /// the deduplication authority, including for older producer binaries.
    /// Row locks (Postgres) / a writer transaction (SQLite) protect checkpoints
    /// and prevent concurrent sweepers from counting or deleting a job twice.
    pub async fn cleanup(
        &self,
        settings: crate::cleanup::CleanupSettings,
    ) -> Result<crate::cleanup::CleanupResult> {
        settings.validate()?;
        let mut result = crate::cleanup::CleanupResult::default();
        if !settings.enabled {
            return Ok(result);
        }
        let mut tx = self
            .pool
            .begin_with(if self.postgres {
                "BEGIN"
            } else {
                "BEGIN IMMEDIATE"
            })
            .await?;
        let now: i64 = sqlx::query_scalar(&format!("SELECT {}", self.now()))
            .fetch_one(&mut *tx)
            .await?;
        let lock = if self.postgres {
            " FOR UPDATE SKIP LOCKED"
        } else {
            ""
        };
        let jobs: Vec<Job> = sqlx::query_as(&format!("SELECT {JOB_COLUMNS} FROM rocksky_durable_jobs WHERE status='completed' AND compacted_at=0 AND updated_at<=$1 ORDER BY updated_at,id LIMIT $2{lock}"))
            .bind(now - settings.completed_retention_seconds).bind(settings.batch_size).fetch_all(&mut *tx).await?;
        let mut compacted_payloads = Vec::with_capacity(jobs.len());
        for job in &jobs {
            // Completed jobs are never executable again while this row exists.
            // Keep the PDS record identity and frozen listening time for audit,
            // but discard track metadata, DID and the large upstream event body.
            let mut compact = serde_json::json!({});
            if job.kind == crate::service::KIND {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(&job.payload) {
                    if let Some(key) = payload.get("recordKey").and_then(|v| v.as_str()) {
                        compact["recordKey"] = key.into();
                    }
                    if let Some(timestamp) = payload.get("track").and_then(|v| v.get("timestamp")) {
                        compact["timestamp"] = timestamp.clone();
                    }
                }
            }
            compacted_payloads.push(compact.to_string());
        }
        if !jobs.is_empty() {
            let ids: Vec<String> = jobs.iter().map(|job| job.id.clone()).collect();
            delete_steps(&mut tx, &ids).await?;
            // Numbered placeholders work with both drivers behind sqlx::Any.
            let cases = (0..jobs.len())
                .map(|n| format!("WHEN ${} THEN ${}", n * 2 + 1, n * 2 + 2))
                .collect::<Vec<_>>()
                .join(" ");
            let statement = format!("UPDATE rocksky_durable_jobs SET payload=CASE id {cases} END, attempt_history='[]', last_error='', compacted_at=${} WHERE id IN ({})", jobs.len() * 2 + 1, placeholders(jobs.len() * 2 + 2, ids.len()));
            let mut update = sqlx::query(&statement);
            for (job, payload) in jobs.iter().zip(&compacted_payloads) {
                update = update.bind(&job.id).bind(payload);
            }
            update = update.bind(now);
            for id in &ids {
                update = update.bind(id);
            }
            result.compacted = update.execute(&mut *tx).await?.rows_affected();
        }
        if settings.dedup_retention_seconds > 0 {
            let ids: Vec<String> = sqlx::query_scalar(&format!("SELECT id FROM rocksky_durable_jobs WHERE status='completed' AND compacted_at>0 AND updated_at<=$1 ORDER BY updated_at,id LIMIT $2{lock}"))
                .bind(now - settings.dedup_retention_seconds).bind(settings.batch_size).fetch_all(&mut *tx).await?;
            if !ids.is_empty() {
                delete_steps(&mut tx, &ids).await?;
                let statement = format!(
                    "DELETE FROM rocksky_durable_jobs WHERE id IN ({})",
                    placeholders(1, ids.len())
                );
                let mut delete = sqlx::query(&statement);
                for id in &ids {
                    delete = delete.bind(id);
                }
                result.deleted = delete.execute(&mut *tx).await?.rows_affected();
            }
        }
        tx.commit().await?;
        Ok(result)
    }

    pub async fn from_env() -> Result<Self> {
        let url = std::env::var("SUBMISSIONS_DATABASE_URL")
            .context("SUBMISSIONS_DATABASE_URL must explicitly name the durable queue database")?;
        Self::connect(&url).await
    }

    fn now_ms(&self) -> &'static str {
        if self.postgres {
            "CAST(FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000) AS BIGINT)"
        } else {
            "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"
        }
    }

    // Fold timing into the same fenced state transition: no additional network
    // round trips on the processing path, and stale workers cannot append spans.
    fn attempt_history(&self, outcome: &str, expired: bool) -> String {
        let end = if expired {
            "lease_until * 1000"
        } else {
            self.now_ms()
        };
        let duration = if expired {
            "NULL".to_owned()
        } else {
            format!("CASE WHEN {end} >= started_at_ms THEN {end} - started_at_ms ELSE 0 END")
        };
        let fields = format!("'attempt',attempts,'started_at_ms',started_at_ms,'finished_at_ms',{end},'duration_ms',{duration},'outcome','{outcome}'");
        let append = if self.postgres {
            format!(
                "(attempt_history::jsonb || jsonb_build_array(jsonb_build_object({fields})))::text"
            )
        } else {
            format!("json_insert(attempt_history,'$[#]',json_object({fields}))")
        };
        format!("CASE WHEN started_at_ms>0 THEN {append} ELSE attempt_history END")
    }

    pub(crate) fn now(&self) -> &'static str {
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
        self.enqueue_after(kind, key, request_hash, payload, 0)
            .await
    }

    /// Persist the delay with the first acceptance; duplicate deliveries never
    /// move the deadline or replace the original payload.
    pub async fn enqueue_after(
        &self,
        kind: &str,
        key: &str,
        request_hash: &str,
        payload: &str,
        delay_seconds: i64,
    ) -> Result<Job> {
        anyhow::ensure!(delay_seconds >= 0, "negative queue delay");
        let id = digest(&serde_json::to_string(&(kind, key))?);
        let now = self.now();
        let sql = format!("INSERT INTO rocksky_durable_jobs (id, kind, request_hash, payload, collection, status, available_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'pending',{now}+$6,{now},{now}) ON CONFLICT (id) DO UPDATE SET id=excluded.id RETURNING {JOB_COLUMNS}");
        let job: Job = sqlx::query_as(&sql)
            .bind(&id)
            .bind(kind)
            .bind(request_hash)
            .bind(payload)
            .bind(job_collection(kind, payload))
            .bind(delay_seconds)
            .fetch_one(&self.pool)
            .await?;
        if job.request_hash != request_hash {
            return Err(Conflict.into());
        }
        self.wake.notify_one();
        Ok(job)
    }

    pub async fn get(&self, id: &str) -> Result<Option<Job>> {
        Ok(sqlx::query_as(&format!(
            "SELECT {JOB_COLUMNS} FROM rocksky_durable_jobs WHERE id=$1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await?)
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
        self.ingest_batch(
            kind,
            &[InboxEvent {
                source: source.into(),
                cursor,
                key: key.into(),
                payload: payload.into(),
            }],
        )
        .await
    }

    /// One network round trip on Postgres, one short transaction on SQLite.
    /// Jobs and every source cursor commit together, even on duplicate delivery.
    pub async fn ingest_batch(&self, kind: &str, events: &[InboxEvent]) -> Result<()> {
        if events.is_empty() {
            return Ok(());
        }
        ensure!(
            events.len() <= 1000,
            "inbox batch must contain at most 1000 events"
        );
        let mut jobs = std::collections::BTreeMap::new();
        let mut cursors = std::collections::BTreeMap::new();
        for event in events {
            jobs.entry(digest(&serde_json::to_string(&(kind, &event.key))?))
                .or_insert_with(|| {
                    (
                        digest(&event.payload),
                        &event.payload,
                        &event.source,
                        job_collection(kind, &event.payload),
                    )
                });
            cursors
                .entry(&event.source)
                .and_modify(|v: &mut i64| *v = (*v).max(event.cursor))
                .or_insert(event.cursor);
        }
        let now = self.now();
        let values = (0..jobs.len())
            .map(|n| {
                let n = 2 + n * 5;
                format!(
                    "(${n},$1,${},${},${},${},'pending',{now},{now},{now})",
                    n + 1,
                    n + 2,
                    n + 3,
                    n + 4
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        let insert = format!("INSERT INTO rocksky_durable_jobs (id,kind,request_hash,payload,source,collection,status,available_at,created_at,updated_at) VALUES {values} ON CONFLICT (id) DO NOTHING");
        let cursor_start = if self.postgres { 2 + jobs.len() * 5 } else { 1 };
        let cursor_values = (0..cursors.len())
            .map(|n| format!("(${},${})", cursor_start + n * 2, cursor_start + n * 2 + 1))
            .collect::<Vec<_>>()
            .join(",");
        let upsert = format!("INSERT INTO rocksky_durable_cursors (source,cursor_value) VALUES {cursor_values} ON CONFLICT (source) DO UPDATE SET cursor_value=CASE WHEN excluded.cursor_value>rocksky_durable_cursors.cursor_value THEN excluded.cursor_value ELSE rocksky_durable_cursors.cursor_value END");
        if self.postgres {
            // Data-modifying CTEs execute exactly once, including when their
            // RETURNING rows are unused. Both writes share this statement's commit.
            let statement = format!("WITH captured AS ({insert} RETURNING id) {upsert}");
            let mut query = sqlx::query(&statement).bind(kind);
            for (id, (hash, payload, source, collection)) in &jobs {
                query = query
                    .bind(id)
                    .bind(hash)
                    .bind(*payload)
                    .bind(*source)
                    .bind(collection);
            }
            for (source, cursor) in &cursors {
                query = query.bind(*source).bind(*cursor);
            }
            query.execute(&self.pool).await?;
        } else {
            let mut tx = self.pool.begin().await?;
            let mut query = sqlx::query(&insert).bind(kind);
            for (id, (hash, payload, source, collection)) in &jobs {
                query = query
                    .bind(id)
                    .bind(hash)
                    .bind(*payload)
                    .bind(*source)
                    .bind(collection);
            }
            query.execute(&mut *tx).await?;
            let mut query = sqlx::query(&upsert);
            for (source, cursor) in &cursors {
                query = query.bind(*source).bind(*cursor);
            }
            query.execute(&mut *tx).await?;
            tx.commit().await?;
        }
        self.wake.notify_one();
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

    pub async fn notified(&self) {
        self.wake.notified().await;
    }

    pub async fn claim(
        &self,
        kind: &str,
        lease_seconds: i64,
        max_attempts: i64,
    ) -> Result<Option<Job>> {
        Ok(self
            .claim_batch(kind, lease_seconds, max_attempts, 1)
            .await?
            .pop())
    }

    /// Reserve a bounded group with one round trip instead of serially paying
    /// remote latency for every available execution slot.
    pub async fn claim_batch(
        &self,
        kind: &str,
        lease_seconds: i64,
        max_attempts: i64,
        limit: i64,
    ) -> Result<Vec<Job>> {
        self.claim_batch_in_lane(kind, lease_seconds, max_attempts, limit, ClaimLane::All)
            .await
    }

    /// Claims only the selected collection lane. Leasing, retry eligibility and
    /// FIFO order within each lane are identical to ordinary claims.
    pub async fn claim_batch_in_lane(
        &self,
        kind: &str,
        lease_seconds: i64,
        max_attempts: i64,
        limit: i64,
        lane: ClaimLane,
    ) -> Result<Vec<Job>> {
        let lane_filter = lane.predicate();
        ensure!(
            lease_seconds > 0 && max_attempts > 0 && (1..=256).contains(&limit),
            "invalid lease, attempt or batch limit"
        );
        let now = self.now();
        let expired_history = self.attempt_history("lease_expired", true);
        let started = self.now_ms();
        let exhausted = format!("UPDATE rocksky_durable_jobs SET attempt_history={expired_history}, status='failed', last_error='lease expired on final attempt', updated_at={now} WHERE kind=$1{lane_filter} AND status='processing' AND lease_until<={now} AND attempts >= $4");
        let lock = if self.postgres {
            " FOR UPDATE SKIP LOCKED"
        } else {
            ""
        };
        let claim = format!("UPDATE rocksky_durable_jobs SET attempt_history=CASE WHEN status='processing' THEN {expired_history} ELSE attempt_history END, started_at_ms={started}, status='processing', attempts=attempts+1, lease_token=$2, lease_until={now}+$3, updated_at={now} WHERE id IN (SELECT id FROM rocksky_durable_jobs WHERE kind=$1{lane_filter} AND attempts<$4 AND ((status='pending' AND available_at<={now}) OR (status='processing' AND lease_until<={now})) ORDER BY available_at, created_at, id LIMIT $5{lock}) RETURNING {JOB_COLUMNS}");
        let sql = if self.postgres {
            format!("WITH exhausted AS ({exhausted} RETURNING id) {claim}")
        } else {
            sqlx::query(&exhausted)
                .bind(kind)
                .bind("")
                .bind(0_i64)
                .bind(max_attempts)
                .execute(&self.pool)
                .await?;
            claim
        };
        Ok(sqlx::query_as(&sql)
            .bind(kind)
            .bind(Uuid::new_v4().to_string())
            .bind(lease_seconds)
            .bind(max_attempts)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?)
    }

    pub async fn renew(&self, job: &Job, lease_seconds: i64) -> Result<bool> {
        let now = self.now();
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET lease_until={now}+$3, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
            .bind(&job.id).bind(&job.lease_token).bind(lease_seconds).execute(&self.pool).await?.rows_affected() == 1)
    }

    pub async fn finish(&self, job: &Job) -> Result<bool> {
        let now = self.now();
        let history = self.attempt_history("completed", false);
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET attempt_history={history}, status='completed', last_error='', lease_token='', lease_until=0, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
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
        let history = self.attempt_history(
            if status == "failed" {
                "failed"
            } else {
                "retry"
            },
            false,
        );
        let delay = retry_delay(job.attempts);
        // Callers supply sanitized errors: never persist bearer tokens/HTTP bodies.
        let error: String = error.chars().take(2000).collect();
        Ok(sqlx::query(&format!("UPDATE rocksky_durable_jobs SET attempt_history={history}, status=$3, last_error=$4, available_at={now}+$5, lease_token='', lease_until=0, updated_at={now} WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>{now}"))
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

fn placeholders(start: usize, len: usize) -> String {
    (start..start + len)
        .map(|n| format!("${n}"))
        .collect::<Vec<_>>()
        .join(",")
}

async fn delete_steps(tx: &mut sqlx::Transaction<'_, Any>, ids: &[String]) -> Result<()> {
    let statement = format!(
        "DELETE FROM rocksky_durable_steps WHERE job_id IN ({})",
        placeholders(1, ids.len())
    );
    let mut query = sqlx::query(&statement);
    for id in ids {
        query = query.bind(id);
    }
    query.execute(&mut **tx).await?;
    Ok(())
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
        let delayed_kind = format!("delayed-{}", Uuid::new_v4());
        let delayed = queue
            .enqueue_after(&delayed_kind, "key", "hash", "first", 60)
            .await
            .unwrap();
        assert_eq!(delayed.available_at, delayed.created_at + 60);
        let retry = queue
            .enqueue_after(&delayed_kind, "key", "hash", "retry", 0)
            .await
            .unwrap();
        assert_eq!(delayed.available_at, retry.available_at);
        assert_eq!(retry.payload, "first");
        assert!(queue
            .claim_batch(&delayed_kind, 120, 20, 1)
            .await
            .unwrap()
            .is_empty());

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

        if queue.postgres {
            // SKIP LOCKED may return no job even with pending work. Prove this
            // deterministically, then release the competing transaction's locks.
            let mut competing = queue.pool.begin().await.unwrap();
            let locked: Vec<String> =
                sqlx::query_scalar("SELECT id FROM rocksky_durable_jobs WHERE kind=$1 FOR UPDATE")
                    .bind(&kind)
                    .fetch_all(&mut *competing)
                    .await
                    .unwrap();
            assert_eq!(locked.len(), 24);
            assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());
            competing.rollback().await.unwrap();
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
        assert!(!ids.is_empty(), "competing consumers must make progress");
        // A single wave is not a drain: SKIP LOCKED can produce transient empty
        // claims. Once every competitor has returned, claim remaining work and
        // keep checking uniqueness against ALL leases from the concurrent wave.
        for _ in ids.len()..24 {
            let job = queue
                .claim(&kind, 60, 3)
                .await
                .unwrap()
                .expect("pending work must remain claimable after contention ends");
            assert!(
                ids.insert(job.id.clone()),
                "duplicate claim after contention"
            );
            jobs.push(job);
        }
        assert_eq!(ids.len(), 24);
        assert!(queue.claim(&kind, 60, 3).await.unwrap().is_none());

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
        let history: String =
            sqlx::query_scalar("SELECT attempt_history FROM rocksky_durable_jobs WHERE id=$1")
                .bind(&old.id)
                .fetch_one(&queue.pool)
                .await
                .unwrap();
        let history: serde_json::Value = serde_json::from_str(&history).unwrap();
        assert_eq!(
            history.as_array().unwrap().len(),
            2,
            "stale transitions must not append spans"
        );
        assert_eq!(history[0]["outcome"], "lease_expired");
        assert!(history[0]["duration_ms"].is_null());
        assert_eq!(history[1]["outcome"], "completed");
        assert!(history[1]["duration_ms"].as_i64().unwrap() >= 0);

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
        assert_eq!(captured.source, source_a);
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

#[cfg(test)]
#[path = "batch_tests.rs"]
mod batch_tests;

#[cfg(test)]
#[path = "cleanup_tests.rs"]
mod cleanup_tests;
