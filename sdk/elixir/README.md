# Rocksky — Elixir SDK
[![Package Version](https://img.shields.io/hexpm/v/rocksky_ex)](https://hex.pm/packages/rocksky_ex)

Elixir bindings to the shared Rocksky Rust core (`rocksky-sdk`) via the
`:rocksky_erl` Rustler NIF: AppView reads, AT Protocol PDS writes (scrobble
fan-out, like, follow, shout) and the identity hashes — the same engine behind
every Rocksky SDK.

## Installation

```elixir
def deps do
  [{:rocksky_ex, "~> 0.4"}]
end
```

`rocksky_ex` pulls in `rocksky_erl`, whose loader fetches the native library from
the GitHub release on first use (checksum-verified). For monorepo dev, build it
locally and point at it: `../erlang/build-core.sh` then set
`ROCKSKY_ERL_PATH=../erlang`.

## Quick start

```elixir
# Reads — unauthenticated. The last arg overrides https://api.rocksky.app.
{:ok, stats} = Rocksky.global_stats()
IO.puts(stats["scrobbles"])

{:ok, top} = Rocksky.top_tracks(10, 0)
for t <- top, do: IO.puts("#{t["artist"]} — #{t["title"]}")

# Writes — log in once (session persisted at the given path).
agent = Rocksky.login("session.json", "alice.bsky.social", "app-password")
{:ok, out} = Rocksky.scrobble(agent, %{
  "title" => "Chaser", "artist" => "Calibro 35",
  "album" => "Jazzploitation", "albumArtist" => "Calibro 35", "durationMs" => 182_320
})
IO.puts(out["scrobbleUri"])
```

## API

Reads/writes return `{:ok, value}` | `{:error, message}` with binary-keyed maps
(the wire shape). Records are maps with camelCase binary keys.

### Reads — `Rocksky`

`profile(actor, base \\ "")`, `scrobbles(actor, limit, offset, base \\ "")`,
`top_tracks(limit, offset, base \\ "")`, `global_stats(base \\ "")`. The trailing
`base` overrides the AppView URL.

### Writes — `Rocksky`

`login(session_path, identifier, password, appview \\ "")` → an opaque agent
handle. Then `scrobble(agent, track)` (fans out to artist/album/song/scrobble),
`like(agent, uri, cid)`, `follow(agent, did)`,
`shout(agent, subject_uri, subject_cid, message)`, `refresh_session(agent)`.

### Identity hashes

`Rocksky.song_hash(title, artist, album)` — lowercase-hex SHA-256, identical
to the server and every other Rocksky SDK.

## Example

```sh
ROCKSKY_ERL_PATH=../erlang mix run examples/native_core.exs
```

## License

MIT.
