//! Per-IP token bucket.
//!
//! riff is a read-only catalog mirror, so the limiter exists to stop one remote
//! client from monopolizing the DuckDB pool — not to meter usage. The defaults
//! are deliberately generous; a normal caller will never see a 429.
//!
//! **Loopback is never limited.** Everything colocated with riff (the API,
//! scrobblers, a developer with curl) talks to it over 127.0.0.1, and those
//! callers are the whole point of running it. Throttling them would only
//! reintroduce the queueing that moving off the Spotify proxy removed.

use actix_web::{
    body::EitherBody,
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpResponse,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use std::{
    collections::HashMap,
    net::IpAddr,
    rc::Rc,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// Buckets idle for longer than this are dropped during the periodic sweep, so
/// a long-running process cannot accumulate one entry per IP that ever visited.
const IDLE_EVICTION: Duration = Duration::from_secs(600);
const SWEEP_EVERY: Duration = Duration::from_secs(60);

#[derive(Clone, Copy)]
pub struct Config {
    /// Sustained requests per second, per IP.
    pub rps: f64,
    /// How many requests may arrive at once before the sustained rate applies.
    pub burst: f64,
    /// Read the client IP from `X-Forwarded-For`. Only enable behind a proxy you
    /// control: otherwise any caller can forge the header and get its own bucket.
    pub trust_proxy: bool,
}

struct Bucket {
    tokens: f64,
    last: Instant,
}

struct Limiter {
    cfg: Config,
    buckets: Mutex<HashMap<IpAddr, Bucket>>,
    last_sweep: Mutex<Instant>,
}

pub enum Decision {
    Allow,
    /// Seconds the caller should wait, for the `Retry-After` header.
    Deny {
        retry_after: u64,
    },
}

impl Limiter {
    fn check(&self, ip: Option<IpAddr>) -> Decision {
        let Some(ip) = ip.map(normalize) else {
            // No peer address (unix socket, test transport). Nothing sensible to
            // key on, and refusing would break local callers, so allow.
            return Decision::Allow;
        };
        if ip.is_loopback() {
            return Decision::Allow;
        }

        let now = Instant::now();
        self.sweep(now);

        let mut buckets = self.buckets.lock().unwrap_or_else(|e| e.into_inner());
        let bucket = buckets.entry(ip).or_insert(Bucket {
            tokens: self.cfg.burst,
            last: now,
        });

        let elapsed = now.saturating_duration_since(bucket.last).as_secs_f64();
        bucket.tokens = (bucket.tokens + elapsed * self.cfg.rps).min(self.cfg.burst);
        bucket.last = now;

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            Decision::Allow
        } else {
            let wait = (1.0 - bucket.tokens) / self.cfg.rps;
            Decision::Deny {
                retry_after: wait.ceil().max(1.0) as u64,
            }
        }
    }

    fn sweep(&self, now: Instant) {
        let mut last = self.last_sweep.lock().unwrap_or_else(|e| e.into_inner());
        if now.saturating_duration_since(*last) < SWEEP_EVERY {
            return;
        }
        *last = now;
        drop(last);
        let mut buckets = self.buckets.lock().unwrap_or_else(|e| e.into_inner());
        buckets.retain(|_, b| now.saturating_duration_since(b.last) < IDLE_EVICTION);
    }
}

/// `::ffff:127.0.0.1` is loopback, but `Ipv6Addr::is_loopback` says otherwise.
/// Folding v4-mapped addresses down first keeps a dual-stack listener from
/// rate limiting localhost.
fn normalize(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => v6
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(v6)),
        v4 => v4,
    }
}

fn client_ip(req: &ServiceRequest, trust_proxy: bool) -> Option<IpAddr> {
    if trust_proxy {
        if let Some(fwd) = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
        {
            if let Some(ip) = fwd.split(',').next().and_then(|s| s.trim().parse().ok()) {
                return Some(ip);
            }
        }
    }
    req.peer_addr().map(|a| a.ip())
}

