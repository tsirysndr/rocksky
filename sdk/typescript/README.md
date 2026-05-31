# @rocksky/sdk

A TypeScript SDK for the [Rocksky](https://rocksky.app) XRPC API.

- **Type-safe** — every endpoint and parameter is statically typed.
- **Builder-friendly** — fluent `RockskyClient.builder()` for ergonomic setup.
- **Pipe-friendly** — composable async operators (`pipe`, `withRetry`, `withTimeout`, `map`, `tap`, `withFallback`, `catchError`).
- **Zero-dependency** — only uses the platform `fetch` and the standard library. Works on Bun, Node 18+, Deno, browsers, Cloudflare Workers.

## Install

```bash
bun add @rocksky/sdk
# or
npm i @rocksky/sdk
```

## Quick start

```ts
import { createClient } from "@rocksky/sdk";

const client = createClient();

const profile = await client.actor.getProfile({ did: "tsiry.bsky.social" });
const topTracks = await client.charts.getTopTracks({ limit: 5 });
```

## Authentication

The SDK accepts a bearer token either as a string or as a (sync/async) function:

```ts
import { createClient } from "@rocksky/sdk";

const client = createClient({ auth: process.env.ROCKSKY_TOKEN });

// or — refresh on every call
const client = createClient({
  auth: async () => loadTokenFromKeychain(),
});
```

Endpoints that require auth throw `RockskyAuthError` when no token is configured.

## Builder

```ts
import { RockskyClient } from "@rocksky/sdk";

const client = RockskyClient.builder()
  .baseUrl("https://api.rocksky.app")
  .bearer(process.env.ROCKSKY_TOKEN!)
  .userAgent("my-app/1.0")
  .timeout(10_000)
  .retries(3)
  .retryDelay(200)
  .header("x-trace-id", crypto.randomUUID())
  .build();
```

`withAuth(token)` and `withBaseUrl(url)` return a new client without mutating the original — handy for per-request overrides.

## Pipe-style composition

```ts
import {
  createClient,
  map,
  pipe,
  tap,
  withFallback,
  withRetry,
  withTimeout,
} from "@rocksky/sdk";

const client = createClient();

// Pass a thunk so withRetry can re-invoke the network call.
const handle = await pipe(
  () => client.actor.getProfile({ did: "tsiry.bsky.social" }),
  withRetry(3, { delayMs: 200 }),
  withTimeout(5_000),
  tap((p) => console.log("loaded", p.handle)),
  map((p) => p.displayName ?? p.handle),
  withFallback("anonymous"),
);
```

`pipe` accepts either a thunk `() => Promise<T>` (preferred — `withRetry` re-runs it) or a bare `Promise<T>` for one-shot composition.

| Operator | Description |
| --- | --- |
| `map(fn)` | Transform the resolved value. |
| `tap(fn)` | Run a side-effect; pass the value through. |
| `withRetry(n, { delayMs, factor, shouldRetry })` | Retry on rejection with exponential backoff. |
| `withTimeout(ms)` | Reject with `RockskyTimeoutError` if it exceeds `ms`. |
| `withFallback(value \| fn)` | Recover from any error with a default. |
| `catchError(fn)` | Map a thrown error to a value. |

## Namespaces

```
client.actor        getProfile, getActorAlbums, getActorArtists, getActorSongs,
                    getActorScrobbles, getActorLovedSongs, getActorPlaylists,
                    getActorNeighbours, getActorCompatibility
client.album        getAlbum, getAlbums, getAlbumTracks
client.apikey       getApikeys, createApikey, updateApikey, removeApikey
client.artist       getArtist, getArtists, getArtistAlbums, getArtistTracks,
                    getArtistListeners, getArtistRecentListeners
client.charts       getScrobblesChart, getTopArtists, getTopTracks
client.dropbox      getFiles, getMetadata, getTemporaryLink, downloadFile
client.feed         search, getFeed, getFeedGenerators, getFeedGenerator,
                    describeFeedGenerator, getFeedSkeleton,
                    getRecommendations, getArtistRecommendations,
                    getAlbumRecommendations, getStories
client.googledrive  getFile, getFiles, downloadFile
client.graph        followAccount, unfollowAccount, getFollowers, getFollows,
                    getKnownFollowers
client.like         likeSong, dislikeSong, likeShout, dislikeShout
client.mirror       getMirrorSources, putMirrorSource
client.player       getCurrentlyPlaying, getPlaybackQueue, play, pause, next,
                    previous, seek, playFile, playDirectory, addItemsToQueue,
                    addDirectoryToQueue
client.playlist     getPlaylists, getPlaylist, createPlaylist, removePlaylist,
                    startPlaylist, insertDirectory, insertFiles, removeTrack
client.scrobble     createScrobble, getScrobble, getScrobbles
client.shout        createShout, replyShout, reportShout, removeShout,
                    getShoutReplies, getProfileShouts, getTrackShouts,
                    getArtistShouts, getAlbumShouts
client.song         getSong, getSongs, getSongRecentListeners, matchSong,
                    createSong
client.spotify      getCurrentlyPlaying, play, pause, next, previous, seek
client.stats        getStats, getWrapped
```

Every method takes a typed parameter object and returns `Promise<T>`. Pass a generic to narrow the response type:

```ts
type Profile = { handle: string; did: string; displayName?: string };
const me = await client.actor.getProfile<Profile>({ did: "alice.bsky.social" });
```

## Escape hatch

For endpoints not yet wrapped, call `xrpc` directly:

```ts
const result = await client.xrpc<MyType>(
  "app.rocksky.something.notWrappedYet",
  "GET",
  { params: { foo: "bar" } },
);
```

## Error handling

The SDK throws four error classes — all extending `RockskyError`:

- `RockskyHttpError` — non-2xx response. Exposes `.status`, `.statusText`, `.url`, `.body`.
- `RockskyTimeoutError` — request exceeded `timeoutMs`.
- `RockskyAuthError` — endpoint requires auth but no token was provided.
- `RockskyError` — base class.

```ts
import { RockskyHttpError } from "@rocksky/sdk";

try {
  await client.scrobble.getScrobble({ uri: "at://x" });
} catch (err) {
  if (err instanceof RockskyHttpError && err.status === 404) {
    console.log("not found");
  } else {
    throw err;
  }
}
```

## Pagination

`paginate()` (and `client.paginate()`) gives you a typed async iterable over any `{ limit, offset }` or `{ cursor }` endpoint.

```ts
import { createClient, paginate } from "@rocksky/sdk";

const client = createClient();

// Offset/limit — fetcher returns the items array, helper handles offset.
for await (const s of paginate({
  fetch: ({ limit, offset }) =>
    client.actor.getActorScrobbles({ did, limit, offset }).then((p) => p.scrobbles ?? []),
  pageSize: 50,
  maxItems: 200,
})) {
  console.log(s.track.title);
}

// Cursor-based — fetcher returns { items, cursor }.
const followers = await client
  .paginate({
    fetch: async ({ limit, cursor }) => {
      const page = await client.graph.getFollowers({ actor, limit, cursor });
      return { items: page.followers, cursor: page.cursor };
    },
    pageSize: 100,
  })
  .toArray();
```

Options: `pageSize`, `maxItems`, `signal` (AbortSignal). The helper stops on an empty page, a short page (offset mode), or a missing cursor (cursor mode).

## Realtime (WebSocket)

The Rocksky API exposes a WebSocket endpoint at `/ws` for now-playing events and device control. The SDK ships a typed client with reconnect, ping, and a fluent builder.

```ts
import { RealtimeClient, createClient } from "@rocksky/sdk";

// Builder style.
const rt = RealtimeClient.builder()
  .baseUrl("https://api.rocksky.app")
  .token(process.env.ROCKSKY_TOKEN!)
  .clientName("my-app")
  .pingInterval(20_000)
  .reconnect({ backoffMs: 1000, maxBackoffMs: 60_000 })
  .build();

// Or — inherit baseUrl from a RockskyClient.
const client = createClient({ baseUrl: "https://api.rocksky.app" });
const rt2 = client.realtime({ token: process.env.ROCKSKY_TOKEN!, clientName: "my-app" });

rt.on("open", () => console.log("connected"));
rt.on("registered", ({ deviceId }) => console.log("device id:", deviceId));
rt.on("message", ({ data, device_id }) => console.log(device_id, data));
rt.on("control", (c) => console.log("control:", c));
rt.on("close", ({ code, reason }) => console.log("closed", code, reason));
rt.on("error", (err) => console.error(err));

await rt.connect();

// Broadcast a now-playing update to your devices.
await rt.sendMessage({
  type: "track",
  title: "Heart of Glass",
  artist: "Blondie",
});

// Control a target device (or all of them).
await rt.sendControl({ action: "play", target: "device-id-123" });

await rt.close();
```

Events: `open`, `close`, `error`, `registered`, `deviceRegistered`, `message`, `control`, `raw`.

For tests, pass a fake `WebSocket` constructor via `.webSocket(FakeWebSocket)`.

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

Run individual examples:

```bash
bun run example:quickstart
bun run example:builder
bun run example:pipe
bun run example:scrobble
bun run example:pagination
```

## License

MIT
