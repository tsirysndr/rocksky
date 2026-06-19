import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config";
import { forgetMachine, userExistsByDid } from "./db";
import { ensureMachine } from "./ensure";
import { destroyMachine } from "./fly";
import { logger } from "./logger";

const app = new Hono();

app.use("*", cors());

app.use("*", async (c, next) => {
  const start = performance.now();
  const { method, url } = c.req;
  const did = c.req.header("x-rockbox-id");
  await next();
  const ms = Math.round(performance.now() - start);
  logger.info(`${method} ${new URL(url).pathname} → ${c.res.status} (${ms}ms)`, {
    did,
    region: c.req.header("x-rockbox-region"),
  });
});

app.get("/healthz", (c) => c.text("ok"));

// Optional: shared-secret gate. The CF Worker (or whatever fronts this) sends
// `Authorization: Bearer <ROUTER_AUTH_BEARER>`. Skipped when unset.
const requireAuth = async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) => {
  if (!config.authBearer) return next();
  if (c.req.header("authorization") !== `Bearer ${config.authBearer}`) {
    logger.warn("rejected unauthorized request", {
      path: new URL(c.req.url).pathname,
    });
    return c.text("unauthorized", 401);
  }
  return next();
};

// Admin: tear down a user's machine (e.g. on account delete).
app.delete("/admin/:did", requireAuth, async (c) => {
  const did = c.req.param("did");
  // We don't store the id here cheaply — caller passes ?machineId= if known,
  // otherwise we noop on Fly and just drop the row.
  const mid = c.req.query("machineId");
  logger.info("admin delete", { did, machineId: mid });
  if (mid) {
    await destroyMachine(mid).catch((e) => {
      logger.warn("destroyMachine failed (continuing)", { machineId: mid, err: String(e) });
    });
  }
  await forgetMachine(did);
  return c.text("ok");
});

// Main routing rule. The CF Worker (or any upstream) MUST send `X-Rockbox-Id:
// <did>` — we look up (or create) that user's Fly machine and tell Fly's
// anycast proxy to replay the request to it.
//
//   client → CF Worker → router (Fly) → fly-replay → rockbox-<did> machine
//
// We deliberately do NOT route off the URL path: the path that arrives here is
// the path that arrives at the rockbox machine (fly-replay replays verbatim).
// Keeping DID-in-header means the rockbox container's existing routes
// (/hls/, /seg/, /init.mp4, /graphql) work unmodified.
app.all("*", requireAuth, async (c) => {
  const did = c.req.header("x-rockbox-id");
  if (!did) {
    logger.warn("missing X-Rockbox-Id header", { path: new URL(c.req.url).pathname });
    return c.text("missing X-Rockbox-Id header", 400);
  }

  // Only provision machines for DIDs that belong to a registered user — keeps
  // anonymous / typo'd DIDs from spinning up Fly machines.
  if (!(await userExistsByDid(did))) {
    logger.warn("unknown did, skipping provision", { did });
    return c.text("unknown did", 404);
  }

  const region = c.req.header("x-rockbox-region") ?? undefined;

  let machineId: string;
  try {
    machineId = await ensureMachine(did, region);
  } catch (e) {
    logger.error("ensureMachine failed", { did, region, err: String(e) });
    return c.text("failed to allocate rockbox instance", 502);
  }

  // The rockbox machines live in `config.flyApp` (e.g. "rockbox"), but this
  // router is its own app ("rockbox-router"). Cross-app replays REQUIRE the
  // `app=<name>` directive — without it the proxy looks for the instance ID
  // inside the router's own app, doesn't find it, and fails with PR04:
  // "could not find a good candidate within 40 attempts at load balancing".
  const replay = `app=${config.flyApp};instance=${machineId}`;
  logger.debug("fly-replay → machine", { did, machineId, replay });

  // https://fly.io/docs/networking/dynamic-request-routing/#the-fly-replay-response-header
  return new Response(null, {
    status: 204,
    headers: { "fly-replay": replay },
  });
});

logger.success(`rockbox-router listening on :${config.port}`, {
  flyApp: config.flyApp,
  defaultRegion: config.defaultRegion,
  authGate: config.authBearer ? "on" : "off",
});
export default { port: config.port, fetch: app.fetch };
