//// The process-wide instruments. `otel.start` must run first.

import rocksky_api/node/otel.{type Counter, type Histogram}

pub type Metrics {
  Metrics(
    request_counter: Counter,
    request_duration: Histogram,
    xrpc_request_counter: Counter,
    xrpc_request_duration: Histogram,
  )
}

pub fn new() -> Metrics {
  Metrics(
    request_counter: otel.counter(
      "http_requests_total",
      "Count of incoming requests",
    ),
    request_duration: otel.histogram(
      "http_request_duration_seconds",
      "Request duration in seconds",
    ),
    xrpc_request_counter: otel.counter(
      "xrpc_requests_total",
      "Count of XRPC requests, by NSID and status code",
    ),
    xrpc_request_duration: otel.histogram(
      "xrpc_request_duration_seconds",
      "XRPC request duration in seconds, by NSID",
    ),
  )
}

pub fn count_request(metrics: Metrics, method: String, route: String) -> Nil {
  otel.counter_add(metrics.request_counter, 1, [
    #("method", method),
    #("route", route),
  ])
}
