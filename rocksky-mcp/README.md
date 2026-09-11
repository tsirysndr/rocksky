# rocksky-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[Rocksky](https://rocksky.app), on stdio. It gives an AI agent three things at
once:

- **the listener's players** — every device online for their account (playerd
  daemons, the desktop app, open web miniplayers), over the same remote-control
  WebSocket the miniplayers speak. It is a *controller*, not a player: the agent
  can run on a laptop, in a terminal, in CI, and still start music on the amp in
  the living room;
- **the listener's library** — Rocksky's Navidrome (Subsonic-compatible) API,
  which is where playable track ids come from;
- **the Rocksky account** — the AppView's XRPC surface: profiles, stats,
  scrobbles, recommendations, the platform charts.

This is what `rocksky mcp` runs. It replaced the TypeScript MCP server that used
to live inside the CLI.

## Install

The Rocksky CLI fetches the binary for you:

```sh
npm install -g @rocksky/cli
rocksky login
rocksky mcp
```

Or install the server on its own:

```sh
npm install -g @rocksky/mcp   # gives you the `rocksky-mcp` command
```

Or build it:

```sh
cd rocksky-mcp
cargo build --release         # target/release/rocksky-mcp
```

## Connecting a client

Claude Code:

```sh
claude mcp add rocksky -- rocksky mcp
```

Anything that reads an `mcpServers` block (Claude Desktop, Cursor, Zed…):

```json
{
  "mcpServers": {
    "rocksky": { "command": "rocksky", "args": ["mcp"] }
  }
}
```

## Configuration

There is nothing to configure for the hosted Rocksky. The server reads the
access token `rocksky login` wrote to `~/.rocksky/token.json`, talks to
`https://api.rocksky.app` and its remote-control socket, and provisions its own
Subsonic credentials (your handle plus a dedicated API key, cached in
`~/.rocksky/navidrome.json` — the same file the CLI and playerd use) against
Rocksky's library server. The library host is not configurable: a Rocksky
account's music lives there and the credentials are minted for it.

| Flag           | Environment          | Default                    | What it is                                                      |
| -------------- | -------------------- | -------------------------- | --------------------------------------------------------------- |
| `--device`     | `ROCKSKY_MCP_DEVICE` | —                          | Player the command tools address when a call names none         |
| `--token`      | `ROCKSKY_TOKEN`      | —                          | Access token, inline (prefer the token file)                    |
| `--token-path` | `ROCKSKY_TOKEN_PATH` | `~/.rocksky/token.json`    | Where the access token lives                                    |
| `--api-url`    | `ROCKSKY_API_URL`    | `https://api.rocksky.app`  | Rocksky API base URL — for pointing at a development server     |
| `--ws-url`     | `ROCKSKY_WS_URL`     | `wss://api.rocksky.app/ws` | Remote-control WebSocket — for pointing at a development server |
| —              | `ROCKSKY_MCP_LOG`    | `info`                     | Log filter (`tracing` syntax). Logs go to stderr, never stdout  |

`rocksky-mcp tools` prints every tool definition as JSON and exits — handy for
checking the surface without a client or a token.

## Tools

Forty of them, grouped below. [TOOLS.md](TOOLS.md) has every parameter of every
one; this is the map.

### Players

`list_devices` is where to start when you do not know what is online. Every
command tool takes an optional `device` (id, or name with case-insensitive
partial matching) and picks the obvious one when only one player is running, or
falls back to the primary device. Pass `"all"` to broadcast.

| Tool                 | What it does                                                                     |
| -------------------- | -------------------------------------------------------------------------------- |
| `list_devices`       | Every player online for the account, with what each is playing                   |
| `get_player_state`   | Transport, current track with elapsed position, shuffle/repeat/volume, the queue |
| `set_primary_device` | Make a device primary, so its now-playing drives the public profile status       |
| `play` / `pause`     | Resume (or start the cued track) / pause, keeping the position                   |
| `next_track`         | Skip forward in the queue                                                        |
| `previous_track`     | Skip back                                                                        |
| `seek`               | Jump to a position within the current track                                      |
| `set_volume`         | 0.0 – 1.0                                                                        |
| `set_playback_mode`  | Shuffle on/off, repeat `off` / `one` / `all`                                     |

### Queue

| Tool           | What it does                                                                           |
| -------------- | -------------------------------------------------------------------------------------- |
| `get_queue`    | The queue with the index of the playing entry — those indices are what the others take |
| `enqueue`      | Put music on: library ids, `{title, artist}` pairs, an `album_id` or a `playlist_id`   |
| `queue_jump`   | Play a specific position                                                               |
| `queue_remove` | Drop one entry                                                                         |
| `queue_move`   | Reorder                                                                                |
| `clear_queue`  | Empty it, keeping the current track by default                                         |

`enqueue` takes `mode`: `"now"` replaces the queue and starts playing, `"next"`
inserts after the current track, `"last"` appends. Names that have no library
match come back under `unresolved` rather than failing the call, so a set built
from recommendations (which are names, not ids) queues in one go.

### Library

