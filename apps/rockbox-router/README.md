# @rocksky/rockbox-router

One Fly app, many machines — one per DID.

```
browser → CF Worker → rockbox-router (this app) ──fly-replay──▶ rockbox-<did>
                          │                                       (tsiry/rockbox:latest)
                          └─ ensures the machine exists, starts it if stopped
```

The router itself is a single small Bun + Hono server. It owns:

1. **A `did → machine_id` mapping** in Postgres (`rockbox_machines` table; created on boot).
2. **Provisioning** through the Fly Machines API: image `tsiry/rockbox:latest`, `autostop = stop`, `autostart = true`.
3. **Routing** by responding with `fly-replay: instance=<machine_id>`. Fly's edge re-issues the original request to that machine — there is no double-hop on the data plane.

Per-DID machines stop on idle (`autostop = stop`) and boot on the next inbound request (`autostart = true`).

## Layout

```
src/
  index.ts    Hono app: /:did/* → ensureMachine → fly-replay
  ensure.ts   Coalesces concurrent first-play, repairs stale rows
  fly.ts      Fly Machines API client (create / wait / start / destroy)
  db.ts       Postgres-backed did→machine_id mapping
  config.ts   Env-var binding
Dockerfile    Bun runtime image for Fly
fly.toml      Router's own Fly config (not the rockbox machines)
```

## Image

The router spawns machines using whatever's at `ROCKBOX_IMAGE`. This must be the **composite image** (rockbox + Go proxy on :8080) built by [`apps/rockbox-image/`](../rockbox-image/) — NOT plain `tsiry/rockbox:latest`, which doesn't listen on 8080 and produces `PC01: instance refused connection` errors at the Fly edge.

Push the image first:

```
cd ../rockbox-image && ./deploy.sh
```

## Setup

```
cd apps/rockbox-router
bun install

# Make the rockbox app on Fly (this hosts the per-DID machines).
fly apps create rockbox --org <your-org>

# Make the router app and deploy this code to it.
fly apps create rockbox-router --org <your-org>
fly secrets set \
  FLY_API_TOKEN="$(fly tokens create deploy -a rockbox)" \
  ROUTER_POSTGRES_URL="postgresql://..." \
  ROUTER_AUTH_BEARER="$(openssl rand -hex 32)" \
  -a rockbox-router
fly deploy -a rockbox-router
```

`FLY_API_TOKEN` must have permission on the **rockbox** app, not on rockbox-router.

## CF Worker → router

Replace the in-Worker `container.fetch(...)` with a fetch to the router:

```ts
app.all("/:id/*", async (c) => {
  const url = new URL(c.req.url);
  url.host = "rockbox-router.fly.dev";
  return fetch(url, {
    method: c.req.method,
    headers: {
      ...Object.fromEntries(c.req.raw.headers),
      authorization: `Bearer ${c.env.ROCKBOX_ROUTER_TOKEN}`,
    },
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
  });
});
```

Or, if you don't need a CF-side auth gate, point `rockbox.rocksky.app` directly at `rockbox-router.fly.dev` (CNAME) and drop the Worker.

## Local dev

```
cp .env.example .env   # fill in FLY_API_TOKEN + ROUTER_POSTGRES_URL
bun run dev
```

The router will hit the real Fly API and create real machines. To test without that, point `FLY_API_BASE` at a mock.

## Operational notes

- **Idle GC**: `rockbox_machines.last_used_at` is bumped on each route. A cron can destroy machines + drop rows where `last_used_at < now() - interval '30 days'`.
- **Cold start**: ~1–3 s for Fly to boot a stopped machine + however long rockbox takes to start. The CMAF encoder needs another ~2 s to fill the first segment before the first manifest is meaningful.
- **Region pinning**: pass `X-Rockbox-Region` from the Worker (derived from `cf-iso-country` or similar) so the first-time machine lands close to the user.
- **Debug**: `fly ssh console -a rockbox --machine <id>` / `fly logs -a rockbox -i <id>`.
