import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

const exporter = new OTLPMetricExporter({
  url: "http://localhost:4318/v1/metrics",
});

const reader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis: 10000,
});

const meterProvider = new MeterProvider({
  readers: [reader],
});

const meter = meterProvider.getMeter("rocksky-hono");

const requestCounter = meter.createCounter("http_requests_total", {
  description: "Count of incoming requests",
});

const requestDuration = meter.createHistogram("http_request_duration_seconds", {
  description: "Request duration in seconds",
});

export { meter, requestCounter, requestDuration };
