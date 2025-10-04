use anyhow::Error;
use std::{env, sync::Arc};
use subscriber::ScrobbleSubscriber;
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

    let jetstream_server = env::var("JETSTREAM_SERVER")
        .unwrap_or_else(|_| "wss://jetstream2.us-west.bsky.network".to_string());
    let url = format!(
        "{}/subscribe?wantedCollections=app.rocksky.*",
        jetstream_server
    );
    let subscriber = ScrobbleSubscriber::new(&url);

    // loop, reconnecting on failure
    loop {
        match subscriber.run(state.clone()).await {
            Ok(_) => tracing::info!("Connected to jetstream server"),
            Err(e) => {
                tracing::error!(error = %e, "Failed to connect to jetstream server, retrying in 1 second...");
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                continue;
            }
        }
        break;
    }

    Ok(())
}
