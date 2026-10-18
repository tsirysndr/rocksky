import { serve as honoServe } from "@hono/node-server";
export const serve = (app) => (port) => () => honoServe({ fetch: app.fetch, port });
