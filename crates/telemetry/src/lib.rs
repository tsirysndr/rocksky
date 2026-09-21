//! OpenTelemetry for every Rocksky service, installed once.
//!
//! `rockskyd` calls [`init`] before it dispatches to a subcommand, so the
//! appview, the mirrors, the scrobbler and the Subsonic and Jellyfin surfaces
//! all export to the same place without any of them knowing this crate exists:
//! they keep writing `tracing::info!` and it flows wherever [`Settings`] says.
//!
//! # One subscriber, installed once
//!
//! The OpenTelemetry layers have to be part of the subscriber that gets
//! installed — `tracing` has no way to add a layer afterwards — so this is
//! also where the subscriber is built. A service that installed its own first
//! would win, and this one's layers would silently do nothing, which is why
//! [`init`] returns an error rather than ignoring that case.
//!
//! # What goes where
//!
//! | signal  | transport                    | typical backend                        |
//! |---------|------------------------------|----------------------------------------|
//! | traces  | OTLP `http/protobuf`         | Jaeger, Honeycomb, Tempo, a collector   |
//! | metrics | OTLP, and/or a scrape page   | any OTLP backend; Prometheus scrapes    |
//! | logs    | OTLP                         | the same place as the traces            |
//!
//! OTLP rather than a backend-specific exporter because it is the one protocol
//! all of them speak: Jaeger accepts it natively, Honeycomb is an endpoint and
//! a header, and anything that does not — Zipkin, Datadog — is a collector
//! sitting in front, which is how those are meant to be reached anyway.
//!
//! Prometheus is the exception and cannot be pushed to, so it gets a registry
//! this crate hands back for the service to serve at `/metrics`.
//!
//! # What ties the three signals together
//!
//! Three signals are only worth having if you can get from one to the others,
//! so everything below exists to make that jump possible:
//!
//! * **One resource on all three.** The same `service.name`,
//!   `service.version`, `service.namespace` and `service.instance.id` are
//!   stamped on every span, metric and log, so a backend groups them as one
//!   process rather than three unrelated streams.
//! * **Logs carry `trace_id` and `span_id`.** `tracing-opentelemetry` attaches
//!   the OpenTelemetry context when a `tracing` span is entered, and the log
//!   bridge reads it back off the current context — so a `tracing::info!`
//!   inside a request handler links to that request's trace with no extra
//!   plumbing at the call site.
//! * **The trace crosses the process boundary in both directions.** [`init`]
//!   installs the W3C `traceparent`/`baggage` propagator globally, which is
//!   what [`middleware`] reads incoming requests with and what
//!   [`propagation::outgoing_headers`] writes outgoing ones with.
//! * **Metrics share the traces' attribute names.** `http.route`,
//!   `http.request.method` and `http.response.status_code` mean the same thing
//!   in [`metrics`] as they do on the span, so a spike in a chart narrows to
//!   the traces behind it by pasting the same filter.
//!
//! ## Exemplars
//!
//! Exemplars — the trace id hanging off a single histogram bucket sample, so a
//! chart clicks straight through to one slow request — are the fourth link,
//! and `opentelemetry_sdk` 0.32 cannot produce them: the data model is there
//! but the aggregators emit `exemplars: vec![]` unconditionally, with no
//! reservoir behind it. Nothing here can switch that on. Until the SDK grows
//! one, the route from a metric to a trace is the shared attribute names
//! above: filter the traces by the `http.route` and status the chart is
//! showing. The Go services and the Elixir relay *do* export exemplars
//! (`otel/otel.go`, `remote-ws/config/runtime.exs`), so a dashboard mixing
//! them will have the link on some panels and not others.

pub mod metrics;
#[cfg(feature = "actix")]
pub mod middleware;
pub mod propagation;

