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

## Database migrations

Run `bun run db:migrate` from `purescript/` to apply the existing PostgreSQL
migrations in `../apps/api/drizzle`. The command uses `XATA_WRITE_POSTGRES_URL`,
falling back to `XATA_POSTGRES_URL`, and loads `.env` from this package directory.
For the production Doppler configuration, run `doppler run -c prd -- bun run db:migrate`.
The migration journal is shared with the TypeScript API. Migrations are explicit;
the build and systemd startup do not apply them automatically.

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

## Production service

`../systemd/rocksky-purescript.service` builds and starts both APIs using tools
installed on the host and the existing Doppler `prd` configuration.
It expects the checkout at `/root/github/rocksky`, Rust/Cargo, a native C/C++
build toolchain, Bun, Node.js 22+, and Doppler available to root's shell, with
Doppler configured for that checkout. Bun installs the project's PureScript,
Spago and other npm build dependencies. The first build needs
network access to fetch locked dependencies. Each start/restart builds the Rust
audio addon, installs frozen Bun dependencies including build tools, bundles the
APIs, and checks bundle loading before launching either server. This build helper
is Linux-specific, matching systemd deployment.

Use the same production secrets as the TypeScript API. Ensure `DB_PATH` and
`KV_DB_PATH` point to the existing persistent databases with **absolute paths**:
the service's working directory is now `purescript/`. Optional environment
settings can be placed in `/etc/default/rocksky-purescript`; Doppler supplies its
configured values at runtime. REST listens on 8000 and XRPC defaults to 3004
(`ROCKSKY_XPRC_PORT` retains the original environment-variable spelling).

On the production host:

```sh
sudo install -m 644 systemd/rocksky-purescript.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl disable --now rocksky.service rocksky-xrpc.service
sudo systemctl enable --now rocksky-purescript.service
sudo journalctl -u rocksky-purescript.service -f
```

Run those commands from the repository root. The unit conflicts with the old
REST/XRPC services because they bind the same ports. `prod:all` runs the built
bundles and terminates the sibling process when either exits; systemd then
restarts the pair. The submissions worker is ordered after this API when both
are started together. No service is installed or activated by adding these files.
