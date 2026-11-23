import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { scrobbleEventsApp } from "./scrobbles/events";
import { createScrobbleRuntime } from "./scrobbles/runtime";

const runtime = createScrobbleRuntime();
const app = new Hono();
app.route("/", scrobbleEventsApp(runtime.events));
app.get("/health", (c) =>
  c.json(
    { healthy: runtime.events.healthy, clients: runtime.events.clients },
    runtime.events.healthy ? 200 : 503,
  ),
);
runtime.start();
const server = serve({
  fetch: app.fetch,
  hostname: process.env.SCROBBLES_SSE_HOST || "127.0.0.1",
  port: Number(process.env.SCROBBLES_SSE_PORT || 8115),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close();
    void runtime.stop().finally(() => process.exit(0));
  });