use opentelemetry::trace::TracerProvider as _;
// `with_endpoint` and `with_headers` are trait methods on the OTLP builders,
// not inherent ones.
use opentelemetry::KeyValue;
use opentelemetry_otlp::{WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

/// The `[telemetry]` section of `config.toml`.
///
/// Everything is optional and the default is off: a personal instance should
/// not need an observability stack to boot, and an endpoint that is not there
/// costs a retry on every export.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Settings {
    /// Where to send traces, metrics and logs — the collector's base URL, e.g.
    /// `http://localhost:4318`. Unset means nothing is exported.
    pub otlp_endpoint: Option<String>,

    /// Headers on every export, for backends that authenticate that way:
    /// Honeycomb wants `x-honeycomb-team`, Grafana Cloud an `authorization`.
    pub otlp_headers: HashMap<String, String>,

    /// Per-signal switches, for sending traces somewhere and keeping metrics
    /// local. All default to on once an endpoint is set.
    pub traces: Option<bool>,
    pub metrics: Option<bool>,
    pub logs: Option<bool>,

    /// The fraction of traces to keep, 0.0–1.0. Default 1.0.
    ///
    /// Worth lowering on a busy public instance and worth leaving alone on a
    /// personal one: a sampled-out trace is one that cannot be looked up when
    /// somebody reports the request that produced it.
    pub sample_ratio: Option<f64>,

    /// Serve `/metrics` for Prometheus to scrape. Independent of
    /// `otlp_endpoint` — Prometheus pulls, so it needs no exporter.
    pub prometheus: Option<bool>,

    /// What this process calls itself in the backend. Defaults to the name the
    /// caller passes [`init`].
    pub service_name: Option<String>,

    /// `production`, `staging`, … Sent as `deployment.environment.name`.
    pub environment: Option<String>,
}

impl Settings {
    fn exports(&self) -> bool {
        self.otlp_endpoint
            .as_deref()
            .is_some_and(|endpoint| !endpoint.trim().is_empty())
    }

    fn wants(&self, signal: Option<bool>) -> bool {
        self.exports() && signal.unwrap_or(true)
    }
}

/// Keeps the providers alive and flushes them on the way out.
///
/// Dropping this is what gets the last spans out of the process. Without it a
/// short-lived run — `--backfill`, a one-shot command — exports nothing at all,
/// because the batch exporters are still holding everything when `main`
/// returns.
pub struct Telemetry {
    traces: Option<SdkTracerProvider>,
    metrics: Option<SdkMeterProvider>,
    logs: Option<SdkLoggerProvider>,
    /// Handed to the service so it can serve `/metrics`.
    pub prometheus: Option<prometheus::Registry>,
}

impl Telemetry {
    /// Flushes everything still buffered. Called by `drop`, and worth calling
    /// explicitly before a long blocking section.
    pub fn flush(&self) {
        if let Some(provider) = &self.traces {
            let _ = provider.force_flush();
        }
        if let Some(provider) = &self.metrics {
            let _ = provider.force_flush();
        }
        if let Some(provider) = &self.logs {
            let _ = provider.force_flush();
        }
    }
}

impl Drop for Telemetry {
    fn drop(&mut self) {
        self.flush();
    }
}

