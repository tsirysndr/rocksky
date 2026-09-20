//! The instruments every HTTP service records.
//!
//! Built lazily off the global meter provider, so a service that never called
//! [`crate::init`] records into a no-op meter rather than having to check.

use opentelemetry::metrics::{Counter, Histogram, Meter};
use opentelemetry::KeyValue;
use std::sync::OnceLock;

fn meter() -> &'static Meter {
    static METER: OnceLock<Meter> = OnceLock::new();
    METER.get_or_init(|| opentelemetry::global::meter("rocksky"))
}

/// How long a request took, in seconds.
///
/// A histogram rather than a gauge or an average: the question in production
/// is "what is the slow tail doing", and an average over a route that is
/// usually 5ms and occasionally 4s reports neither number.
pub fn request_duration() -> &'static Histogram<f64> {
    static HISTOGRAM: OnceLock<Histogram<f64>> = OnceLock::new();
    HISTOGRAM.get_or_init(|| {
        meter()
            .f64_histogram("http.server.request.duration")
            .with_unit("s")
            .with_description("How long each HTTP request took")
            .build()
    })
}

/// Requests, by route and status.
pub fn requests() -> &'static Counter<u64> {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();
    COUNTER.get_or_init(|| {
        meter()
            .u64_counter("http.server.requests")
            .with_description("HTTP requests served")
            .build()
    })
}

/// Records one finished request against both instruments.
///
/// Labelled by *route* rather than by path: `/xrpc/app.rocksky.actor.getProfile`
/// is one series, where the raw path of an upload or a `{id}` route would be a
/// new series per id and blow up the cardinality of the metric.
pub fn record_request(route: &str, method: &str, status: u16, seconds: f64) {
    let attributes = [
        KeyValue::new("http.route", route.to_string()),
        KeyValue::new("http.request.method", method.to_string()),
        KeyValue::new("http.response.status_code", status as i64),
    ];
    requests().add(1, &attributes);
    request_duration().record(seconds, &attributes);

    // And the Prometheus registry, when it is being scraped. Both, rather than
    // one or the other, because the two can be pointed at different places:
    // traces to Honeycomb and metrics to a local Prometheus is a normal setup.
    if let Some(prometheus) = PROMETHEUS.get() {
        let status = status.to_string();
        let labels = [route, method, status.as_str()];
        prometheus.requests.with_label_values(&labels).inc();
        prometheus
            .duration
            .with_label_values(&labels)
            .observe(seconds);
    }
}

// ------------------------------------------------------------- Background work
//
// The services that serve no HTTP — the jetstream subscriber, the mirror
// pollers, the Spotify listener — still have a unit of work worth counting and
// timing. One pair of instruments labelled by `work` rather than one pair per
// service, so "how many units, how long, how many failed" is the same query
// everywhere.

/// How long one unit of background work took, in seconds.
pub fn work_duration() -> &'static Histogram<f64> {
    static HISTOGRAM: OnceLock<Histogram<f64>> = OnceLock::new();
    HISTOGRAM.get_or_init(|| {
        meter()
            .f64_histogram("rocksky.work.duration")
            .with_unit("s")
            .with_description("How long each unit of background work took")
            .build()
    })
}

/// Units of background work, by kind and outcome.
pub fn work_items() -> &'static Counter<u64> {
    static COUNTER: OnceLock<Counter<u64>> = OnceLock::new();
    COUNTER.get_or_init(|| {
        meter()
            .u64_counter("rocksky.work.items")
            .with_description("Units of background work processed")
            .build()
    })
}

/// Records one finished unit of background work against both instruments.
///
/// `work` names the kind — `jetstream.commit`, `mirror.poll`,
/// `spotify.scrobble` — and matches the span name, so a spike in the metric
/// leads straight to the traces for it. `outcome` is `ok` or `error`; keep it
/// to that handful of values, since every distinct one is a new series.
pub fn record_work(work: &str, outcome: &str, seconds: f64) {
    let attributes = [
        KeyValue::new("work", work.to_string()),
        KeyValue::new("outcome", outcome.to_string()),
    ];
    work_items().add(1, &attributes);
    work_duration().record(seconds, &attributes);
}

// ------------------------------------------------------------------ Prometheus
//
// Prometheus scrapes a text page rather than being pushed to, so it is served
// from a registry of its own rather than through an OpenTelemetry exporter.
// `opentelemetry-prometheus` would do it, but it is pinned to opentelemetry
// 0.29 and would pull a third copy of the SDK into the graph.

use prometheus::{Encoder, HistogramVec, IntCounterVec, Registry, TextEncoder};

struct Prometheus {
    registry: Registry,
    requests: IntCounterVec,
    duration: HistogramVec,
}

static PROMETHEUS: OnceLock<Prometheus> = OnceLock::new();

/// Creates the registry and the instruments on it. Called once by
/// [`crate::init`] when `[telemetry].prometheus` is on.
pub(crate) fn install_prometheus() -> anyhow::Result<Registry> {
    let registry = Registry::new();

    let requests = IntCounterVec::new(
        prometheus::Opts::new("http_server_requests_total", "HTTP requests served"),
        &["route", "method", "status"],
    )?;
    // Seconds, and buckets that straddle what these routes actually do: a
    // cached feed page is single-digit milliseconds, a scrobble that publishes
    // four records to a PDS is hundreds.
    let duration = HistogramVec::new(
        prometheus::HistogramOpts::new(
            "http_server_request_duration_seconds",
            "How long each HTTP request took",
        )
        .buckets(vec![
            0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
        ]),
        &["route", "method", "status"],
    )?;

    registry.register(Box::new(requests.clone()))?;
    registry.register(Box::new(duration.clone()))?;

    let _ = PROMETHEUS.set(Prometheus {
        registry: registry.clone(),
        requests,
        duration,
    });
    Ok(registry)
}

/// The scrape page, or `None` when Prometheus was never switched on.
pub fn scrape() -> Option<String> {
    let prometheus = PROMETHEUS.get()?;
    let mut buffer = Vec::new();
    TextEncoder::new()
        .encode(&prometheus.registry.gather(), &mut buffer)
        .ok()?;
    String::from_utf8(buffer).ok()
}
