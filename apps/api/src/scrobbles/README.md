# Public live scrobbles

`GET /events/scrobbles` is an unauthenticated, CORS-enabled SSE stream.
Each connection receives the latest 12 indexed scrobbles, followed by named
`scrobbles` events containing `{ "scrobbles": [...] }` when the feed changes.
Named `heartbeat` events every 15 seconds contain `{ "healthy": true }` when
both Jetstream and PostgreSQL are available. Clients should reconnect and keep
their HTTP fallback enabled when health is false.

One shared Jetstream subscription listens only to `app.rocksky.scrobble`
creates, updates and deletes. Events are coalesced, checked against the primary
index, and retried for up to 60 seconds while indexing catches up. Snapshots are
deduplicated and broadcast to all clients. There is no periodic feed polling:
only startup, reconnect and indexed Jetstream commits refresh the feed. Upstream
reconnection uses an in-memory Jetstream cursor and unlimited capped backoff;
restarting the process obtains a fresh snapshot. Slow clients are disconnected
instead of accumulating an unbounded output queue.

The main Hono API exposes the route lazily. For an independent production worker:

```sh
bun run build:sse
doppler run -- bun dist/scrobbles-stream.mjs
```

The standalone worker binds `127.0.0.1:8115` and exposes `/health` (200 when ready,
503 while degraded). Configure `SCROBBLES_SSE_HOST`, `SCROBBLES_SSE_PORT`, or
`SCROBBLES_SSE_JETSTREAM_URL` if needed. Its small PostgreSQL pool uses
`SCROBBLES_SSE_DATABASE_URL`, `XATA_WRITE_POSTGRES_URL`, or `XATA_POSTGRES_URL`, in
that order. Point it at the primary so indexing checks do not lag a replica.

The deployment unit in `../../deploy/rocksky-scrobbles-sse.service` expects a
bundled artifact at `/opt/rocksky-sse/current/scrobbles-stream.mjs`. Confirm the
Doppler executable path on the target. Start and verify this worker before
adding this exact route inside the existing `api.rocksky.app` Caddy site:

```caddy
handle /events/scrobbles {
    reverse_proxy 127.0.0.1:8115 {
        flush_interval -1
    }
}
```

Validate the complete Caddy configuration and reload gracefully. Existing API
services do not need a restart. Deploy the landing only after the public stream
returns snapshots and subsequent Jetstream-driven updates.

```sh
bun test src/scrobbles/events.test.ts
curl -N https://api.rocksky.app/events/scrobbles
```
