import express from "express";

export const newApp = () => express();
export const useMiddlewareImpl = (app, mw) => {
  app.use((req, res, next) => mw(req, res, () => next()));
};
export const useRouter = (app) => (router) => () => {
  app.use(router);
};
export const usePathRouter = (app) => (path) => (router) => () => {
  app.use(path, router);
};
export const listen = (app) => (port) => (cb) => () => {
  app.listen(port, () => cb());
};
export const reqHeaderImpl = (req) => (k) => {
  const v = req.headers[k.toLowerCase()];
  return v === undefined ? null : Array.isArray(v) ? v.join(", ") : v;
};
export const reqHeaders = (req) => req.headers;
export const reqPath = (req) => req.path;
export const reqMethod = (req) => req.method;
export const reqQuery = (req) => req.query;
export const resStatusCode = (res) => () => res.statusCode;
export const onFinish = (res) => (f) => () => {
  res.on("finish", () => f());
};
export const toRouter = (x) => x;

export const sendJson = res => body => () => { res.json(body); };
export const setHeader = res => name => value => () => { res.setHeader(name, value); };
