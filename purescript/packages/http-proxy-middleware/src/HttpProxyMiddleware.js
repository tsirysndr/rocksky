import { createProxyMiddleware as create } from "http-proxy-middleware";
export const createProxyMiddleware = (target) => () => create({ target, changeOrigin: true });
