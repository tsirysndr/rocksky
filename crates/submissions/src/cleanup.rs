//! Bounded retention for completed jobs. Failed jobs require explicit operator action.
use crate::Queue;
use anyhow::{ensure, Context, Result};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy)]
pub struct CleanupSettings {
    pub enabled: bool,
    pub completed_retention_seconds: i64,
    /// Total time from completion, not additional time after compaction. Zero = forever.
    pub dedup_retention_seconds: i64,
    pub interval_seconds: u64,
    pub batch_size: i64,
}

impl Default for CleanupSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            completed_retention_seconds: 7 * 86400,
            dedup_retention_seconds: 90 * 86400,
            interval_seconds: 300,
            batch_size: 500,
        }
    }
}

impl CleanupSettings {
    pub fn from_env() -> Result<Self> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self> {
        let mut settings = Self::default();
        if let Some(value) = get("SUBMISSIONS_CLEANUP_ENABLED") {
            settings.enabled = value
                .parse()
                .context("SUBMISSIONS_CLEANUP_ENABLED must be true or false")?;
        }
        for (name, target) in [
            (
                "SUBMISSIONS_COMPLETED_RETENTION_SECONDS",
                &mut settings.completed_retention_seconds,
            ),
            (
                "SUBMISSIONS_DEDUP_RETENTION_SECONDS",
                &mut settings.dedup_retention_seconds,
            ),
            ("SUBMISSIONS_CLEANUP_BATCH_SIZE", &mut settings.batch_size),
        ] {
            if let Some(value) = get(name) {
                *target = value.parse().with_context(|| format!("invalid {name}"))?;
            }
        }
        if let Some(value) = get("SUBMISSIONS_CLEANUP_INTERVAL_SECONDS") {
            settings.interval_seconds = value
                .parse()
                .context("invalid SUBMISSIONS_CLEANUP_INTERVAL_SECONDS")?;
        }
        settings.validate()?;
        Ok(settings)
    }

    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.completed_retention_seconds > 0,
            "completed retention must be positive"
        );
        ensure!(
            self.dedup_retention_seconds == 0
                || self.dedup_retention_seconds > self.completed_retention_seconds,
            "dedup retention must be zero (forever) or greater than completed retention"
        );
        ensure!(
            (1..=10000).contains(&self.batch_size),
            "cleanup batch size must be 1..10000"
        );
        ensure!(
            (1..=86400).contains(&self.interval_seconds),
            "cleanup interval must be 1..86400 seconds"
        );
        Ok(())
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct CleanupResult {
    pub compacted: u64,
    pub deleted: u64,
}

pub async fn run(queue: Queue, settings: CleanupSettings, shutdown: CancellationToken) {
    if !settings.enabled {
        return;
    }
    tracing::info!(?settings, "durable queue cleanup enabled");
    let mut ticks = tokio::time::interval(Duration::from_secs(settings.interval_seconds));
    ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            biased;
            _ = shutdown.cancelled() => break,
            _ = ticks.tick() => {},
        }
        // Complete the bounded transaction before stopping; never do network
        // publication under these locks. Multiple replicas may clean safely.
        match queue.cleanup(settings).await {
            Ok(result) if result.compacted + result.deleted > 0 => {
                tracing::info!(
                    compacted = result.compacted,
                    deleted = result.deleted,
                    "durable queue cleanup completed"
                );
            }
            Ok(_) => {}
            Err(error) => tracing::error!(%error, "durable queue cleanup failed; will retry"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retention_configuration() {
        let defaults = CleanupSettings::from_lookup(|_| None).unwrap();
        assert_eq!(defaults.completed_retention_seconds, 604800);
        assert_eq!(defaults.dedup_retention_seconds, 7776000);
        for (name, value) in [
            ("SUBMISSIONS_CLEANUP_ENABLED", "yes"),
            ("SUBMISSIONS_COMPLETED_RETENTION_SECONDS", "0"),
            ("SUBMISSIONS_COMPLETED_RETENTION_SECONDS", "-1"),
            ("SUBMISSIONS_DEDUP_RETENTION_SECONDS", "604800"),
            ("SUBMISSIONS_DEDUP_RETENTION_SECONDS", "-1"),
            ("SUBMISSIONS_CLEANUP_INTERVAL_SECONDS", "0"),
            ("SUBMISSIONS_CLEANUP_BATCH_SIZE", "10001"),
        ] {
            assert!(
                CleanupSettings::from_lookup(|key| (key == name).then(|| value.into())).is_err(),
                "{name}"
            );
        }
        let settings = CleanupSettings::from_lookup(|key| match key {
            "SUBMISSIONS_CLEANUP_ENABLED" => Some("false".into()),
            "SUBMISSIONS_DEDUP_RETENTION_SECONDS" => Some("0".into()),
            _ => None,
        })
        .unwrap();
        assert!(!settings.enabled);
        assert_eq!(settings.dedup_retention_seconds, 0);
    }
}
