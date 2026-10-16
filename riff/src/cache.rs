//! Bounded cache for the read-only catalog. No DuckDB connection is held on hits.
use actix_web::web::Bytes;
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct Entry {
    body: Bytes,
    inserted: Instant,
    used: Instant,
}
#[derive(Default)]
struct State {
    entries: HashMap<String, Entry>,
    bytes: usize,
}

pub(crate) struct SearchCache {
    state: Mutex<State>,
    // A fixed number of locks bounds synchronization memory even under unique
    // query floods. Same-key misses share one computation; unrelated shards run
    // concurrently. These locks are only acquired on Actix's blocking threads.
    flights: [Mutex<()>; 64],
    ttl: Duration,
    max_bytes: usize,
    max_entries: usize,
}
impl SearchCache {
    pub(crate) fn from_env() -> Result<Self, String> {
        fn setting(name: &str, default: usize, max: usize) -> Result<usize, String> {
            let value = match std::env::var(name) {
                Ok(v) => v
                    .parse()
                    .map_err(|_| format!("{name} must be an integer"))?,
                Err(std::env::VarError::NotPresent) => default,
                Err(_) => return Err(format!("{name} must be valid UTF-8")),
            };
            if value > max {
                return Err(format!("{name} must be at most {max}"));
            }
            Ok(value)
        }
        Ok(Self::new(
            Duration::from_secs(setting("RIFF_SEARCH_CACHE_SECONDS", 900, 86400)? as u64),
            setting("RIFF_SEARCH_CACHE_MB", 32, 1024)? * 1024 * 1024,
            setting("RIFF_SEARCH_CACHE_ENTRIES", 2048, 100000)?,
        ))
    }
    fn new(ttl: Duration, max_bytes: usize, max_entries: usize) -> Self {
        Self {
            state: Mutex::new(State::default()),
            flights: std::array::from_fn(|_| Mutex::new(())),
            ttl,
            max_bytes,
            max_entries,
        }
    }
    fn get(&self, key: &str) -> Option<Bytes> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = state.entries.get_mut(key) {
            if entry.inserted.elapsed() < self.ttl {
                entry.used = Instant::now();
                return Some(entry.body.clone());
            }
        }
        if let Some(entry) = state.entries.remove(key) {
            state.bytes -= key.len() + entry.body.len();
        }
        None
    }
    pub(crate) fn get_or_load<E>(
        &self,
        key: String,
        load: impl FnOnce() -> Result<Bytes, E>,
    ) -> Result<(Bytes, bool), E> {
        if self.ttl.is_zero()
            || self.max_bytes == 0
            || self.max_entries == 0
            || key.len() > self.max_bytes
        {
            return load().map(|body| (body, false));
        }
        if let Some(body) = self.get(&key) {
            return Ok((body, true));
        }
        let mut hash = DefaultHasher::new();
        key.hash(&mut hash);
        let _flight = self.flights[hash.finish() as usize % self.flights.len()]
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(body) = self.get(&key) {
            return Ok((body, true));
        }
        // Errors are never cached. The guard is released even on panic.
        let body = load()?;
        let size = key.len().saturating_add(body.len());
        if size <= self.max_bytes {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            while state.bytes + size > self.max_bytes || state.entries.len() >= self.max_entries {
                let oldest = state
                    .entries
                    .iter()
                    .min_by_key(|(_, e)| e.used)
                    .map(|(k, _)| k.clone());
                let Some(oldest) = oldest else {
                    break;
                };
                let entry = state.entries.remove(&oldest).unwrap();
                state.bytes -= oldest.len() + entry.body.len();
            }
            state.bytes += size;
            state.entries.insert(
                key,
                Entry {
                    body: body.clone(),
                    inserted: Instant::now(),
                    used: Instant::now(),
                },
            );
        }
        Ok((body, false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Barrier,
    };
    #[test]
    fn concurrent_identical_searches_load_once() {
        let cache = Arc::new(SearchCache::new(Duration::from_secs(60), 1024, 10));
        let calls = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let (cache, calls, barrier) = (cache.clone(), calls.clone(), barrier.clone());
                std::thread::spawn(move || {
                    barrier.wait();
                    cache
                        .get_or_load("query".into(), || -> Result<_, ()> {
                            calls.fetch_add(1, Ordering::SeqCst);
                            std::thread::sleep(Duration::from_millis(20));
                            Ok(Bytes::from_static(b"result"))
                        })
                        .unwrap()
                        .0
                })
            })
            .collect();
        for worker in workers {
            assert_eq!(worker.join().unwrap(), b"result"[..]);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn bounds_expiration_errors_and_disable() {
        let cache = SearchCache::new(Duration::from_secs(60), 10, 2);
        let load = || -> Result<_, ()> { Ok(Bytes::from_static(b"abc")) };
        assert!(!cache.get_or_load("a".into(), load).unwrap().1);
        assert!(cache.get_or_load("a".into(), load).unwrap().1);
        cache.get_or_load("b".into(), load).unwrap();
        cache.get_or_load("c".into(), load).unwrap();
        assert!(cache.get("a").is_none());
        assert!(cache.state.lock().unwrap().bytes <= 10);
        cache
            .state
            .lock()
            .unwrap()
            .entries
            .get_mut("c")
            .unwrap()
            .inserted = Instant::now() - Duration::from_secs(61);
        assert!(cache.get("c").is_none());
        assert!(cache
            .get_or_load("error".into(), || Err::<Bytes, _>(()))
            .is_err());
        assert!(cache.get("error").is_none());
        cache
            .get_or_load("big".into(), || Ok::<_, ()>(Bytes::from(vec![0; 20])))
            .unwrap();
        assert!(cache.get("big").is_none());
        let off = SearchCache::new(Duration::ZERO, 100, 10);
        for _ in 0..2 {
            assert!(!off.get_or_load("a".into(), load).unwrap().1);
        }
    }
}
