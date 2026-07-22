# rocksky — Gleam SDK

[![Package Version](https://img.shields.io/hexpm/v/rocksky)](https://hex.pm/packages/rocksky)
[![Hex Docs](https://img.shields.io/badge/hex-docs-ffaff3)](https://hexdocs.pm/rocksky)

Gleam bindings to the shared Rocksky Rust core (`rocksky-sdk`) via the
`rocksky_erl` Rustler NIF: AppView reads, AT Protocol PDS writes (scrobble,
like, follow, shout) and the identity hashes — the same engine behind every
Rocksky SDK. Targets Erlang.

## Installation

```sh
gleam add rocksky
```

`rocksky` depends on `rocksky_erl`, whose loader fetches the native library from
the GitHub release on first use (checksum-verified). For monorepo dev, build it
with `../erlang/build-core.sh` and use the local path dep in `gleam.toml`.

## Quick start

```gleam
import rocksky/core

pub fn main() {
  // Reads — the last arg overrides https://api.rocksky.app ("" = default).
  // Envelope calls return Dynamic ({ok, value} | {error, message}); decode with
  // gleam/dynamic.
  echo core.global_stats("")
  echo core.top_tracks(10, 0, "")

  // Writes — log in once (session persisted at the given path).
  let agent = core.login("session.json", "alice.bsky.social", "app-password")
  echo core.follow(agent, "did:plc:rlwgbwqdknilpxxep5gvzc3y")
}
```

## API

### Reads

`profile(actor, base)`, `scrobbles(actor, limit, offset, base)`,
`top_tracks(limit, offset, base)`, `global_stats(base)`. The trailing `base`
overrides the AppView URL (`""` = default). Each returns `Dynamic`.

### Writes

`login(session_path, identifier, password)` → an opaque `Agent`. Then
`like(agent, uri, cid)`, `follow(agent, did)`,
`shout(agent, subject_uri, subject_cid, message)`, `refresh_session(agent)`.

### Identity hashes

`song_hash(title, artist, album)`, `artist_hash(album_artist)` — lowercase-hex
SHA-256, identical to the server and every other Rocksky SDK.

## Example

```sh
gleam run -m examples/native_core
```

## License

MIT.
