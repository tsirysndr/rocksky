# Rocksky API — PureScript

A port of `../apps/api` (TypeScript) to PureScript, targeting Node.js 22+.
Bun is the package manager; spago builds the PureScript.

```sh
bun install
bun run env:generate              # create .env from local Docker Compose settings
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

## Local environment

`bun run env:generate` creates a private, git-ignored `.env` using the published
PostgreSQL, NATS, Redis and Typesense ports in `../compose.yaml`. It generates
fresh local secrets and leaves third-party credentials blank. No Docker daemon,
compiled PureScript output, or running services are required.

The generated `SUBMISSIONS_*` settings also configure the submissions worker:
its queue uses the Compose PostgreSQL database, it listens on `127.0.0.1:8098`,
and its callbacks target the local REST API on port 8000. Load this same `.env`
when starting the worker so it shares `SUBMISSIONS_SECRET` with the API.
Worker concurrency, retry, cleanup and dashboard settings use the worker defaults;
CORS origins are empty for same-origin dashboard access. The worker still needs
to be started separately.

An existing `.env` is preserved. Use `bun run env:generate --force` to replace it;
this regenerates secrets and removes manual edits. Companion services and an S3
server must be started/configured separately. Compose settings must use literal
values; the generator rejects `${...}` interpolation.

## Local feed seed

After `bun run db:migrate`, run `bun run db:seed` from this package.
`bun run dev` also runs this seed before starting the local API and XRPC server.
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


## Jetstream v2 archive backfill

Build once with `bun run build`, then run from `purescript/`:

```sh
# Loads this package's .env. Store the hosted archive key there or export it.
bun run backfill:jetstream --dry-run --limit 100
bun run backfill:jetstream
```

`JETSTREAM_API_KEY` is required by the hosted archive service. Obtain it through
[Bluesky's replay documentation](https://bsky.network/docs/jetstream-replay/).
`JETSTREAM_BACKFILL_URL` defaults to `https://jetstream.us-west.bsky.network`;
`--service https://your-jetstream.example` overrides it. Use Node >= 22.15
for the SDK's native Zstandard decoder.

The PureScript command scans the sealed archive for **all `app.rocksky.*`
commit collections**, including create/update/delete, then exits. It does not
start a live tail or fetch unrelated namespaces. Missing or invalid archive
records stop the run rather than being silently skipped. The official SDK
handles planning, bounded archive downloads, CBOR decoding and HTTP retries.

Non-dry runs require `SUBMISSIONS_DATABASE_URL` pointing to the same **Postgres**
durable queue as `rockskyd jetstream`. Start that service once to initialize its
queue tables, and keep it running to index the captured jobs into the app
catalog. This command queues work for the existing production indexing handlers;
"queued" does not mean indexing has completed. Check worker errors/dashboard
for indexing progress. SQLite queues are not supported by this script.

The job IDs match the Rust live subscriber's `(did, collection, rkey, rev)`
identity, preventing duplicate jobs while retained in the queue. A separate
`jetstream:v2:backfill:<origin>:app.rocksky.*` checkpoint is committed atomically
with every batch. Restart the same command to resume; it never advances the
live subscriber's checkpoint. Interruptions leave uncommitted batches replayable.
Only one backfill per origin can write to a queue at a time. Archive sequences
are instance-specific, so changing `--service` starts an independent checkpoint.

Options:

- `--dry-run`: downloads and validates without opening the database or saving progress.
- `--limit N`: stop after N commits this run; rerun without it to finish.
- `--batch-size N`: 1–1000 commits per transaction (default 250).
- `--cursor N` (alias: `--after-seq N`): exclusive starting sequence for a new checkpoint (default 0);
  rejected if it conflicts with an existing checkpoint. Dry runs use it directly.
- `--before-seq N`: inclusive archive upper bound; otherwise stop at the sealed tip.
- `--help`: show usage without connecting to any services.

Sequences are v2 sequence numbers, **not** v1 microsecond timestamps.
Use `(ps/backfill-jetstream)` in the Clojure REPL or `bb ps:backfill:jetstream`.
For example, `(ps/backfill-jetstream :dry-run :limit 100 :cursor 3000000000)`.
Run `bun run test:jetstream-backfill` for regressions. Set
`JETSTREAM_BACKFILL_TEST_URL` to a local PostgreSQL URL to include the isolated
queue transaction tests (they create and remove their own temporary schema).

## Updating tables and generating migrations

