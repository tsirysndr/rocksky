import { Hono } from "hono";

export const newApp = () => new Hono();
export const methodImpl = (m) => (app, path, h) => {
  app[m](path, (c) => h(c));
};
export const onImpl = (app, path, h) => {
  app.all(path, (c) => h(c));
};
export const route = (app) => (path) => (sub) => () => {
  app.route(path, sub);
};
export const useImpl = (app, path, mw) => {
  app.use(path, async (c, next) => {
    const r = await mw(c, () => next());
    if (r !== null && r !== undefined) return r;
  });
};
export const toNullableM = (m) => (m.constructor && m.constructor.name === "Just" ? m.value0 : null);
export const fetchHandler = (app) => app.fetch;
export const onErrorImpl = (app, f) => {
  app.onError((err, c) => f(err, c));
};
export const notFoundImpl = (app, h) => {
  app.notFound((c) => h(c));
};

export const reqHeaderImpl = (c) => (k) => c.req.header(k) ?? null;
export const reqRawHeaderImpl = (c) => (k) => c.req.raw.headers.get(k);
export const reqParam = (c) => (k) => c.req.param(k) ?? "";
export const reqQueryImpl = (c) => (k) => c.req.query(k) ?? null;
export const reqQueries = (c) => (k) => c.req.queries(k) ?? [];
export const reqJsonImpl = (c) => () => c.req.json();
export const reqTextImpl = (c) => () => c.req.text();
export const reqFormDataImpl = (c) => () => c.req.formData();
export const reqArrayBufferImpl = (c) => () => c.req.arrayBuffer().then((ab) => Buffer.from(ab));
export const reqMethod = (c) => c.req.method;
export const reqPath = (c) => c.req.path;
export const reqUrl = (c) => c.req.url;

export const formGetImpl = (f) => (k) => {
  const v = f.get(k);
  return typeof v === "string" ? v : null;
};
export const formGetFileImpl = (f) => (k) => {
  const v = f.get(k);
  return v && typeof v === "object" && typeof v.arrayBuffer === "function" ? v : null;
};
export const fileName = (f) => f.name ?? "";
export const fileType = (f) => f.type ?? "";
export const fileSize = (f) => f.size ?? 0;
export const fileBufferImpl = (f) => () => f.arrayBuffer().then((ab) => Buffer.from(ab));

export const status = (c) => (code) => () => {
  c.status(code);
};
export const setHeader = (c) => (k) => (v) => () => {
  c.header(k, v);
};
export const json = (c) => (v) => () => c.json(v);
export const jsonWith = (c) => (v) => (s) => () => c.json(v, s);
export const text = (c) => (s) => () => c.text(s);
export const textWith = (c) => (s) => (st) => () => c.text(s, st);
export const html = (c) => (s) => () => c.html(s);
export const redirect = (c) => (url) => (s) => () => c.redirect(url, s);
export const body = (c) => (data) => (s) => (headers) => () => c.body(data, s, headers);
export const toForeign = (x) => x;
export const rawResponse = (r) => r;
export const notFoundResponse = (c) => () => c.notFound();
export const setVar = (c) => (k) => (v) => () => {
  c.set(k, v);
};
export const getVarImpl = (c) => (k) => () => c.get(k) ?? null;

export const formValue = f => key => f.get(key);
export const fileTextImpl = file => () => file.text();
