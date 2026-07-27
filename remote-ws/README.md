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

## How it works

### Entrypoint & boot

The OTP application is declared in `mix.exs` (`mod: {RemoteWs.Application, []}`), so
on start the BEAM calls `RemoteWs.Application.start/2`
(`lib/remote_ws/application.ex`), which starts the supervision tree — the real
"main":

```
RemoteWs.Supervisor (one_for_one)
├── Phoenix.PubSub            (referenced by the endpoint)
├── RemoteWs.Devices.Registry (duplicate Registry, keyed by DID)
├── RemoteWs.StopDebouncer    (GenServer — the 15s song.stopped debounce)
├── RemoteWsWeb.Endpoint      (the HTTP/WS server, Bandit)
└── externals (prod only):    RemoteWs.Repo, Redix, Gnat connection
```

The externals (Postgres/Redis/NATS clients) are only added when `:start_externals`
is true — it's `false` in `config/test.exs`, so tests boot the whole tree with **no
live services**.

### HTTP → WebSocket upgrade path

An incoming `GET /ws` flows through Phoenix:

```
Bandit → RemoteWsWeb.Endpoint → RemoteWsWeb.Router → RemoteWsWeb.WsController.upgrade/2
```

- `endpoint.ex` runs a tiny plug pipeline (RequestId, Telemetry, JSON parser) then
  `plug RemoteWsWeb.Router`.
- `router.ex` maps `get "/ws" → WsController :upgrade` (and `get "/health"`).
- `ws_controller.ex` performs the upgrade:

  ```elixir
  conn
  |> WebSockAdapter.upgrade(RemoteWs.Ws.Connection, %{}, timeout: 60_000)
  |> halt()
  ```

This is the key design choice: it's a **raw `WebSock` handler, not a Phoenix
Channel**. Channels would wrap every frame in a topic/`phx_join` envelope and break
the wire format; every existing client speaks bare JSON. After the upgrade, **each
connected client is its own lightweight BEAM process** running
`RemoteWs.Ws.Connection`.

### The connection process

`lib/remote_ws/ws/connection.ex` implements the `WebSock` behaviour:

- **`init/1`** → per-connection state `%{device_id: nil, did: nil}`.
- **`handle_in/2`** — an inbound frame from *this* client: `"ping"` → `"pong"`; any
  other text → `Jason.decode/1`, then `RemoteWs.Ws.Handler.handle(msg, state)`, and
  push back whatever frames it returns. Invalid JSON / binary frames are ignored.
- **`handle_info/2`** — an Erlang message from *another* process, specifically
  `{:push, frame}`: this is how broadcasts reach a socket. Another connection
  process (or the debouncer) sends `{:push, json}` to this pid, and we forward it
  down the wire.

Two directions, then: **client → us** (`handle_in` → `Handler`) and **another
process → client** (`{:push, frame}` → `handle_info` → socket). Because the
device-registry entry is owned by this process, a dead socket auto-cleans its entry
— replacing the Node server's manual `onClose`.

### Dispatch

`lib/remote_ws/ws/handler.ex` is the port of the Node `onMessage` body. It's **pure
with respect to the socket**: it returns `{frames_to_send_back, new_state}` and
performs broadcasts as side effects via `RemoteWs.Devices`. Dispatch is pattern
matching on `"type"`:

```elixir
def handle(%{"type" => "register"} = msg, state), do: register(msg, state)
def handle(%{"type" => "command"} = msg, state), do: command(msg, state)
def handle(%{"type" => "message"} = msg, state), do: device_message(msg, state)
def handle(_msg, state), do: {[], state}   # unknown → drop, like the Node try/catch
```

Each branch first calls `RemoteWs.Auth.verify_token/1`; on failure it returns
`{[], state}` (silently drops), mirroring the Node behavior.

- **`register`** → mint a UUID `device_id`, `Devices.register(did, device_id, name)`
  (registers *this* process under the DID), broadcast `device_registered` to the
  user's *other* devices, reply `{status: "registered", deviceId}`, and store
  `device_id`/`did` in the connection state.
- **`command`** (play/pause/next/previous/seek) → build `{type, action, args}`; if a
  `target` device is named, `Devices.send_to/3` it, otherwise `Devices.broadcast/2`
  to all the user's devices.
- **`message`** (a player pushing now-playing) → if `data.type == "track"`, run
  `RemoteWs.NowPlaying.handle_track/3` (enrich + gate), else `handle_status/2`; then
  broadcast the enriched `{type: "message", data, device_id, device_name}` to all
  the user's devices.

### End-to-end: CLI plays a track, web sees it

```
CLI socket (proc A)              Web socket (proc B)
   │ {"type":"message",
   │  data:{type:"track",…},
   │  device_id:A, token}
   ▼
handle_in (A) ──► Handler.device_message
   │  Auth.verify_token → did
   │  NowPlaying.handle_track(did, data, "Rocksky CLI")
   │     → Redis enrich, maybe NATS song.changed
   │  Devices.broadcast(did, {type:"message", data, device_id:A,
   │                          device_name:"Rocksky CLI"})
   │        │ send {:push, frame} to every pid under `did`
   │        ├──────────────► handle_info (A)  → socket (echo)
   │        └──────────────► handle_info (B)  → socket  ✅ web renders it
```

A `command` from the web travels the mirror path: `handle_in (B)` →
`Handler.command` → `Devices.broadcast`/`send_to` → `{:push}` → `handle_info (A)` →
CLI socket.

Mental model: **one BEAM process per socket; the `Registry` is the routing table
(keyed by user DID); `Handler` is the dispatcher; cross-socket delivery is just
`send(pid, {:push, frame})`.**

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
