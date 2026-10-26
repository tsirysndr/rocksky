# Rocksky CLI

Workspace port of `apps/cli`, with a PureScript core and the React/Ink TUI
maintained in TSX. Requires Node.js >=22.15, Bun, and the workspace's PureScript
toolchain.

From `purescript/`:

```sh
bun install
(cd cli && bun install --frozen-lockfile)
bun run build:cli
node cli/index.js --help
node cli/index.js                 # interactive terminal player
bun run test:cli
bun run bundle:cli               # cli/dist/index.js; npm/native deps remain external
```

The CLI has its own dependency installation because audio, smart-card, SQLite,
and terminal dependencies are separate from the API. Its manifest trusts the
native build scripts for better-sqlite3, pcsclite, koffi, and the MCP binary.
NFC requires a compatible reader and PC/SC service; audio requires the native
Rockbox libraries. Keep `cli/node_modules` and `cli/drizzle` alongside a bundled
build. This is a private workspace package, not a standalone published package.

The command tree includes login, profile/statistics and library reads,
scrobbling, repository sync, history imports, the scrobble API, MCP, MPD,
NFC/smart cards, uploads, and the terminal player. Use each command's `--help`
for its options. Import supports Spotify JSON/CSV and Last.fm JSON/CSV,
dry runs, resumable checkpoints, deduplication, concurrency, and rate limiting.

Browser login saves the same `~/.rocksky` credentials used by the original CLI.
App-password workflows use `ROCKSKY_IDENTIFIER` (or `ROCKSKY_HANDLE`) and
`ROCKSKY_PASSWORD`. The current directory's `.env` is loaded. Settings and
playback state also use `~/.rocksky`; the local SQLite database uses the
platform's Rocksky application-data directory. Both implementations therefore
share local state when run as the same user.

## Code boundaries

- `src/Rocksky/Cli/`: command definitions and dispatch, API client, authentication,
  sync orchestration, scrobble matching, history parsing/import/checkpoints,
  playback orchestration, library operations, settings, MPD protocol/status,
  and NFC payload logic.
- `runtime/tui/*.tsx` and `runtime/cmd/{tui,upload}.tsx`: maintained React/Ink
  views. Supporting UI hooks and device adapters remain TypeScript. The build
  emits ignored adjacent `.js` files with esbuild.
- `runtime/`: JavaScript interoperability facades and retained native, SDK,
  database, HTTP/socket, repository-ingestion, and hardware integrations.
  MPD server handlers and scrobble publishing still use these adapters.
- `drizzle/`: local database migrations, copied into this package so runtime
  execution does not import `apps/cli`.

Change business behavior in the PureScript modules; expose it to TSX through
the existing JavaScript facades. Do not edit generated UI JavaScript. The port
intentionally retains these integration boundaries rather than translating
React components and native bindings into PureScript.

Tests cover command parsing, HTTP contracts, import parsing/checkpoints and
deduplication, SQLite import indexing, queue/library behavior, settings,
scrobble decisions, MPD formatting, NFC/card encoding, and actual Ink rendering.
Network/device behavior is mocked where appropriate; these tests do not verify
live account writes, audio output, or a physical NFC/smart-card reader.
