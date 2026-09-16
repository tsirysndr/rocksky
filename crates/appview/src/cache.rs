//! The response cache.
//!
//! `apps/api` requires Redis for this. Here Redis is optional: when
//! `REDIS_URL` is set the cache is shared (so several instances behind a load
//! balancer see each other's entries), and otherwise an in-process TTL map does
//! the same job for a single binary. Handlers call the same methods either way.
//!
//! Cache misses are never fatal. Every operation swallows backend errors and
//! reports "not cached" — a dead Redis must degrade to slower responses, not to
//! failed requests.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Entries beyond this are pruned oldest-expiry-first on insert. The cached
/// values are small JSON views, so this is a memory ceiling, not a hit-rate
/// tuning knob.
const MAX_IN_PROCESS_ENTRIES: usize = 20_000;

/// How long to wait for Redis at startup before giving up and running
/// in-process. Short on purpose: the cache is an accelerator, so a slow or
/// absent Redis must cost seconds, not a stalled boot.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
enum Backend {
    InProcess(Arc<Mutex<HashMap<String, Entry>>>),
    Redis(redis::aio::ConnectionManager),
}

struct Entry {
    value: String,
    expires_at: Instant,
}

#[derive(Clone)]
pub struct Cache {
    backend: Backend,
}

impl Cache {
    /// Connects to Redis when a URL is given, falling back to the in-process
    /// map if the connection cannot be established. A self-hosted instance that
    /// mistyped `REDIS_URL` should still serve traffic.
    pub async fn new(redis_url: Option<&str>) -> Self {
        let Some(url) = redis_url else {
            return Self::in_process();
        };

        // ConnectionManager retries with backoff, which on an unreachable host
        // means minutes of it. Startup must not block on a mistyped URL.
        match tokio::time::timeout(CONNECT_TIMEOUT, Self::connect_redis(url)).await {
            Ok(Ok(cache)) => {
                tracing::info!("using Redis for the response cache");
                cache
            }
            Ok(Err(err)) => {
                tracing::warn!(
                    error = %err,
                    "could not reach Redis; falling back to the in-process cache"
                );
                Self::in_process()
            }
            Err(_) => {
                tracing::warn!(
                    timeout = ?CONNECT_TIMEOUT,
                    "Redis did not answer in time; falling back to the in-process cache"
                );
                Self::in_process()
            }
        }
    }

    async fn connect_redis(url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(url)?;
        let manager = redis::aio::ConnectionManager::new(client).await?;
        Ok(Self {
            backend: Backend::Redis(manager),
        })
    }

    pub fn in_process() -> Self {
        Self {
            backend: Backend::InProcess(Arc::new(Mutex::new(HashMap::new()))),
        }
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        match &self.backend {
            Backend::InProcess(map) => {
                let mut map = map.lock().ok()?;
                let entry = map.get(key)?;
                if entry.expires_at <= Instant::now() {
                    map.remove(key);
                    return None;
                }
                Some(entry.value.clone())
            }
            Backend::Redis(manager) => {
                let mut conn = manager.clone();
                match redis::cmd("GET").arg(key).query_async(&mut conn).await {
                    Ok(value) => value,
                    Err(err) => {
                        tracing::debug!(error = %err, key, "cache read failed");
                        None
                    }
                }
            }
        }
    }

    pub async fn set_ex(&self, key: &str, ttl: Duration, value: &str) {
        match &self.backend {
            Backend::InProcess(map) => {
                let Ok(mut map) = map.lock() else { return };
                if map.len() >= MAX_IN_PROCESS_ENTRIES {
                    prune(&mut map);
                }
                map.insert(
                    key.to_string(),
                    Entry {
                        value: value.to_string(),
                        expires_at: Instant::now() + ttl,
                    },
                );
            }
            Backend::Redis(manager) => {
                let mut conn = manager.clone();
                let result: redis::RedisResult<()> = redis::cmd("SETEX")
                    .arg(key)
                    .arg(ttl.as_secs().max(1))
                    .arg(value)
                    .query_async(&mut conn)
                    .await;
                if let Err(err) = result {
                    tracing::debug!(error = %err, key, "cache write failed");
                }
            }
        }
    }