The database has one shared migration history. Drizzle Kit reads
`apps/api/src/schema/*.ts` and writes SQL and snapshots under `apps/api/drizzle/`.
PureScript queries use the corresponding definitions in
`purescript/api/src/Rocksky/Schema/`. Update both representations when changing a
table; editing a `.purs` file alone does not generate a database migration.
Paths in this section are relative to the **repository root**.

1. Edit the TypeScript table in `apps/api/src/schema/`, including column types,
   nullability, defaults, indexes and constraints. For a new table, also add it to
   `apps/api/src/schema/index.ts`.
2. Update its PureScript module. For example, a change to
   `apps/api/src/schema/tracks.ts` belongs in
   `purescript/api/src/Rocksky/Schema/Tracks.purs`: update `TracksCols`, the
   `tracks = table ...` column definitions, and `SelectTrack`. Keep SQL column
   names, camelCase record fields, types and `Nullable` usage consistent.
   For a new table, add its module and re-export it from `Rocksky.Schema`, with
   the corresponding `<table>C = columns <table>` accessor. Update affected
   queries, projections, inserts, decoders and response records too.
3. Generate a migration using the TypeScript API's schema-aware configuration:

   ```sh
   # From the repository root; install workspace dependencies if needed.
   bun install --frozen-lockfile
   (cd apps/api && bun run db:gen-migration --name=add-track-source)
   ```

   Replace `add-track-source` with a descriptive name. This generates files; it
   does not apply SQL to a database. Review the SQL, snapshot and
   `apps/api/drizzle/meta/_journal.json`, especially inferred renames, drops and
   changes to populated columns. Preserve previously applied migration files.
4. Apply the reviewed migration to the local Compose database using the
   PureScript package's `.env`:

   ```sh
   # From the repository root.
   docker compose up -d db
   (cd purescript && bun run db:migrate)
   (cd purescript && bun run build)
   (cd purescript && bun run test:all)
   ```

   The migration command uses `XATA_WRITE_POSTGRES_URL`, falling back to
   `XATA_POSTGRES_URL`. It reads the same SQL directory and uses the same journal
   table as the TypeScript API. The automated tests mostly mock database calls;
   they complement applying the migration and exercising affected queries on a
   local database.
5. Commit the TypeScript schema, PureScript schema/consumer changes, generated
   SQL, migration metadata and relevant tests together.

For production, run `doppler run -c prd -- bun run db:migrate` from `purescript/`
with the intended production configuration. Migrations are explicit: the build
and systemd startup do not apply them automatically.

The PureScript `drizzle.config.js` is configured for **applying existing SQL**;
use `apps/api` for generation. There is currently no TypeScript-schema-to-
PureScript generator. `tools/schemagen/gen.ts` generates Gleam models, not these
PureScript table definitions.

## Updating lexicons: PKL to the PureScript API

The current pipeline is:

```text
apps/api/pkl/defs/**/*.pkl
  -> bun run pkl:gen (from the repository root)
apps/api/lexicons/**/*.json
  -> Rocksky.Lexicon.loadLexicons at API startup
PureScript XRPC validation and handlers
```

There is no generated `.purs` model layer in this pipeline. The runtime loads
JSON lexicons directly; handler parameter/result types and business logic are
maintained in PureScript. Lexicon changes and database migrations are separate:
change the database schema only when the new API contract needs storage changes.

1. Edit the relevant PKL definition under `apps/api/pkl/defs/`. For example,
   `album/getAlbum.pkl` defines `app.rocksky.album.getAlbum`, while
   `album/defs.pkl` contains its shared response definitions. Update required
   fields, formats, references and descriptions together. The shared PKL schema
   is under `apps/api/pkl/schema/`.
2. With workspace dependencies installed and the `pkl` executable available,
   generate JSON and refresh the TypeScript server bindings:

   ```sh
   # From the repository root.
   bun run pkl:gen
   bun run lexgen
   ```

   `pkl:gen` recursively evaluates `apps/api/pkl/defs/` into
   `apps/api/lexicons/`. `lexgen` reads that directory plus
   `apps/api/src/tealfm/lexicons/` and generates `apps/api/src/lexicon/`, including
   nullable-array normalization and formatting. PureScript consumes the JSON;
   the TypeScript generation step keeps the original API in sync. Review the
   generated changes. If a PKL file was removed or renamed, remove its stale JSON
   explicitly: the PKL generator does not clean old output files.
