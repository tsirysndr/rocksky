import { context, metrics, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { consola } from "consola";

const SENSITIVE_KEY = /authorization|cookie|set-cookie|token|secret|passw|api[-_]?key|session/i;
const URL_VALUE_KEY = /^(http\.url|http\.target|url\.full)$/;

function scrubAttributes(attributes) {
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (SENSITIVE_KEY.test(key)) attributes[key] = "[REDACTED]";
    else if (key === "url.query") delete attributes[key];
    else if (URL_VALUE_KEY.test(key) && typeof value === "string") attributes[key] = value.split("?")[0];
  }
}

class ScrubbingSpanProcessor extends BatchSpanProcessor {
  onEnd(span) {
    scrubAttributes(span.attributes);
    super.onEnd(span);
  }
}

const CONSOLA_SEVERITY = {
  0: SeverityNumber.ERROR,
  1: SeverityNumber.WARN,
  2: SeverityNumber.INFO,
  3: SeverityNumber.INFO,
  4: SeverityNumber.DEBUG,
  5: SeverityNumber.TRACE,
};

const redactText = (text) =>
  text
    .replace(/bearer\s+[\w\-.~+/=]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s"'?]+)\?[^\s"']*/g, "$1");

let started = false;

export const start = (defaultServiceName, version) => {
  if (started) return;
  started = true;
  const otlpBase = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318").replace(/\/+$/, "");
  const tracesUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? `${otlpBase}/v1/traces`;
  const metricsUrl = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? `${otlpBase}/v1/metrics`;
  const logsUrl = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? `${otlpBase}/v1/logs`;
  const serviceName = process.env.OTEL_SERVICE_NAME ?? defaultServiceName;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      "service.version": version,
      "service.namespace": "rocksky",
      "service.instance.id": `${process.pid}-${Date.now()}`,
      ...(process.env.DEPLOYMENT_ENVIRONMENT
        ? { "deployment.environment.name": process.env.DEPLOYMENT_ENVIRONMENT }
        : {}),
    }),
  );

  const sdk = new NodeSDK({
    serviceName,
    resource,
    spanProcessors: [new ScrubbingSpanProcessor(new OTLPTraceExporter({ url: tracesUrl }))],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: metricsUrl }),
      exportIntervalMillis: 10_000,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: logsUrl }))],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });
  sdk.start();

  const otelLogger = logs.getLogger(serviceName);
  consola.addReporter({
    log(logObj) {
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
      } catch {}
    },
  });

  const flushAndExit = (signal) => {
    sdk
      .shutdown()
      .catch(() => {})
      .finally(() => process.kill(process.pid, signal));
  };
  process.once("SIGTERM", () => flushAndExit("SIGTERM"));
  process.once("SIGINT", () => flushAndExit("SIGINT"));
};

const meter = () => metrics.getMeter("rocksky-api");
const attrs = (list) => Object.fromEntries(list.toArray());
export const counter = (name, description) => meter().createCounter(name, { description });
export const histogram = (name, description) => meter().createHistogram(name, { description });
export const counterAdd = (c, v, a) => c.add(v, attrs(a));
export const histogramRecord = (h, v, a) => h.record(v, attrs(a));

export const updateActiveSpan = (name, route) => {
  const span = trace.getActiveSpan();
  span?.updateName(name);
  span?.setAttribute("http.route", route);
};
export const parentContext = (headers) => {
  const active = context.active();
  return trace.getSpan(active) ? active : propagation.extract(active, headers);
};
export const startServerSpan = (tracer, name, attributes, parent) =>
  trace.getTracer(tracer).startSpan(name, { kind: SpanKind.SERVER, attributes: attrs(attributes) }, parent);
export const setAttributeInt = (span, k, v) => {
  span.setAttribute(k, v);
};
export const setStatusError = (span) => {
  span.setStatus({ code: SpanStatusCode.ERROR });
};
export const endSpan = (span) => {
  span.end();
};
export const withSpan = (parent, span, f) => {
  context.with(trace.setSpan(parent, span), f);
};
