use anyhow::Error;
use std::{env, sync::Arc};
use subscriber::MultiSourceSubscriber;
use tokio::sync::Mutex;

use crate::webhook_worker::{start_worker, AppState};

pub mod event;
pub mod like;
pub mod playlist;
pub mod profile;
pub mod repo;
pub mod schema;
pub mod source;
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

    let state = Arc::new(Mutex::new(AppState::new(redis, queue_key)));

    let servers = source::configured_sources()?;
    start_worker(state.clone()).await?;
    tracing::info!(
        count = servers.len(),
        ?servers,
        "Configured jetstream sources"
    );

    let subscriber = MultiSourceSubscriber::with_sources(servers);
    subscriber.run(state).await
}
