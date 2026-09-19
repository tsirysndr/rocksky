import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";
import { xrpcRequestCounter, xrpcRequestDuration } from "metrics";

const tracer = trace.getTracer("rocksky-xrpc");

// One SERVER span per XRPC call, named by NSID, covering every method the
// lexicon router serves. Only the path and status code are recorded — never
// headers, query params, or request bodies.
export function xrpcTelemetry() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/xrpc/")) {
      return next();
    }
    const nsid = req.path.slice("/xrpc/".length) || "unknown";
    const startedAt = process.hrtime.bigint();

    // If http auto-instrumentation already opened a server span, nest under
    // it; otherwise pick up the caller's traceparent ourselves.
    const active = context.active();
    const parent = trace.getSpan(active)
      ? active
      : propagation.extract(active, req.headers);

    const span = tracer.startSpan(
      nsid,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "xrpc.method": nsid,
          "http.request.method": req.method,
          "url.path": req.path,
        },
      },
      parent,
    );

    res.on("finish", () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      span.setAttribute("http.response.status_code", res.statusCode);
      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
      const labels = {
        nsid,
        method: req.method,
        status: res.statusCode,
      };
      xrpcRequestCounter.add(1, labels);
      xrpcRequestDuration.record(seconds, labels);
    });

    context.with(trace.setSpan(parent, span), next);
  };
}
