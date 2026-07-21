# rocksky (Ruby)

Idiomatic Ruby client for the [Rocksky](https://rocksky.app) XRPC API.

```ruby
client = Rocksky.new(token: ENV["ROCKSKY_TOKEN"])

client.actor.get_profile(did: "tsiry-sandratraina.com")
client.charts.get_top_artists(limit: 10, start_date: "2025-01-01")
client.scrobble.create_scrobble(title: "In Bloom", artist: "Nirvana")
```

Every XRPC NSID maps to a method on a resource object. `app.rocksky.actor.getProfile`
becomes `client.actor.get_profile(...)`. `app.rocksky.scrobble.createScrobble`
becomes `client.scrobble.create_scrobble(...)`. No magic — just kwargs in,
parsed JSON out.

## Installation

Add it to your `Gemfile`:

```ruby
gem "rocksky"
```

Or install directly:

```bash
gem install rocksky
```

Requires Ruby 3.0+. The SDK depends only on Ruby's stdlib (`net/http`, `json`, `uri`).

## Quick start

```ruby
require "rocksky"

# Reads ROCKSKY_BASE_URL and ROCKSKY_TOKEN from the env when omitted.
client = Rocksky.new

profile = client.actor.get_profile(did: "tsiry-sandratraina.com")
puts profile["displayName"]
```

For authenticated calls, pass a Bluesky-issued Bearer token (see
[lexicons documentation](https://github.com/rocksky/rocksky/blob/main/LEXICONS.md)):

```ruby
client = Rocksky.new(token: "eyJ...")
client.scrobble.create_scrobble(title: "In Bloom", artist: "Nirvana")
```

`with_token` derives a new client without mutating the original — useful in
web apps that share one base client across users:

```ruby
base = Rocksky.new
def for_user(base, token) = base.with_token(token)
```

## Resources

| Resource | Methods |
|----------|---------|
| `client.actor`    | `get_profile`, `get_actor_albums/artists/songs/scrobbles/playlists/loved_songs`, `get_actor_neighbours`, `get_actor_compatibility` |
| `client.album`    | `get_album`, `get_albums`, `get_album_tracks` |
| `client.apikey`   | `get_apikeys`, `create_apikey`, `update_apikey`, `remove_apikey` *(auth)* |
| `client.artist`   | `get_artist`, `get_artists`, `get_artist_albums/tracks/listeners/recent_listeners` |
| `client.charts`   | `get_scrobbles_chart`, `get_top_artists`, `get_top_tracks` |
| `client.feed`     | `search`, `get_feed_generators/generator/feed`, `get_stories`, `get_recommendations`, `get_artist_recommendations`, `get_album_recommendations` |
| `client.graph`    | `follow_account`, `unfollow_account`, `get_followers`, `get_follows`, `get_known_followers` *(auth)* |
| `client.like`     | `like_song`, `dislike_song`, `like_shout`, `dislike_shout` *(auth)* |
| `client.mirror`   | `get_mirror_sources`, `put_mirror_source` *(auth)* |
| `client.player`   | `play`, `pause`, `next`, `previous`, `seek`, `play_file`, `play_directory`, `add_items_to_queue`, `get_currently_playing`, `get_playback_queue` |
| `client.playlist` | `get_playlist`, `get_playlists`, `create_playlist`, `remove_playlist`, `start_playlist`, `insert_files`, `insert_directory` |
| `client.scrobble` | `create_scrobble`, `get_scrobble`, `get_scrobbles` |
| `client.shout`    | `create_shout`, `reply_shout`, `remove_shout`, `report_shout`, `get_*_shouts`, `get_shout_replies` |
| `client.song`     | `get_song`, `get_songs`, `get_song_recent_listeners`, `match_song`, `create_song` |
| `client.spotify`  | `play`, `pause`, `next`, `previous`, `seek`, `get_currently_playing` *(auth)* |
| `client.stats`    | `get_stats`, `get_wrapped` |

For anything not covered, drop down to the raw transport:

```ruby
client.query("app.rocksky.actor.getProfile", did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr")
client.procedure("app.rocksky.like.likeSong", body: { uri: "at://..." })
```

## Conventions

- **Keyword args** for every parameter. Ruby `snake_case` names map to the
  lexicon's `camelCase` (e.g. `start_date:` → `startDate`).
- **`nil` is dropped.** Pass `nil` for any optional param and it won't be sent.
- **Arrays are CSV-joined.** Lexicon list params like `names:` accept Ruby arrays:
  `client.artist.get_artists(names: %w[Nirvana Pixies])`.
- **Hashes in, Hashes out.** Responses come back as plain `Hash` (string keys) —
  no DSL, no model classes. Match the shape of the lexicon JSON 1:1.

## Error handling

Every non-2xx response raises a subclass of `Rocksky::Error`:

```ruby
begin
  client.song.get_song(uri: "at://does-not-exist")
rescue Rocksky::NotFound => e
  puts "missing: #{e.message} (status=#{e.status}, nsid=#{e.nsid})"
rescue Rocksky::RateLimited
  sleep 5; retry
rescue Rocksky::Error => e
  warn "rocksky failure: #{e.class}: #{e.message}"
end
```

| Class | Status |
|-------|--------|
| `Rocksky::BadRequest`     | 400 |
| `Rocksky::Unauthorized`   | 401 |
| `Rocksky::Forbidden`      | 403 |
| `Rocksky::NotFound`       | 404 |
| `Rocksky::RateLimited`    | 429 |
| `Rocksky::ServerError`    | 5xx |
| `Rocksky::HTTPError`      | any other non-2xx |
| `Rocksky::TransportError` | DNS/TCP/timeouts |

## IRB console

The gem ships with a `rocksky-console` executable: an IRB session
pre-loaded with a `client` bound to your environment.

```bash
$ gem install rocksky
$ ROCKSKY_TOKEN=eyJ... rocksky-console
Rocksky 0.2.0 — interactive console
  base_url : https://api.rocksky.app
  token    : present (set via ROCKSKY_TOKEN)

A client is bound to `client`. Try:
  client.actor.get_profile(did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr")
  client.charts.get_top_artists(limit: 10)

irb> client.actor.get_profile(did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr")
=> {"did"=>"did:plc:...", "handle"=>"tsiry-sandratraina.com", ...}
```

### From a checkout (development)

If you've cloned the repo, use `bin/console` instead. It loads the local
source tree, so edits to `lib/` are picked up on the next `reload!`-style
restart:

```bash
$ cd sdk/ruby
$ bundle install
$ bin/console
```

### Ad-hoc IRB (no script)

You can always launch IRB yourself:

```bash
$ irb -rrocksky
irb> client = Rocksky.new(token: ENV["ROCKSKY_TOKEN"])
irb> client.charts.get_top_tracks(limit: 5)
```

### Useful IRB recipes

```ruby
# Pretty-print responses
require "json"
puts JSON.pretty_generate(client.actor.get_profile(did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr"))

# Inspect what the SDK is about to send
client = Rocksky.new(headers: { "X-Debug" => "1" })

# Try things against staging without touching prod
client = Rocksky.new(base_url: "https://api.staging.rocksky.app")

# Tighter timeouts in a script
client = Rocksky.new(open_timeout: 2, read_timeout: 5)
```

## Configuration

| Option         | Default                       | Env var               |
|----------------|-------------------------------|-----------------------|
| `base_url`     | `https://api.rocksky.app`     | `ROCKSKY_BASE_URL`    |
| `token`        | `nil`                         | `ROCKSKY_TOKEN`       |
| `headers`      | `{}`                          | —                     |
| `user_agent`   | `rocksky-ruby/<version>`      | —                     |
| `open_timeout` | `10` seconds                  | —                     |
| `read_timeout` | `30` seconds                  | —                     |

## Types

Lexicon-derived `Struct` types are available under `Rocksky::Generated::*`, mirroring every lex `*View*` / `*Record` / `*Input` / `*Output` / `*Params` shape from [the Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons). Regenerate with `bun run lexgen:types` at the repo root.


## Examples

The `examples/` directory contains runnable scripts:

```bash
bundle exec ruby examples/01_profile.rb tsiry-sandratraina.com
bundle exec ruby examples/03_charts.rb
ROCKSKY_TOKEN=... bundle exec ruby examples/02_scrobble.rb
```

See [examples/README.md](examples/README.md) for the full list.

## Development

```bash
$ bundle install
$ bundle exec rake test    # run the suite
$ bin/console              # IRB with the local source tree
```

Tests use Minitest + WebMock — no live network access needed. Add a new
resource by dropping a file in `lib/rocksky/resources/`, wiring it into
`lib/rocksky.rb` and `lib/rocksky/client.rb`, and adding tests under
`test/resources/`.

## License

[MIT](LICENSE) © Tsiry Sandratraina.

## Native core (`Rocksky::Core`)

Alongside the HTTP client, the gem ships the **native core** — a stdlib `fiddle`
binding to the shared Rust engine's C ABI (`rocksky-sdk`), giving AT Protocol PDS
**writes** (scrobble fan-out, like, follow, shout) and identity hashes identical
to every other Rocksky SDK.

```sh
./build-core.sh
ruby -Ilib examples/native_core.rb
```

```ruby
require "rocksky/core"

Rocksky::Core.global_stats               # => {"scrobbles"=>…, …}
agent = Rocksky::Core::Agent.login("session.json", "alice.bsky.social", "app-pw")
out = agent.scrobble("title" => "Chaser", "artist" => "Calibro 35",
                     "album" => "Jazzploitation", "albumArtist" => "Calibro 35",
                     "durationMs" => 182_320)
puts out["scrobbleUri"]
agent.close
```
