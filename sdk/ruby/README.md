# rocksky (Ruby)

Ruby bindings to the shared Rocksky Rust core (`rocksky-sdk`) through Ruby's
stdlib `fiddle` (no `ffi` gem): AppView reads, AT Protocol PDS writes (scrobble
fan-out, like, follow, shout) and the identity hashes — the same engine behind
every Rocksky SDK.

## Installation

```sh
gem install rocksky
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

`profile(actor, base:)`, `scrobbles(actor, limit:, offset:, base:)`,
`top_tracks(limit:, offset:, base:)`, `global_stats(base:)`. Every read takes an
optional `base:` to target a custom AppView.

### Writes — `Rocksky::Agent`

`Agent.login(session_path, identifier, password, appview:)` → an agent. Then
`scrobble(track)` (fans out to artist/album/song/scrobble), `like(uri, cid)`,
`follow(did)`, `shout(subject_uri, subject_cid, message)`, `refresh_session`, and
`close` (release the native handle).

### Identity hashes

`Rocksky.song_hash(title, artist, album)` — lowercase-hex SHA-256, identical
to the server and every other Rocksky SDK.

## Example

```sh
ruby -Ilib examples/native_core.rb
```

## License

MIT.
