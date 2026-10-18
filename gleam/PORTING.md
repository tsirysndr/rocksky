# Porting apps/api to Gleam

Source of truth for behaviour: `../apps/api/src`. Target: this package (`target = "javascript"`, Node).

## Rules

- No Effect. A pipeline is a `Task(a)` (`Promise(Result(a, error.Error))`) composed with `use x <- task.then(...)`.
  - `Effect.timeout` / `Effect.retry(transientDbRetry)` / `Effect.catchAll(-> {})` become `handler.options(label)` + `handler.timeout(ms)` + `handler.on_error(...)` in `xrpc/handler.gleam`.
  - `Promise.all` becomes `task.all2/3/4`, `task.all`, `task.parallel_map`.
  - `queryCache(lookup, ttl)` becomes `query_cache.cached(ttl_ms, capacity, key_fn, lookup)`, allocated once in `register`.
  - `dbQuery("label", db => ...)` / `readQuery` become `db.query_with_timeout(ctx.db | ctx.read_db, label, ms, fn(db) { ... })`, or plain calls on `ctx.db` / `ctx.read_db`.
- Use the typed Drizzle bindings in `drizzle/orm.gleam` and generated `drizzle/schema/*` modules (user decision, 2026-10-18). Generate them with `bun run db:generate-bindings`. Preserve Drizzle runtime schema semantics. Application queries use these bindings; specialized SQL expressions remain permitted for features such as EXPLAIN and materialized views.
  - Explicitly import ORM functions and types: `import rocksky_api/drizzle/orm.{select, where, type Query}`. Do not qualify calls with `orm.`. Alias conflicting names in the import, for example `limit as db_limit`. The binding generator must preserve this convention.
  - Typed table bindings live in `src/rocksky_api/drizzle/schema/<table>.gleam`; row records and decoders live in `src/rocksky_api/schema/<table>.gleam`.
  - Compose joins and projections with typed ORM functions, using `nested` and `optional_selection` for nested and nullable results.
  - Use `ctx.read_db` exactly where TS used `readDb`/`readQuery`, `ctx.db` elsewhere.
  - Keep the TS SQL semantics (order, limits, filters, ICU collation notes) exactly.
- No lodash / ramda / dayjs / zod / chalk calls in handlers. Use `gleam/list`, `gleam/dict`, `gleam/string`, `gleam/time`, decoders, and `log.cyan` etc.
- Responses must be concretely typed: build `lexicon/models.gleam` records (`models.new_x()` then record update) and encode with `models.encode_x`. Never return untyped JSON from XRPC handlers. For REST passthrough of an upstream service payload, `rest/upstream.passthrough` is acceptable.
- Errors: return `error.Error` variants (`Unauthorized`, `NotFound`, `InvalidRequest`, `Forbidden`, `PdsSessionExpired`, `Upstream`). Never `panic`/`todo`/`let assert` in runtime paths.
- Comments: only for genuinely non-obvious things (carry over the TS comments that explain *why*, condensed). No narration.
- Naming: snake_case modules mirroring the TS path, e.g. `xrpc/app/rocksky/song/get_songs.gleam`, `rest/users.gleam`, `services/nowplaying.gleam`.
- JS bindings: a `.gleam` file with `@external(javascript, "./x_ffi.mjs", ...)` plus the `.mjs`. FFI returns `Ok/Error` (import from `../../gleam.mjs`, depth-adjusted) or `Option` (`gleam_stdlib/gleam/option.mjs`). Put new bindings in `src/rocksky_api/node/` or `src/rocksky_api/atproto/`.
- Foundation changes and central wiring are authorized as part of finishing the full port. Keep generated schema/model changes reproducible through their generators.

## Building blocks

| Need                  | Module                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Context (db, redis…)  | `rocksky_api/context` (`ctx.db`, `ctx.read_db`, `ctx.redis`, …)   |
| Env vars              | `ctx.env.<field>` (`rocksky_api/env`)                             |
| XRPC method           | `xrpc_server.method(server, nsid, Some(auth.verifier(ctx)), fn)`  |
| XRPC plumbing         | `rocksky_api/xrpc/handler` (`query`, `procedure`, `run`)          |
| REST app              | `rocksky_api/node/hono`, `lib/auth`, `lib/respond`                |
| PDS agent             | `lib/agent.create/require`, `atproto/agent`                       |
| Token verification    | `lib/verify_token`, `xrpc/auth`, `lib/auth`                       |
| Redis / NATS / HTTP   | `node/redis`, `node/nats`, `node/axios`                           |
| Hashing / crypto      | `node/crypto`                                                     |
| Likes                 | `lib/track_likes`                                                 |
| Stats / feed caches   | `lib/stats_cache`, `lib/feed_cache`                               |
| Scrobble guard        | `lib/scrobble_guard`, `lib/durable_submission`                    |
| Time                  | `db/row.iso8601`, `gleam/time/timestamp`                          |

