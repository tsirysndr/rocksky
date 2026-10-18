# Rocksky API in Gleam

This package ports `apps/api` to Gleam's JavaScript target, running on Node.js.
REST, XRPC, subscriptions, workers, OAuth policy, recommendations, uploads and
maintenance commands are implemented in Gleam. JavaScript FFI connects to Drizzle,
AT Protocol and other JavaScript SDKs, Node APIs and native audio/image libraries.
The server does not import the original TypeScript application at runtime.

## Run

Install workspace dependencies from the repository root with `bun install`, then:

```sh
cd gleam
bun run build
bun run api       # REST, port 8000
bun run xrpc      # XRPC, default port 3004 (ROCKSKY_XRPC_PORT)
```

Use the same service credentials and environment configuration as `apps/api`;
`src/rocksky_api/env.gleam` defines the configuration. PostgreSQL, Redis, NATS and
other configured upstream services must be reachable. Audio processing uses
ffmpeg; key/BPM/fingerprint analysis uses the optional `@rocksky/analysis` native
binding.

Maintenance commands are listed in `package.json`. They can also be invoked as:

```sh
gleam run -m rocksky_api/scripts/sync_library
```

Backfill dry-run options are command-specific, matching the source scripts.
Consult the corresponding Gleam module before running a backfill.

## Database bindings

Application PostgreSQL queries use typed Gleam Drizzle bindings, with explicit
function imports from `rocksky_api/drizzle/orm`. There are 57 generated table
bindings plus view bindings. Regenerate table bindings with:

```sh
bun run db:generate-bindings
```

SQLite OAuth storage, database recovery and migration bookkeeping retain their
infrastructure SQL. The migration command is `bun run db:migrate`.

## Verify

```sh
gleam format --check src test
bun run test
```

Database integration tests require an isolated PostgreSQL instance. Supply its
socket directory or host and port to enable them; without these variables they
are skipped:

```sh
GLEAM_TEST_PGHOST=/path/to/test/socket GLEAM_TEST_PGPORT=55447 bun run test
```

Fixtures use temporary tables and mocked external services. Tests include real
PostgreSQL queries, real audio metadata/ReplayGain processing, PDS record payloads,
OAuth policy, route registration and HTTP responses. Route inventory tests read
`../apps/api/src`, so run them within this repository.

`python3 scripts/port_coverage.py` reports the source-to-target module mapping.
Presence coverage is not a proof of behavioral equivalence. `PORTING.md` records
implementation conventions, verification and intentional source bug fixes.

The original TypeScript API already has unfinished player/API-key/cloud XRPC
methods. `xrpc/legacy.gleam` preserves those responses. Implementing those new
features is separate from porting the existing API. Live production integration
and deployment are not part of the local test suite.

## Production systemd services

`systemd/rocksky-gleam.service` and `systemd/rocksky-gleam-xrpc.service` at the
repository root build and run the REST and XRPC processes respectively. They
follow the existing deployment convention: root user, checkout at
`/root/github/rocksky`, tools available through the Bash interactive environment,
and Doppler configuration `prd`.

Each start runs `gleam/deploy/build-production.sh`: `bun install --frozen-lockfile`
at the workspace root, followed by `gleam build --target javascript`. A shared
`flock` serializes dependency installation and compilation. A failed build prevents
startup. The JavaScript compiler output lives under `build/dev/javascript` even
when running the application with `NODE_ENV=production`; the Node entrypoints use
that compiler output directly.

The deployment host needs Bun, Gleam, Node.js, Doppler and `flock`, plus the native
build dependencies required by the workspace. Configure Doppler for the Gleam
working directory. Supply production API settings through Doppler, including
**absolute paths** for `DB_PATH` and `KV_DB_PATH` pointing to the existing SQLite
stores when replacing the TypeScript services. Optional systemd environment
settings can be placed in `/etc/default/rocksky-gleam`.

On the deployment host, from the repository root:

```sh
sudo install -m 644 systemd/rocksky-gleam.service systemd/rocksky-gleam-xrpc.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/rocksky-gleam.service /etc/systemd/system/rocksky-gleam-xrpc.service
sudo systemctl daemon-reload
sudo systemctl disable --now rocksky.service rocksky-xrpc.service
sudo systemctl enable --now rocksky-gleam.service rocksky-gleam-xrpc.service
journalctl -u rocksky-gleam -u rocksky-gleam-xrpc -f
```

The units conflict with their TypeScript equivalents to avoid competing listeners.
After updating the checkout, restart both Gleam services to rebuild and load the
new code. These units do not run database migrations automatically.