    /// Claims `key` if nobody holds it, returning whether this caller won.
    ///
    /// The one cache operation whose *result* matters rather than its value:
    /// it is a lock. Several sources can report the same listen within the
    /// same second — a Spotify webhook, a Last.fm mirror and navidrome all
    /// firing at once — and each would publish its own ATProto record. The
    /// database's uniqueness catches the duplicate rows, but by then the
    /// duplicate records are already in the user's repository, where nothing
    /// removes them.
    ///
    /// With Redis this is `SET NX EX`, which is atomic across processes. With
    /// the in-process cache it is atomic within one, which is all a single
    /// binary needs — and a self-hosted instance is a single binary.
    ///
    /// A cache that cannot be reached answers `true`: refusing the write would
    /// turn a lost Redis into lost scrobbles, which is far worse than a
    /// duplicate record.
    pub async fn claim(&self, key: &str, ttl: Duration) -> bool {
        match &self.backend {
            Backend::InProcess(map) => {
                let Ok(mut map) = map.lock() else {
                    return true;
                };
                if let Some(entry) = map.get(key) {
                    if entry.expires_at > Instant::now() {
                        return false;
                    }
                }
                if map.len() >= MAX_IN_PROCESS_ENTRIES {
                    prune(&mut map);
                }
                map.insert(
                    key.to_string(),
                    Entry {
                        value: "1".to_string(),
                        expires_at: Instant::now() + ttl,
                    },
                );
                true
            }
            Backend::Redis(manager) => {
                let mut conn = manager.clone();
                let result: redis::RedisResult<Option<String>> = redis::cmd("SET")
                    .arg(key)
                    .arg("1")
                    .arg("NX")
                    .arg("EX")
                    .arg(ttl.as_secs().max(1))
                    .query_async(&mut conn)
                    .await;

                match result {
                    // `SET NX` answers OK when it set, nil when it did not.
                    Ok(Some(_)) => true,
                    Ok(None) => false,
                    Err(err) => {
                        tracing::warn!(
                            error = %err,
                            key,
                            "could not reach the cache to take a lock; proceeding \
                             rather than dropping the write"
                        );
                        true
                    }
                }
            }
        }
    }

    /// Reads and deserializes a cached view. A value that no longer parses (the
    /// shape changed between releases) counts as a miss rather than an error.
    pub async fn get_json<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let raw = self.get(key).await?;
        match serde_json::from_str(&raw) {
            Ok(value) => Some(value),
            Err(err) => {
                tracing::debug!(error = %err, key, "discarding unparseable cache entry");
                None
            }
        }
    }

    pub async fn set_json<T: serde::Serialize>(&self, key: &str, ttl: Duration, value: &T) {
        match serde_json::to_string(value) {
            Ok(raw) => self.set_ex(key, ttl, &raw).await,
            Err(err) => tracing::debug!(error = %err, key, "could not serialize cache entry"),
        }
    }

    /// Increments a counter and returns the new value, used for the cache
    /// version keys that invalidate feed reads in bulk.
    pub async fn incr(&self, key: &str, ttl: Duration) -> i64 {
        match &self.backend {
            Backend::InProcess(map) => {
                let Ok(mut map) = map.lock() else { return 0 };
                let next = map
                    .get(key)
                    .filter(|e| e.expires_at > Instant::now())
                    .and_then(|e| e.value.parse::<i64>().ok())
                    .unwrap_or(0)
                    + 1;
                map.insert(
                    key.to_string(),
                    Entry {
                        value: next.to_string(),
                        expires_at: Instant::now() + ttl,
                    },
                );
                next
            }
            Backend::Redis(manager) => {
                let mut conn = manager.clone();
                match redis::cmd("INCR").arg(key).query_async(&mut conn).await {
                    Ok(next) => next,
                    Err(err) => {
                        tracing::debug!(error = %err, key, "cache incr failed");
                        0
                    }
                }
            }
        }
    }

    pub async fn delete(&self, key: &str) {
        match &self.backend {
            Backend::InProcess(map) => {
                if let Ok(mut map) = map.lock() {
                    map.remove(key);
                }
            }
            Backend::Redis(manager) => {
                let mut conn = manager.clone();
                let result: redis::RedisResult<()> =
                    redis::cmd("DEL").arg(key).query_async(&mut conn).await;
                if let Err(err) = result {
                    tracing::debug!(error = %err, key, "cache delete failed");
                }
            }
        }
    }
}

