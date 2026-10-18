//// Binding to the OpenTelemetry Node SDK and API.

import gleam/dynamic.{type Dynamic}

/// Starts the SDK (traces, metrics, logs over OTLP/HTTP) with attribute
/// scrubbing and the consola log bridge, and registers signal flushing.
@external(javascript, "./otel_ffi.mjs", "start")
pub fn start(default_service_name: String, version: String) -> Nil

pub type Counter

pub type Histogram

@external(javascript, "./otel_ffi.mjs", "counter")
pub fn counter(name: String, description: String) -> Counter

@external(javascript, "./otel_ffi.mjs", "histogram")
pub fn histogram(name: String, description: String) -> Histogram

@external(javascript, "./otel_ffi.mjs", "counterAdd")
pub fn counter_add(
  counter: Counter,
  value: Int,
  attributes: List(#(String, String)),
) -> Nil

@external(javascript, "./otel_ffi.mjs", "histogramRecord")
pub fn histogram_record(
  histogram: Histogram,
  value: Float,
  attributes: List(#(String, String)),
) -> Nil

pub type Span

pub type Ctx

/// Renames the active span and sets `http.route`.
@external(javascript, "./otel_ffi.mjs", "updateActiveSpan")
pub fn update_active_span(name: String, route: String) -> Nil

/// The active context, or the one extracted from incoming headers when no
/// server span is open.
@external(javascript, "./otel_ffi.mjs", "parentContext")
pub fn parent_context(headers: Dynamic) -> Ctx

@external(javascript, "./otel_ffi.mjs", "startServerSpan")
pub fn start_server_span(
  tracer: String,
  name: String,
  attributes: List(#(String, String)),
  parent: Ctx,
) -> Span

@external(javascript, "./otel_ffi.mjs", "setAttributeInt")
pub fn set_attribute_int(span: Span, key: String, value: Int) -> Nil

@external(javascript, "./otel_ffi.mjs", "setStatusError")
pub fn set_status_error(span: Span) -> Nil

@external(javascript, "./otel_ffi.mjs", "endSpan")
pub fn end_span(span: Span) -> Nil

/// Runs `f` with `span` active in `parent`.
@external(javascript, "./otel_ffi.mjs", "withSpan")
pub fn with_span(parent: Ctx, span: Span, f: fn() -> Nil) -> Nil
