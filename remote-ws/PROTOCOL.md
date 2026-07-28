# Rocksky Remote-Control WebSocket Protocol

This document specifies the WebSocket protocol that powers Rocksky's remote
playback control — the same protocol the Rocksky CLI, the Rockbox companion, and
the web/mobile miniplayers speak. With it you can build:

- a **player device** — a controllable player (like the Rocksky CLI) that
  advertises what it's playing and obeys play/pause/next/seek/queue commands, or
- a **controller** — a remote UI that lists a user's players, shows what each is
  playing, and sends commands to them.

It's a plain-JSON protocol over a single WebSocket. No framework envelopes, no
codegen — anything that can open a WebSocket and parse JSON can implement it.

- **Endpoint:** `wss://api.rocksky.app/ws`
- **Server:** the `remote-ws` service (Elixir/Phoenix + Bandit); see this repo.

---

## 1. Concepts

### Identity & scoping

Every message carries a Rocksky **access token** (a JWT — get one from
`rocksky login` or the Access Tokens screen). The server resolves it to your
AT-Protocol **DID** and scopes everything to that user: you can only see and
control **your own** devices. There is no cross-user access.

### Devices

Each open connection that `register`s becomes a **device** with a server-assigned
`deviceId` (a UUID). "Devices" include both players (CLI, Rockbox) and
controllers (the web/mobile miniplayers) — anything that registers. A device that
never pushes a `track` is treated as a controller and is hidden from other
clients' device lists.

### The primary device

A user can have several players streaming at once. But the **public profile
now-playing and scrobble** are inherently one stream, so they are driven only by
the **primary device**:

- A controller selects it with `set_primary`; the server broadcasts
  `primary_changed` so every client converges on it.
- If none is selected (or the selected one disconnects), the server
  auto-adopts a lone player — so a headless player still scrobbles with zero UI.

Non-primary players are still listed, mirrored, and controllable — they just
don't touch the profile.

---

## 2. Connection lifecycle

```
client                          server
  │  (open WebSocket) ───────────▶│
  │  {"type":"register",...} ─────▶│
  │◀───── {"status":"registered","deviceId":"…"}
  │◀───── {"type":"devices", …}          (snapshot of current players)
  │                                │
  │  … push state / send commands / receive broadcasts …
  │                                │
  │  "ping"  ────────────────────▶│   (heartbeat, raw text)
  │◀───────────────────  "pong"    │
```

1. **Open** the WebSocket to `wss://api.rocksky.app/ws`.
2. **Register** (see §4.1). The server replies with your `deviceId`, then a
   `devices` snapshot.
3. **Heartbeat.** Send the literal string `"ping"` every ~10s; the server replies
   `"pong"`. This keeps the socket alive — the server times out an idle socket
   after ~60s.
4. **Reconnect.** If the socket closes (network blip, background throttling,
   idle timeout), reconnect and re-`register`. The server re-sends the `devices`
   snapshot so you resync immediately.

> **Heartbeat note:** some existing clients also send
> `{"type":"heartbeat","token":"…"}`; the server ignores it (only the raw
> `"ping"` yields `"pong"`). Prefer `"ping"`.

---

## 3. Message envelope

All non-heartbeat frames are JSON objects with a `type` field. Client→server
frames carry `token`. There are four client→server types (`register`, `command`,
`set_primary`, `message`) and several server→client types (below).

---

## 4. Client → server messages

### 4.1 `register`

Announce this connection as a device.

```json
{ "type": "register", "clientName": "My Player", "token": "<jwt>" }
```

- `clientName` — the human label shown in the miniplayer's device picker
  (e.g. "Rocksky CLI", "Living Room").

**Reply:** `{ "status": "registered", "deviceId": "<uuid>" }`, immediately
followed by a `devices` snapshot (§5.1).

> **Capture your `deviceId` ONLY from this reply** (the frame with
> `status: "registered"`). Do **not** read `deviceId` from other frames — the
> `device_registered` broadcast (§5.2) carries *another* device's id, and
> capturing it will make your pushes look like they came from that device.