#[derive(Clone)]
pub struct RateLimit {
    limiter: Arc<Limiter>,
}

impl RateLimit {
    pub fn new(cfg: Config) -> Self {
        Self {
            limiter: Arc::new(Limiter {
                cfg,
                buckets: Mutex::new(HashMap::new()),
                last_sweep: Mutex::new(Instant::now()),
            }),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimit
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = RateLimitMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RateLimitMiddleware {
            service: Rc::new(service),
            limiter: self.limiter.clone(),
        }))
    }
}

pub struct RateLimitMiddleware<S> {
    service: Rc<S>,
    limiter: Arc<Limiter>,
}

impl<S, B> Service<ServiceRequest> for RateLimitMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let decision = self
            .limiter
            .check(client_ip(&req, self.limiter.cfg.trust_proxy));
        let service = self.service.clone();

        Box::pin(async move {
            match decision {
                Decision::Allow => Ok(service.call(req).await?.map_into_left_body()),
                Decision::Deny { retry_after } => {
                    let res = HttpResponse::TooManyRequests()
                        .insert_header(("Retry-After", retry_after.to_string()))
                        .json(serde_json::json!({
                            "error": { "status": 429, "message": "API rate limit exceeded" }
                        }));
                    Ok(req.into_response(res).map_into_right_body())
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limiter(rps: f64, burst: f64) -> Limiter {
        Limiter {
            cfg: Config {
                rps,
                burst,
                trust_proxy: false,
            },
            buckets: Mutex::new(HashMap::new()),
            last_sweep: Mutex::new(Instant::now()),
        }
    }

    fn allowed(d: Decision) -> bool {
        matches!(d, Decision::Allow)
    }

    #[test]
    fn loopback_is_never_limited() {
        let l = limiter(1.0, 1.0);
        let local: IpAddr = "127.0.0.1".parse().unwrap();
        // Far past a burst of 1 — localhost must still sail through.
        for _ in 0..1_000 {
            assert!(allowed(l.check(Some(local))));
        }
    }

    #[test]
    fn ipv4_mapped_loopback_is_never_limited() {
        let l = limiter(1.0, 1.0);
        let mapped: IpAddr = "::ffff:127.0.0.1".parse().unwrap();
        for _ in 0..1_000 {
            assert!(allowed(l.check(Some(mapped))));
        }
        let v6: IpAddr = "::1".parse().unwrap();
        for _ in 0..1_000 {
            assert!(allowed(l.check(Some(v6))));
        }
    }

    #[test]
    fn external_ip_is_limited_after_the_burst() {
        let l = limiter(1.0, 5.0);
        let remote: IpAddr = "203.0.113.7".parse().unwrap();
        for _ in 0..5 {
            assert!(allowed(l.check(Some(remote))));
        }
        assert!(!allowed(l.check(Some(remote))));
    }

    #[test]
    fn buckets_are_per_ip() {
        let l = limiter(1.0, 2.0);
        let a: IpAddr = "203.0.113.7".parse().unwrap();
        let b: IpAddr = "198.51.100.9".parse().unwrap();
        assert!(allowed(l.check(Some(a))));
        assert!(allowed(l.check(Some(a))));
        assert!(!allowed(l.check(Some(a))));
        // b has its own budget and is unaffected by a exhausting its own.
        assert!(allowed(l.check(Some(b))));
    }

    #[test]
    fn denial_reports_a_usable_retry_after() {
        let l = limiter(2.0, 1.0);
        let remote: IpAddr = "203.0.113.7".parse().unwrap();
        assert!(allowed(l.check(Some(remote))));
        match l.check(Some(remote)) {
            Decision::Deny { retry_after } => assert!(retry_after >= 1),
            Decision::Allow => panic!("expected the second request to be denied"),
        }
    }

    #[test]
    fn missing_peer_address_is_allowed() {
        let l = limiter(1.0, 1.0);
        for _ in 0..100 {
            assert!(allowed(l.check(None)));
        }
    }
}
