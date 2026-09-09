//! The analysis cache — SQLite via sqlx.
//!
//! Analysing a track means downloading and decoding all of it, which is far
//! too expensive to repeat: the same album gets queued again, the daemon
//! restarts, the agent plans another set from the same library. So every
//! result is keyed by track id and kept.
//!
//! Rows are versioned by [`SCHEMA_VERSION`]: when the analysis itself changes
//! shape, stale rows are ignored rather than migrated, and re-computed on
//! demand.

use std::path::Path;
use std::str::FromStr;

use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

use super::TrackAnalysis;

/// Bump when [`TrackAnalysis`] gains or changes a field that older rows cannot
/// answer for.
pub const SCHEMA_VERSION: i64 = 1;

#[derive(Clone)]
pub struct AnalysisCache {
    pool: SqlitePool,
}

impl AnalysisCache {
    /// Open (creating if needed) the cache database at `path`.
    pub async fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
            .with_context(|| format!("bad cache path {}", path.display()))?
            .create_if_missing(true)
            // WAL so the daemon analysing the next track never blocks a read
            // by `playerd mcp` running beside it on the same box.
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(std::time::Duration::from_secs(5));

        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await
            .with_context(|| format!("opening {}", path.display()))?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS track_analysis (
                track_key      TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL,
                analyzed_at    INTEGER NOT NULL,
                analysis       TEXT NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .context("creating the analysis table")?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS track_analysis_analyzed_at
             ON track_analysis (analyzed_at)",
        )
        .execute(&pool)
        .await
        .context("creating the analysis index")?;

        Ok(AnalysisCache { pool })
    }

    /// The cached analysis for `track_key`, if one was stored by this schema
    /// version. A row that fails to parse is treated as absent — a corrupt
    /// cache should cost a re-analysis, not an error.
    pub async fn get(&self, track_key: &str) -> Option<TrackAnalysis> {
        let row = sqlx::query(
            "SELECT analysis FROM track_analysis
             WHERE track_key = ?1 AND schema_version = ?2",
        )
        .bind(track_key)
        .bind(SCHEMA_VERSION)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| tracing::warn!("analysis cache read failed: {e}"))
        .ok()
        .flatten()?;

        let raw: String = row.try_get("analysis").ok()?;
        match serde_json::from_str(&raw) {
            Ok(analysis) => Some(analysis),
            Err(e) => {
                tracing::debug!("dropping unreadable cached analysis for {track_key}: {e}");
                None
            }
        }
    }

    pub async fn put(&self, track_key: &str, analysis: &TrackAnalysis) -> Result<()> {
        let raw = serde_json::to_string(analysis).context("serialising analysis")?;
        sqlx::query(
            "INSERT INTO track_analysis (track_key, schema_version, analyzed_at, analysis)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(track_key) DO UPDATE SET
                schema_version = excluded.schema_version,
                analyzed_at    = excluded.analyzed_at,
                analysis       = excluded.analysis",
        )
        .bind(track_key)
        .bind(SCHEMA_VERSION)
        .bind(analysis.analyzed_at)
        .bind(raw)
        .execute(&self.pool)
        .await
        .context("writing the analysis cache")?;
        Ok(())
    }

    /// How many tracks are cached under the current schema.
    pub async fn len(&self) -> u64 {
        sqlx::query("SELECT COUNT(*) AS n FROM track_analysis WHERE schema_version = ?1")
            .bind(SCHEMA_VERSION)
            .fetch_one(&self.pool)
            .await
            .ok()
            .and_then(|row| row.try_get::<i64, _>("n").ok())
            .unwrap_or(0) as u64
    }

    /// Drop rows from superseded schema versions, and trim the oldest entries
    /// past `keep`. Cheap enough to run at startup.
    pub async fn prune(&self, keep: u64) -> Result<u64> {
        let stale = sqlx::query("DELETE FROM track_analysis WHERE schema_version <> ?1")
            .bind(SCHEMA_VERSION)
            .execute(&self.pool)
            .await
            .context("pruning stale analyses")?
            .rows_affected();

        let excess = sqlx::query(
            "DELETE FROM track_analysis WHERE track_key IN (
                 SELECT track_key FROM track_analysis
                 ORDER BY analyzed_at DESC LIMIT -1 OFFSET ?1
             )",
        )
        .bind(keep as i64)
        .execute(&self.pool)
        .await
        .context("trimming the analysis cache")?
        .rows_affected();

        Ok(stale + excess)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> TrackAnalysis {
        TrackAnalysis {
            duration_ms: 210_000,
            sample_rate: 44_100,
            channels: 2,
            integrated_lufs: -9.5,
            true_peak: 1.02,
            recommended_gain_db: -1.2,
            target_lufs: -14.0,
            music_start_ms: 120,
            music_end_ms: 208_400,
            waveform: vec![1, 2, 3],
            bpm: Some(124.0),
            bpm_confidence: Some(0.8),
            tempo_stability: Some(0.9),
            musical_key: Some("A minor".into()),
            camelot: Some("8A".into()),
            key_root: Some(9),
            key_major: Some(false),
            loudness_range: 5.5,
            analyzed_at: 1_700_000_000,
        }
    }

    #[tokio::test]
    async fn round_trips_and_prunes() {
        let dir =
            std::env::temp_dir().join(format!("playerd-analysis-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let cache = AnalysisCache::open(&dir.join("analysis.db")).await.unwrap();

        assert!(cache.get("nope").await.is_none());
        cache.put("track-1", &sample()).await.unwrap();

        let got = cache.get("track-1").await.expect("cached");
        assert_eq!(got.bpm, Some(124.0));
        assert_eq!(got.camelot.as_deref(), Some("8A"));
        assert_eq!(got.music_end_ms, 208_400);

        // Re-analysing the same track replaces the row rather than duplicating.
        let mut newer = sample();
        newer.bpm = Some(126.0);
        cache.put("track-1", &newer).await.unwrap();
        assert_eq!(cache.len().await, 1);
        assert_eq!(cache.get("track-1").await.unwrap().bpm, Some(126.0));

        let mut older = sample();
        older.analyzed_at = 1;
        cache.put("track-2", &older).await.unwrap();
        assert_eq!(cache.len().await, 2);
        assert_eq!(cache.prune(1).await.unwrap(), 1);
        // The newest survives the trim.
        assert!(cache.get("track-1").await.is_some());
        assert!(cache.get("track-2").await.is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
