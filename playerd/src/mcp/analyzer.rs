//! Analysis, controller-side.
//!
//! The daemon analyses what it is about to play; the MCP server analyses what
//! an agent is *thinking about* playing. Same code, same cache format, same
//! keys — so when both run on one machine each one's work saves the other's.
//!
//! Tracks come from the library over their Subsonic stream URL, which means a
//! full download per track: expensive once, free forever after.

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use tokio::sync::Semaphore;

use crate::analysis::cache::AnalysisCache;
use crate::analysis::TrackAnalysis;
use crate::mcp::subsonic::{Song, Subsonic};

/// Whole tracks are downloaded to analyse them; a handful at a time keeps a
/// planning call off the wrong side of the library's bandwidth.
const CONCURRENCY: usize = 3;

/// Guardrail for `plan_set` and friends: past this the wait stops being worth
/// it, and a set that long was not going to be listened to anyway.
pub const MAX_BATCH: usize = 40;

const MAX_BYTES: usize = 200 * 1024 * 1024;

pub struct Analyzer {
    cache: AnalysisCache,
    http: reqwest::Client,
    target_lufs: f64,
    permits: Semaphore,
}

/// One track plus what the analysis found — or why it did not.
pub struct Analyzed {
    pub song: Song,
    pub analysis: Option<TrackAnalysis>,
    pub error: Option<String>,
}

impl Analyzer {
    pub fn new(cache: AnalysisCache, target_lufs: f64) -> Analyzer {
        Analyzer {
            cache,
            http: reqwest::Client::new(),
            target_lufs,
            permits: Semaphore::new(CONCURRENCY),
        }
    }

    /// The key the daemon writes under, so both processes share a cache.
    pub fn key_for(id: &str) -> String {
        format!("track:{id}")
    }

    /// Cached analysis only — no download, no decode.
    pub async fn cached(&self, id: &str) -> Option<TrackAnalysis> {
        self.cache.get(&Self::key_for(id)).await
    }

    /// Analyse one track, using the cache unless `refresh`.
    pub async fn analyze(
        &self,
        subsonic: &Subsonic,
        song: &Song,
        refresh: bool,
    ) -> Result<TrackAnalysis> {
        let key = Self::key_for(&song.id);
        if !refresh {
            if let Some(cached) = self.cache.get(&key).await {
                return Ok(cached);
            }
        }

        let url = subsonic.stream_url(&song.id);
        let _permit = self.permits.acquire().await.context("analyzer shut down")?;
        let response = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("streaming {}", song.title))?;
        if !response.status().is_success() {
            bail!("streaming {}: HTTP {}", song.title, response.status());
        }
        let bytes = response.bytes().await.context("reading audio")?;
        if bytes.len() > MAX_BYTES {
            bail!(
                "{} is {} bytes, too large to analyse",
                song.title,
                bytes.len()
            );
        }

        let hint = song.suffix.clone();
        let target = self.target_lufs;
        let analysis = tokio::task::spawn_blocking(move || {
            crate::analysis::analyze(bytes.to_vec(), hint.as_deref(), target)
        })
        .await
        .context("analysis task panicked")??;

        if let Err(e) = self.cache.put(&key, &analysis).await {
            tracing::warn!("could not cache analysis for {}: {e:#}", song.id);
        }
        Ok(analysis)
    }

    /// Analyse a batch concurrently, never failing the batch for one track.
    /// The caller's order is preserved — a planner reads it as the candidate
    /// list it handed in.
    pub async fn analyze_all(
        self: &Arc<Self>,
        subsonic: &Arc<Subsonic>,
        songs: Vec<Song>,
        refresh: bool,
    ) -> Vec<Analyzed> {
        let mut tasks = tokio::task::JoinSet::new();
        for (index, song) in songs.into_iter().enumerate() {
            let analyzer = self.clone();
            let subsonic = subsonic.clone();
            tasks.spawn(async move {
                let analyzed = match analyzer.analyze(&subsonic, &song, refresh).await {
                    Ok(analysis) => Analyzed {
                        song,
                        analysis: Some(analysis),
                        error: None,
                    },
                    Err(e) => Analyzed {
                        song,
                        analysis: None,
                        error: Some(format!("{e:#}")),
                    },
                };
                (index, analyzed)
            });
        }

        let mut done: Vec<(usize, Analyzed)> = Vec::new();
        while let Some(joined) = tasks.join_next().await {
            match joined {
                Ok(result) => done.push(result),
                Err(e) => tracing::warn!("analysis task failed: {e}"),
            }
        }
        done.sort_by_key(|(index, _)| *index);
        done.into_iter().map(|(_, analyzed)| analyzed).collect()
    }
}