/// Drops expired entries, then — if that freed nothing — the soonest-to-expire
/// half. Without the second step a cache full of long-TTL entries would stop
/// accepting writes.
fn prune(map: &mut HashMap<String, Entry>) {
    let now = Instant::now();
    map.retain(|_, entry| entry.expires_at > now);

    if map.len() < MAX_IN_PROCESS_ENTRIES {
        return;
    }
    let mut expiries: Vec<Instant> = map.values().map(|e| e.expires_at).collect();
    expiries.sort_unstable();
    let cutoff = expiries[expiries.len() / 2];
    map.retain(|_, entry| entry.expires_at > cutoff);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct View {
        scrobbles: Vec<String>,
    }

    #[tokio::test]
    async fn round_trips_json() {
        let cache = Cache::in_process();
        let view = View {
            scrobbles: vec!["a".into(), "b".into()],
        };

        assert!(cache.get_json::<View>("k").await.is_none());
        cache.set_json("k", Duration::from_secs(30), &view).await;
        assert_eq!(cache.get_json::<View>("k").await, Some(view));
    }

    #[tokio::test]
    async fn expired_entries_read_as_a_miss() {
        let cache = Cache::in_process();
        cache.set_ex("k", Duration::from_millis(1), "v").await;
        tokio::time::sleep(Duration::from_millis(5)).await;
        assert_eq!(cache.get("k").await, None);
    }

    #[tokio::test]
    async fn unparseable_entries_read_as_a_miss() {
        let cache = Cache::in_process();
        cache
            .set_ex("k", Duration::from_secs(30), "{not json")
            .await;
        assert!(cache.get_json::<View>("k").await.is_none());
    }

    #[tokio::test]
    async fn incr_counts_up_from_absent() {
        let cache = Cache::in_process();
        assert_eq!(cache.incr("v", Duration::from_secs(60)).await, 1);
        assert_eq!(cache.incr("v", Duration::from_secs(60)).await, 2);
    }

    #[tokio::test]
    async fn delete_removes_the_entry() {
        let cache = Cache::in_process();
        cache.set_ex("k", Duration::from_secs(60), "v").await;
        cache.delete("k").await;
        assert_eq!(cache.get("k").await, None);
    }

    #[tokio::test]
    async fn an_unreachable_redis_falls_back_instead_of_failing() {
        // Port 1 refuses connections; the cache must still be usable.
        let cache = Cache::new(Some("redis://127.0.0.1:1")).await;
        cache.set_ex("k", Duration::from_secs(60), "v").await;
        assert_eq!(cache.get("k").await, Some("v".to_string()));
    }

    #[test]
    fn pruning_makes_room_even_when_nothing_has_expired() {
        let mut map = HashMap::new();
        for i in 0..MAX_IN_PROCESS_ENTRIES {
            map.insert(
                i.to_string(),
                Entry {
                    value: "v".into(),
                    // All far in the future, so the expiry sweep frees nothing.
                    expires_at: Instant::now() + Duration::from_secs(3600 + i as u64),
                },
            );
        }
        prune(&mut map);
        assert!(
            map.len() < MAX_IN_PROCESS_ENTRIES,
            "prune must free space, left {}",
            map.len()
        );
    }
}

#[cfg(test)]
mod claim_tests {
    use super::*;

    /// The first caller wins and the rest do not — that is the whole point.
    #[tokio::test]
    async fn only_the_first_caller_claims_a_key() {
        let cache = Cache::in_process();
        let ttl = Duration::from_secs(60);

        assert!(cache.claim("scrobble-put:alice:abc:1", ttl).await);
        assert!(!cache.claim("scrobble-put:alice:abc:1", ttl).await);
        assert!(!cache.claim("scrobble-put:alice:abc:1", ttl).await);

        // A different key is unaffected.
        assert!(cache.claim("scrobble-put:alice:abc:2", ttl).await);
    }

    /// A claim expires, so a lock leaked by a crashed request does not block
    /// that listen forever.
    #[tokio::test]
    async fn a_claim_expires() {
        let cache = Cache::in_process();

        assert!(cache.claim("k", Duration::from_millis(1)).await);
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(
            cache.claim("k", Duration::from_secs(60)).await,
            "an expired claim must be retakeable"
        );
    }
}
