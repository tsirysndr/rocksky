//! `GET /metrics` — the Prometheus scrape page.
//!
//! Prometheus pulls rather than being pushed to, which is why this exists at
//! all: traces and logs leave over OTLP, metrics can do both, and a Prometheus
//! deployment scrapes this.
//!
//! Registered unconditionally and answering 404 when `[telemetry].prometheus`
//! is off, rather than being registered conditionally: a route that appears
//! and disappears with config is harder to reason about from the outside than
//! one that is always there and says whether it has anything.
//!
//! # No authentication
//!
//! The page carries request counts and latencies by route and status — no
//! record contents, no identifiers, nothing about who called. That is the same
//! posture as the rest of the read surface, and a scrape endpoint behind auth
//! is the usual reason a Prometheus job silently stops working. Put it behind
//! the network boundary rather than behind a token.

use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;

pub fn configure(cfg: &mut ServiceConfig) {
    cfg.route("/metrics", web::get().to(metrics));
}

async fn metrics() -> HttpResponse {
    match rocksky_telemetry::metrics::scrape() {
        Some(body) => HttpResponse::Ok()
            // The version Prometheus expects; without it some scrapers fall
            // back to guessing and drop the histogram buckets.
            .content_type("text/plain; version=0.0.4; charset=utf-8")
            .body(body),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "NotConfigured",
            "message": "Prometheus metrics are off. Set [telemetry].prometheus = true.",
        })),
    }
}
