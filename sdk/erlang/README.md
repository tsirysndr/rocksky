# rocksky (Erlang)

[![Hex.pm](https://img.shields.io/hexpm/v/rocksky_erl.svg?logo=erlang&logoColor=white)](https://hex.pm/packages/rocksky_erl)
[![Hex Docs](https://img.shields.io/badge/hex-docs-lightgreen.svg)](https://hexdocs.pm/rocksky_erl/)
![Erlang/OTP](https://img.shields.io/badge/Erlang%2FOTP-27%2B-A90533?logo=erlang&logoColor=white)
![NIF](https://img.shields.io/badge/native-erl__nif-5C4B8A)
![License](https://img.shields.io/badge/license-MIT-blue)

Official Erlang SDK for [Rocksky](https://rocksky.app) — a Rustler **NIF** over
the shared Rust engine (`rocksky-sdk`, `crates/rocksky-nif`). AppView reads,
AT Protocol PDS **writes** (scrobble fan-out, like, follow, shout), and the
identity hashes shared across every Rocksky SDK.

The OTP application is `rocksky_erl`; the modules are `rocksky` (friendly API)
and `rocksky_nif` (raw NIF). This same NIF powers the Elixir and Gleam SDKs.

## Build

```sh
./build-core.sh                 # build priv/rocksky_nif.so from the Rust core
erlc -o ebin src/*.erl
./examples/native_core.escript  # read-only demo
```

## Usage

```erlang
{ok, Stats} = rocksky:global_stats().
Hash = rocksky:song_hash(<<"Chaser">>, <<"Calibro 35">>, <<"Jazzploitation">>).

Agent = rocksky:agent_login(<<"session.json">>, <<"alice.bsky.social">>, <<"app-pw">>),
{ok, Out} = rocksky:agent_scrobble(Agent, #{
    <<"title">> => <<"Chaser">>, <<"artist">> => <<"Calibro 35">>,
    <<"album">> => <<"Jazzploitation">>, <<"albumArtist">> => <<"Calibro 35">>,
    <<"durationMs">> => 182320}).
```

Reads/writes return `{ok, Value}` | `{error, Message}` with binary-keyed maps.

The Hex package is `rocksky_erl` 0.3.0.

## API

### Reads

Named reads: `profile`, `scrobbles`, `top_tracks`, `global_stats`.

**Universal `get`** — the escape hatch reaches the *whole* `app.rocksky.*` read
catalog by NSID: `rocksky:get(Nsid, Params)`, `rocksky:get(Nsid, Params, Base)`,
and `rocksky:get(Nsid, Params, Base, Token)` (bearer token for auth-gated
queries), each → `{ok, Data}`.

```erlang
{ok, Albums}  = rocksky:get(<<"app.rocksky.album.getAlbums">>, #{<<"limit">> => 20}),
{ok, Tracks}  = rocksky:get(<<"app.rocksky.album.getAlbumTracks">>, #{<<"uri">> => Uri}),
{ok, Follows} = rocksky:get(<<"app.rocksky.graph.getFollows">>, #{<<"actor">> => Actor}),
{ok, S}       = rocksky:get(<<"app.rocksky.stats.getStats">>, #{}).
```

**Typed date-window charts** — `rocksky:top_tracks_interval(5, 0, {days, 7})` and
`rocksky:top_artists_interval(5, 0, all)`; the interval is `all` | `{days, N}` |
`{weeks, N}` | `{months, N}` | `{years, N}` | `{range, Start, End}`.

**Match** — `rocksky:match_song(Title, Artist)` resolves a bare title + artist
into full canonical metadata.

### Writes

`rocksky:agent_login(Session, Id, Pw)` (also `/5` with `AppView`, `DedupPath`),
then `agent_scrobble` (full metadata), `agent_like`, `agent_follow`,
`agent_shout`, `agent_refresh_session`.

**Match-then-scrobble** — `rocksky:agent_scrobble_match(Agent, Input)` where
`Input` is a map with camelCase binary keys: required `<<"title">>`/`<<"artist">>`,
optional `<<"album">>`, `<<"mbId">>`, `<<"isrc">>` (match anchors) and
`<<"timestamp">>` (scrobbled-at Unix seconds). Resolves canonical metadata and
scrobbles in one call. A flat `/7` form —
`agent_scrobble_match(Agent, Title, Artist, Album, MbId, Isrc, Timestamp)`, empty
strings / `0` omitted — backs the Gleam SDK.

**Dedup + realtime** — pass a `DedupPath` to `agent_login/5` to enable the local
dedup store, then keep it warm with `rocksky:agent_sync_repo(Agent)` and
`rocksky:agent_hydrate_from_jetstream(Agent)`.

## License

MIT.