| Tool                    | What it does                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `search_library`        | Tracks, albums and artists, with the ids `enqueue` takes. An `at://` URI works too |
| `get_album`             | An album and its tracks in order, by id or title (narrow with `artist`)            |
| `get_artist`            | An artist and their albums, by id or name                                          |
| `browse_songs`          | A batch of tracks without searching: `random`, `starred`, or a whole `genre`       |
| `browse_albums`         | Album listings: newest, frequent, recent, random, starred, by year, by genre       |
| `list_genres`           | Genres present, with track and album counts                                        |
| `list_playlists`        | The listener's saved playlists                                                     |
| `get_playlist`          | A playlist and its tracks, by id or name                                           |
| `get_listening_history` | What the listener plays: `top`, `loved`, or `recent` scrobbles                     |
| `get_recommendations`   | What Rocksky thinks they would like next: `tracks`, `artists` or `albums`          |

### Audio

`get_audio_settings` reads the *saved* settings — the
`app.rocksky.rockbox.audio.settings` record every Rocksky player starts from.
The setters push to a running player over the remote protocol: immediate, and
they do not rewrite the record, so the next change from the web or desktop app
wins again.

| Tool                     | What it does                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- |
| `get_audio_settings`     | The saved equalizer, tone, crossfade and ReplayGain                          |
| `set_equalizer`          | 10-band EQ gains (32 Hz – 16 kHz), precut, bass and treble, in dB            |
| `set_audio_settings`     | A full document: crossfade, ReplayGain, crossfeed, compressor, surround, pbe |
| `list_equalizer_presets` | The listener's saved `app.rocksky.equalizer` presets, with their bands       |
| `apply_equalizer_preset` | Load one onto a running player, by name or `at://` URI                       |

### Account

Each of these takes an optional `actor` (handle or DID) and falls back to the
logged-in account, so "what am I listening to" and "what is alice.bsky.social
listening to" are one tool. Only `create_api_key` writes anything.

| Tool              | What it does                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `whoami`          | The account this server is authenticated as                                               |
| `get_profile`     | Handle, display name, avatar, profile page                                                |
| `get_stats`       | Scrobbles, and how many distinct tracks/albums/artists/loved tracks that adds up to       |
| `get_scrobbles`   | Scrobbles newest first, with when they happened                                           |
| `get_top`         | Most-played `songs`, `albums`, `artists`, or `loved` tracks                               |
| `get_now_playing` | What they are scrobbling right now (Rocksky, falling back to their connected Spotify)     |
| `search`          | Everything Rocksky has indexed — tracks, albums, artists, playlists, accounts             |
| `get_charts`      | What the whole community plays: top `artists` or `tracks` over `all` / `7d` / `4w` / `1y` |
| `create_api_key`  | Mint an API key for a third-party scrobbler (the key itself is read in the web app)       |

`search` is platform-wide and returns names; `search_library` is the listener's
own music and returns playable ids. For something to play, use the latter.

## How it works

```
MCP client ──stdio JSON-RPC──▶ rocksky-mcp ──┬── remote-control WebSocket ──▶ players
                                             ├── Subsonic REST ─────────────▶ library
                                             └── XRPC (rocksky-sdk AppView) ▶ AppView
```

- `server.rs` is the stdio loop: newline-delimited JSON-RPC 2.0 over
  [`jsonrpsee`](https://docs.rs/jsonrpsee), with requests dispatched
  concurrently (a `search_library` waiting on the network must not hold up the
  `pause` behind it) and every reply funnelled through one writer task. Nothing
  but protocol frames reaches stdout.
- `state.rs` folds the controller's event stream into a snapshot of every device
  on the account, which is what makes commands addressable by name. Commands are
  fire-and-forget — the protocol has no acks — so each tool settles briefly and
  then reports the state the player pushed back.
- Reads go through [`rocksky-sdk`](../crates/rocksky-sdk)'s `AppView`, so
  responses are typed views rather than loose JSON.

There is no local audio here: no decoding, no analysis, no `rockbox-playback`.
That is [`playerd`](../playerd)'s job, and keeping it out is why this binary
cross-compiles to every release target with no system dependencies.

## Releases

`rocksky-mcp-release.yml` builds macOS arm64/x64, Linux x64/arm64 and Windows
x64 tarballs with SHA-256 sums and uploads them to the
`rocksky-mcp-v<version>` release. It runs on a `rocksky-mcp-v*` tag or manually
from the Actions tab. The npm package (`rocksky-mcp/npm`, `@rocksky/mcp`) pins
its version to `Cargo.toml` and downloads the matching release; it is published
by hand, not by CI.

## Skill

`skills/rocksky` is an agent skill for this server — when to reach for which
tool, how to build a set, and what to do when nothing is online. Symlink it
where your agent looks for skills:

```sh
ln -s "$PWD/skills/rocksky" ~/.claude/skills/rocksky
```

For beat- and key-aware mixing (Auto DJ, set planning, track analysis) there is
a second server and skill: [playerd](../playerd) and `rocksky-dj`.

## License

MPL-2.0
