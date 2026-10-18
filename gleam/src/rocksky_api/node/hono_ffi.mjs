import { Hono } from "hono";
import { cors as honoCors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve as nodeServe } from "@hono/node-server";
import { Ok, Error as GError, toList, BitArray } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

const opt = (v) => (v === undefined || v === null ? new None() : new Some(v));
const wrap = (p, f = (v) => v) => p.then((v) => new Ok(f(v)), (e) => new GError(e));
const toBits = (buf) => new BitArray(new Uint8Array(buf));

export const newApp = () => new Hono();
export const on = (app, method, path, handler) => {
  app[method](path, (c) => handler(c));
  return app;
};
export const use = (app, path, middleware) => {
  app.use(path, async (c, next) => {
    const r = await middleware(c, () => next());
    return r instanceof Some ? r[0] : undefined;
  });
  return app;
};
export const cors = (app) => {
  app.use(honoCors());
  return app;
};
export const route = (app, path, sub) => {
  app.route(path, sub);
  return app;
};
export const serve = (app, port) => {
  nodeServe({ fetch: app.fetch, port });
};

export const param = (c, name) => c.req.param(name) ?? "";
export const query = (c, name) => opt(c.req.query(name));
export const queries = (c) => toList(Object.entries(c.req.query()));
export const header = (c, name) => opt(c.req.header(name));
export const method = (c) => c.req.method;
export const path = (c) => c.req.path;
export const url = (c) => c.req.url;
export const jsonBody = (c) => wrap(c.req.json());
export const textBody = (c) => wrap(c.req.text());
export const bytesBody = (c) => wrap(c.req.arrayBuffer(), toBits);
export const formData = (c) => wrap(c.req.formData());
export const formString = (form, name) => {
  const v = form.get(name);
  return typeof v === "string" ? new Some(v) : new None();
};
export const formFile = (form, name) => {
  const v = form.get(name);
  return v && typeof v === "object" && typeof v.arrayBuffer === "function" ? new Some(v) : new None();
};
export const fileName = (f) => f.name ?? "";
export const fileType = (f) => f.type ?? "";
export const fileSize = (f) => f.size ?? 0;
export const fileBytes = (f) => wrap(f.arrayBuffer(), toBits);
export const raw = (c) => c.req.raw;

export const setHeader = (c, name, value) => {
  c.header(name, value);
};
export const json = (c, body, status) => c.json(body, status);
export const text = (c, body, status) => c.text(body, status);
export const html = (c, body, status) => c.html(body, status);
export const redirect = (c, url) => c.redirect(url);
export const bytes = (c, body, status, contentType) =>
  c.body(body.rawBuffer ?? body.buffer, status, { "content-type": contentType });
export const empty = (c, status) => c.body(null, status);
export const proxyFetch = async (c, url, fallback) => {
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return new Ok(c.text("Upstream error", 502));
    const contentType = upstream.headers.get("content-type") ?? fallback;
    return new Ok(new Response(upstream.body, { headers: { "content-type": contentType } }));
  } catch (e) {
    return new GError(e);
  }
};
export const rawResponse = (r) => r;

export const streamSse = (c, body) => streamSSE(c, (stream) => body(stream));
export const writeSse = (stream, event, data) => wrap(stream.writeSSE({ event, data }), () => undefined);
export const onAbort = (stream, f) => {
  stream.onAbort(() => f());
};
export const streamSleep = (stream, ms) => stream.sleep(ms).then(() => undefined);
export const streamClosed = (stream) => !!stream.closed || !!stream.aborted;
export const bodyResponse = (body, headers, status) => new Response(body, {status,headers:Object.fromEntries(headers.toArray())});
export const fileText=file=>file.text().then(v=>new Ok(v),e=>new GError(e));
