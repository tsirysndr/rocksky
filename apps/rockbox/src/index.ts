import { Hono } from "hono";
import { cors } from "hono/cors";

// CF Worker frontline for rockbox. Responsibilities:
//   1. Public hostname (rockbox.rocksky.app) + CORS.
//   2. Extract the DID from /:did/* and forward to rockbox-router on Fly.
//   3. Hold the shared bearer between the public edge and the router.
//
// The Fly router responds to our request with `fly-replay: instance=<id>`,
// Fly's anycast proxy then re-issues the request to the specific per-DID
// rockbox machine. So this Worker never sees the audio bytes pass through —
// it just authenticates and forwards.

type Env = {
  ROCKBOX_ROUTER_URL: string; // e.g. https://rockbox-router.fly.dev
  ROCKBOX_ROUTER_TOKEN: string; // matches ROUTER_AUTH_BEARER on the router
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/", (c) =>
  c.text(
    "rockbox.rocksky.app — per-user rockbox on Fly\n" +
      "GET /<did>/hls/audio.m3u8 → user's CMAF HLS stream\n" +
      "POST /<did>/graphql       → user's rockbox GraphQL\n",
  ),
);

// /:did/* — strip the DID, forward to the router with X-Rockbox-Id set.
//
// We strip the prefix because fly-replay forwards the URL verbatim to the
// rockbox machine, and that machine's internal proxy expects clean paths
// (/hls/, /seg/, /init.mp4, /graphql) — no /:did/ prefix.
app.all("/:id{[^/]+}/*", async (c) => forward(c.req.raw, c.env, c.req.param("id")));
app.all("/:id{[^/]+}", async (c) => forward(c.req.raw, c.env, c.req.param("id"), true));

async function forward(req: Request, env: Env, did: string, rootOnly = false): Promise<Response> {
  const inUrl = new URL(req.url);
  const stripped = rootOnly ? "/" : inUrl.pathname.slice(1 + did.length) || "/";

  const target = new URL(env.ROCKBOX_ROUTER_URL);
  target.pathname = stripped;
  target.search = inUrl.search;

  const headers = new Headers(req.headers);
  headers.set("X-Rockbox-Id", did);
  headers.set("Authorization", `Bearer ${env.ROCKBOX_ROUTER_TOKEN}`);
  // Drop CF's host/cf-* hop headers so they don't confuse Fly's proxy.
  headers.delete("host");

  return fetch(target.toString(), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    // Required when forwarding a streamed body to a sub-request.
    // @ts-expect-error — duplex is a valid Workers RequestInit field.
    duplex: "half",
    redirect: "manual",
  });
}

export default app;
