//! Durable round-robin scheduling between actors, independent of ingestion order.
use crate::{
    queue::{job_actor, ClaimLane, JOB_COLUMNS},
    Job, Queue,
};
use anyhow::{ensure, Result};
use sqlx::{Any, Row, Transaction};
use uuid::Uuid;

pub(crate) async fn migrate(tx: &mut Transaction<'_, Any>, postgres: bool) -> Result<()> {
    for sql in [
        "CREATE TABLE IF NOT EXISTS rocksky_durable_actors (kind TEXT NOT NULL, lane BIGINT NOT NULL, actor TEXT NOT NULL, last_served BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(kind,lane,actor))",
        "CREATE INDEX IF NOT EXISTS rocksky_durable_actors_turn ON rocksky_durable_actors(kind,lane,last_served,actor)",
        "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_actor_ready ON rocksky_durable_jobs(kind,actor,available_at,created_at,id) WHERE status IN ('pending','processing')",
        "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_actor_backfill ON rocksky_durable_jobs(kind,id) WHERE actor='' AND status<>'completed'",
        "CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_actor_leases ON rocksky_durable_jobs(kind,actor,lease_until) WHERE status='processing'",
    ] { sqlx::query(sql).execute(&mut **tx).await?; }
    // Register in the same transaction as the job, including manual retries.
    // DO NOTHING deliberately preserves an actor's turn on duplicate deliveries.
    let insert = "INSERT INTO rocksky_durable_actors(kind,lane,actor) VALUES (NEW.kind,CASE WHEN NEW.collection='app.rocksky.scrobble' THEN 1 ELSE 2 END,NEW.actor) ON CONFLICT(kind,lane,actor) DO NOTHING";
    if postgres {
        sqlx::query(&format!("CREATE OR REPLACE FUNCTION rocksky_register_durable_actor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor<>'' THEN {insert}; END IF; RETURN NEW; END $$")).execute(&mut **tx).await?;
        sqlx::query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rocksky_durable_actor_register' AND tgrelid='rocksky_durable_jobs'::regclass) THEN CREATE TRIGGER rocksky_durable_actor_register AFTER INSERT OR UPDATE OF actor,collection ON rocksky_durable_jobs FOR EACH ROW EXECUTE FUNCTION rocksky_register_durable_actor(); END IF; END $$").execute(&mut **tx).await?;
    } else {
        for (name, event) in [
            ("insert", "INSERT"),
            ("update", "UPDATE OF actor,collection"),
        ] {
            sqlx::query(&format!("CREATE TRIGGER IF NOT EXISTS rocksky_durable_actor_{name} AFTER {event} ON rocksky_durable_jobs WHEN NEW.actor<>'' BEGIN {insert}; END")).execute(&mut **tx).await?;
        }
    }
    Ok(())
}

impl Queue {
    /// Upgrade the existing backlog before enabling fair consumers. Bounded
    /// batches avoid a long write transaction. Missing DIDs share one safe bucket.
    pub async fn prepare_fairness(&self, kind: &str) -> Result<()> {
        loop {
            let rows = sqlx::query("SELECT id,payload FROM rocksky_durable_jobs WHERE kind=$1 AND actor='' AND status<>'completed' ORDER BY id LIMIT 500")
                .bind(kind).fetch_all(&self.pool).await?;
            if rows.is_empty() {
                break;
            }
            let cases = (0..rows.len())
                .map(|n| format!("WHEN ${} THEN ${}", n * 2 + 1, n * 2 + 2))
                .collect::<Vec<_>>()
                .join(" ");
            let ids = (0..rows.len())
                .map(|n| format!("${}", n * 2 + 1))
                .collect::<Vec<_>>()
                .join(",");
            let statement = format!("UPDATE rocksky_durable_jobs SET actor=CASE id {cases} END WHERE id IN ({ids}) AND actor='' AND status<>'completed'");
            let mut query = sqlx::query(&statement);
            for row in rows {
                query = query
                    .bind(row.get::<String, _>("id"))
                    .bind(job_actor(&row.get::<String, _>("payload")));
            }
            query.execute(&self.pool).await?;
        }
        Ok(())
    }

