import dns from "node:dns";
import { consola } from "consola";
import { ctx } from "context";
import cors from "cors";
import { pool } from "drizzle";
import type { Request, Response } from "express";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "lexicon";
import cron from "node-cron";
import API from "./xrpc";

dns.setDefaultResultOrder("ipv4first");

process.on("unhandledRejection", (err) => {
  consola.error("Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  consola.error("Uncaught exception:", err);
});

cron.schedule("*/30 * * * *", async () => {
  // A concurrent refresh runs far longer than the pool's statement_timeout, so
  // it needs its own client with the cap lifted rather than a pooled query.
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    for (const view of [
      "user_artists_mv",
      "top_scrobblers_mv",
      "scrobbles_per_day_mv",
    ]) {
      try {
        await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);
      } catch (err) {
        consola.error(`Failed to refresh ${view}:`, err);
      }
    }
  } catch (err) {
    consola.error("Failed to run materialized view refresh:", err);
  } finally {
    client.release(true);
  }
});

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
