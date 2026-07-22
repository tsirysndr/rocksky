# rocksky (Erlang)

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

## License

MIT.