3. Update the matching PureScript handler under
   `purescript/api/src/Rocksky/Xrpc/App/Rocksky/<Group>/`. Adjust its parameter,
   input and result types, validation, projections and serialized fields to match
   the new contract. Update shared types/decoders in `Rocksky.Types` when relevant.
   Preserve the distinction between omitted fields and explicit `null`.
4. For a new endpoint, implement and export `register :: Server -> Context ->
   Effect Unit`, register the exact NSID with `Xrpc.method`, and regenerate the
   group aggregators and XRPC index:

   ```sh
   # From the repository root.
   (cd purescript && python3 bin/register-xrpc.py)
   ```

   This command discovers existing PureScript handler modules; it does not
   generate handlers or types from lexicons. Keep the original TypeScript handler
   and its registration in sync as well: the parity test compares both APIs.
5. Add or update endpoint behavior tests, then validate:

   ```sh
   # From the repository root.
   (cd purescript && bun run test:xrpc)
   (cd purescript && bun run test:all)
   ```

   `test:xrpc` builds and registers handlers against the real JSON lexicons.
   When adding/removing endpoints, update its explicit expected handler count
   (currently 153) to the reviewed total. Registration tests do not replace
   assertions about input validation and response shapes.
6. Commit the PKL source, generated JSON/TypeScript bindings, PureScript changes,
   registration files and tests together. Restart the API to load changed JSON.
   For a bundled deployment, rebuild with `bun run bundle` from `purescript/`
   and retain the lexicon JSON directories alongside the checkout.

If SDK contracts also changed, run `bun run lexgen:types` from the repository
root and review the generated SDK changes. That generator has no PureScript
backend. `LEXICONS_DIR` can override runtime JSON locations; ensure it points at
these updated files when testing or deploying.

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

Migration runners share `tools/db/migrate.mjs`. Every SQL file must appear once
in both journals; run `node --test tools/db/migrate.test.mjs` from the repository
root to check coverage and matching copies. Registered migrations are checked
individually against applied hashes/timestamps, so older missing files are not
skipped by a latest-timestamp cutoff. Entries with `transaction: false` run each
statement outside a transaction for concurrent indexes; other files run in a
transaction. Use `bun run db:migrate` rather than `drizzle-kit migrate` to apply
this history. A failed concurrent migration can leave completed statements;
these index migrations use `IF NOT EXISTS` / `IF EXISTS` for retries.

## Repair missing artist pictures

After Jetstream backfill, run `bun run repair:artist-pictures --dry-run --limit 100`
to preview matching pictures, then `bun run repair:artist-pictures` to fill them.
PureScript needs `bun run build` first. Both ports use the same repair logic.

The script reads the target database from this package's `.env`
(`XATA_WRITE_POSTGRES_URL`, falling back to `XATA_POSTGRES_URL`). It requests
`app.rocksky.artist.getArtists` from `https://api.rocksky.app` using exact artist
SHA-256 filters, so local and production row IDs or URIs need not match. Only
null/blank pictures are filled, including an update-time guard against concurrent
changes. Existing pictures, other artist metadata, and PDS records are preserved.
Artists without a picture in Rocksky remain unchanged. No API key is needed.

Options: `--dry-run`, `--limit N` (0/all by default), `--batch-size N` (1–30,
default 30), `--delay-ms N` (minimum 100, default 500), and `--api-url URL`
(or `ROCKSKY_PICTURE_API_URL`). There is one request at a time. HTTP 429 honors
`Retry-After` seconds or HTTP dates; exhausted rate-limit headers delay the next
request. Network errors, 408 and 5xx responses retry with exponential backoff and
jitter, with six attempts maximum. Exhausted retries stop the command. Rerun to
process pictures still missing. Keyset pagination avoids skipping rows as updates
remove them from the missing-picture set; each run has a fixed upper artist ID.

REPL: `(ps/repair-artist-pictures :dry-run :limit 100)` or
`(gleam/repair-artist-pictures :dry-run :limit 100)`.
Run `bun run test:artist-pictures` for shared regression tests. Set
`ARTIST_PICTURE_TEST_URL` to local PostgreSQL to include the temporary-table
update tests.

The Jetstream SDK patch in `../patches/` filters archive row kinds before wire
validation, so unrelated sync records in mixed blocks do not stop commit-only
backfills. Commit validation remains enabled. Run `bun install` after pulling
changes to the patch (from the repository root for Gleam).
