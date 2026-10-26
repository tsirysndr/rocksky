// Start the Node SDK before importing application instrumentation.
export async function startTelemetry(){
 if(process.env.OTEL_SDK_DISABLED==='true')return;
 if(process.env.OTEL_ENABLED!=='true'&&process.env.OTEL_DENO!=='true'&&!process.env.OTEL_EXPORTER_OTLP_ENDPOINT)return;
 const [{NodeSDK},{OTLPTraceExporter},{OTLPMetricExporter},{PeriodicExportingMetricReader},{OTLPLogExporter},{BatchLogRecordProcessor},{resourceFromAttributes}]=await Promise.all([
  import('@opentelemetry/sdk-node'),import('@opentelemetry/exporter-trace-otlp-http'),import('@opentelemetry/exporter-metrics-otlp-http'),import('@opentelemetry/sdk-metrics'),import('@opentelemetry/exporter-logs-otlp-http'),import('@opentelemetry/sdk-logs'),import('@opentelemetry/resources'),
 ]);
 const sdk=new NodeSDK({serviceName:process.env.OTEL_SERVICE_NAME||'rocksky-feeds',resource:resourceFromAttributes({'service.namespace':'rocksky','service.version':process.env.COMMIT_SHA||'unknown'}),traceExporter:new OTLPTraceExporter(),metricReader:new PeriodicExportingMetricReader({exporter:new OTLPMetricExporter(),exportIntervalMillis:10000}),logRecordProcessors:[new BatchLogRecordProcessor(new OTLPLogExporter())]});
 sdk.start();globalThis.__rockskyFeedsShutdown=()=>sdk.shutdown();
}
