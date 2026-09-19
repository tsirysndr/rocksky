import { metrics } from "@opentelemetry/api";

// Instruments bind to the global MeterProvider, so "./otel" must be imported
// before this module or every metric silently becomes a no-op.
const meter = metrics.getMeter("rocksky-api");

const requestCounter = meter.createCounter("http_requests_total", {
  description: "Count of incoming requests",
});

const requestDuration = meter.createHistogram("http_request_duration_seconds", {
  description: "Request duration in seconds",
});

const xrpcRequestCounter = meter.createCounter("xrpc_requests_total", {
  description: "Count of XRPC requests, by NSID and status code",
});

const xrpcRequestDuration = meter.createHistogram(
  "xrpc_request_duration_seconds",
  {
    description: "XRPC request duration in seconds, by NSID",
  },
);

export {
  meter,
  requestCounter,
  requestDuration,
  xrpcRequestCounter,
  xrpcRequestDuration,
};
