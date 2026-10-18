# Rocksky API — PureScript

A port of `../apps/api` (TypeScript) to PureScript, targeting Node.js 22+.
Bun is the package manager; spago builds the PureScript.

```sh
bun install
bun run build
node bin/run.js Rocksky.Index    # REST API (Hono), port 8000
node bin/run.js Rocksky.Server   # XRPC API (express + @atproto/xrpc-server), port 3004
bun run dev                      # both
bun run script Rocksky.Scripts.Sync # operational scripts use their module names
bun run test:all                  # specs and all 64 JS regression suites
bun run test:xrpc                 # registration + deletion checks, no live services
```

Environment variables are the same as `apps/api` (see `api/src/Rocksky/Lib/Env.purs`).
Lexicon JSON is read at startup from `../apps/api/lexicons` and
`../apps/api/src/tealfm/lexicons`; override with `LEXICONS_DIR` (comma separated).

## Layout

- `packages/` — one spago package of FFI bindings per npm dependency
  (`drizzle` is the copied `purescript-drizzle`, extended with `Drizzle.Builder`).
- `api/` — the application (`rocksky-api`); module paths mirror `apps/api/src`.
- `CONVENTIONS.md` — mapping rules from the TypeScript source and FFI style.

Effect-TS is not ported: pipelines are plain `Aff` with the helpers in
`Rocksky.Lib.Aff` (`timeoutMs`, `retryTransientDb`, `recoverWith`).

## Port status

All 340 non-generated source modules are mapped, including both entrypoints,
all REST applications, operational scripts, and 153 XRPC handlers across 23 groups.
`bun run audit:port` regenerates the source inventory. The inventory measures
coverage; behavioral checks are maintained separately in `bin/test-*.js`.

`bun run test:all` builds and runs seven PureScript specs plus 64 JavaScript
regression suites with mocked external services (and local SQLite where needed).
Registration checks compare the actual XRPC handlers and the main/user REST
routes with the original TypeScript source. No live-service verification or
deployment is performed by these tests.

`bun run bundle` emits `api/dist/index.js` and `api/dist/server.js`.
Npm dependencies remain external so native modules and SDK assets resolve from
installed `node_modules`. Run bundles from this workspace root, with dependencies
installed and the lexicon directories available. `bun run check:bundles` checks
that both bundles load without executing startup or contacting services.

Existing TypeScript limitations are preserved: several player/API-key/cloud
XRPC endpoints are no-ops or empty responses, and cloud downloads report
“Not implemented yet.” These are source behavior, not newly added features.
See `PORTING.md` for implementation history and final validation details.