### 4.2 `message` — push now-playing / status / queue (player devices)

Wrap a state payload. `data.type` is one of `track`, `status`, `queue`.

```json
{ "type": "message", "device_id": "<your deviceId>", "token": "<jwt>",
  "data": { "type": "track", … } }
```

The server enriches `data` (album art, URIs, like status…), then broadcasts it to
all of the user's devices as a `message` (§5.4).

> The server routes/tags broadcasts by the **connection's** registered
> `deviceId`, not the `device_id` in your payload — so a wrong value can't
> misroute commands. Still, send your own `deviceId` for clarity.

**`track`** — the current track. Push on track change, and re-push every few
seconds so controllers can reconcile elapsed time.

```json
{ "type": "track",
  "title": "Song title",
  "artist": "Artist",
  "album": "Album",
  "album_artist": "Album artist",
  "length": 214000,        // total duration, ms
  "elapsed": 42000,        // current position, ms
  "duration_ms": 214000,   // = length (either is accepted)
  "album_art": "https://…",
  "is_playing": true,
  "device_name": "My Player"   // optional; lets clients label the source even
}                              // before the server's device_name is known
```

Fields the server fills in on the broadcast (you don't send them): `album_art`
(canonical, from the library), `song_uri`, `album_uri`, `artist_uri`, `liked`,
`sha256`, `duration_ms`.

**`status`** — transport state.

```json
{ "type": "status", "status": 1 }
```

`status`: `0` = stopped, `1` = playing, `2` = paused (`3` is also treated as
paused). Send `1`/`2` on play/pause, `0` on stop.

**`queue`** — the playback queue + current index. Push on queue change / track
advance.

```json
{ "type": "queue", "index": 2,
  "queue": [
    { "uploadId": "", "trackId": "abc",
      "title": "…", "artist": "…", "album": "…", "album_artist": "…",
      "album_art": "https://…", "duration": 214000,
      "song_uri": "at://…", "album_uri": "at://…", "track_number": 3 }
  ] }
```

The server enriches each item's `album_art` from the library where possible.

### 4.3 `command` — control a device (controllers)

```json
{ "type": "command", "action": "pause", "target": "<deviceId>", "token": "<jwt>" }
```

- `target` (optional) — send only to that device. Omit to broadcast to **all**
  the user's devices.
- `args` (optional) — action-specific (see §6).

The server relays `{ "type": "command", "action": …, "args": … }` to the
target(s). `args` is omitted when absent.

### 4.4 `set_primary` — choose the scrobble/profile source (controllers)

```json
{ "type": "set_primary", "device_id": "<deviceId>", "token": "<jwt>" }
```

The server records the primary, broadcasts `primary_changed`, and re-points the
profile now-playing at that device's current track.

---

## 5. Server → client messages

### 5.1 `devices` — snapshot (sent to you right after you register)

```json
{ "type": "devices", "primary_device": "<deviceId|null>",
  "devices": [
    { "device_id": "<deviceId>", "name": "Rocksky CLI",
      "now_playing": { …enriched track… },
      "queue": { "index": 2, "queue": [ … ] } } ] }
```

Only players that have streamed a track appear (controllers are excluded).

### 5.2 `device_registered` — a new device joined (to the user's other devices)

```json
{ "type": "device_registered", "deviceId": "<deviceId>", "clientName": "…" }
```

> Informational. **Never** capture this `deviceId` as your own (see §4.1).

### 5.3 `device_unregistered` — a device left

```json
{ "type": "device_unregistered", "device_id": "<deviceId>" }
```

### 5.4 `message` — a device's enriched state (broadcast to all the user's devices)

```json
{ "type": "message", "device_id": "<source deviceId>",
  "device_name": "Rocksky CLI", "data": { "type": "track" | "status" | "queue", … } }
```

This is the enriched, broadcast form of §4.2 — controllers render it; a pure
player can ignore it (including the echo of its own pushes).

### 5.5 `primary_changed`

```json
{ "type": "primary_changed", "device_id": "<deviceId>" }
```

The primary device changed (via `set_primary`, or auto-adopt). Controllers
should converge their "active device" on it.

### 5.6 `command` — a relayed control command (delivered to player devices)

```json
{ "type": "command", "action": "seek", "args": { "position": 42000 } }
```

Player devices execute these (see §6).

---

## 6. Commands (what a player device must handle)

| `action`       | `args`                                                             | Meaning |
| -------------- | ----------------------------------------------------------------- | ------- |
| `play`         | —                                                                 | Resume  |
| `pause`        | —                                                                 | Pause   |
| `next`         | —                                                                 | Next track |
| `previous`     | —                                                                 | Previous track |
| `seek`         | `{ "position": <ms> }`                                            | Seek to position |
| `queue_jump`   | `{ "index": <n> }`                                               | Jump to queue index |
| `queue_remove` | `{ "index": <n> }`                                               | Remove queue item |
| `enqueue`      | `{ "tracks": [descriptor…], "mode": "now"\|"next"\|"last", "shuffle"?: bool, "startIndex"?: <n> }` | Play / play-next / append tracks (an album or a single track) |

An `enqueue` **descriptor** is a track the controller resolved for you:

```json
{ "trackId": "abc", "uploadId": "",
  "title": "…", "artist": "…", "album": "…", "album_artist": "…",
  "album_art": "https://…", "duration": 214000,
  "song_uri": "at://…", "album_uri": "at://…" }
```

Stream it via `uploadId` (Rocksky uploads) or `trackId` (Navidrome/Subsonic id),
whichever is present.

After executing any command, push fresh `track` / `status` / `queue` state so all
clients update promptly.

---

## 7. NATS side effects (informational)

For the **primary** device only, the server publishes to NATS as a side effect —
this is what drives the user's public profile now-playing and scrobbling. SDK
clients don't interact with NATS; it's noted for completeness.

- `rocksky.song.changed` — `{ did, track: { name, artist, album, albumCoverUrl, duration_ms, source } }`
- `rocksky.song.stopped` — `{ did }` (debounced 15s so a pause/resume doesn't churn)

---

## 8. Implementer checklist

Building a **player device**? Make sure you:

- [ ] Register with a descriptive `clientName`.
- [ ] Capture `deviceId` **only** from the `status:"registered"` reply.
- [ ] Push `track` on change + periodically (~every 4s) with fresh `elapsed`.
- [ ] Push `status` on play/pause/stop transitions.
- [ ] Push `queue` on queue change (optional but enables the remote queue UI).
- [ ] Handle every command in §6 (at minimum play/pause/next/previous/seek).
- [ ] Send `"ping"` every ~10s; auto-reconnect (with re-register) on close.
- [ ] Ignore `message` echoes of your own pushes and other devices' broadcasts.

Building a **controller**? You:

- [ ] Register (any `clientName`); you'll be excluded from device lists until you
      push a track (which controllers don't).
- [ ] Seed your device list from the `devices` snapshot, then keep it live with
      `message` (track/status/queue), `device_unregistered`, and
      `primary_changed`.
- [ ] Send `command` (optionally `target`ed) and `set_primary`.
- [ ] Reconnect + re-register on close to resync.

---

## 9. Reference implementations

- **TypeScript** (player): `apps/cli/src/tui/rockskyWs.ts`
- **Rust** (player): `crates/connect/src/websocket.rs`, `~/…/rockbox-zig/crates/rocksky/src/lib.rs`
- **Web controller:** `apps/web/src/components/StickyPlayer/StickyPlayerWithData.tsx`
- **Mobile controller:** `apps/web-mobile/src/components/MiniPlayer/index.tsx`
- **Server:** `remote-ws/` (see `README.md` for the module map)
