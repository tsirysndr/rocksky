//! Optional, bounded Redis acceleration. Cache failures never fail matching.
use crate::{MatchRequest, MatchResponse, Status, POLICY_VERSION};
use redis::aio::{ConnectionManager, ConnectionManagerConfig};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::OnceCell;

const IO_TIMEOUT: Duration = Duration::from_millis(200);
const MAX_ENTRY_BYTES: usize = 2 * 1024 * 1024;

pub struct MatchCache {
    client: redis::Client,
    connection: OnceCell<ConnectionManager>,
    scope: String,
    pub ttl_seconds: u64,
    pub negative_ttl_seconds: u64,
}
impl MatchCache {
    pub fn new(
        url: &str,
        scope: &str,
        ttl_seconds: u64,
        negative_ttl_seconds: u64,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            client: redis::Client::open(url)?,
            connection: OnceCell::new(),
            scope: scope.to_owned(),
            ttl_seconds,
            negative_ttl_seconds,
        })
    }

    pub fn key(&self, request: &MatchRequest, providers: &[&str]) -> String {
        // Typed serialization is deterministic, includes every constraint, and
        // preserves version/edition words and literal artist credits.
        let bytes = serde_json::to_vec(&(
            POLICY_VERSION,
            &self.scope,
            self.ttl_seconds,
            self.negative_ttl_seconds,
            providers,
            request,
        ))
        .expect("matching requests contain only JSON-compatible values");
        format!("rocksky:matching:response:v1:{:x}", Sha256::digest(bytes))
    }

    async fn connection(&self) -> redis::RedisResult<ConnectionManager> {
        let manager = self
            .connection
            .get_or_try_init(|| async {
                ConnectionManager::new_with_config(
                    self.client.clone(),
                    ConnectionManagerConfig::new()
                        .set_number_of_retries(0)
                        .set_connection_timeout(IO_TIMEOUT)
                        .set_response_timeout(IO_TIMEOUT),
                )
                .await
            })
            .await?;
        Ok(manager.clone())
    }

    pub async fn get(&self, key: &str) -> Option<MatchResponse> {
        let result = tokio::time::timeout(IO_TIMEOUT, async {
            let mut connection = self.connection().await?;
            redis::cmd("GET")
                .arg(key)
                .query_async::<Option<String>>(&mut connection)
                .await
        })
        .await;
        match result {
            Ok(Ok(Some(value))) if value.len() <= MAX_ENTRY_BYTES => {
                let response: MatchResponse = serde_json::from_str(&value).ok()?;
                (response.policy_version == POLICY_VERSION
                    && response.warnings.is_empty()
                    && ((response.status == Status::Matched) == response.track.is_some()))
                .then_some(response)
            }
            Ok(Ok(_)) => None,
            _ => {
                tracing::warn!("matching cache read unavailable; using providers");
                None
            }
        }
    }

    pub async fn put(&self, key: &str, response: &MatchResponse) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let ttl = response_ttl(response, self.ttl_seconds, self.negative_ttl_seconds, now);
        if ttl == 0 {
            return;
        }
        let Ok(value) = serde_json::to_string(response) else {
            return;
        };
        if value.len() > MAX_ENTRY_BYTES {
            return;
        }
        let result = tokio::time::timeout(IO_TIMEOUT, async {
            let mut connection = self.connection().await?;
            redis::cmd("SETEX")
                .arg(key)
                .arg(ttl)
                .arg(value)
                .query_async::<()>(&mut connection)
                .await
        })
        .await;
        if !matches!(result, Ok(Ok(()))) {
            tracing::warn!("matching cache write unavailable; returning fresh result");
        }
    }
}

pub fn response_ttl(response: &MatchResponse, positive: u64, negative: u64, now: u64) -> u64 {
    if !response.warnings.is_empty() {
        return 0;
    }
    let mut ttl = if response.status == Status::Matched {
        positive
    } else {
        negative
    };
    for candidate in response
        .track
        .iter()
        .chain(response.candidates.iter().map(|c| &c.track))
    {
        let Some(preview) = &candidate.preview else {
            continue;
        };
        // Unknown signing schemes get a conservative short lifetime. Deezer's
        // hdnea tokens carry exp=<Unix seconds> inside the query-string value.
        let expiry = reqwest::Url::parse(preview).ok().and_then(|url| {
            url.query_pairs()
                .filter_map(|(key, value)| {
                    if key == "exp" || key == "expires" {
                        return value.parse::<u64>().ok();
                    }
                    value
                        .split('~')
                        .find_map(|part| part.strip_prefix("exp=")?.parse::<u64>().ok())
                })
                .min()
        });
        ttl = ttl.min(
            expiry
                .map(|expires| expires.saturating_sub(now.saturating_add(60)))
                .unwrap_or(300),
        );
    }
    ttl
}
