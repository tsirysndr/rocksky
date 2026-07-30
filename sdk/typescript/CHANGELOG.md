# Changelog

All notable changes to `@rocksky/sdk` are documented here. This project adheres
to [Semantic Versioning](https://semver.org) — while pre-1.0, the **minor**
version is the breaking slot.

## [0.11.0] - 2026-07-30

A **backwards-compatible** release for existing code — it *adds* rate-limiting
control to `Agent` and turns on an always-enforced `matchSong` throttle. The one
behavioral change (below) only affects code publishing thousands of writes.

### Added

- **`Agent.configureRateLimit(opts)`** — configure the client-side throttles and
  get back the effective `RateLimitState`. The `*.bsky.network` guard is
  authoritative and cannot be bypassed:
  - `disabled: true` turns the **PDS write** throttle fully off on a self-hosted
    PDS, but on the official Bluesky PDS it is ignored and the throttle stays on
    at the safe rate (`forcedOn: true`).
  - `writesPerHour` is honored as given on a self-hosted PDS, but clamped to
    `MAX_SAFE_WRITES_PER_HOUR` on the official Bluesky PDS (`capped: true`).
  - `matchSongPerHour` tunes the (always-on) AppView throttle; `disabled` never
    turns it off.
- **`Agent.pdsHost`** and **`Agent.isOfficialBlueskyPds`** — the resolved PDS
  host and whether it is an official Bluesky PDS (`*.bsky.network`). A look-alike
  host such as `bsky.network.evil.com` is **not** treated as official.
- New exports: **`MAX_SAFE_WRITES_PER_HOUR`**, **`DEFAULT_MATCH_SONG_PER_HOUR`**,
  and the **`RateLimitOptions`** / **`RateLimitState`** types.

### Changed

- **`Agent.scrobbleMatch` now throttles its `matchSong` call.** `matchSong` hits
  the shared Rocksky AppView (`api.rocksky.app`), whose rate limit is not the
  account owner's to waive — a self-hosted PDS grants no extra AppView capacity —
  so it is **always** rate-limited, independent of the write throttle and of any
  `disabled` request. The default (`DEFAULT_MATCH_SONG_PER_HOUR` ≈ 108,000/h, ~30
  req/s) is derived from the AppView's real per-IP limit (1,000 requests / 30 s)
  with a 0.9 safety margin, so ordinary use is unaffected; only very large bulk
  runs (e.g. history imports) will notice pacing.

### Notes

- The PDS **write** throttle is **off by default** — single live scrobbles never
  pay for it. Bulk writers (e.g. the CLI `import` command) opt in via
  `configureRateLimit()`. The write budget follows Bluesky's ~5,000 points/hour
  (~3 points per `createRecord`/`putRecord`/`deleteRecord`).

## [0.10.2] - 2026-07-28

A **backwards-compatible** patch release.

### Added

- **`@rocksky/sdk/remote`** — a browser-safe subpath that exports only the
  remote-control surface (`RemotePlayer`, `RemoteController`, and their types).
  The main entry pulls in the dedup index (`classic-level`) and identity hashes
  (`node:crypto`), which are Node-only; the remote player/controller are pure
  WebSocket + JSON, so import them from this subpath in browser bundles.

## [0.10.1] - 2026-07-28

A **backwards-compatible** patch release.

### Added

- **`RemoteNowPlaying`** gained optional server-enriched fields — `songUri`,
  `albumUri`, `artistUri`, `sha256`, and `liked` — populated on the broadcast a
  `RemoteController` receives (a player leaves them unset; the server resolves
  them from the library). This lets a controller UI deep-link to the song / album
  / artist and show like state without re-fetching. Purely additive; existing
  code is unaffected.

## [0.10.0] - 2026-07-28

A **backwards-compatible** release — it only *adds* the remote-controller
surface, so existing `^0.9.0` code keeps working.

### Added

- **`RemoteController`** — the controller half of the remote-control WebSocket
  protocol (see [`remote-ws/PROTOCOL.md`](../../remote-ws/PROTOCOL.md)). Lists the
  user's player devices, observes what each is playing (now-playing / status /
  queue), selects the primary device, and sends commands — `play` / `pause` /
  `next` / `previous`, `seek`, `queueJump`, `queueRemove`, `enqueue`, and
  `setPrimary`. Heartbeat, reconnect, and the register handshake are handled for
  you; subscribe to server updates with `.on(event, handler)`.
- New exported types: `RemoteControllerOptions`, `RemoteControllerEvents`,
  `RemoteDevice`, `RemoteStatus`.

## [0.9.0] - 2026-07-28

A **backwards-compatible** release — it only *adds* the remote-player surface.

### Added

- **`RemotePlayer`** — build a Rocksky-controllable player over the
  remote-control WebSocket (see [`remote-ws/PROTOCOL.md`](../../remote-ws/PROTOCOL.md)):
  it registers as a device, advertises what you're playing (`setNowPlaying` /
  `setStatus` / `setQueue`), and invokes your handlers when a miniplayer sends a
  command (`play` / `pause` / `next` / `previous` / `seek` / `enqueue` /
  `queueJump` / `queueRemove`). Heartbeat, reconnect, and the device-id handshake
  are handled for you; register handlers with `.on(event, handler)`.
- New exports: `DEFAULT_REMOTE_WS` and the types `RemoteNowPlaying`,
  `RemoteQueueItem`, `EnqueueCommand`, `RemotePlayerOptions`,
  `RemotePlayerHandlers`.

## [0.7.3] - 2026-07-24

A **backwards-compatible** patch release.

### Fixed

