import { Hono } from "@hono/hono";
import { ctx, type AppEnv } from "./src/context.ts";
import { createServer } from "./src/lex/index.ts";
import describeFeedGenerator from "./src/api/describeFeedGenerator.ts";
import getFeedSkeleton from "./src/api/getFeedSkeleton.ts";
import health from "./src/api/health.ts";
import wellKnown from "./src/api/well-known.ts";
import { env } from "./src/utils/env.ts";

const app = new Hono<AppEnv>();

const server = createServer();
describeFeedGenerator(server, ctx);
getFeedSkeleton(server, ctx);

app.route("/", server.xrpc.app);

app.get("/", (c) => {
  return c.text(
    "This is a Feed Generation service! Most endpoints are under /xrpc",
  );
});

app.route("/.well-known", wellKnown);
app.route("/", health);

Deno.serve({ port: env.ROCKSKY_FEEDGEN_PORT }, app.fetch);
