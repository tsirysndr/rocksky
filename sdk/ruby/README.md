# rocksky (Ruby)

Ruby bindings to the shared Rocksky Rust core (`rocksky-sdk`) through Ruby's
stdlib `fiddle` (no `ffi` gem): AppView reads, AT Protocol PDS writes (scrobble
fan-out, like, follow, shout) and the identity hashes — the same engine behind
every Rocksky SDK.

## Installation

```sh
gem install rocksky
```

Or in a Gemfile:

```ruby
gem "rocksky", "~> 0.7"
```

The gem is pure-Ruby; the native library is fetched from the GitHub release on
first load and cached (checksum-verified). For a local checkout, build it once:

```sh
./build-core.sh
```

## Quick start

```ruby
require "rocksky"

# Reads — unauthenticated. base: overrides https://api.rocksky.app.
stats = Rocksky.global_stats
puts stats["scrobbles"]
Rocksky.top_tracks(limit: 10).each { |t| puts "#{t["artist"]} — #{t["title"]}" }

# Writes — log in once (session persisted at the given path).
agent = Rocksky::Agent.login("session.json", "alice.bsky.social", "app-password")
out = agent.scrobble(
  "title" => "Chaser", "artist" => "Calibro 35",
  "album" => "Jazzploitation", "albumArtist" => "Calibro 35", "durationMs" => 182_320
)
puts out["scrobbleUri"]
agent.close
```

## API

Reads/writes return plain Hashes/Strings (the wire shape); write verbs raise
`Rocksky::Error` on an `{"error": …}` envelope. Records are Hashes with
camelCase keys.

### Reads — `Rocksky`

Named reads: `profile(actor, base:)`, `scrobbles(actor, limit:, offset:, base:)`,
`top_tracks(limit:, offset:, base:)`, `global_stats(base:)`. Every read takes an
optional `base:` to target a custom AppView.

**Universal escape hatch** — `Rocksky.get(nsid, params, base: nil, token: nil)`
reaches the *whole* `app.rocksky.*` read catalog and returns the parsed
Hash/Array. Pass `token:` to send an `Authorization: Bearer` header for
auth-gated queries.

```ruby
Rocksky.get("app.rocksky.album.getAlbums", limit: 10)
Rocksky.get("app.rocksky.album.getAlbumTracks", uri: album_uri)
Rocksky.get("app.rocksky.graph.getFollows", actor: "alice.bsky.social")
Rocksky.get("app.rocksky.actor.getActorLovedSongs", actor: "alice.bsky.social")
Rocksky.get("app.rocksky.stats.getStats")
Rocksky.get("app.rocksky.charts.getScrobblesChart", token: "…")
```

**Typed date-window charts** — `top_tracks_interval(limit:, offset:, interval:)`
and `top_artists_interval(...)`. `interval:` is `:all` or one of
`[:days, n]` / `[:weeks, n]` / `[:months, n]` / `[:years, n]` /
`[:range, start, end]`.

```ruby
Rocksky.top_tracks_interval(limit: 5, interval: [:days, 7])
Rocksky.top_artists_interval(limit: 5, interval: :all)
```

**Match** — `Rocksky.match_song(title, artist, mb_id: nil, isrc: nil)` resolves a
bare title + artist into full canonical metadata.

### Writes — `Rocksky::Agent`

`Agent.login(session_path, identifier, password, appview:, dedup_path:)` → an
agent. Pass `dedup_path:` to enable scrobble dedup + realtime hydration (see
below). Then `scrobble(track)` (fans out to artist/album/song/scrobble),
`like(uri, cid)`, `follow(did)`, `shout(subject_uri, subject_cid, message)`,
`refresh_session`, and `close` (release the native handle).

**Two scrobble paths** — `scrobble(track)` takes full metadata, while
`scrobble_match(params)` takes a single Hash with camelCase string keys —
required `"title"`/`"artist"`, optional `"album"` (override), `"mbId"`/`"isrc"`
(match anchors), `"timestamp"` (scrobbled-at Unix seconds) — matching a bare
title + artist first, then writes.

```ruby
agent.scrobble_match("title" => "Chaser", "artist" => "Calibro 35",
                     "album" => "Jazzploitation")
```

**Dedup + realtime** — with `dedup_path:` set at login, `agent.sync_repo`
backfills from the PDS repo and `agent.hydrate_from_jetstream` streams live
updates, both deduped against the on-disk store.

```ruby
agent = Rocksky::Agent.login("session.json", "alice.bsky.social", "app-password",
                             dedup_path: "./dedup")
agent.sync_repo
agent.hydrate_from_jetstream
```

### Identity hashes

`Rocksky.song_hash(title, artist, album)` — lowercase-hex SHA-256, identical
to the server and every other Rocksky SDK.

## Example

```sh
ruby -Ilib examples/native_core.rb
```

## License

MIT.
