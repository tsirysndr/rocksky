import { basename } from "node:path";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { consola } from "consola";

// MUST be imported before any other module (express, pg, ioredis, …) so
// auto-instrumentation can patch them, and before "./metrics" so instruments
// bind to a real MeterProvider instead of the no-op one.

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

const sdk = new NodeSDK({
  serviceName,
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
