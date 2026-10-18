import { logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const URL_VALUE_KEY = /^(http\.url|http\.target|url\.full)$/;

function scrubber(sensitive) {
  return (attributes) => {
    for (const key of Object.keys(attributes)) {
      const value = attributes[key];
      if (sensitive.test(key)) attributes[key] = "[REDACTED]";
      else if (key === "url.query") delete attributes[key];
      else if (URL_VALUE_KEY.test(key) && typeof value === "string") attributes[key] = value.split("?")[0];
    }
  };
}

export const start = (cfg) => () => {
  const scrub = scrubber(new RegExp(cfg.sensitiveKeyPattern, "i"));
  class ScrubbingSpanProcessor extends BatchSpanProcessor {
    onEnd(span) {
      scrub(span.attributes);
      super.onEnd(span);
    }
  }
  const attrs = {
    "service.version": cfg.serviceVersion,
    "service.namespace": cfg.serviceNamespace,
    "service.instance.id": cfg.instanceId,
  };
  if (cfg.deploymentEnvironment !== null) attrs["deployment.environment.name"] = cfg.deploymentEnvironment;
  const resource = defaultResource().merge(resourceFromAttributes(attrs));
  const disabled = {};
  for (const name of cfg.disabledInstrumentations) disabled[name] = { enabled: false };
  const sdk = new NodeSDK({
    serviceName: cfg.serviceName,
    resource,
    spanProcessors: [new ScrubbingSpanProcessor(new OTLPTraceExporter({ url: cfg.tracesUrl }))],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: cfg.metricsUrl }),
      exportIntervalMillis: cfg.metricExportIntervalMillis,
    }),
    logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: cfg.logsUrl }))],
    instrumentations: [getNodeAutoInstrumentations(disabled)],
  });
  sdk.start();
  return sdk;
};

export const shutdownImpl = (sdk) => () => sdk.shutdown().catch(() => {});
export const getLogger = (name) => () => logs.getLogger(name);
export const emitLog = (logger) => (r) => () => {
  logger.emit({
    severityNumber: r.severityNumber,
    severityText: r.severityText,
    body: r.body,
    attributes: Object.keys(r.attributes).length > 0 ? r.attributes : undefined,
  });
};
