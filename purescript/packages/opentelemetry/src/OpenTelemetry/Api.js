import { context, metrics, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

export const getActiveSpanImpl = () => trace.getActiveSpan() ?? null;
export const updateName = (s) => (n) => () => {
  s.updateName(n);
};
export const setAttribute = (s) => (k) => (v) => () => {
  s.setAttribute(k, v);
};
export const setAttributeNumber = (s) => (k) => (v) => () => {
  s.setAttribute(k, v);
};
export const setAttributes = (s) => (a) => () => {
  s.setAttributes(a);
};
export const addEvent = (s) => (n) => () => {
  s.addEvent(n);
};
export const addEventWith = (s) => (n) => (a) => () => {
  s.addEvent(n, a);
};
export const recordException = (s) => (e) => () => {
  s.recordException(e);
};
export const setStatusError = (s) => () => {
  s.setStatus({ code: SpanStatusCode.ERROR });
};
export const endSpan = (s) => () => {
  s.end();
};

export const getTracer = (name) => () => trace.getTracer(name);

export const startServerSpanFromHeadersImpl = (tracer, name, o) => {
  const active = context.active();
  const parent = trace.getSpan(active) ? active : propagation.extract(active, o.headers);
  const span = tracer.startSpan(name, { kind: SpanKind.SERVER, attributes: o.attributes }, parent);
  span.__parentContext = parent;
  return span;
};

export const withSpanActiveImpl = (span, f) => {
  const parent = span.__parentContext ?? context.active();
  context.with(trace.setSpan(parent, span), () => f());
};

export const getMeter = (name) => () => metrics.getMeter(name);
export const createCounter = (m) => (name) => (description) => () => m.createCounter(name, { description });
export const createHistogram = (m) => (name) => (description) => () => m.createHistogram(name, { description });
export const counterAdd = (c) => (n) => (attrs) => () => {
  c.add(n, attrs);
};
export const histogramRecord = (h) => (n) => (attrs) => () => {
  h.record(n, attrs);
};