    /// Share each batch among eligible actors, with a database-wide live-lease cap
    /// per actor and lane. A short scheduling lock serializes competing claims;
    /// execution and ingestion never hold that lock. Expired leases don't count.
    pub async fn claim_fair_batch(
        &self,
        kind: &str,
        lease_seconds: i64,
        max_attempts: i64,
        limit: i64,
        lane: ClaimLane,
        per_actor: i64,
    ) -> Result<Vec<Job>> {
        ensure!(
            lane != ClaimLane::All,
            "fair scheduling requires a collection lane"
        );
        ensure!(
            lease_seconds > 0
                && max_attempts > 0
                && (1..=256).contains(&limit)
                && (1..=256).contains(&per_actor),
            "invalid fair claim settings"
        );
        let lane_id = if lane == ClaimLane::Scrobbles {
            1_i64
        } else {
            2
        };
        let lane_filter = lane.predicate();
        let now = self.now();
        let started = self.now_ms();
        let history = self.attempt_history("lease_expired", true);
        let mut tx = self
            .pool
            .begin_with(if self.postgres {
                "BEGIN"
            } else {
                "BEGIN IMMEDIATE"
            })
            .await?;
        if self.postgres {
            // hash collisions only serialize unrelated schedulers; never violate caps.
            sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1),$2)")
                .bind(kind)
                .bind(lane_id as i32)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query(&format!("UPDATE rocksky_durable_jobs SET attempt_history={history},status='failed',last_error='lease expired on final attempt',updated_at={now} WHERE kind=$1{lane_filter} AND status='processing' AND lease_until<={now} AND attempts>=$2"))
            .bind(kind).bind(max_attempts).execute(&mut *tx).await?;
        // Both correlated probes use actor indexes. No window sort of the job
        // backlog, and no fixed candidate window that a noisy DID can monopolize.
        let ready = format!("kind=a.kind AND actor=a.actor AND status IN ('pending','processing'){lane_filter} AND attempts<$3 AND ((status='pending' AND available_at<={now}) OR (status='processing' AND lease_until<={now}))");
        let live = format!("(SELECT count(*) FROM rocksky_durable_jobs WHERE kind=a.kind AND actor=a.actor AND status='processing'{lane_filter} AND lease_until>{now})");
        let rows = sqlx::query(&format!("SELECT a.actor,{live} AS inflight FROM rocksky_durable_actors a WHERE a.kind=$1 AND a.lane=$2 AND (SELECT count(*) FROM rocksky_durable_jobs WHERE kind=a.kind AND actor=a.actor AND status='processing'{lane_filter} AND lease_until>{now})<$4 AND EXISTS (SELECT 1 FROM rocksky_durable_jobs WHERE {ready}) ORDER BY a.last_served,a.actor LIMIT $5"))
            .bind(kind).bind(lane_id).bind(max_attempts).bind(per_actor).bind(limit).fetch_all(&mut *tx).await?;
        if rows.is_empty() {
            tx.commit().await?;
            return Ok(Vec::new());
        }
        let lock = if self.postgres {
            " FOR UPDATE SKIP LOCKED"
        } else {
            ""
        };
        // Split this batch evenly, respecting live capacity. Each bounded actor
        // probe reads FIFO directly from its index instead of sorting the backlog.
        let choices = rows.iter().enumerate().map(|(n,row)| {
            let share = limit / rows.len() as i64 + i64::from((n as i64) < limit % rows.len() as i64);
            let quota = share.min(per_actor-row.get::<i64,_>("inflight"));
            let actor_param = n+5;
            format!("SELECT id FROM (SELECT id FROM rocksky_durable_jobs WHERE kind=$3 AND actor=${actor_param} AND status IN ('pending','processing'){lane_filter} AND attempts<$4 AND ((status='pending' AND available_at<={now}) OR (status='processing' AND lease_until<={now})) ORDER BY available_at,created_at,id LIMIT {quota}{lock}) AS actor_{n}")
        }).collect::<Vec<_>>().join(" UNION ALL ");
        let statement = format!("UPDATE rocksky_durable_jobs SET attempt_history=CASE WHEN status='processing' THEN {history} ELSE attempt_history END,started_at_ms={started},status='processing',attempts=attempts+1,lease_token=$1,lease_until={now}+$2,updated_at={now} WHERE id IN ({choices}) RETURNING {JOB_COLUMNS}");
        let mut claim = sqlx::query_as::<_, Job>(&statement)
            .bind(Uuid::new_v4().to_string())
            .bind(lease_seconds)
            .bind(kind)
            .bind(max_attempts);
        for row in &rows {
            claim = claim.bind(row.get::<String, _>("actor"));
        }
        let jobs = claim.fetch_all(&mut *tx).await?;
        let params = (0..rows.len())
            .map(|n| format!("${}", n + 3))
            .collect::<Vec<_>>()
            .join(",");
        let statement = format!("UPDATE rocksky_durable_actors SET last_served=(SELECT COALESCE(MAX(last_served),0)+1 FROM rocksky_durable_actors WHERE kind=$1 AND lane=$2) WHERE kind=$1 AND lane=$2 AND actor IN ({params})");
        let mut turns = sqlx::query(&statement).bind(kind).bind(lane_id);
        for row in &rows {
            turns = turns.bind(row.get::<String, _>("actor"));
        }
        turns.execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(jobs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    async fn contract(queue: Queue) {
        let kind = format!("fair-{}", Uuid::new_v4());
        let mut noisy = Vec::new();
        for n in 0..40 {
            noisy.push(
                queue
                    .enqueue(
                        &kind,
                        &format!("noisy-{n}"),
                        "hash",
                        r#"{"did":"did:plc:noisy"}"#,
                    )
                    .await
                    .unwrap(),
            );
        }
        sqlx::query("UPDATE rocksky_durable_jobs SET available_at=available_at-100,created_at=created_at-100 WHERE kind=$1").bind(&kind).execute(&queue.pool).await.unwrap();
        for did in ["did:plc:quiet-a", "did:plc:quiet-b"] {
            for n in 0..3 {
                queue
                    .enqueue(
                        &kind,
                        &format!("{did}-{n}"),
                        "hash",
                        &serde_json::json!({"did":did}).to_string(),
                    )
                    .await
                    .unwrap();
            }
        }
        sqlx::query(
            "UPDATE rocksky_durable_jobs SET collection='app.rocksky.scrobble' WHERE kind=$1",
        )
        .bind(&kind)
        .execute(&queue.pool)
        .await
        .unwrap();
        // One slot rotates even though the noisy account has the oldest backlog.
        let mut seen = HashSet::new();
        for _ in 0..3 {
            let jobs = queue
                .claim_fair_batch(&kind, 60, 3, 1, ClaimLane::Scrobbles, 2)
                .await
                .unwrap();
            assert_eq!(jobs.len(), 1);
            seen.insert(job_actor(&jobs[0].payload));
            assert!(queue.finish(&jobs[0]).await.unwrap());
        }
        assert_eq!(
            seen.len(),
            3,
            "a large older backlog must not starve quiet DIDs"
        );
        // Competing schedulers share the cap, not merely an in-process semaphore.
        let (a, b, c) = tokio::join!(
            queue.claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2),
            queue.claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2),
            queue.claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
        );
        let jobs = [a.unwrap(), b.unwrap(), c.unwrap()].concat();
        assert_eq!(jobs.len(), 6);
        assert_eq!(jobs.iter().map(|j| &j.id).collect::<HashSet<_>>().len(), 6);
        let mut counts = HashMap::new();
        for job in &jobs {
            *counts.entry(job_actor(&job.payload)).or_insert(0) += 1;
        }
        assert!(counts.values().all(|&n| n == 2));
        assert!(queue
            .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
            .await
            .unwrap()
            .is_empty());
        // Live leases fence stale workers; expired ones recover and free capacity.
        let expired = jobs
            .iter()
            .find(|j| job_actor(&j.payload) == "did:plc:noisy")
            .unwrap();
        sqlx::query("UPDATE rocksky_durable_jobs SET lease_until=0 WHERE id=$1")
            .bind(&expired.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        // Ensure the expired job is first in its actor's FIFO ordering.
        sqlx::query("UPDATE rocksky_durable_jobs SET available_at=available_at-1000 WHERE id=$1")
            .bind(&expired.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        let recovered = queue
            .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
            .await
            .unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].id, expired.id);
        assert_eq!(recovered[0].attempts, 2);
        assert!(!queue.finish(expired).await.unwrap());
        assert!(queue
            .fail(&recovered[0], "retry later", false, 3)
            .await
            .unwrap());
        let next = queue
            .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
            .await
            .unwrap();
        assert_eq!(next.len(), 1);
        assert_ne!(
            next[0].id, expired.id,
            "a delayed retry must not jump its deadline"
        );
        sqlx::query("UPDATE rocksky_durable_jobs SET status='processing',attempts=3,lease_until=0 WHERE id=$1")
            .bind(&expired.id).execute(&queue.pool).await.unwrap();
        assert!(queue
            .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
            .await
            .unwrap()
            .is_empty());
        assert_eq!(
            queue.get(&expired.id).await.unwrap().unwrap().status,
            "failed"
        );
        assert!(queue.retry(&expired.id).await.unwrap());
        assert!(queue.finish(&next[0]).await.unwrap());
        let retried = queue
            .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Scrobbles, 2)
            .await
            .unwrap();
        assert_eq!(retried.len(), 1);
        assert_eq!(job_actor(&retried[0].payload), "did:plc:noisy");
        // A saturated scrobble actor doesn't occupy its background allocation.
        queue
            .enqueue(&kind, "background", "hash", r#"{"did":"did:plc:noisy"}"#)
            .await
            .unwrap();
        assert_eq!(
            queue
                .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Background, 2)
                .await
                .unwrap()
                .len(),
            1
        );
        // Old jobs without actor metadata are upgraded, including malformed DIDs.
        let legacy = queue
            .enqueue(&kind, "legacy", "hash", r#"{"did":"did:plc:legacy"}"#)
            .await
            .unwrap();
        sqlx::query("UPDATE rocksky_durable_jobs SET actor='' WHERE id=$1")
            .bind(&legacy.id)
            .execute(&queue.pool)
            .await
            .unwrap();
        queue.prepare_fairness(&kind).await.unwrap();
        queue.prepare_fairness(&kind).await.unwrap();
        let actor: String =
            sqlx::query_scalar("SELECT actor FROM rocksky_durable_jobs WHERE id=$1")
                .bind(&legacy.id)
                .fetch_one(&queue.pool)
                .await
                .unwrap();
        assert_eq!(actor, "did:plc:legacy");
        assert_eq!(
            queue
                .claim_fair_batch(&kind, 60, 3, 32, ClaimLane::Background, 2)
                .await
                .unwrap()
                .len(),
            1
        );
        assert!(queue
            .claim_fair_batch(&kind, 60, 3, 1, ClaimLane::All, 2)
            .await
            .is_err());
        assert!(queue
            .claim_fair_batch(&kind, 60, 3, 1, ClaimLane::Scrobbles, 0)
            .await
            .is_err());
        sqlx::query("DELETE FROM rocksky_durable_jobs WHERE kind=$1")
            .bind(&kind)
            .execute(&queue.pool)
            .await
            .unwrap();
        sqlx::query("DELETE FROM rocksky_durable_actors WHERE kind=$1")
            .bind(&kind)
            .execute(&queue.pool)
            .await
            .unwrap();
    }

    #[test]
    fn missing_or_invalid_dids_share_a_bounded_bucket() {
        for payload in ["invalid", "{}", r#"{"did":42}"#, r#"{"did":""}"#] {
            assert_eq!(job_actor(payload), "unknown");
        }
    }

    #[cfg(feature = "sqlite")]
    #[tokio::test]
    async fn sqlite_fairness_contract() {
        let dir = tempfile::tempdir().unwrap();
        contract(
            Queue::connect(&format!(
                "sqlite://{}?mode=rwc",
                dir.path().join("fair.sqlite").display()
            ))
            .await
            .unwrap(),
        )
        .await;
    }
    #[cfg(feature = "postgres")]
    #[tokio::test]
    #[ignore = "requires SUBMISSIONS_TEST_POSTGRES_URL"]
    async fn postgres_fairness_contract() {
        contract(
            Queue::connect(&std::env::var("SUBMISSIONS_TEST_POSTGRES_URL").unwrap())
                .await
                .unwrap(),
        )
        .await;
    }
}
