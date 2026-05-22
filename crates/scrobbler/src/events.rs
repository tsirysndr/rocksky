use std::{collections::HashMap, env, sync::Arc};

use tokio::{sync::Mutex, task::AbortHandle};

pub struct Events {
    pub nc: async_nats::Client,
    timers: Arc<Mutex<HashMap<String, AbortHandle>>>,
}

impl Events {
    pub fn new(nc: async_nats::Client) -> Self {
        Self {
            nc,
            timers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn emit_song_changed(&self, did: &str, track: serde_json::Value) {
        let payload = serde_json::json!({ "did": did, "track": track })
            .to_string()
            .into_bytes();
        if let Err(e) = self.nc.publish("rocksky.song.changed", payload.into()).await {
            tracing::error!(error = %e, "Failed to publish rocksky.song.changed");
        }
    }

    pub async fn schedule_song_stopped(&self, did: String, duration_ms: u64) {
        let idle_ms = env::var("NATS_IDLE_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30_000);

        let delay = std::time::Duration::from_millis(duration_ms + idle_ms);
        let nc = self.nc.clone();
        let did_clone = did.clone();

        let handle = tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            let payload = serde_json::json!({ "did": did_clone })
                .to_string()
                .into_bytes();
            if let Err(e) = nc.publish("rocksky.song.stopped", payload.into()).await {
                tracing::error!(error = %e, "Failed to publish rocksky.song.stopped");
            }
        });

        let mut timers = self.timers.lock().await;
        if let Some(old) = timers.insert(did, handle.abort_handle()) {
            old.abort();
        }
    }
}
