import { serve } from "@hono/node-server";
import { createScrobbleRuntime } from "./scrobbles/runtime";
import { scrobblesStreamApp } from "./scrobbles/stream-app";

const runtime = createScrobbleRuntime();
const app = scrobblesStreamApp(runtime.events);
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
