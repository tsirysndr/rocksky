# Rocksky API in Gleam

This package ports `apps/api` to Gleam's JavaScript target, running on Node.js.
REST, XRPC, subscriptions, workers, OAuth policy, recommendations, uploads and
maintenance commands are implemented in Gleam. JavaScript FFI connects to Drizzle,
AT Protocol and other JavaScript SDKs, Node APIs and native audio/image libraries.
The server does not import the original TypeScript application at runtime.

## Local environment

Run `bun run dev:env` from this package to generate `.env` using the published
ports and database credentials in the root `compose.yaml`. Docker Compose must
be installed; the Docker daemon does not need to be running.

Rerun after changing Compose ports. Existing provider credentials and encryption
keys are preserved; local service URLs are refreshed. Changed files are backed
up as ignored `.env.local-dev-*.bak` files. The generated `.env` is gitignored and
has mode `0600`. Missing OAuth signing keys and local secrets are generated.
Spotify/Dropbox/S3 credentials remain blank unless already configured; S3 and
application sidecars require separate setup.

Use `bun run dev:env --force` to reset settings and regenerate all local secrets
and signing keys. Existing provider credentials and custom settings are cleared;
the previous file is still backed up.

## Local feed seed

After `bun run db:migrate`, local API startup (`bun run api`, including
`bun run dev` and the corresponding Clojure REPL commands) always runs
`bun run db:seed` before building and starting the API. A failed seed prevents
API startup. Production commands do not seed. You can also run `bun run db:seed`
manually.
It imports the shared `tools/db/seeds/feed-generators.json` snapshot into the
root Compose `db` container, including missing feed owners. Existing users are
matched by DID and preserved; feeds are upserted by URI, so rerunning is safe.
The command ignores database URLs in `.env` and always targets Docker PostgreSQL.
It requires the container to be running and the migrations to have been applied.
No production connection or OAuth session is needed.

The snapshot was read from production on 2026-10-18 and contains feed metadata
and the public profile fields needed for its owners, without credentials.
The existing `seed:feed` script is separate: it imports an authenticated user's
feed records from their PDS.


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

## Updating tables and generating migrations

The source of truth is `apps/api/src/schema/*.ts`, not the generated Gleam
modules. Use Bun, Gleam and the installed workspace dependencies for this
workflow. All commands below start at the **repository root** unless noted.

1. Edit the Drizzle table definition in `apps/api/src/schema/`. For a new table,
   also export it from `apps/api/src/schema/index.ts`, which the Gleam binding
   generator imports. `google-drive-tokens.ts` is explicitly included by the
   generator because the original schema index omits it.
2. Generate the migration using the existing API's Drizzle configuration:

   ```sh
   bun run db:gen-migration
   ```

   This runs `drizzle-kit generate` in `apps/api` and writes SQL and migration
   metadata under `apps/api/drizzle/`. Review the SQL, snapshot and journal;
   generating a migration does not apply it to a database. For data backfills,
   materialized views or other custom SQL, use the API's Drizzle Kit custom
   migration workflow and keep the journal in the same history.
3. Copy the migration history and regenerate both layers of Gleam bindings:

   ```sh
   cp -R apps/api/drizzle/. gleam/drizzle/
   bun tools/schemagen/dump.ts > tools/schemagen/schema.json
   bun tools/schemagen/gen.ts
   cd gleam
   bun run db:generate-bindings
   gleam format src/rocksky_api/schema src/rocksky_api/drizzle
   gleam build
   ```

   `dump.ts` captures table metadata; `gen.ts` writes row records, decoders and
   JSON encoders into `gleam/src/rocksky_api/schema/`. Run these **before**
   `db:generate-bindings`, which reads those row types, writes typed table/column
   bindings into `src/rocksky_api/drizzle/schema/`, and bundles the runtime
   Drizzle definitions into `src/rocksky_api/drizzle/schema_ffi.mjs`.
   The binding command alone does not regenerate row types or migration SQL.
4. Update affected Gleam queries and response mappings, then apply the reviewed
   migration to the configured development database:

   ```sh
   # From gleam/
   bun run dev:env
   bun run db:migrate
   bun run test
   ```

   Start Compose PostgreSQL first if needed (`docker compose up -d db` from the
   repository root). The Gleam migration runner reads `gleam/drizzle/`, uses
   `XATA_WRITE_POSTGRES_URL` with fallback to `XATA_POSTGRES_URL`, and records
   applied migrations in `drizzle.__drizzle_migrations`. The repository-root
   `db:migrate` still runs the TypeScript API command; use the command from
   `gleam/` to pick up this package's `.env` and copied migration history.

