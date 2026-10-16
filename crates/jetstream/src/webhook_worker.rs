use crate::webhook::discord::{self, model::WebhookEnvelope};
use anyhow::Error;
use std::{
    env,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{sync::Mutex, time::interval};

#[derive(Clone)]
pub struct AppState {
    pub redis: redis::Client,
    pub queue_key: String,
}

pub async fn start_worker(state: Arc<Mutex<AppState>>) -> Result<(), Error> {
    let max_rps: u32 = env::var("MAX_REQUESTS_PER_SEC")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);
    let max_embeds_per: usize = env::var("MAX_EMBEDS_PER_REQUEST")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10);
    let batch_window_ms: u64 = env::var("BATCH_WINDOW_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(400);
    let discord_webhook_url = env::var("DISCORD_WEBHOOK_URL").unwrap_or(String::new());

    tokio::spawn(run_worker(
        state.clone(),
        discord_webhook_url,
        max_rps,
        max_embeds_per,
        Duration::from_millis(batch_window_ms),
    ));

    Ok(())
}

async fn run_worker(
    st: Arc<Mutex<AppState>>,
    discord_webhook_url: String,
    max_rps: u32,
    max_embeds_per: usize,
    batch_window: Duration,
) {
    let http = reqwest::Client::builder()
        .user_agent("rocksky-discord-bridge/0.1")
        .build()
        .expect("http client");

    let mut tokens = max_rps as i32;
    let mut refill = interval(Duration::from_secs(1));
    refill.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = refill.tick() => {
                tokens = (tokens + max_rps as i32).min(max_rps as i32);
            }
            _ = tokio::time::sleep(Duration::from_millis(10)) => { /* tick */ }
        }

        if tokens <= 0 {
            continue;
        }

        let start = Instant::now();
        let mut embeds = Vec::with_capacity(max_embeds_per);

        while embeds.len() < max_embeds_per && start.elapsed() < batch_window {
            match brpop_once(st.clone(), 1).await {
                Ok(Some(json_str)) => {
                    if let Ok(env) = serde_json::from_str::<WebhookEnvelope>(&json_str) {
                        embeds.push(discord::embed_from_scrobble(&env.data, &env.id));
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    tracing::error!(error = %e, "Failed to pop from Redis");
                    break;
                }
            }
        }

        if embeds.is_empty() {
            tokio::time::sleep(Duration::from_millis(50)).await;
            continue;
        }

        tokens -= 1;

        if let Err(e) = discord::post_embeds(&http, &discord_webhook_url, embeds).await {
            tracing::error!(error = %e, "Failed to post to Discord webhook");
        }
    }
}

async fn brpop_once(
    state: Arc<Mutex<AppState>>,
    timeout_secs: u64,
) -> redis::RedisResult<Option<String>> {
    let AppState {
        redis: client,
        queue_key: key,
    } = state.lock().await.clone();
    // Release the state lock before connection setup and the blocking pop.
    // Producers must remain able to enqueue while the consumer waits for data.
    let mut conn = client.get_multiplexed_async_connection().await?;
    let res: Option<(String, String)> = redis::cmd("BRPOP")
        .arg(&key)
        .arg(timeout_secs as usize)
        .query_async(&mut conn)
        .await?;
    Ok(res.map(|(_, v)| v))
}

pub async fn push_to_queue(
    state: Arc<Mutex<AppState>>,
    item: &WebhookEnvelope,
) -> redis::RedisResult<()> {
    let payload = serde_json::to_string(item).unwrap();
    let AppState {
        redis: client,
        queue_key: key,
    } = state.lock().await.clone();
    let mut conn = client.get_multiplexed_async_connection().await?;
    let _: () = redis::pipe()
        .cmd("RPUSH")
        .arg(&key)
        .arg(payload)
        .ignore()
        .cmd("EXPIRE")
        .arg(&key)
        .arg(60 * 60 * 24) // 24h
        .query_async(&mut conn)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{net::TcpListener, time::timeout};

    // A stalled Redis handshake must not monopolize the shared state. This
    // exercises the real connection path without requiring a Redis daemon.
    async fn stalled_redis_does_not_lock_state(producer: bool) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client =
            redis::Client::open(format!("redis://{}", listener.local_addr().unwrap())).unwrap();
        let state = Arc::new(Mutex::new(AppState {
            redis: client,
            queue_key: "test".into(),
        }));
        let worker_state = state.clone();
        let worker = tokio::spawn(async move {
            if producer {
                let item: WebhookEnvelope = serde_json::from_value(serde_json::json!({
                    "id":"test", "data": {
                        "user":{"did":"did:test","display_name":"test","handle":"test","avatar_url":""},
                        "track":{"title":"test","artist":"test","album":"test","duration":1},
                        "played_at":"2026-01-01T00:00:00Z"
                    }
                })).unwrap();
                let _ = push_to_queue(worker_state, &item).await;
            } else {
                let _ = brpop_once(worker_state, 1).await;
            }
        });
        let (_socket, _) = timeout(Duration::from_secs(5), listener.accept())
            .await
            .unwrap()
            .unwrap();
        let unlocked = timeout(Duration::from_millis(500), state.lock())
            .await
            .is_ok();
        worker.abort();
        let _ = worker.await;
        assert!(unlocked, "Redis I/O held the shared webhook state lock");
    }

    #[tokio::test]
    async fn stalled_consumer_does_not_block_producers() {
        stalled_redis_does_not_lock_state(false).await;
    }

    #[tokio::test]
    async fn stalled_producer_does_not_block_other_producers() {
        stalled_redis_does_not_lock_state(true).await;
    }
}
