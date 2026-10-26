// OpenTelemetry adapters retained from apps/feeds; the Node SDK is started by index.js.
import {
  metrics,
  SpanKind,
  SpanStatusCode,
  trace
} from "@opentelemetry/api";
const SERVICE_NAME = "rocksky-feeds";
const tracer = trace.getTracer(SERVICE_NAME);
const meter = metrics.getMeter(SERVICE_NAME);
const httpRequestCounter = meter.createCounter("http_requests_total", {
  description: "Count of incoming requests, by route and status code"
});
const httpRequestDuration = meter.createHistogram(
  "http_request_duration_seconds",
  {
    description: "Request duration in seconds, by route",
    unit: "s"
  }
);
const feedRequestCounter = meter.createCounter("feed_requests_total", {
  description: "Count of feed skeleton requests, by algorithm and outcome"
});
const feedRequestDuration = meter.createHistogram(
  "feed_request_duration_seconds",
  {
    description: "Feed skeleton duration in seconds, by algorithm",
    unit: "s"
  }
);
const feedItemsReturned = meter.createHistogram("feed_items_returned", {
  description: "Number of scrobbles returned per feed skeleton request"
});
const dbQueryDuration = meter.createHistogram("db_query_duration_seconds", {
  description: "Postgres query duration in seconds, by operation",
  unit: "s"
});
const seconds = (startedAt) => (performance.now() - startedAt) / 1e3;
function recordError(span, error) {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error)
  });
}
const routeOf = (path) => path.startsWith("/xrpc/") ? path.slice("/xrpc/".length) : path;
function telemetry() {
  return async (c, next) => {
    const route = routeOf(c.req.path);
    const startedAt = performance.now();
    trace.getActiveSpan()?.setAttributes({
      "http.route": route,
      ...route === c.req.path ? {} : { "xrpc.method": route }
    });
    let status = 500;
    try {
      await next();
      status = c.res.status;
    } finally {
      const labels = { route, method: c.req.method, status };
      httpRequestCounter.add(1, labels);
      httpRequestDuration.record(seconds(startedAt), labels);
    }
  };
}
const statementOf = (config) => {
  if (typeof config === "string") return config;
  if (config && typeof config === "object" && "text" in config) {
    return String(config.text);
  }
  return "";
};
function instrumentPool(pool) {
  const query = pool.query.bind(pool);
  const instrumented = (...args) => {
    if (typeof args.at(-1) === "function") return query(...args);
    const statement = statementOf(args[0]);
    const operation = /^\s*(\w+)/.exec(statement)?.[1]?.toUpperCase() ?? "UNKNOWN";
    const startedAt = performance.now();
    return tracer.startActiveSpan(
      "pg.query",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "db.system": "postgresql",
          "db.operation": operation,
          "db.statement": statement
        }
      },
      (span) => {
        const finish = (status) => {
          span.end();
          dbQueryDuration.record(seconds(startedAt), { operation, status });
        };
        try {
          return Promise.resolve(query(...args)).then(
            (result) => {
              finish("ok");
              return result;
            },
            (error) => {
              recordError(span, error);
              finish("error");
              throw error;
            }
          );
        } catch (error) {
          recordError(span, error);
          finish("error");
          throw error;
        }
      }
    );
  };
  pool.query = instrumented;
  return pool;
}
export {
  SERVICE_NAME,
  feedItemsReturned,
  feedRequestCounter,
  feedRequestDuration,
  instrumentPool,
  recordError,
  telemetry,
  tracer
};
