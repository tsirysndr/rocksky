import {
  metrics,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { MiddlewareHandler } from "@hono/hono";
import type { Pool } from "pg";

// Deno ships OpenTelemetry in the runtime: with OTEL_DENO=true it exports
// traces for Deno.serve/fetch, the runtime metrics, and every console.* call as
// a log record, all over OTLP. There is no SDK to start here — this module only
// adds the spans and metrics Deno cannot know about.

export const SERVICE_NAME = "rocksky-feeds";

export const tracer = trace.getTracer(SERVICE_NAME);
const meter = metrics.getMeter(SERVICE_NAME);

const httpRequestCounter = meter.createCounter("http_requests_total", {
  description: "Count of incoming requests, by route and status code",
});

const httpRequestDuration = meter.createHistogram(
  "http_request_duration_seconds",
  {
    description: "Request duration in seconds, by route",
    unit: "s",
  },
);

export const feedRequestCounter = meter.createCounter("feed_requests_total", {
  description: "Count of feed skeleton requests, by algorithm and outcome",
});

export const feedRequestDuration = meter.createHistogram(
  "feed_request_duration_seconds",
  {
    description: "Feed skeleton duration in seconds, by algorithm",
    unit: "s",
  },
);

export const feedItemsReturned = meter.createHistogram("feed_items_returned", {
  description: "Number of scrobbles returned per feed skeleton request",
});

const dbQueryDuration = meter.createHistogram("db_query_duration_seconds", {
  description: "Postgres query duration in seconds, by operation",
  unit: "s",
});

const seconds = (startedAt: number) => (performance.now() - startedAt) / 1000;

export function recordError(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
}

// The NSID is the only useful route label here: the XRPC router matches every
// method on one pattern, so c.req.routePath would collapse them all together.
const routeOf = (path: string): string =>
  path.startsWith("/xrpc/") ? path.slice("/xrpc/".length) : path;

export function telemetry(): MiddlewareHandler {
  return async (c, next) => {
    const route = routeOf(c.req.path);
    const startedAt = performance.now();
    trace.getActiveSpan()?.setAttributes({
      "http.route": route,
      ...(route === c.req.path ? {} : { "xrpc.method": route }),
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

type QueryArgs = readonly unknown[];
type QueryFn = (...args: QueryArgs) => unknown;

const statementOf = (config: unknown): string => {
  if (typeof config === "string") return config;
  if (config && typeof config === "object" && "text" in config) {
    return String((config as { text: unknown }).text);
  }
  return "";
};

// Drizzle runs every query through pool.query, so wrapping it once covers the
// whole data layer. Statement text is parameterized by drizzle; the bound
// values stay out of telemetry.
export function instrumentPool(pool: Pool): Pool {
  const query = pool.query.bind(pool) as QueryFn;

  const instrumented: QueryFn = (...args: QueryArgs) => {
    // The callback form never returns a promise; leave it alone.
    if (typeof args.at(-1) === "function") return query(...args);

    const statement = statementOf(args[0]);
    const operation = /^\s*(\w+)/.exec(statement)?.[1]?.toUpperCase() ??
      "UNKNOWN";
    const startedAt = performance.now();

    return tracer.startActiveSpan(
      "pg.query",
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "db.system": "postgresql",
          "db.operation": operation,
          "db.statement": statement,
        },
      },
      (span) => {
        const finish = (status: "ok" | "error") => {
          span.end();
          dbQueryDuration.record(seconds(startedAt), { operation, status });
        };
        try {
          return Promise.resolve(query(...args)).then(
            (result) => {
              finish("ok");
              return result;
            },
            (error: unknown) => {
              recordError(span, error);
              finish("error");
              throw error;
            },
          );
        } catch (error) {
          recordError(span, error);
          finish("error");
          throw error;
        }
      },
    );
  };

  pool.query = instrumented as typeof pool.query;
  return pool;
}
