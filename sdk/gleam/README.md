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
import rocksky/client

pub fn main() {
  // Reads — use the default AppView (https://api.rocksky.app).
  // Envelope calls return Dynamic ({ok, value} | {error, message}); decode with
  // gleam/dynamic.
  echo client.global_stats()
  echo client.top_tracks(10, 0)

  // Writes — log in once (session persisted at the given path).
  let agent = client.login("session.json", "alice.bsky.social", "app-password")
  echo client.follow(agent, "did:plc:rlwgbwqdknilpxxep5gvzc3y")
}
```

## API

### Reads

`profile(actor)`, `scrobbles(actor, limit, offset)`, `top_tracks(limit, offset)`,
`global_stats()` — each returns `Dynamic`. To target a custom AppView endpoint,
use the `*_at` variant with a trailing endpoint URL (e.g.
`global_stats_at("https://…")`, `top_tracks_at(limit, offset, "https://…")`).

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
