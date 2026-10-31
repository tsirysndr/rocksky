import { serve as honoServe } from "@hono/node-server";
export const serve = (app) => (port) => () => honoServe({ fetch: app.fetch, port });
export const serveOn = (app) => (hostname) => (port) => () => honoServe({ fetch: app.fetch, hostname, port });
