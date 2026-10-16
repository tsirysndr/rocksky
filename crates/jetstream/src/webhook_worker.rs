use crate::webhook::discord::{self, model::WebhookEnvelope};
use anyhow::Error;
use std::{
    env,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    sync::{Mutex, OnceCell},
    time::interval,
};

#[derive(Clone)]
pub struct AppState {
    pub redis: redis::Client,
    pub queue_key: String,
    producer: Arc<OnceCell<redis::aio::ConnectionManager>>,
    consumer: Arc<OnceCell<redis::aio::ConnectionManager>>,
}

impl AppState {
    pub fn new(redis: redis::Client, queue_key: String) -> Self {
        Self {
            redis,
            queue_key,
            producer: Arc::new(OnceCell::new()),
            consumer: Arc::new(OnceCell::new()),
        }
    }

    async fn connection(
        &self,
        consumer: bool,
    ) -> redis::RedisResult<redis::aio::ConnectionManager> {
        let slot = if consumer {
            &self.consumer
        } else {
            &self.producer
        };
        slot.get_or_try_init(|| async {
            let config = redis::aio::ConnectionManagerConfig::new()
                .set_connection_timeout(Duration::from_secs(5))
                .set_response_timeout(Duration::from_secs(5));
            redis::aio::ConnectionManager::new_with_config(self.redis.clone(), config).await
        })
        .await
        .cloned()
    }
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
    let state = state.lock().await.clone();
    let key = &state.queue_key;
    // Release the state lock before connection setup and the blocking pop.
    // Producers must remain able to enqueue while the consumer waits for data.
    let mut conn = state.connection(true).await?;
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
    let state = state.lock().await.clone();
    let key = &state.queue_key;
    let mut conn = state.connection(false).await?;
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
        let state = Arc::new(Mutex::new(AppState::new(client, "test".into())));
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
    async fn reuses_connections_and_enqueues_while_consumer_is_blocked() {
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = Arc::new(Mutex::new(AppState::new(
            redis::Client::open(format!("redis://{}", listener.local_addr().unwrap())).unwrap(),
            "test".into(),
        )));
        let accepted = Arc::new(AtomicUsize::new(0));
        let pushes = Arc::new(AtomicUsize::new(0));
        let disconnect = Arc::new(AtomicBool::new(false));
        let blocked = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let server = tokio::spawn({
            let accepted = accepted.clone();
            let pushes = pushes.clone();
            let disconnect = disconnect.clone();
            let blocked = blocked.clone();
            let release = release.clone();
            async move {
                let mut connections = tokio::task::JoinSet::new();
                loop {
                    let (socket, _) = listener.accept().await.unwrap();
                    accepted.fetch_add(1, Ordering::SeqCst);
                    let pushes = pushes.clone();
                    let disconnect = disconnect.clone();
                    let blocked = blocked.clone();
                    let release = release.clone();
                    connections.spawn(async move {
                        let mut socket = BufReader::new(socket);
                        loop {
                            let mut line = String::new();
                            if socket.read_line(&mut line).await.unwrap() == 0 {
                                break;
                            }
                            let count: usize =
                                line.trim().strip_prefix('*').unwrap().parse().unwrap();
                            let mut args = Vec::new();
                            for _ in 0..count {
                                line.clear();
                                socket.read_line(&mut line).await.unwrap();
                                let len: usize =
                                    line.trim().strip_prefix('$').unwrap().parse().unwrap();
                                let mut data = vec![0; len + 2];
                                socket.read_exact(&mut data).await.unwrap();
                                args.push(String::from_utf8(data[..len].to_vec()).unwrap());
                            }
                            let response: &[u8] = match args[0].as_str() {
                                "BRPOP" => {
                                    blocked.notify_one();
                                    release.notified().await;
                                    b"*-1\r\n"
                                }
                                "RPUSH" => {
                                    if disconnect.swap(false, Ordering::SeqCst) {
                                        return;
                                    }
                                    pushes.fetch_add(1, Ordering::SeqCst);
                                    b":1\r\n"
                                }
                                "EXPIRE" => b":1\r\n",
                                // redis-rs connection initialization.
                                "CLIENT" | "SELECT" => b"+OK\r\n",
                                other => panic!("unexpected Redis command: {other}"),
                            };
                            socket.get_mut().write_all(response).await.unwrap();
                        }
                    });
                }
            }
        });
        let consumer = tokio::spawn(brpop_once(state.clone(), 1));
        timeout(Duration::from_secs(5), blocked.notified())
            .await
            .unwrap();
        let item: WebhookEnvelope = serde_json::from_value(serde_json::json!({
            "id":"test", "data": {
                "user":{"did":"did:test","display_name":"test","handle":"test","avatar_url":""},
                "track":{"title":"test","artist":"test","album":"test","duration":1},
                "played_at":"2026-01-01T00:00:00Z"
            }
        }))
        .unwrap();
        let mut producers = tokio::task::JoinSet::new();
        for _ in 0..10 {
            let state = state.clone();
            let item = item.clone();
            producers.spawn(async move {
                push_to_queue(state, &item).await.unwrap();
            });
        }
        timeout(Duration::from_secs(3), async {
            while let Some(result) = producers.join_next().await {
                result.unwrap();
            }
        })
        .await
        .expect("producer blocked behind BRPOP");
        assert_eq!(pushes.load(Ordering::SeqCst), 10);
        assert_eq!(accepted.load(Ordering::SeqCst), 2);
        // A broken producer socket must recover without replacing AppState.
        disconnect.store(true, Ordering::SeqCst);
        assert!(push_to_queue(state.clone(), &item).await.is_err());
        timeout(Duration::from_secs(5), push_to_queue(state.clone(), &item))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(pushes.load(Ordering::SeqCst), 11);
        assert_eq!(accepted.load(Ordering::SeqCst), 3);
        release.notify_one();
        assert!(consumer.await.unwrap().unwrap().is_none());
        release.notify_one();
        assert!(brpop_once(state, 1).await.unwrap().is_none());
        assert_eq!(
            accepted.load(Ordering::SeqCst),
            3,
            "consumer must also reuse its connection"
        );
        server.abort();
        let _ = server.await;
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
