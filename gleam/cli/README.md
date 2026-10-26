# Rocksky CLI in Gleam

`rocksky_cli` ports the commands in `apps/cli` to Gleam's JavaScript target.
Command dispatch, import parsing and checkpoints, database materialization,
standalone MPD commands, and headless playback policy are implemented in Gleam.

The terminal UI remains the original TSX/Ink implementation in
`apps/cli/src/cmd/tui.tsx` and `apps/cli/src/tui/`. The build bundles that source
into `cli/dist/tui.mjs`; a small Gleam FFI entrypoint loads it only for `tui`
or the default command. UI changes continue to be made in the original TSX
files, with no copied or rewritten screen implementation to maintain.

From the `gleam` workspace:

```sh
npm ci --prefix cli
bun run build:cli
bun run cli --help
bun run cli tui
bun run test:cli
```

The workspace's root `gleam.toml` includes this package as a path dependency.
`gleam build` compiles it alongside the API and app proxy. `build:cli` bundles the
compiled modules into `cli/dist/index.mjs`; runtime npm dependencies and SQLite
migrations remain alongside the bundle. Node 22 or newer is recommended. Run the
bundle with Node, including when Bun runs the workspace scripts.

Commands include `login`, `whoami`, `nowplaying`, `scrobbles`, `search`, `stats`,
`artists`, `albums`, `tracks`, `scrobble`, `create apikey`, `mcp`, `sync`,
`scrobble-api`, `mpd`, `nfc`, `card`, `import`, `upload`, and `tui`.
Running without a command opens the TUI. Each command exposes `--help`.

```sh
bun run cli login alice.bsky.social
bun run cli import ./Streaming_History.json --format spotify --dry-run
bun run cli import ./lastfm.csv --format lastfm --resume
bun run cli mpd --bind 127.0.0.1 --port 6600
```

OAuth commands use `~/.rocksky/token.json`. PDS writes and repository sync use
`ROCKSKY_IDENTIFIER` and `ROCKSKY_PASSWORD` (an app password), as in the original
CLI. Import dry runs do not authenticate or write records. Imports retain
chronological ordering, album-independent play identities, bounded concurrency,
SDK rate limiting, live deduplication, and checkpoints that preserve successes
beyond a failed record. `sync` imports the CAR snapshot into SQLite and then
watches repository commits until interrupted.

The retained TSX TUI keeps its existing navigation, library/profile views,
search, playlists, favorites, queue, sound settings, remote control, and NFC/card
integration. Its embedded MPD server also remains with the original TUI so it
shares the same player. Use the UI's help screen for its keyboard shortcuts.
The standalone `mpd` command uses the Gleam server and headless player.

MPD supports library directories, stored playlists, command lists, idle
notifications, cover-art chunks, persistent library caching, and the shared
Rockbox player. Unsupported queue reordering returns an MPD error. The
scrobbling server supports Last.fm, ListenBrainz, and Web Scrobbler clients.

## Runtime bindings

JavaScript adapters handle Node filesystem/network/terminal APIs, Commander
argument parsing, SQLite/Drizzle migrations, AT Protocol SDK operations, Rockbox
native calls, remote WebSockets, Linux MPRIS, and NFC/smart-card protocols.
The low-level PC/SC adapters retain the original Apache-licensed protocol code.
The TUI bundles its local TypeScript dependencies at build time; the executable
does not need TypeScript tooling at runtime. Building requires the monorepo
source alongside `gleam`.

Rockbox and SQLite require their native binaries. NFC/card readers need the
optional PC/SC dependencies and a working system PC/SC service. MPRIS is optional
and Linux-only. Missing optional integrations do not prevent help, read commands,
or the terminal UI from running. The MCP command launches the optional
`@rocksky/mcp` binary or `ROCKSKY_MCP_BIN`.

The CLI shares the original settings/session paths and SQLite schema. State files
are written atomically with mode `0600`. These overrides allow isolated runs of the Gleam commands and headless player
(the retained TSX UI continues to use its original paths/configuration):

| Variable | Purpose |
| --- | --- |
| `ROCKSKY_STATE_DIR` | Override `~/.rocksky` for tokens, settings, sessions, checkpoints, and MPD cache |
| `ROCKSKY_CLI_DATA_DIR` | Override the platform data directory containing `rocksky.sqlite` |
| `ROCKSKY_CACHE_DIR` | Override the audio cache directory |
| `ROCKSKY_API_URL` | Override the Rocksky API endpoint |
| `ROCKSKY_WS` | Override the remote-control WebSocket endpoint |
| `ROCKSKY_NO_REMOTE` | Disable remote-control registration |
| `ROCKSKY_NO_NFC` | Disable automatic NFC monitoring |

## Validation

`bun run test:cli` builds the executable and runs parser/checkpoint, HTTP fixture,
CLI subprocess, SQLite migration/materialization, SDK deduplication, cache,
Rockbox-binding, TSX bundle, and MPD socket tests. Tests use temporary state and
mock upstream requests; the MPD test needs permission to bind localhost.

For an offline terminal smoke test on a system with Python, Node 22.15+/24+, and PTYs:

```sh
python3 cli/test/terminal-smoke.py
```

Live OAuth/PDS writes, physical audio playback, MPRIS, and physical NFC/cards
require integration testing with the corresponding account or hardware. The
terminal smoke test stubs native audio, remote control, and PC/SC so it can exercise the original Ink screens without account or hardware access.
