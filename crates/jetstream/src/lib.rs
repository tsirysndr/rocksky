use anyhow::Error;
use std::{env, sync::Arc};
use subscriber::MultiSourceSubscriber;
use tokio::sync::Mutex;

use crate::webhook_worker::{start_worker, AppState};

pub mod profile;
pub mod repo;
pub mod subscriber;
pub mod types;
pub mod webhook;
pub mod webhook_worker;
pub mod xata;

pub async fn subscribe() -> Result<(), Error> {
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let redis = redis::Client::open(redis_url)?;
    let queue_key =
        env::var("WEBHOOK_QUEUE_KEY").unwrap_or_else(|_| "rocksky:webhook_queue".to_string());

    let state = Arc::new(Mutex::new(AppState { redis, queue_key }));

    start_worker(state.clone()).await?;

    let servers = resolve_servers();
    tracing::info!(count = servers.len(), ?servers, "Configured jetstream sources");

    let subscriber = MultiSourceSubscriber::new(servers);
    subscriber.run(state).await
}

/// Reads `JETSTREAM_SERVERS` (comma-separated) when present, otherwise falls
/// back to the legacy single `JETSTREAM_SERVER`, otherwise to the upstream
/// default. Duplicates and empty entries are stripped so misconfigured env
/// (`a,,a`) doesn't open redundant connections.
fn resolve_servers() -> Vec<String> {
    if let Ok(raw) = env::var("JETSTREAM_SERVERS") {
        let mut seen = Vec::new();
        for part in raw.split(',') {
            let trimmed = part.trim().trim_end_matches('/').to_string();
            if !trimmed.is_empty() && !seen.contains(&trimmed) {
                seen.push(trimmed);
            }
        }
        if !seen.is_empty() {
            return seen;
        }
    }

    let single = env::var("JETSTREAM_SERVER")
        .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
    vec![single.trim_end_matches('/').to_string()]
}