`xrpc/app/rocksky/scrobble/get_scrobble.gleam` is the reference XRPC port; `api.gleam` is the reference REST port.

Each XRPC module exports `pub fn register(server: Server, ctx: Context) -> Nil`. Each REST sub-app exports `pub fn app(ctx: Context) -> hono.App`. Wiring into `xrpc/routes.gleam` / `api.gleam` is done centrally.

Pure logic with TS tests (`*.test.ts`) gets a gleeunit port in `test/`.

## Progress (2026-10-18)

- Added `xrpc/app/rocksky/song/get_song.gleam`: optional authentication, trimmed
  URI/MBID/ISRC/Spotify identifier lookup, separate user-track URI resolution,
  replica reads, shared SHA-based likes, ordered artist credits, listener/play
  counts, first scrobble, and typed detailed metadata. Errors propagate.
- `getSong` is centrally registered. Additional catalog, graph, settings, notification, mirror and library handlers are now registered; see `xrpc/routes.gleam`.
- `bun run test` now runs gleeunit and Node endpoint tests. The song tests invoke
  the registered XRPC handler with fake PostgreSQL pools; they verify lookup
  parameters, response fields, read-pool selection, optional auth, empty history,
  and definitive errors. They do not replace a live PostgreSQL integration test.

- Ported playlist reads (`getPlaylist`, `getPlaylists`, `getActorPlaylists`),
  feed-generator metadata, event reads and RSVP writes, actor profile refresh,
  profile stats, the public scrobble feed, and daily charts. Tests cover real
  PostgreSQL with isolated temporary tables; PDS, identity, HTTP and NATS calls
  use mocks. No external records are created by these tests.
- Event tests cover duplicate resolution and combined RSVPs, date/artist/viewer
  filters, typed media/location views, and rollback after PDS rejection.
- Daily charts use the materialized view's actual coverage and live queries for
  the remainder, including an empty view. Scrobble feed tests cover following,
  RSQL validation, per-track likes, pagination, and versioned Redis caching.
- Profile account payloads use `views/profile.Detailed`, a typed response that
  preserves the extra account fields returned by the TypeScript API's open
  objects. Spotify email is omitted. Partial upstream profiles preserve existing
  names and avatars; CID string conversion uses the object's string method.
- `python3 scripts/port_coverage.py` reports missing and present-but-unreviewed
  modules, including mappings for reorganized files. Presence is not completion.
  The full port remains in progress. Several original TypeScript API-key,
  player, and playlist-write handlers are already placeholders; their behavior
  must be recorded separately from functional implementations.

- Added shout reads, reporting and mutations, the hybrid hourly scrobbler
  leaderboard, Spotify playback commands, and Google Drive/Dropbox file lists.
- Playlist mutations publish and delete PDS records; Jetstream owns their
  database rows. Tests cover patch preservation, duplicate song entries,
  positional conflict detection and entry ownership.
- Added catalog publication, song likes/unlikes, centralized matching and
  catalog identity checks, scrobble processing, Teal publication and internal
  submission-worker callbacks. Durable writes use stable keys and explicit
  create-only CAS. Tests cover lost acknowledgements, status races, dedup
  reservations, caller preferences and persisted-job validation.
- Matching candidates, shout inputs and cloud-file views have concrete Gleam
  records where the source uses fields beyond the generated lexicon types.
  Open Teal record fields are retained using the typed JSON value representation.
- The inventory is still a presence report, not a certification of parity.
  REST authentication/provider apps, subscribers, search/recommendation feeds,
  upload/storage workflows, several XRPC routes and maintenance scripts remain.
- `xrpc/legacy.gleam` explicitly preserves existing TypeScript placeholders:
  API-key XRPC mutations, the legacy player controls, playlist file insertion,
  and cloud metadata/download methods. These are compatibility behavior, not
  newly functional features. The source `addDirectoryToQueue.ts` is empty and
  registers no route. Functional playlist record mutations are separate.
- `player.addItemsToQueue` forwards the original URI list to the tracklist
  service. Its advisory provider lookups use file-ID columns, correcting the
  source's invalid whole-table `IN` expressions.