Commit the source schema, new SQL and migration metadata in both copies,
`tools/schemagen/schema.json`, generated Gleam rows/bindings/runtime schema,
and the affected application code/tests together. Applied migrations stay in
history; express later changes as new migrations. For removed tables, remove
obsolete generated modules too: the generators overwrite files but do not prune
them. New PostgreSQL column types may require extending the generators' codec
mappings. Materialized view bindings in `drizzle/views_ffi.mjs` and
`drizzle/chart_views.gleam` are maintained separately from generated tables.

Application queries explicitly import functions from `rocksky_api/drizzle/orm`.
SQLite OAuth storage, database recovery and migration bookkeeping retain their
infrastructure SQL.

## Updating lexicons: Pkl to Gleam

The pipeline is:

```text
apps/api/pkl/defs/**/*.pkl
  -> apps/api/lexicons/**/*.json
  -> sdk/gleam/src/rocksky/models.gleam
  -> gleam/src/rocksky_api/lexicon/models.gleam
```

The Gleam server also needs its own `gleam/lexicons/` JSON copy at runtime for
XRPC registration and record validation. Updating the model file alone is not
enough. This workflow requires the Pkl CLI, Bun, Python 3 and Gleam.

1. Edit the relevant definition under `apps/api/pkl/defs/`; reusable Pkl schema
   definitions live under `apps/api/pkl/schema/`. For example, a song record is
   defined in `apps/api/pkl/defs/song/song.pkl`.
2. From the **repository root**, evaluate Pkl and regenerate the shared APIs:

   ```sh
   bun run pkl:gen
   bun run lexgen
   bun tools/lexgen/generate.ts --gleam
   ```

   `pkl:gen` produces `apps/api/lexicons/`. `lexgen` updates the original
   TypeScript server types so the shared API stays in sync. The final command
   generates the Gleam SDK models/client and its HTTP adapter. It does **not**
   update this server port automatically.
3. Copy runtime JSON and adapt the SDK model module for this API:

   ```sh
   cp -R apps/api/lexicons/. gleam/lexicons/
   mkdir -p gleam/lexicons/fm
   cp -R apps/api/src/tealfm/lexicons/. gleam/lexicons/fm/
   python3 - <<'PYTHON'
   from pathlib import Path
   source = Path('sdk/gleam/src/rocksky/models.gleam').read_text()
   source = source.replace(
       'import rocksky/json_value',
       'import rocksky_api/lexicon/json_value',
   )
   Path('gleam/src/rocksky_api/lexicon/models.gleam').write_text(source)
   PYTHON
   cd gleam
   gleam format src/rocksky_api/lexicon/models.gleam
   gleam build
   bun run test
   ```

   Keep this API's existing `lexicon/json_value.gleam` helper. The SDK's generated
   `api.gleam` is a client, not a server route implementation; do not copy it into
   this package. Teal/Alpha JSON comes from its separate upstream directory and
   is copied into `lexicons/fm/`; it is not generated from the Rocksky Pkl files.
4. Update affected handlers to use the regenerated records, decoders and
   encoders. For a new endpoint, implement its module under
   `src/rocksky_api/xrpc/app/rocksky/` and register it in `xrpc/routes.gleam`.
   Restart the API after updating runtime JSON: record validation caches the
   loaded lexicons.

If a definition is renamed or removed, remove its old JSON from both
`apps/api/lexicons/` and `gleam/lexicons/` before generating models. Pkl generation
and the copy commands do not delete stale files. Commit the Pkl source, updated
JSON copies, generated TypeScript/Gleam outputs, and handler changes together.
Change the generator when generation behavior needs fixing; edits made directly
to generated models will be overwritten on the next run.

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
`flock` on Linux or the system `shlock` on macOS serializes native builds,
dependency installation and compilation. Native artifacts use `.so` on Linux
and `.dylib` on macOS. A failed build prevents
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

Migration runners share `tools/db/migrate.mjs`. Every SQL file must appear once
in both journals; run `node --test tools/db/migrate.test.mjs` from the repository
root to check coverage and matching copies. Registered migrations are checked
individually against applied hashes/timestamps, so older missing files are not
skipped by a latest-timestamp cutoff. Entries with `transaction: false` run each
statement outside a transaction for concurrent indexes; other files run in a
transaction. Use `bun run db:migrate` rather than `drizzle-kit migrate` to apply
this history. A failed concurrent migration can leave completed statements;
these index migrations use `IF NOT EXISTS` / `IF EXISTS` for retries.
