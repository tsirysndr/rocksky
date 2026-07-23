# rocksky — Python SDK

Python bindings to the shared Rocksky Rust core (`rocksky-sdk`) via
[UniFFI](https://mozilla.github.io/uniffi-rs/): AppView reads, AT Protocol PDS
writes (scrobble fan-out, like, follow, shout, now-playing), a local
duplicate-prevention index, and the identity hashes — the same engine behind
every Rocksky SDK (Ruby, Kotlin, Clojure, Erlang/Elixir/Gleam).

## Install

```sh
pip install rocksky==0.6.0        # or: uv add rocksky==0.6.0
```

The wheel is pure-Python; the ~14 MB native library is fetched from the GitHub
release on first import and cached (checksum-verified). For a local checkout,
build it once:

```sh
./build-core.sh
```

## Quickstart

```python
from rocksky import AppView, Agent, ScrobbleInput, song_hash

# Reads — unauthenticated. Pass a base URL to override https://api.rocksky.app.
av = AppView()  # defaults to https://api.rocksky.app; AppView(base, token) for auth-gated reads
print(av.global_stats().scrobbles)
for t in av.top_tracks(10, 0):
    print(t.artist, "—", t.title)

# Typed date-window charts, and a bare title+artist resolved to canonical metadata.
from rocksky import DateInterval
for t in av.top_tracks_interval(10, 0, DateInterval.LAST_DAYS(days=7)):
    print(t.artist, "—", t.title)
meta = av.match_song("Chaser", "Calibro 35", None, None)  # JSON string

# Writes — log in once (session persisted at the given path).
agent = Agent.login_password("session.json", "alice.bsky.social", "app-password", None, None)
out = agent.scrobble(ScrobbleInput(
    title="Chaser", artist="Calibro 35",
    album="Jazzploitation", album_artist="Calibro 35", duration_ms=182320,
))
print(out.scrobble_uri)   # also artist_uri / album_uri / song_uri
```

## API

### Reads — `AppView(base=None, token=None)`

Pass a base URL to target a custom AppView; pass `token` to send
`Authorization: Bearer <token>` on every read (for auth-gated queries).

**Typed views** (return dataclasses): `profile(actor)`,
`scrobbles(actor, limit, offset)`, `songs(actor, limit, offset)`,
`albums(actor, limit, offset)`, `artists(actor, limit, offset)`,
`loved_songs(actor, limit, offset)`, `catalog_albums`, `catalog_artists`,
`catalog_songs`, `album_tracks(uri)`, `artist_albums(uri)`, `artist_tracks`,
`scrobble_feed`, `scrobble(uri)` (single), `follows`, `followers`,
`known_followers`, `top_tracks(limit, offset)`, `top_artists(limit, offset)`,
`global_stats()`.

**Typed date-window charts**: `top_tracks_interval(limit, offset, interval)` and
`top_artists_interval(...)`, where `interval` is a `DateInterval`:
`DateInterval.ALL_TIME`, `DateInterval.LAST_DAYS(days=7)`,
`DateInterval.LAST_WEEKS(weeks=n)`, `DateInterval.LAST_MONTHS(months=n)`,
`DateInterval.LAST_YEARS(years=n)`, `DateInterval.RANGE(start=..., end=...)`
(RFC-3339 bounds). `top_tracks` / `top_artists` are the all-time shorthands.

**Match**: `match_song(title, artist, mb_id, isrc)` resolves a bare title+artist
into full canonical metadata (returns a JSON string).

**Raw-JSON long tail** (each returns a JSON string): `album`, `artist`, `song`,
`playlists`, `playlist`, `stats`, `wrapped`, `scrobbles_chart`,
`recommendations`, `neighbours`, shouts, and more.

**Universal escape hatch**: `av.get(nsid, params)` calls *any* read query by
NSID — `params` is a `dict[str, str]`, and it returns a JSON string.

### Writes — `Agent`

`Agent.login_password(session_path, identifier, password, appview=None, dedup_path=None)`
returns an agent. Then:

- `scrobble(ScrobbleInput)` → `ScrobbleResult` — from full metadata, writes
  **artist + album + song + scrobble**, skipping any that already exist (with a
  dedup store).
- `scrobble_match(ScrobbleMatchInput)` → `ScrobbleResult` — resolves the track
  via `match_song` first, then fans out the same way. `ScrobbleMatchInput(title,
  artist, album=None, mb_id=None, isrc=None, timestamp=None)` — `title`/`artist`
  required; `album` overrides the resolved album, `mb_id`/`isrc` are match
  anchors, `timestamp` is the scrobbled-at Unix seconds
  (e.g. `agent.scrobble_match(ScrobbleMatchInput(title="Chaser", artist="Calibro 35"))`).
- `create_song(SongInput)`, `create_album(AlbumInput)`, `create_artist(ArtistInput)`
- `like(uri, cid)`, `unlike(uri)`, `follow(did)`, `unfollow(did)`
- `shout(subject_uri, subject_cid, message)`, `reply_shout(...)`
- `set_now_playing(NowPlayingInput)`, `clear_now_playing()`
- `refresh_session()`, `did()`, `profile()`
- `sync_repo()` — mirror the repo into the local dedup index, returning per-collection
  counts as JSON (needs `dedup_path`)
- `hydrate_from_jetstream()` — keep the dedup index live off the Jetstream firehose
  (needs `dedup_path`)

### Identity hashes

`song_hash(title, artist, album)`, `album_hash(album, album_artist)`,
`artist_hash(album_artist)` — lowercase-hex SHA-256, identical to the server and
every other Rocksky SDK.

## Example

```sh
python examples/native_core.py
```

## License

MIT.