- **Packaging** — the build bundled dependencies (`--external none`), inlining
  the native **`classic-level`** and baking in a build-machine path, so on other
  platforms/ABIs it failed at import with *"No native build was found"*.
  Dependencies are now externalized (`--packages external`); `classic-level` and
  `@atcute/*` are resolved from `node_modules` at runtime, where the prebuilds
  live. The published bundle drops from ~232 KB to ~32 KB.

## [0.7.2] - 2026-07-24

A **backwards-compatible** patch release.

### Fixed

- **`Agent.login` / `Agent.syncRepo`** — the identity resolver can return a PDS
  URL with a trailing slash (e.g. `https://….host.bsky.network/`), which made
  `syncRepo` build a `//xrpc/com.atproto.sync.getRepo` path that some PDS hosts
  answer with **404**. The PDS URL is now normalized (trailing slashes stripped)
  at login, so `getRepo` and every other `${pds}/xrpc/...` call resolve
  correctly.

## [0.7.0] - 2026-07-24

A **backwards-compatible** release — it only *adds* the new `library` surface, so
existing `^0.6.0` code keeps working.

### Added

- **`RockskyClient.library()`** — the authenticated `app.rocksky.library.*` API,
  a client over your uploaded music (the Subsonic / navidrome-compatible
  surface). Returns a `RockskyLibrary`; **every method requires auth**, so
  `library()` throws unless the client was built with a token
  (`new RockskyClient(appview, token)`). 41 methods:
  - browse: `getArtists`, `getIndexes`, `getArtist`, `getArtistInfo`, `getAlbum`,
    `getAlbumList`, `getAlbumInfo`, `getSong`, `getRandomSongs`,
    `getSongsByGenre`, `getSimilarSongs`, `getTopSongs`, `getLyrics`,
    `getMusicDirectory`, `getGenres`, `search`.
  - favorites: `getStarred`, `star`, `unstar`.
  - playlists: `getPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`,
    `deletePlaylist`.
  - playback: `scrobble`, `updateNowPlaying`, `getNowPlaying`, `getPlayQueue`,
    `savePlayQueue`.
  - uploads: `deleteSong`, `deleteAlbum` — delete your own uploaded track / album.
  - media URLs: `getStreamUrl`, `getDownloadUrl`, `getCoverArtUrl` (return a
    ready-to-fetch `{ url }`).
  - system: `ping`, `getLicense`, `getMusicFolders`, `getScanStatus`,
    `startScan`, `getUser`, `getInternetRadioStations`.
- Generated `app.rocksky.library.*` types, wired into the `Endpoints` map.

### Changed

- Generated endpoint type names are now namespace-qualified when two namespaces
  expose the same method name (e.g. `LibraryGetSongParams` vs `SongGetSongParams`),
  so the library methods coexist with `song` / `album` / `playlist`. The public
  client API and the exported view types (`SongViewDetailed`, …) are unchanged.

## [0.6.0] - 2026-07-23

### Changed — BREAKING

- **`Agent.scrobbleMatch` now takes a single object**, not positional args:
  `scrobbleMatch({ title, artist, album?, mbId?, isrc?, timestamp? })`
  (was `scrobbleMatch(title, artist, album?, mbId?, isrc?)`). Adds an optional
  `timestamp` (scrobbled-at Unix seconds; omitted = now). The full-metadata
  `Agent.scrobble(rec)` is unchanged.

## [0.5.0] - 2026-07-22

A **backwards-compatible** release — it only *adds* to the read/write surface
(nothing removed or renamed), so existing `^0.4.0` code keeps working.

### Added

- **Full AppView read catalog** on `RockskyClient` — beyond the 0.4.0 basics:
  - typed: `lovedSongs`, `catalogAlbums` / `catalogArtists` / `catalogSongs`,
    `albumTracks`, `artistAlbums` / `artistTracks`, `scrobbleFeed`, `scrobble`
    (single, by uri), `follows` / `followers` / `knownFollowers`.
  - raw (`unknown`-returning) detail & long tail: `album`, `artist`, `song`,
    `feed`, `playlists`, `playlist`, `stats`, `wrapped`, `scrobblesChart`,
    `recommendations` / `artistRecommendations` / `albumRecommendations`,
    `neighbours`, `compatibility`, listeners, shouts, `mirrorSources`,
    `currentlyPlaying`, `audioSettings`, `apikeys`.
- **Universal escape hatch** — `get(nsid, params)` calls *any* `app.rocksky.*`
  read query by nsid and returns the raw JSON; every named method is sugar over it.
- **Typed date-window charts** — `topTracksInterval(limit, offset, interval)` /
  `topArtistsInterval(...)` take a `DateInterval` built with the `Interval`
  factories: `Interval.allTime()`, `lastDays(n)`, `lastWeeks(n)`, `lastMonths(n)`,
  `lastYears(n)`, `range(start, end)`. `topTracks` / `topArtists` stay all-time
  shorthands.
- **Metadata match** — `matchSong(title, artist, mbId?, isrc?)` resolves a bare
  title + artist into full canonical metadata (album, artwork, duration, MBID,
  ISRC, streaming links).
- **Match-then-scrobble** — `Agent.scrobbleMatch(title, artist, album?, mbId?,
  isrc?)` resolves metadata via `matchSong`, then runs the normal fan-out; the
  existing full-metadata `Agent.scrobble(rec)` is unchanged.
- **Bearer access token** — `new RockskyClient(appview, token)` sends
  `Authorization: Bearer <token>` on every read, for auth-gated queries.

### Fixed

- `songs()` returned an empty array — `app.rocksky.actor.getActorSongs` responds
  with a `tracks` envelope, not `songs`, and the 0.4.0 method read the wrong key.

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
