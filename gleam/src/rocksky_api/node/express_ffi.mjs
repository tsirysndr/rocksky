import express from "express";
import corsMiddleware from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";

export const newApp = () => express();
export const use = (app, m) => {
  app.use(m);
  return app;
};
export const cors = () => corsMiddleware();
export const proxy = (target) => createProxyMiddleware({ target, changeOrigin: true });
export const middleware = (f) => (req, res, next) => f(req, res, () => next());
export const listen = (app, port, cb) => {
  app.listen(port, () => cb());
};
export const path = (req) => req.path;
export const method = (req) => req.method;
export const header = (req, name) => {
  const v = req.headers[name.toLowerCase()];
  return v === undefined ? new None() : new Some(Array.isArray(v) ? v[0] : v);
};
export const headers = (req) => req.headers;
export const statusCode = (res) => res.statusCode;
export const onFinish = (res, f) => {
  res.on("finish", () => f());
};
export const setHeader = (res, name, value) => {
  res.setHeader(name, value);
};

export const sendJson = (res, body) => { res.json(body); };
