# @rocksky/sdk

Official TypeScript SDK for [Rocksky](https://rocksky.app) — a music scrobbling &
discovery platform on the AT Protocol. Built on
[atcute](https://github.com/mary-ext/atcute): `RockskyClient` does unauthenticated
AppView reads, and `Agent` logs in with an app password and writes
`app.rocksky.*` records to the user's PDS.

## Install

```sh
npm install @rocksky/sdk      # or: bun add @rocksky/sdk
```

## Quickstart

```ts
import { RockskyClient, Agent } from "@rocksky/sdk";

// Reads — unauthenticated. new RockskyClient() uses https://api.rocksky.app.
const rk = new RockskyClient();
const stats = await rk.globalStats();
const top = await rk.topTracks(10, 0);

// Writes — log in with an app password (resolves the PDS automatically).
const agent = await Agent.login("alice.bsky.social", "app-password");
const uri = await agent.scrobble({
  title: "Chaser", artist: "Calibro 35",
  album: "Jazzploitation", albumArtist: "Calibro 35", duration: 182320,
});
```

## API

**Reads — `RockskyClient`**: `profile`, `scrobbles`, `songs`, `albums`,
`artists`, `topTracks`, `topArtists`, `search`, `globalStats`.

**Writes — `Agent`**: `scrobble`, `createSong`/`createAlbum`/`createArtist`,
`like`, `follow`, `shout`/`replyShout`, `setNowPlaying`/`clearNowPlaying`,
`delete`. Records are the generated types from `./generated/types`.

**Identity hashes**: `songHash`, `albumHash`, `artistHash` — lowercase-hex
SHA-256, identical to the server and every other Rocksky SDK.

## Duplicate prevention + real-time sync

An optional local index (embedded [classic-level](https://github.com/Level/classic-level)
LevelDB) prevents duplicate writes and stays live off the firehose:

```ts
import { RockskyIndex } from "@rocksky/sdk";

const idx = new RockskyIndex("./dedup");
await idx.open();
agent.useIndex(idx);

const stats = await agent.syncRepo();     // backfill from the repo CAR (com.atproto.sync.getRepo)
agent.hydrateFromJetstream();             // keep it live from Jetstream (all 4 servers)
```

With an index attached, the write verbs skip records that already exist (return
the existing URI) and a same-second scrobble of the same track isn't duplicated.

Node ≥ 22 (global `WebSocket`/`fetch`) or Bun.

## Example

```sh
bun run examples/native.ts
```

## License

MIT.
