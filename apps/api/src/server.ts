import { consola } from "consola";
import { ctx } from "context";
import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "lexicon";
import dns from "node:dns";
import API from "./xrpc";
dns.setDefaultResultOrder("ipv4first");

const proxyMiddleware = createProxyMiddleware<Request, Response>({
  target: "http://localhost:8000",
  changeOrigin: true,
});

let server = createServer({
  validateResponse: false,
  payload: {
    jsonLimit: 100 * 1024, // 100kb
    textLimit: 100 * 1024, // 100kb
    blobLimit: 5 * 1024 * 1024, // 5mb
  },
});

server = API(server, ctx);

const app = express();
app.use(cors());
app.use(server.xrpc.router);
app.use(proxyMiddleware);

app.listen(process.env.ROCKSKY_XPRC_PORT || 3004, () => {
  consola.info(
    `Rocksky XRPC API is running on port ${process.env.ROCKSKY_XRPC_PORT || 3004}`,
  );
});
