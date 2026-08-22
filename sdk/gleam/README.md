# rocksky — Gleam SDK

[![Package Version](https://img.shields.io/hexpm/v/rocksky)](https://hex.pm/packages/rocksky)
[![Hex Docs](https://img.shields.io/badge/hex-docs-ffaff3)](https://hexdocs.pm/rocksky/)
![Gleam](https://img.shields.io/badge/Gleam-%E2%89%A51.0-FFAFF3?logo=gleam&logoColor=white)
![Erlang/OTP](https://img.shields.io/badge/Erlang%2FOTP-27%2B-A90533?logo=erlang&logoColor=white)
![NIF](https://img.shields.io/badge/native-erl__nif-5C4B8A)
![License](https://img.shields.io/badge/license-MIT-blue)

Gleam bindings to the shared Rocksky Rust core (`rocksky-sdk`) via the
`rocksky_erl` Rustler NIF: AppView reads, AT Protocol PDS writes (scrobble,
like, follow, shout) and the identity hashes — the same engine behind every
Rocksky SDK. Targets Erlang.

## Installation

```sh
gleam add rocksky   # rocksky = ">= 1.7.0 and < 2.0.0"
```

`rocksky` 1.7.0 depends on `rocksky_erl` 0.4.0, whose loader fetches the native
library from the GitHub release on first use (checksum-verified). For monorepo
dev, build it with `../erlang/build-core.sh` and use the local path dep in
`gleam.toml`.

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

Named reads: `profile(actor)`, `scrobbles(actor, limit, offset)`,
`top_tracks(limit, offset)`, `global_stats()` — each returns `Dynamic`. To target
a custom AppView endpoint, use the `*_at` variant with a trailing endpoint URL
(e.g. `global_stats_at("https://…")`, `top_tracks_at(limit, offset, "https://…")`).

**Universal `get`** — the escape hatch reaches the *whole* `app.rocksky.*` read
catalog by NSID: `get(nsid, params_json)`, `get_authed(nsid, params_json, token)`
(bearer token for auth-gated queries), and `get_at(nsid, params_json, endpoint)`,
each returning `Dynamic`.

```gleam
echo client.get("app.rocksky.album.getAlbums", "{\"limit\":20}")
echo client.get("app.rocksky.album.getAlbumTracks", "{\"uri\":\"...\"}")
echo client.get("app.rocksky.graph.getFollows", "{\"actor\":\"...\"}")
echo client.get("app.rocksky.stats.getStats", "{}")
```

**Typed date-window charts** — `top_tracks_interval(limit, offset, interval)` and
`top_artists_interval(limit, offset, interval)`, where `Interval` is
`AllTime | LastDays(Int) | LastWeeks(Int) | LastMonths(Int) | LastYears(Int) |
Range(String, String)`.

```gleam
echo client.top_tracks_interval(5, 0, client.LastDays(7))
```

**Match** — `match_song(title, artist)` resolves a bare title + artist into full
canonical metadata.

### Filtering

The catalog and feed reads — `catalog_songs`, `catalog_artists`,
`catalog_albums` (each `(limit, offset, genre, filter)`) and
`scrobble_feed(did, following, limit, offset, filter)`, plus `*_at` variants —
take an optional RSQL `filter` expression. Build it with `rocksky/filter`:
fields are a typed `Field` custom type (`filter.Artist`, `filter.Duration`,
dotted scrobble selectors like `filter.TrackArtist`/`filter.UserDid`, and a
`CustomField("…")` escape hatch for anything else), the filter value is always
the first argument of `and`/`or` so expressions chain with `|>`, and
`filter.build` renders the string. Values are quoted/escaped automatically
(`*` wildcards stay bare); `in_list`/`out_list` panic on an empty list.

```gleam
import gleam/option.{None, Some}
import rocksky/client
import rocksky/filter

let rsql =
  filter.eq(filter.Artist, "Daft Punk")
  |> filter.and(filter.gt(filter.Duration, 200_000))
  |> filter.or(filter.in_list(filter.Genre, ["house", "electro"]))
  |> filter.build
// artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)

echo client.catalog_songs(50, 0, None, Some(rsql))
```

Comparisons: `eq`/`ne` (String), `eq_int`/`ne_int`, `eq_bool`/`ne_bool`,
`gt`/`ge`/`lt`/`le` (Int), `in_list`/`out_list`, `is_null`/`is_not_null`.

### Writes

`login(session_path, identifier, password)` → an opaque `Agent`. Then
`scrobble(agent, track)` (full metadata) or
`scrobble_match(agent, ScrobbleMatch(title, artist, album, mb_id, isrc, timestamp))`
(match-then-write) — `title`/`artist` are `String`, the rest `Option` (`album`
override, `mb_id`/`isrc` match anchors, `timestamp` scrobbled-at Unix seconds),
e.g. `scrobble_match(agent, ScrobbleMatch("Chaser", "Calibro 35", None, None, None, None))`,
`like(agent, uri, cid)`, `follow(agent, did)`,
`shout(agent, subject_uri, subject_cid, message)`, `refresh_session(agent)`.

**Dedup + realtime** — once logged in with a dedup path, keep the store warm with
`sync_repo(agent)` and `hydrate_from_jetstream(agent)`.

### Identity hashes

`song_hash(title, artist, album)`, `artist_hash(album_artist)` — lowercase-hex
SHA-256, identical to the server and every other Rocksky SDK.

## Example

```sh
gleam run -m examples/native_core
```

## License

MIT.