- Added Typesense search, schemas, library indexing and retry policy; all seven
  NATS subscribers are registered, including playlist import, playback timers,
  status deduplication and scrobble refresh. Added Discogs enrichment and cached
  release/master relations. Tests use mocked services and PostgreSQL.
- Added playlist mirroring and library mutations, encrypted storage-provider
  management, upload deletion, Webscrobbler settings, Bluesky REST authentication,
  Dropbox and Google Drive REST routes. Google Drive token schema generation now
  includes the table omitted from the original schema index (57 tables total).
- Added Spotify request retry/abort handling and enrichment budgets. SSE tests
  cover unread counts, notification delivery and cancellation cleanup.
- Actor compatibility and neighbours use replica reads and typed Drizzle queries;
  neighbours use a correlated lateral query for top shared artists.
- Wrapped is registered and tested against PostgreSQL for bounded periods,
  weighted listening time, genres, milestones, prior artists, empty years and
  streaks. Its single summary statement uses Drizzle CTEs and typed aggregation.
- Public OpenGraph routes and upload routes are registered. Upload tests cover
  owner-scoped browsing, queue order, stream credentials/ranges, deletion, real
  tagged MP3 metadata, cover storage, content hashes and duplicate files.
  ReplayGain tests run ffmpeg on generated audio and verify written tags.
  Native key/BPM/fingerprint analysis is optional and fills only missing values.
  New-track ingestion is also exercised through the AT Protocol SDK with mocked
  publication and PostgreSQL indexing, followed by object storage and search indexing.
- `getFeed` and `getStories` are registered. Tests verify generator routing,
  timestamp ordering, caller-separated caching, per-track likes and latest story
  selection with the all-history fallback. Large lyrics are excluded in these
  projections using the typed ORM binding.
- History import, Spotify REST, users REST and song creation are implemented.
  Integration tests cover import parsing, jobs/cancellation, encrypted Spotify
  credentials/playback, legacy user response shapes and PDS catalog publication.
- OAuth client metadata, authentication negotiation, authorization orchestration,
  and PDS proxy routing policy are implemented in Gleam; JavaScript retains SDK
  calls and native Request/Response adapters. Policy tests cover PKCE state, PAR,
  signing-key negotiation, redirect validation and proxy host matching.
- All three recommendation endpoints are registered with a shared five-minute
  cache, Drift fallback and local Drizzle queries. Database tests cover scoring,
  genre filtering, social likes, album exclusions and artist diversity.
- The module inventory now contains no missing implementation paths. This is
  presence coverage, not a claim that every edge case has been verified.
- Maintenance commands are callable as Gleam modules and package scripts. Tests
  use isolated fixtures; no production backfills or PDS mutations were run.

Deliberate corrections to defects in the TypeScript source:

- Spotify playback accepts a successful empty 204 response without JSON parsing.
- Song creation uses fresh record keys and handles missing catalog rows through
  the shared publication service.
- The scrobble deduplication command forwards the pagination cursor.
- Identifier and genre backfills use stable keyset pagination. The TypeScript
  offset calculations can skip rows or repeatedly process misses while successful
  updates remove rows from the filter.

## Completion verification

Verified on 2026-10-18: `gleam format --check src test`, `gleam build`,
34 passing Gleam tests and 74 passing Node/integration tests with PostgreSQL
enabled (zero failures and zero skipped tests).

- All 277 inventoried source modules have target paths (one source module is
  empty). Generated schema, lexicon and provider types are handled separately.
  The inventory deliberately labels presence separately from behavioral proof.
- Automated source comparisons cover all 153 XRPC registrations and every REST
  method mounted by the original entrypoint. The audit caught and fixed omitted
  root likes routes and `POST /tracks`.
- ORM calls use explicit function imports throughout the Gleam source. Runtime
  adapters do not import the TypeScript application.
- Additional maintenance tests cover catalog restoration and duplicate replay,
  relationship repair, URI conflict guards, sub-millisecond pagination cursors,
  secret encryption, event poster/strong-reference publication, Riff dry runs and
  unique-link conflicts, and OAuth sessions with absent expiry claims.
- Recommendation tests cover Drift request coalescing and database fallback.
- Configuration with zero or negative worker/page counts is clamped to one so
  backfills continue to advance.

The port preserves unfinished behavior already present in the source through
`xrpc/legacy.gleam`; those endpoints are not advertised as newly implemented
features. External providers, PDS ingestion, Redis, NATS and object storage are
mocked in integration tests. Production credentials, live services and native
fingerprint analysis require deployment-environment validation; no production
backfills, publication or deployment were performed.
