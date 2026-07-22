# rocksky — Python SDK

Python bindings to the shared Rocksky Rust core (`rocksky-sdk`) via
[UniFFI](https://mozilla.github.io/uniffi-rs/): AppView reads, AT Protocol PDS
writes (scrobble fan-out, like, follow, shout, now-playing), a local
duplicate-prevention index, and the identity hashes — the same engine behind
every Rocksky SDK (Ruby, Kotlin, Clojure, Erlang/Elixir/Gleam).

## Install

```sh
pip install rocksky        # or: uv add rocksky
```

The wheel is pure-Python; the ~14 MB native library is fetched from the GitHub
release on first import and cached (checksum-verified). For a local checkout,
build it once:

```sh
./build-core.sh
```

## Quickstart

```python
from rocksky.core import AppView, Agent, ScrobbleInput, song_hash

# Reads — unauthenticated. Pass a base URL to override https://api.rocksky.app.
av = AppView(None)
print(av.global_stats().scrobbles)
for t in av.top_tracks(10, 0):
    print(t.artist, "—", t.title)

# Writes — log in once (session persisted at the given path).
agent = Agent.login_password("session.json", "alice.bsky.social", "app-password", None, None)
out = agent.scrobble(ScrobbleInput(
    title="Chaser", artist="Calibro 35",
    album="Jazzploitation", album_artist="Calibro 35", duration_ms=182320,
))
print(out.scrobble_uri)   # also artist_uri / album_uri / song_uri
```

## API

### Reads — `AppView(base=None)`

`profile(actor)`, `scrobbles(actor, limit, offset)`, `songs(actor, limit, offset)`,
`top_tracks(limit, offset)`, `top_artists(limit, offset)`, `global_stats()`.
Pass a base URL to `AppView(...)` to target a custom AppView.

### Writes — `Agent`

`Agent.login_password(session_path, identifier, password, appview=None, dedup_path=None)`
returns an agent. Then:

- `scrobble(ScrobbleInput)` → `ScrobbleResult` — writes **artist + album + song +
  scrobble**, skipping any that already exist (with a dedup store).
- `create_song(SongInput)`, `create_album(AlbumInput)`, `create_artist(ArtistInput)`
- `like(uri, cid)`, `unlike(uri)`, `follow(did)`, `unfollow(did)`
- `shout(subject_uri, subject_cid, message)`, `reply_shout(...)`
- `set_now_playing(NowPlayingInput)`, `clear_now_playing()`
- `refresh_session()`, `did()`, `profile()`
- `sync_repo()` — mirror the repo into the local dedup index (needs `dedup_path`)

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
