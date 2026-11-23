import { Hono } from "hono";
import { scrobbleEventsApp } from "./events";
import { createScrobbleRuntime } from "./runtime";

// The main API can serve the same route; production can isolate the long-lived
// connections in scrobbles-stream.ts without restarting the application API.
const app = new Hono();
let stream: ReturnType<typeof scrobbleEventsApp> | undefined;
app.get("/events/scrobbles", (c) => {
  if (!stream) {
    const runtime = createScrobbleRuntime();
    stream = scrobbleEventsApp(runtime.events, () => runtime.start());
  }
  return stream.fetch(c.req.raw);
});
export default app;
