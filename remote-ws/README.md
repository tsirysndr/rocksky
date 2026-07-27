# remote-ws

An **Elixir / Phoenix / Ecto** port of the player remote-control WebSocket
server that currently lives in `apps/api/src/websocket/handler.ts`.

Phase 1: this is a **1:1 port** — the existing Node `/ws` endpoint stays
authoritative. This service speaks the identical wire protocol and publishes the
same NATS events so it can eventually replace the Node relay with no client or
consumer changes.

## What it does

A raw-JSON WebSocket relay at `GET /ws` that lets the web/mobile miniplayers and
player devices (the Rocksky CLI, the Rockbox companion) control each other:

- `register` a device, scoped by the JWT's DID
- broadcast a device's now-playing (`track`) and transport (`status`) to the
  user's other devices, enriched from Redis/Postgres
- relay `command`s (play/pause/next/previous/seek) to devices
- publish `rocksky.song.changed` / `rocksky.song.stopped` to NATS (with the same
  15s stop debounce and `ws_lastsong` gating as the Node server)

Because it's a raw-JSON protocol (not Phoenix Channel envelopes), the socket is a
`WebSock` handler served by Bandit — **not** a Phoenix Channel — so every existing
client works unchanged.

## Architecture (map from the Node handler)

| Node (`handler.ts`) | Elixir |
| --- | --- |
| `@hono/node-ws` upgrade at `/ws` | `WebSockAdapter.upgrade` → `RemoteWs.Ws.Connection` (`WebSock`) |
| `devices` / `deviceNames` / `userDevices` maps | `RemoteWs.Devices` over a duplicate `Registry` keyed by DID (auto-cleans on disconnect) |
| `pendingStop` + `setTimeout` | `RemoteWs.StopDebouncer` GenServer |
| `verifyToken` (jsonwebtoken) | `RemoteWs.Auth` (Joken HS256, ignore-expiration + jti revoke check) |
| `ctx.redis` | `RemoteWs.Redis` behaviour → `RemoteWs.Redis.Redix` |
| `ctx.db` (drizzle) | `RemoteWs.Store` behaviour → `RemoteWs.Store.Ecto` + `RemoteWs.Repo` |
| `ctx.nc` (NATS) | `RemoteWs.Nats` behaviour → `RemoteWs.Nats.Gnat` |
| enrichment + gating (lines 64-273) | `RemoteWs.NowPlaying` |
| `onMessage` dispatch | `RemoteWs.Ws.Handler` |

Redis, NATS, and the read store sit behind behaviours so the intricate gating and
debounce logic is unit-tested against in-memory doubles — no live Redis / NATS /
Postgres required.

## Environment

Reuses the **same variable names** as `apps/api` (share one environment):

| Var | Purpose |
| --- | --- |
| `JWT_SECRET` | HS256 secret for verifying bearer tokens |
| `XATA_POSTGRES_URL` | Postgres connection URL (Ecto) |
| `REDIS_URL` | Redis URL (default `redis://localhost:6379`) |
| `NATS_URL` | NATS URL (default `nats://localhost:4222`) |
| `REMOTE_WS_PORT` | HTTP listen port (service-specific; default `4000`) |

No `SECRET_KEY_BASE` is needed: this is a raw-WebSocket relay with no cookies /
sessions / CSRF / LiveView, so the endpoint's `secret_key_base` (which Phoenix
requires only to boot) is generated at runtime and never used.

## Develop

```bash
mix deps.get
mix test          # 29 tests, no external services needed
REMOTE_WS_PORT=4000 mix phx.server
```

Deployed via `systemd/rocksky-remote-ws.service`. Tests run in CI through the
`remote-ws` job in `.github/workflows/tests.yml`.