/// Builds the subscriber and installs it.
///
/// `service` is the process's default name in the backend — `rockskyd`, or the
/// subcommand when one is running. Returns the guard; hold it for the life of
/// the process.
pub fn init(service: &str, settings: &Settings) -> anyhow::Result<Telemetry> {
    let service_name = settings
        .service_name
        .clone()
        .unwrap_or_else(|| service.to_string());

    // One resource, built once and given to all three providers: a span, a
    // metric point and a log record that disagree about who emitted them
    // cannot be correlated in any backend.
    //
    // `Resource::builder` already folds in `OTEL_SERVICE_NAME` and
    // `OTEL_RESOURCE_ATTRIBUTES`; the attributes set here are applied on top,
    // so the config file wins over the environment for the ones it names and
    // anything extra in the environment still comes through.
    let mut attributes = vec![
        KeyValue::new("service.name", service_name.clone()),
        KeyValue::new("service.version", env!("CARGO_PKG_VERSION").to_string()),
        // Every Rocksky process shares a namespace, which is what lets a
        // backend show "all of Rocksky" without listing the services by hand.
        KeyValue::new("service.namespace", "rocksky"),
        // Distinguishes two processes of the same service — the Hono API and
        // the XRPC server, an appview restarted mid-investigation. See
        // `instance_id` for what goes in it.
        KeyValue::new("service.instance.id", instance_id()),
        KeyValue::new("process.pid", std::process::id() as i64),
    ];
    if let Some(environment) = &settings.environment {
        attributes.push(KeyValue::new(
            "deployment.environment.name",
            environment.clone(),
        ));
    }
    let resource = Resource::builder().with_attributes(attributes).build();

    let traces = settings
        .wants(settings.traces)
        .then(|| build_traces(settings, &resource))
        .transpose()?;
    let metrics = settings
        .wants(settings.metrics)
        .then(|| build_metrics(settings, &resource))
        .transpose()?;
    let logs = settings
        .wants(settings.logs)
        .then(|| build_logs(settings, &resource))
        .transpose()?;

    // Prometheus is a pull, so it is independent of the OTLP endpoint and can
    // be the only thing switched on. Its own registry rather than an OTel
    // exporter — see the note on the dependency.
    let prometheus = settings
        .prometheus
        .unwrap_or(false)
        .then(metrics::install_prometheus)
        .transpose()?;

    if let Some(provider) = metrics.clone() {
        opentelemetry::global::set_meter_provider(provider);
    }
    if let Some(provider) = traces.clone() {
        // The `tracing` layer below holds its own tracer, so this is not what
        // makes spans work — it is what makes `global::tracer()` return a real
        // one for code reaching for OpenTelemetry directly rather than through
        // `tracing`, instead of silently recording into a no-op.
        opentelemetry::global::set_tracer_provider(provider);
    }

    // The global propagator, which has no default: `global::get_text_map_propagator`
    // hands back a *no-op* until something installs one. Without this line the
    // extract in `middleware` reads every incoming `traceparent` as absent and
    // starts a fresh trace per service — the exact failure this is here to
    // prevent, and an invisible one, because each service's traces look
    // perfectly fine on their own.
    //
    // Baggage alongside trace context so a key set upstream (which user, which
    // scrobble) travels with the request and can be read anywhere downstream.
    opentelemetry::global::set_text_map_propagator(propagation::propagator());

    // sqlx logs every statement at INFO, which drowns everything else out on a
    // busy instance — the same default the appview's own binary used.
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn"));

    let registry = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().compact());

    // Built as one subscriber because layers cannot be added after `init`.
    let result = match (&traces, &logs) {
        (Some(traces), Some(logs)) => registry
            .with(tracing_opentelemetry::layer().with_tracer(traces.tracer(service_name.clone())))
            .with(opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge::new(logs))
            .try_init(),
        (Some(traces), None) => registry
            .with(tracing_opentelemetry::layer().with_tracer(traces.tracer(service_name.clone())))
            .try_init(),
        (None, Some(logs)) => registry
            .with(opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge::new(logs))
            .try_init(),
        (None, None) => registry.try_init(),
    };

    // A subscriber was already installed, so these layers would export
    // nothing. Reported rather than swallowed: silent no-op telemetry is worse
    // than none, because it is only discovered when somebody needs it.
    result.map_err(|err| {
        anyhow::anyhow!(
            "could not install the tracing subscriber: {err}. Something installed one \
             first — telemetry has to be set up once, at the entrypoint, before any \
             service starts."
        )
    })?;

    if settings.exports() {
        tracing::info!(
            endpoint = settings.otlp_endpoint.as_deref().unwrap_or_default(),
            service = %service_name,
            traces = traces.is_some(),
            metrics = metrics.is_some(),
            logs = logs.is_some(),
            "exporting telemetry over OTLP"
        );
    }
    if prometheus.is_some() {
        tracing::info!("serving Prometheus metrics at /metrics");
    }

    Ok(Telemetry {
        traces,
        metrics,
        logs,
        prometheus,
    })
}

/// A value unique to this process, for `service.instance.id`.
///
/// The pid and the moment it started, rather than a UUID: both are unique
/// together — a recycled pid cannot have started at the same nanosecond — and
/// unlike a UUID the value is legible, so the instance a trace names can be
/// matched to a line in `ps` or a `journalctl` window without a lookup.
fn instance_id() -> String {
    let started = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or_default();
    format!("{}-{}", std::process::id(), started)
}

/// The OTLP path for a signal. The endpoint is the collector's base URL, and
/// `http/protobuf` puts each signal on its own path under it.
fn endpoint_for(settings: &Settings, signal: &str) -> String {
    let base = settings
        .otlp_endpoint
        .as_deref()
        .unwrap_or_default()
        .trim_end_matches('/');
    format!("{base}/v1/{signal}")
}

