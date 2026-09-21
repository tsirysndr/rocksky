import { basename } from "node:path";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { consola } from "consola";
import { version } from "../package.json" with { type: "json" };

// MUST be imported before any other module (express, pg, ioredis, …) so
// auto-instrumentation can patch them, and before "./metrics" so instruments
// bind to a real MeterProvider instead of the no-op one.
//
// What ties the three signals together:
//
//   * one resource on all of them (below), so a backend groups the spans, the
//     metrics and the logs as one process rather than three streams;
//   * trace and span ids on every log record — the consola bridge at the
//     bottom emits into the active context, so a line written inside a request
//     handler links back to that request's trace;
//   * W3C traceparent in and out, which the auto-instrumentations do by
//     default, so a trace that starts here continues into the appview and the
//     Go proxies and vice versa.
//
// The fourth link, exemplars — a trace id on one histogram sample, so a chart
// clicks through to the slow request behind a spike — is not available here.
// @opentelemetry/sdk-metrics ships the exemplar types and filters but nothing
// wires them into the aggregators, and otlp-transformer does not serialize
// them, so there is no option to turn on. Getting from a metric to a trace
// means filtering the traces by the same attribute names the metric carries;
// that is why those names are kept identical across the services.

const otlpBase = (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318"
).replace(/\/+$/, "");

const tracesUrl =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? `${otlpBase}/v1/traces`;
const metricsUrl =
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? `${otlpBase}/v1/metrics`;
const logsUrl =
  process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? `${otlpBase}/v1/logs`;

// index.ts (Hono) and server.ts (XRPC) run as separate processes from the
// same codebase; tell them apart by entrypoint unless explicitly named.
const entrypoint = basename(process.argv[1] ?? "");
const serviceName =
  process.env.OTEL_SERVICE_NAME ??
  (entrypoint.startsWith("server") ? "rocksky-xrpc" : "rocksky-api");

// Telemetry must never carry credentials or PII: redact any auth-shaped
// attribute and strip query strings (API keys, cursors, search terms) from
// every URL-shaped attribute before export.
const SENSITIVE_KEY =
  /authorization|cookie|set-cookie|token|secret|passw|api[-_]?key|session/i;
const URL_VALUE_KEY = /^(http\.url|http\.target|url\.full)$/;

function scrubAttributes(attributes: Record<string, unknown>) {
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (SENSITIVE_KEY.test(key)) {
      attributes[key] = "[REDACTED]";
    } else if (key === "url.query") {
      delete attributes[key];
    } else if (URL_VALUE_KEY.test(key) && typeof value === "string") {
      attributes[key] = value.split("?")[0];
    }
  }
}

class ScrubbingSpanProcessor extends BatchSpanProcessor {
  onEnd(span: ReadableSpan) {
    scrubAttributes(span.attributes as Record<string, unknown>);
    super.onEnd(span);
  }
}

// The same identity the Rust services get from crates/telemetry and the Go
// ones from otel/, on all three signals. `defaultResource()` first so the
// telemetry.sdk.* attributes survive; the detectors NodeSDK runs afterwards
// (env, process, host) are merged on top, so OTEL_RESOURCE_ATTRIBUTES still
// overrides anything set here.
const resource = defaultResource().merge(
  resourceFromAttributes({
    "service.version": version,
    // Every Rocksky process shares a namespace, which is what lets a backend
    // show "all of Rocksky" without naming the services by hand.
    "service.namespace": "rocksky",
    // Tells the two processes built from this codebase apart across a
    // restart — pid and start time, legible enough to match against ps and
    // journalctl without a lookup.
    "service.instance.id": `${process.pid}-${Date.now()}`,
    ...(process.env.DEPLOYMENT_ENVIRONMENT
      ? { "deployment.environment.name": process.env.DEPLOYMENT_ENVIRONMENT }
      : {}),
  }),
);

const sdk = new NodeSDK({
  serviceName,
  resource,
  spanProcessors: [
    new ScrubbingSpanProcessor(new OTLPTraceExporter({ url: tracesUrl })),
  ],
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: metricsUrl }),
    exportIntervalMillis: 10_000,
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: logsUrl })),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs/net/dns produce enormous span volume for no diagnostic value here
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
    }),
  ],
});

sdk.start();

// Bridge consola to OTel logs so every existing consola.* call ships to the
// collector, correlated with the active span.
const CONSOLA_SEVERITY: Record<number, SeverityNumber> = {
  0: SeverityNumber.ERROR,
  1: SeverityNumber.WARN,
  2: SeverityNumber.INFO,
  3: SeverityNumber.INFO,
  4: SeverityNumber.DEBUG,
  5: SeverityNumber.TRACE,
};

function redactText(text: string): string {
  return text
    .replace(/bearer\s+[\w\-.~+/=]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s"'?]+)\?[^\s"']*/g, "$1");
}

const otelLogger = logs.getLogger(serviceName);

consola.addReporter({
  log(logObj) {
    // Telemetry must never take the process down.
    try {
      const body = logObj.args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return arg.stack ?? arg.message;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" ");
      otelLogger.emit({
        severityNumber: CONSOLA_SEVERITY[logObj.level] ?? SeverityNumber.INFO,
        severityText: logObj.type,
        body: redactText(body),
        attributes: logObj.tag ? { "log.tag": logObj.tag } : undefined,
      });
    } catch {
      // ignore
    }
  },
});

const flushAndExit = (signal: NodeJS.Signals) => {
  sdk
    .shutdown()
    .catch(() => {})
    .finally(() => process.kill(process.pid, signal));
};
process.once("SIGTERM", () => flushAndExit("SIGTERM"));
process.once("SIGINT", () => flushAndExit("SIGINT"));
