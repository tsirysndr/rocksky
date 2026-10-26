#!/usr/bin/env node
import 'dotenv/config';

// Start instrumentation before importing Hono, pg, or the application modules.
if (process.env.OTEL_DENO === 'true' || process.env.OTEL_ENABLED === 'true') {
  const {start} = await import('../output/OpenTelemetry.Sdk/foreign.js');
  const base = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318').replace(/\/$/, '');
  globalThis.rockskyFeedsTelemetry = start({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'rocksky-feeds',
    serviceVersion: process.env.COMMIT_SHA ?? 'unknown',
    serviceNamespace: 'rocksky', instanceId: `${process.pid}`,
    deploymentEnvironment: process.env.NODE_ENV ?? 'development',
    tracesUrl: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? `${base}/v1/traces`,
    metricsUrl: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? `${base}/v1/metrics`,
    logsUrl: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? `${base}/v1/logs`,
    metricExportIntervalMillis: 60000,
    sensitiveKeyPattern: 'authorization|cookie|token|password|secret|(^|\\.)did$',
    disabledInstrumentations: ['@opentelemetry/instrumentation-fs', '@opentelemetry/instrumentation-pg'],
  })();
}
const {main} = await import('../output/Rocksky.Feeds.Index/index.js');
main();
