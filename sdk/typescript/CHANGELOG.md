# Changelog

All notable changes to `@rocksky/sdk` are documented here. This project adheres
to [Semantic Versioning](https://semver.org) — while pre-1.0, the **minor**
version is the breaking slot.

## [0.4.0] - 2026-07-22

### Changed — BREAKING

The SDK has been **rewritten from scratch on [atcute](https://github.com/mary-ext/atcute)**.
It is now a native AT Protocol client (real PDS writes), not an HTTP wrapper over
the Rocksky XRPC API. The entire public surface changed; **0.3.x code will not
work against 0.4.0**.

- **Removed** the old HTTP client and all of it: the `Client`/`ClientBuilder`,
  the resource namespaces (`client.actor`, `client.scrobble`, `client.feed`, …),
  `paginate()`, `pipe()`, the realtime helper, and the bearer-token/`baseUrl`
  configuration.
- **New read API** — `RockskyClient` (unauthenticated, over the public AppView):
  `globalStats`, `topTracks`, `topArtists`, `profile`, `scrobbles`, `songs`,
  `albums`, `artists`, `search`.
- **New write API** — `Agent.login(identifier, appPassword)` resolves the user's
  PDS and authenticates with an **app password**, then writes `app.rocksky.*`
  records directly to the repo: `scrobble`, `createSong` / `createAlbum` /
  `createArtist`, `like`, `follow`, `shout` / `replyShout`, `setNowPlaying` /
  `clearNowPlaying`, `delete`.
- **Types** — record/view types are the generated `app.rocksky.*` shapes
  (re-exported from the package root). Write verbs take `ScrobbleInput` /
  `SongInput` / `AlbumInput` / `ArtistInput` (`createdAt` optional).

### Added

- **Identity hashes** — `songHash`, `albumHash`, `artistHash` (lowercase-hex
  SHA-256), byte-for-byte identical to the server and every other Rocksky SDK.
- **Duplicate prevention** — `RockskyIndex`, an embedded local index
  (classic-level) keyed by the identity hashes. `Agent.useIndex(idx)` makes the
  write verbs skip records that already exist; `Agent.syncRepo()` backfills it
  from the repo CAR (`com.atproto.sync.getRepo`).
- **Real-time sync** — `Agent.hydrateFromJetstream()` keeps the index live off
  the Bluesky Jetstream firehose (all four servers, filtered to `app.rocksky.*`
  and the account's DID), plus the standalone `runJetstream()`.

### Requirements

- Node ≥ 22 (global `WebSocket` / `fetch`) or Bun.

### Migration

There is no drop-in shim. If you were reading data via the 0.3.x `client.*`
namespaces, switch to the `RockskyClient` methods above (same data, different
call sites). If you were writing scrobbles through the HTTP API, switch to
`Agent.login(...)` + `agent.scrobble(...)` — writes now go to the user's own PDS
over the AT Protocol.

Existing `^0.3.0` / `~0.3.0` dependents are unaffected: npm's caret/tilde ranges
resolve `<0.4.0`, so this release is opt-in.

## [0.3.0]

Legacy HTTP client for the Rocksky XRPC API (async, typed, resource namespaces,
pagination + pipe helpers). Superseded by 0.4.0.
