import { Hono } from "hono";
import { ScrobbleEvents, scrobbleEventsApp } from "./events";

export const banner = String.raw`    ____             __        __            __________ ______
   / __ \____  _____/ /_______/ /____  __   / ___/ ___// ____/
  / /_/ / __ \/ ___/ //_/ ___/ //_/ / / /   \__ \\__ \/ __/
 / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /   ___/ /__/ / /___
/_/ |_|\____/\___/_/|_/____/_/|_|\__, /   /____/____/_____/
                                /____/
`;

export function scrobblesStreamApp(events: ScrobbleEvents) {
  const app = new Hono();
  app.get(
    "/",
    () =>
      new Response(banner, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  );
  app.route("/", scrobbleEventsApp(events));
  app.get("/health", (c) =>
    c.json(
      { healthy: events.healthy, clients: events.clients },
      events.healthy ? 200 : 503,
    ),
  );
  return app;
}