fn headers(settings: &Settings) -> HashMap<String, String> {
    settings.otlp_headers.clone()
}

fn build_traces(settings: &Settings, resource: &Resource) -> anyhow::Result<SdkTracerProvider> {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_endpoint(endpoint_for(settings, "traces"))
        .with_headers(headers(settings))
        .with_timeout(Duration::from_secs(10))
        .build()?;

    let ratio = settings.sample_ratio.unwrap_or(1.0).clamp(0.0, 1.0);
    let sampler = if ratio >= 1.0 {
        opentelemetry_sdk::trace::Sampler::AlwaysOn
    } else {
        // Parent-based, so a sampled incoming request keeps its whole trace
        // rather than losing the half of it that this service would have
        // sampled away on its own.
        opentelemetry_sdk::trace::Sampler::ParentBased(Box::new(
            opentelemetry_sdk::trace::Sampler::TraceIdRatioBased(ratio),
        ))
    };

    Ok(SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_sampler(sampler)
        .with_resource(resource.clone())
        .build())
}

fn build_metrics(settings: &Settings, resource: &Resource) -> anyhow::Result<SdkMeterProvider> {
    let exporter = opentelemetry_otlp::MetricExporter::builder()
        .with_http()
        .with_endpoint(endpoint_for(settings, "metrics"))
        .with_headers(headers(settings))
        .with_timeout(Duration::from_secs(10))
        .build()?;

    Ok(SdkMeterProvider::builder()
        .with_periodic_exporter(exporter)
        .with_resource(resource.clone())
        .build())
}

fn build_logs(settings: &Settings, resource: &Resource) -> anyhow::Result<SdkLoggerProvider> {
    let exporter = opentelemetry_otlp::LogExporter::builder()
        .with_http()
        .with_endpoint(endpoint_for(settings, "logs"))
        .with_headers(headers(settings))
        .with_timeout(Duration::from_secs(10))
        .build()?;

    Ok(SdkLoggerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(resource.clone())
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_exported_without_an_endpoint() {
        let settings = Settings::default();
        assert!(!settings.exports());
        // Even with a signal explicitly on: there is nowhere to send it.
        let settings = Settings {
            traces: Some(true),
            ..Default::default()
        };
        assert!(!settings.wants(settings.traces));
    }

    /// A blank endpoint is the shape `${OTLP_ENDPOINT:-}` leaves in a compose
    /// file, and it must read as "off" rather than as an endpoint to retry
    /// against forever.
    #[test]
    fn a_blank_endpoint_is_off() {
        let settings = Settings {
            otlp_endpoint: Some("   ".into()),
            ..Default::default()
        };
        assert!(!settings.exports());
    }

    #[test]
    fn each_signal_can_be_turned_off_on_its_own() {
        let settings = Settings {
            otlp_endpoint: Some("http://localhost:4318".into()),
            metrics: Some(false),
            ..Default::default()
        };
        assert!(settings.wants(settings.traces), "on by default");
        assert!(settings.wants(settings.logs), "on by default");
        assert!(!settings.wants(settings.metrics));
    }

    /// `http/protobuf` puts each signal on its own path under the base URL,
    /// and a trailing slash must not produce `//v1/traces`.
    #[test]
    fn the_signal_paths_hang_off_the_base_endpoint() {
        let settings = Settings {
            otlp_endpoint: Some("http://collector:4318/".into()),
            ..Default::default()
        };
        assert_eq!(
            endpoint_for(&settings, "traces"),
            "http://collector:4318/v1/traces"
        );
        assert_eq!(
            endpoint_for(&settings, "metrics"),
            "http://collector:4318/v1/metrics"
        );
        assert_eq!(
            endpoint_for(&settings, "logs"),
            "http://collector:4318/v1/logs"
        );
    }

    /// Prometheus is a pull, so it does not need an endpoint to push to.
    #[test]
    fn prometheus_is_independent_of_the_otlp_endpoint() {
        let settings = Settings {
            prometheus: Some(true),
            ..Default::default()
        };
        assert!(!settings.exports());
        assert_eq!(settings.prometheus, Some(true));
    }
}
