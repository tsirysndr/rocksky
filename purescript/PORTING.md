# Full-port work checkpoint

User instruction: **port all remaining; do not stop until the full port is finished**.
The implementation is complete; final validation is recorded at the end of this file.
Historical continuation checkpoints below describe intermediate states.
Do not substitute stubs or JS/TS delegation for PureScript application logic.

## Workspace / execution

- Source: `../apps/api/src`; target: `api/src/Rocksky`.
- Follow `CONVENTIONS.md`. Its old parallel-agent waiting paragraph was removed:
  no sibling agents are active. Do not wait for missing modules to appear.
- Use **`bun run build`**, **`bun run test`** and local Spago. Global Spago is a
  different version and rewrites the lockfile incompatibly with local Spago.
- Local npm PureScript placeholder was repaired with the cached 0.15.16 compiler.
  `purescript` is now trusted in package.json so installation runs its hook.
- Entire purescript directory is still untracked in the parent repo. Existing
  parent changes (`../package.json`, `../bun.lock`, gleam, tools/schemagen) belong
  to earlier work; preserve them. Do not commit without being asked.
- No live databases / PDS / S3 / NATS services have been contacted for tests.

## Inventory

`python3 bin/port-status.py` writes `port-inventory.json` and lists missing files.
Current: 340 non-generated, non-test source modules; 340 mapped; zero missing.
Presence is explicitly **not** a claim of parity. OAuth application behavior was
moved to PureScript; JS retains runtime/SDK interoperability.

`python3 bin/register-xrpc.py` regenerates all group aggregators and Index.
Current: **153 handlers / 23 groups**. `bin/test-xrpc.js` compares actual runtime
registration with every ported handler and registers them with the real lexicons.
The registration test also compares all original TypeScript handler NSIDs.

## Completed during full-port pass

- Equalizer list/put/delete presets, stable slug, pagination, optimistic record
  writes, public DID lookup and anonymous agent fallback.
- Rockbox get/put audio settings, sparse section patches preserving other values.
- Shared RepoSettings / JsonRecord PureScript helpers. Only localeCompare is FFI;
  initial patch/projection JS helpers were replaced with PureScript.
- Playlists.Service: create/update/add/remove, owner checks, strong references,
  remove-by-position and duplicate-song behavior. Named InvalidRequestError
  support added to XRPC binding. Empty procedure response (`NoContent`) added.
- Library.PlaylistMirror and library create/update/delete playlist handlers.
  Mutation succeeds independently of mirror; failures are returned as atprotoError.
- REST Apikeys, AccessTokens, full Storage provider management + existing resolver.
  Shared Rest helper; these apps are not yet mounted because Index is absent.
- Mirror get/put sources, encrypted credentials, re-enable backfill watermark,
  NATS notification, Tealfm.PushEnabled.
- Typesense Schema, Search, complete Library (index/search/delete); exact-match
  option in binding. Context already owns the client; no separate client needed.
- Tealfm.Publication and Index with durable record creation, deduplication,
  stale status suppression, compare-and-swap writes and retry recovery.
- Notifications.Service, Notification XRPC group, Notifications.Sse.
  Pull subscriptions / nextMessage / unsubscribe added to NATS binding.

- Shouts.Service: subject lookup, create/reply, reaction writes, profile links,
  mention deduplication and owner notification suppression. All eleven shout/
  shout-reaction XRPC handlers are implemented and registered.
- Lovedtracks.Service: metadata upserts, relationship repair, PDS likes,
  notifications, Jetstream-owned deletions and local legacy deletion events.
  Song like/dislike XRPC handlers are registered.
- Nowplaying.Records: artist/album/song/scrobble record publication, exact
  identity lookup, position normalization and durable create-only retry recovery.
  Nowplaying.Service now uses these publication helpers.

- Lib.Matching: complete candidate/response validation, request normalization,
  Spotify identifier handling, metadata mapping, all-constraint cache identity,
  transport propagation, and AbortSignal forwarding. Only standard URL parsing
  and Axios HTTP calls use FFI; matching logic is PureScript.
- Tracks.Service: existing-art preference, missing URI repairs, publication,
  15-attempt ingestion polling, artist-credit guard, relationship inserts and
  original NATS event shape.

- Nowplaying.Service: durable record recovery, captured listening timestamp,
  bot/rate checks, history and Redis reservation dedup, matching enrichment,
  record ownership repair/claims, import-operation memoization, bounded ingestion
  polling, Teal-before-parent publication and durable early return.
- Nowplaying.Enrichment and Publication contain source metadata precedence and
  scrobble/track event construction, relationship fallback and cache invalidation.
- Subscribers.Playback/User/Track: playback expiry, sequential NATS message
  consumption, per-message failure isolation and concurrent independent indexing.
  Consumer is a shared PureScript pull loop; Subscriber.Index is still absent.

- Submissions.App: both internal callbacks, secret/input/record-key validation,
  preference recheck, session expiry, synchronous durable publication and exact
  403/429/503 mappings. Like other REST apps this awaits mounting in Index.
- Subscribers.Playlist: import publishes only repo records, reuses Spotify-linked
  playlist identity/createdAt, skips indexed entries and isolates song failures;
  indexed notifications reindex only after ingest. Consumer.startRaw supports
  string subjects while preserving sequential processing.
- Track decoder now preserves absent versus explicitly-null optional metadata.
  ScrobbleGuard error retryAfter remains numeric through the FFI boundary;
  fromError accepts numeric values, retaining legacy string compatibility.

- Subscribers.Status and Status.Info: centralized matching, source metadata
  precedence, same-key/source suppression, optimistic status record writes,
  Navidrome ownership, deferred stop snapshots, timer cancellation, replay expiry,
  clear-status suppression and per-DID rate-limit recovery. State is PureScript;
  timers use standard Effect.Timer. Both subscriber entrypoints are ready.

- Lib.DiscogsRelation: position/duration parsing, artist credit joins, relational
  artist/label/company/identifier/track/master mappings.
- Lib.DiscogsEnrichment: cached hit/miss/stale decisions, service-unavailable
  distinction, release upserts, child replacement transactions, optional full
  release/master fetches, completion marker ordering and fill-only album links.
  Database failures propagate exactly as source despite its "never throws"
  doc comment; subscriber owns the optional-enrichment catch.
- Subscribers.Scrobble: raw-ID events, recent URI repairs, per-history-row
  publication catch and optional background Discogs enrichment.
- Subscribers.Index now starts all seven source subscribers in source order.

## Validation

- `bun run test`: four retry-policy PureScript tests pass.
- `bun run test:xrpc`: registration, all library auth, deletion guards, search
  deletion retry classification, preset slugs, sparse audio patches, credential
  REST unauthenticated guards, notification fallbacks/subject sanitization/SSE
  auth guard. Must rerun after new handlers / mutations.
- `bun run test:teal`: six original durability scenarios run against compiled PS,
  including lost ACK, status-only retry, expiry, CAS race, failed read, mirror dedup.
- `bun run test:typesense`: federation, partial result errors, library pagination,
  null/date response contracts.
- `bun run test:shouts-likes`: compiled service tests for GIF/mention JSON,
  mention deduplication and notification suppression, duplicate reactions,
  PDS/local unlike paths, metadata/junction creation, real record lexicons,
  timestamps/positions and durable scrobble lost-ACK recovery. Passes.
- `bun run test:matching`: source matching.test.ts cases, plus malformed
  provider scores/ranks and missing-versus-null metadata. Passes.
- Track service tests in `test:shouts-likes` cover existing relationships,
  missing relationship insertion then retry/publication, wrong-artist guard,
  and exact nested NATS relation IDs/timestamp/hash fields. Passes.
- `bun run test:nowplaying`: durable recovery/lost ACK, matching failures and
  ambiguity, catalog-selected metadata only, duplicate recheck, reservation
  conflicts, no durable post-publication polling, event ordering and nested
  payloads, relation creation, cache invalidation, subscriber ordering/error
  isolation and independent indexing. Passes.
- bun run test:submissions: real Hono callback validation/authentication,
  Teal opt-out, playlist import identity/dedup, sparse track decoding, bot blocks,
  Retry-After, session rejection, PDS failure and durable recovery. No external
  services: Kysely DummyDriver + OAuth session fetchHandler mocks. Passes.
- bun run test:status: actual Atproto Agent/OAuth mock session transport with
  fake time/timers verifies source takeover, unchanged suppression, stale stop
  snapshots, actual deferred deletion, stopped dedup, 429 suppression/recovery,
  failed CID lookup prevention, swapRecord CID, replay expiry, normalization and
  retry/reset header precedence. Passes. No network access.
- bun run test:discogs: source mapper scenarios, exact 30-day miss boundary,
  service-unavailable vs cached miss, cached hit, transactional child writes and
  failure-before-completion, all seven subscriber registrations, last-five URI
  repairs and per-scrobble failure isolation. Passes against compiled PS.
- All four older suites rerun after these changes and pass (79 XRPC registrations).
- Builds pass. Eight existing warnings remain in Actor.GetActorScrobbles and
  Charts.GetScrobblesChart (Row name shadows Prim.Row, local `day`).
- Tests are service mocks; live integration parity remains unverified.

## Next work / dependencies

Continue implementing actual missing modules (inventory is authoritative list).
Suggested order:
1. Users.Utils, discogs/event helpers;
   these unblock social/catalog endpoints and scrobble/nowplaying services.
2. Remaining Subscribers.*, Submissions.App; preserve durable ingestion
   and error semantics. Then REST Index and remaining apps (Bsky, Spotify,
   GoogleDrive, Import, Uploads, Users, Webscrobbler, Opengraph).
3. Remaining XRPC (actor, album, artist, charts, event, feed, graph, likes, shout,
   playlist reads, scrobble, song, stats wrapped, provider proxies, api keys).
4. Operational scripts and package scripts; bundle both entrypoints; audit all
   source behavior, not just missing filenames.

Some legacy player handlers are already unfinished/no-op in TypeScript; preserve
source behavior explicitly and document source limitations rather than claiming
new playback functionality. Source addDirectoryToQueue.ts may be empty.

## Review risks to revisit

- Existing foundational ports were inherited; they need parity review too.
- Existing OAuth application override is embedded in package FFI from the earlier
  session. Source inventory deliberately flags it instead of declaring completion.
- The Typesense APIs currently take explicit limit/offset / context arguments;
  ensure future callers apply source defaults (50/0 for library, 20 federation).
- Playlist error wrappers follow source but have not had DB/PDS integration tests.
- SSE tests currently cover auth only; exercise stream ordering and unsubscribe
  cleanup with a fake pull subscription before declaring this subsystem complete.
- Goal must remain active across checkpoints. Do not call update_goal complete
  or leave user with an implication that this partial checkpoint is full delivery.

## Previous continuation handoff (superseded below)

Next: remaining REST apps (Bsky, Spotify, GoogleDrive, Import, Uploads, Users,
Webscrobbler, Opengraph) and REST Index, or Lib.DiscogsView/EventView to unblock
catalog endpoints. All subscribers are implemented; Index has seven registrations.
Inventory: 225 mapped / 115 missing. Keep overall goal active.

Source index.ts first 170 lines were inspected:
- loads otel/profiling, sets DNS ipv4first, starts subscribers.
- internal/submissions routes mounted BEFORE global limiter.
- then limiter1000/30sec, active span name/route, duration metrics, CORS.
- mounts Bsky at "/", Spotify /spotify, Storage /storage, Dropbox /dropbox,
  GoogleDrive /googledrive, Apikeys /apikeys, AccessTokens /access-tokens,
  Import /import, Notifications /notifications, Opengraph /public/og.
- image proxy preserves upstream body/content-type, returns source 400/502 errors.
- health "/" then now-playing and many further routes (not read yet this turn).
Do not create incomplete Index/stub apps merely to satisfy build or inventory.

DiscogsRelation/Enrichment are fully ported; helpers exported:
- DiscogsRelation parses positions to Array Number [disc,track], durations Number;
  mappers return Array Foreign; toMasterRow returns Maybe Foreign.
- DiscogsEnrichment uses ADT Matched SelectDiscogsRelease | Missed | Unavailable |
  Skipped. Future HTTP/script callers must convert ADT to source JSON status.
- enrichAlbumWithDiscogs ctx artist album (Maybe albumId) -> Aff DiscogsLookup.
- enrichScrobbleWithDiscogs ctx (Nullable String trackId) -> Aff Unit because
  source scrobbles.trackId is nullable. Uses SQL.param for the null lookup.
- missRetryMs is Number; isStaleSearch search nowMillis is pure.
- Credit/full-release children replace inside transactions. creditsFetchedAt
  only updates after child operations; full release/master HTTP errors remain
  optional exactly as source (a failed full fetch still marks completion).
- recordSearch and linkAlbum preserve source insertion/updating behavior.
- Scrobble subscriber intentionally terminates on unhandled initial query/URI
  repair errors, matching source's uncaught async loop. Publication catches per
  recent row; optional Discogs failure is caught in forked Aff.

Remaining DiscogsView helper is 150 lines; EventView is 451. Both still missing.
Discogs SQL schemas and API types/bindings were already available.

Status/Submissions/Nowplaying details and signatures remain in module files and
previous checkpoint notes above. Track.parseTrack preserves missing versus null.
All new files compile without warnings. Ten test suites now exist. Most recent
checks: build, discogs, nowplaying, status, submissions and PureScript tests.
No live services contacted. Full completion still requires missing source,
entrypoint wiring/bundles and inherited behavior audit.

## Continuation checkpoint — REST, events, RSQL and albums

Inventory now 242 mapped / 98 missing of 340. This is file coverage, NOT a
full-parity claim. Goal remains active. 87 XRPC handlers across 16 groups.

Implemented and compiled:
- Bsky.App: OAuth GET/POST login, app-password login/session persistence,
  callback/CLI long-lived token handshake, one-time /token, profile refresh,
  beta-account metadata, public client metadata and source's fixed JWKS.
- Googledrive.App: credentials, OAuth URL/callback, encrypted token upsert,
  beta join, directory creation/listing and file/download proxies.
- Webscrobbler.App: DID/handle auth and UUID provisioning/update.
- Opengraph.App: public profile and scrobble/album/artist/song previews.
- Lib.DiscogsView: all relation mappers, optional-array omission, score rounding.
- Lib.EventView: location/media/artist/RSVP/event views, batched hydration,
  handle URI normalization, duplicate canonicalization, RSVP groups, filters.
- Event.GetEvent/GetEvents/GetEventRsvps/PutRsvp and Artist.GetArtistEvents.
  putRsvpWithAgent exports injectable agent factory for tests; source advisory
  transaction lock + PDS-before-index ordering and duplicate subject preserved.
- Lib.Rsql: SQL compiler with allowlists, arrays, nulls, case-insensitive escaped
  wildcards, number/date coercion and InvalidFilter wrapper. RsqlFieldMap uses
  Object {column :: SQL, type_ :: RsqlFieldType}; field is string-field helper.
  compileRsqlFilter -> Effect (Either RsqlFilterError SQL).
  compileRsqlFilterParam -> Maybe String -> fields -> Aff (Maybe SQL).
- Uploads.Analysis: cached lazy native loading with logged import failure,
  coalesce persistence and nonfatal upload analysis. Context explicitly passed.
- Users.Utils snake-case track dedupe. Corrected inherited Lib.Common dedupe:
  JS Map insertion order, empty lyrics count as missing, null vs undefined
  positions remain distinct. Generic dedupeByPosition/positionKey exported.
- Album.GetAlbum/GetAlbumTracks/GetAlbums including Discogs children, likes,
  read pool query cancellation, filteredPage selection and 30s cache.

Generic binding additions:
- Rocksky.Analysis.loadChecked preserves import rejection; old load retained.
- Atproto.XrpcServer.isInvalidRequestError for exact source exception behavior.
- Drizzle.Builder.querySQL builds getSQL() tree without executing a query.

Tests: new test:rest-storage, test:events, test:rsql, test:albums. 14 suites
including PureScript tests. All run successfully this checkpoint; final shared
dedupe change rechecked by REST tests, album tests and XRPC registration tests.
No live service access. New modules warning-free; rebuilding foundational
bindings surfaced the existing 8 warnings in other modules.

Coverage details:
- REST: auth guards, Webscrobbler upsert, all three Drive token storage branches,
  directory create/re-read sequence, OAuth URL, OG omission/null shapes;
  Bsky CLI OAuth callback, single-use JWT, metadata/JWKS; analysis coalesce.
- Events: media/locations/date bounds/filter SQL, batch counts/viewer status,
  duplicate resolution, transaction lock ordering, reused RSVP subject/rkey,
  missing-CID fetch, PDS 403 rollback without index write.
- RSQL: typed coercion, allowlist validation, logical nesting, escaping,
  parameter binding, malformed operator/value forms and InvalidFilter errors.
- Albums: ranked/filtered ordering including unplayed albums, empty page,
  dedup order/lyrics, dates, notfound and anonymous like counts.

Remaining test/audit gaps (do not claim integration-tested):
- Bsky app-password and profile full routes need end-to-end mocked coverage.
  CLI POST accepts boolean/string truthiness; source accepts any JS truthy
  JSON value. Revisit unusual malformed POST body types during parity audit.
- Drive callback/download/join external adapters need full route tests.
- Lib.EventView parseDate takes Nullable; source distinguishes explicit null
  from undefined but lexicon only allows strings. Validated request parity
  tested. Query mocks compile SQL but no real PostgreSQL/PDS transactions.
- DiscogsRelations helper now expects all relation arrays explicitly; callers
  should pass empty arrays + null master when absent (GetAlbum already does).

Next: remaining REST Spotify/Import/Uploads/Users and Index; remaining catalog,
graph, feed, player/Spotify/Drive/Dropbox XRPC; scripts and OAuth override audit.
RSQL + DiscogsView + EventView dependencies are now available for these.
Users.Utils complete; Users.App still missing. No source-stub handlers were
invented/registered this checkpoint (source's existing unfinished endpoints
remain to be handled and explicitly documented).

## Continuation checkpoint — artist catalog and loved songs

Inventory: 249 mapped / 91 missing; 94 XRPC handlers / 16 groups.
Previous goal turn made verified progress; full goal remains active.

New complete source counterparts:
- Artist.GetArtist: user-artist/canonical URI lookup, NotFound preserved,
  listener/play counts, full row and ISO dates.
- Artist.GetArtistAlbums: artist junction lookup, album count decoration,
  source DB result order, 10-minute shared query cache, errors rethrown.
- Artist.GetArtistListeners: readDb ranked listener page, most-played track
  selection (first encountered wins a tie), missing users retain rank gaps.
- Artist.GetArtistRecentListeners: primary DB queries, latest timestamp and
  scrobble URI per user, first encountered wins equal-timestamp ties.
- Artist.GetArtistTracks: rank played tracks before paging, stable ID ties,
  fill short pages from unplayed junction rows only after Unicode credit
  validation, account for total played groups in later unplayed page offsets.
- Artist.GetArtists: name/genre/RSQL filters via filteredPage, default ranking
  by distinct listeners, totals and default empty genres, 30-second cache.
- Actor.GetActorLovedSongs: DID or handle lookup, published likes only,
  createdAt is love time; keep lyrics and serialize track updatedAt.

Source Cache.make in GetArtistListeners/RecentListeners/Tracks is rerun on
each request (unlike queryCache). These ports intentionally retain no cache
between calls, matching that source behavior; do not accidentally introduce
shared caching when tidying them.

New test:artists suite validates all seven handlers' retrieval behavior with
query mocks and compiled SQL: unknown artists, listener rank holes and ties,
notfound class, dates, album order, artist ranking/filter conjunction,
Unicode credit filtering before offsets, played/unplayed page composition,
and loved-song published-record/timestamp/lyrics rules.
Build and test:artists pass; test:xrpc verifies all 94 real-lexicon registrations.
No live services contacted. Source artist group now fully mapped (including
GetArtistEvents from previous checkpoint).

Read but NOT ported this turn: all four XRPC apikey files. They are unfinished
in TypeScript (create/update/remove return {}, list returns {apikeys:[]}).
Unused current-user helpers in those files are not wired into the handlers.
Do not invent CRUD logic or count new placeholder logic as finished service
work; preserve/document source limitations when reaching that group. REST
Apikeys.App already implements real credential management separately.

Next: remaining actor endpoints/graph/feed/catalog, large REST apps
Spotify/Import/Uploads/Users + Index, scripts, OAuth overrides and full audit.

## Continuation checkpoint — graph and actor playlists

Inventory: 255 mapped / 85 missing. 100 XRPC handlers / 17 groups.
Previous turn and this turn made verified progress; overall goal stays active.

Implemented Graph.GetFollowers/GetFollows/GetKnownFollowers/FollowAccount/
UnfollowAccount, backed by Graph.Common and Graph.Mutations (actual PureScript
logic, no application JS delegation). Source behavior retained:
- Separate follower/followed direction, subject optional -> {}, count excludes
  cursor, cursor derived from separate follows page, optional DID filtering.
- Source getFollowers cursor query includes false for explicitly empty dids
  with a cursor, while the joined profile query does not. Kept and tested.
- Known followers use primary dbQuery and correlated mutual-follow EXISTS;
  absent viewer returns empty without DB work.
- Mutation guards precede agent access; PDS create/delete precedes local
  insert/delete; no invented transaction. Follow lexicon validation, conflict
  ignore, post-write follower list, then notification with correct actor IDs.
- Unfollow's full-page cursor comes from the final USER createdAt (source
  behavior), unlike graph list cursors from FOLLOW createdAt.
- mutateWithAgent exports an injectable factory for offline tests.

Actor.GetActorPlaylists now mapped. Exports filterFields, filtersOnTracks,
trackCount and trackArts for future playlist catalog reuse. Uses source
curatorDId spelling, preserves trackCount value, dates, picture, cover mosaic.
Track predicates use a parenthesized correlated EXISTS so all comparisons
refer to the same track; no track join on playlist-only filters. Validates
RSQL before catch/fallback. Primary dbQuery retains cancellation semantics.

New test:graph passes for graph direction, filters, cursor/count separation,
empty-dids source oddity, known-follower SQL, mutation guards, PDS failure
before local writes, follow notification identity, and actor playlist SQL.
Playlist query tests use real Drizzle with a fake pg client, checking actual
generated SQL and parameters. Build and test:xrpc pass (100 registrations).
No live services contacted.

Read next candidate fully: Actor.GetProfile.ts (~490 lines).
Implementation requirements from source:
- Resolve handle once through ctx.baseIdResolver; explicit DID supports plc/web.
- params.did overrides auth DID; missing both errors -> handler {} fallback.
- Explicit actor params trigger PLC/web document fetch for service endpoint.
  No params actor -> use createAgent, even though auth did known.
- Agent errors logged/swallowed; fetchBskyProfile takes Maybe agent.
- Fetch existing user, profile + handle + linked account rows (joins via users).
- New user insert with empty avatar/name fallback, reselect, publish rocksky.user
  with xata_* keys and version1. Existing only overwrite fetched fields when
  present; handle updates; source DB update is fire-and-forget, then NATS.
- Response uses refreshed in-memory user; omitted avatar when empty; dates.
  spotifyUser omits email; accounts absent become {}. spotifyConnected bool.
- Each stage wraps errors with its source label, outer retry120sec + {} fallback.
This module not yet created. Other actor compatibility/neighbours remain.

Still outstanding: larger REST Spotify/Import/Uploads/Users + Index, remaining
catalog/feed/player/cloud XRPC, scripts, OAuth overrides and full parity audit.

## Continuation checkpoint — actor profile, compatibility and neighbours

Inventory: 259 mapped / 81 missing. 103 XRPC handlers / 17 groups.
Previous and current turns made verified progress; full goal remains active.

Actor.GetProfile implemented with explicit context and optional actor/viewer:
- resolveActor resolves handles once, preserves explicit actor precedence,
  rejects requests without actor/session; PLC and web service-document lookup.
- getProfileWith injects fetchBskyProfile for offline testing; normal getProfile
  uses real helper. Endpoint agent creation errors swallowed like source.
- Linked account joins use internal user IDs (different from REST Bsky.App).
- refreshProfile preserves stored avatar/name on partial fetch; new user
  defaults empty strings; publishes source xata_* envelope/version semantics.
- Existing DB update is forked, preserving source non-awaited write. Existing
  response keeps original row timestamps while refreshing handle/name/avatar.
- Spotify response omits email; absent account objects are {}; empty user
  avatar omitted. Stage error labels, outer retry/timeout/fallback implemented.

Actor.GetActorCompatibility implemented: user lookup, Various Artists exclusion,
distinct library union percentage, round-to-tenth score, level0..10, first20
shared IDs -> rank-weighted top10, absent picture/URI omitted. Source Cache.make
is per-call so no cross-request cache added.

Actor.NeighboursQuery copies source SQL into parameterized PureScript template;
no runtime TypeScript loading. Actor.GetActorNeighbours resolves DID/handle,
executes materialized shared-pair query, decorates cards, computes overlap
relative to target library; 10-minute cache capacity100 and readQuery wrapper.

New test:profile passes (offline). Covers actor precedence/one handle lookup,
missing actor, unchanged/partial/new profile, event version and defaults,
linked-account email omission, compatibility scores/rank weighting/null IDs,
empty libraries, neighbour bound SQL and nullable-card hydration.
Build and test:xrpc pass (103 registrations). Actor group now fully mapped.
No live services contacted.

Remaining profile audit caveats:
- Forked update uses existing forkAndForget helper (logs failure) whereas source
  leaves a rejected fire-and-forget promise unhandled. Successful behavior and
  PDS/DB-boundary tests match; document or revisit failure policy in full audit.
- New-user reselect missing row throws explicit error, source dereferences
  undefined; both outer fallback {}. Valid-row behavior tested.
- Full profile real AppView fallback remains covered by helper implementation;
  new end-to-end tests inject fetch profile while mocking DID-document fetch.

Next prioritize remaining large REST apps (Spotify/Import/Uploads/Users) and
Index, then feed/player/cloud/catalog/charts endpoints, scripts, OAuth overrides
and whole-port audit. User's objective remains all modules and wiring.

## Continuation checkpoint — Spotify REST app

Inventory 260 mapped / 80 missing; XRPC still103/17groups.
Previous turn progress verified; full goal remains active.

Spotify.App now fully implements source spotify/app.ts (882 lines), split into
Spotify.OAuth and Spotify.Playback PureScript helpers:
- login auth/beta-app selection, random hex state stored in ctx.kv, source scopes
  and Strict/Secure/HttpOnly cookie; no app -> literal undefined client_id.
- callback consumes state once before user lookup, decrypts app secret, trades
  code, encrypts access/refresh tokens, updates/inserts, publishes beta user email.
- join validates email, selects first app below25 accounts, inserts non-beta
  account and posts beta signup. Duplicate-key error rethrown, other DB insert
  failures logged and ignored, matching source.
- currently-playing rate limiter10/15sec, optional query DID/handle override
  after bearer verification, Redis email:current cache, lowercase metadata
  SHA256, canonical URI attachment and requesting subject's liked flag.
- pause/play/next/previous/seek refresh access token on each call; only403
  response is forwarded as text, other responses are parsed as JSON exactly
  as source (including its failure on empty204 responses).
- volume validates PUT integer0..100 before auth; refresh failures401;
  forwards upstream status/content-type/text, successful PUT204, GET204 ->
  {volume:null,supported:false}; reports device support/restriction.

Added generic Fetch.urlEncoded binding for URLSearchParams form serialization.
No business logic delegated to JS.

New test:spotify covers anonymous guards, invalid volume, OAuth state/cookie,
one-use callback, token update+insert encryption, refresh forms for controls,
403 responses, volume204/device/auth/upstream-error handling, beta signup app
selection, and public cached playback hashes/URIs/likes.
Build warning-free; test:spotify passes, entirely fake fetch/DB/Redis/NATS.

Source edge caveats: callback missing app/token fields throw explicit errors
instead of source null dereferences, both Hono500. Current-playback malformed
cached track throws like source. No live Spotify integration tested.
REST Index is still missing so module is not yet mounted in service entrypoint.

Next: Import.App, Uploads.App, Users.App and Index, then remaining XRPC/scripts/
OAuth overrides and whole-port audit. Spotify XRPC files still missing and
must be read independently; do not assume their behavior matches REST.

## Continuation checkpoint — import, charts, Spotify XRPC

Inventory: 270 mapped / 70 missing of 340 non-generated source modules.
112 XRPC handlers registered across 18 groups. These counts track presence,
not a completed parity audit. Full-port goal remains active.

Implemented Import.App with Parser and Service support modules:
- Last.fm CSV BOM/header/escaped-quote handling, numeric-prefix timestamps
  beyond Int32, missing album fallback, Spotify basic and extended history,
  custom UTC parsing and 30-second minimum listening duration.
- Bearer authentication catches verification and DB failures as 401; SSE
  catches token verification failures but lets DB failures propagate.
- Multipart uploads, recent running-job conflict, stale-job failure, oldest
  first processing, background crash persistence, status/jobs/cancel routes.
- Agent restoration, bulk timestamp duplicate prefilter, shared import cache,
  batches of three settled scrobbles, progress persistence and 50-error cap,
  local/cross-instance cancellation, 300ms inter-batch pause.
- SSE progress until terminal job or two-hour deadline.
- Generic Hono raw form-value/file-text bindings and effectful Dayjs UTC input
  binding preserve undefined-as-now versus null-as-invalid date behavior.
- Import test covers parsing, missing/null timestamps, concurrency/cache,
  duplicate filtering, cancellation, 50-error cap, auth failures, stale jobs,
  multipart failures, numeric query coercion and terminal SSE.

Implemented charts GetTopArtists/GetTopTracks/GetTopScrobblers:
- Pooled cancellable readQuery for artist/track data, materialized all-time
  views, live filtered ranking, DID/handle resolution, stable tie-breaks,
  artist exclusion, metadata hydration, numeric count conversion and tags.
- Scrobbler all-time MV and ranged counts split at actual hourly-view coverage,
  with partial head and live tail. Distinct keys calculated only for ranked
  users. Bot exclusion and original inclusive-end behavior retained.
- 2-minute artist/track and 10-minute scrobbler caches; 120-second deadlines.
- Chart tests exercise real Drizzle SQL using fake pg clients, hydration,
  missing actors, ranking, count conversions and hourly coverage boundaries.

Implemented all six Spotify XRPC handlers:
- Play/pause/next/previous/seek share encrypted refresh-token and app lookup,
  form refresh, action request and upstream status logging. Source returns
  no content even for swallowed failures and does not parse action response.
- Currently playing selects actor or authenticated DID, reads email cache,
  hashes metadata, uses pooled queries for URI/likes and returns actor likes.
  Unlike REST, source does not add sha256 to the response.
- Tests cover refresh form decryption, verbs/seek, no-content fallback and
  actor URI/like enrichment. Registration uses real lexicons.

Fixed shared Lib.Aff.timeoutMs: parOneOf previously discarded an operation's
failure while waiting for the deadline, replacing the original failure with
TimeoutException. Race now carries attempt results as values, propagates the
original error immediately, and still cancels the loser. Three regression
specs cover original errors, success, and cancellation after deadline.

Validation: build passes (wide rebuild reports eight pre-existing warnings in
older modules; new modules warning-free), all seven PureScript specs pass,
and all twenty bin/test-*.js suites pass after the shared timeout correction.
New scripts: test:import, test:charts, test:spotify-xrpc. No live services used.

Remaining: Uploads.App, Users.App, Index; remaining feed/playlist/song/scrobble/
cloud/player/stats handlers; scripts; OAuth overrides and whole-port audit.
Source audit found several existing TypeScript placeholders: Dropbox
getMetadata/getTemporaryLink and downloadFile, Google Drive getFile and
 downloadFile, player play/pause/next/previous/seek/getCurrentlyPlaying are
empty/no-op source implementations; player getPlaybackQueue reads queueTracks
then returns {}, playFile/playDirectory do the same in a transaction;
addItemsToQueue has real prefix grouping, transaction reads and tracklist call;
addDirectoryToQueue.ts appears empty (recheck before mapping). Preserve and
explicitly document source limitations, never claim invented stub behavior is
implemented functionality. These files remain unmapped at this checkpoint.

## Continuation checkpoint — playlist reads, feeds/stories, scrobble submission

Inventory: 277 mapped / 63 missing of 340. XRPC: 119 handlers / 19 groups.
Full-port goal remains active. No live services used.

Implemented playlist GetPlaylist and GetPlaylists:
- Pooled cancellable primary DB queries, handle-to-DID canonical URI lookup,
  missing-playlist typed error/fallback, addedAt then ingestion-time ordering.
- Track likes through shared SHA-aware withLikes; omit lyrics in detailed
  output, preserve whole-playlist count when filtering tracks, serialize dates.
- Listing RSQL curator aliases, same-track EXISTS semijoin with DISTINCT,
  stable cover-art mosaic, count projection and pagination defaults.
- Reuses actor playlist SQL fragments; validates filters before fallback so
  malformed expressions remain InvalidFilter errors.
- test:playlists checks real Drizzle SQL, same-track semijoin, curator aliases,
  invalid filters, canonical/unknown/malformed URIs, omission and likes.

Implemented Feed.GetFeedGenerator/GetFeedGenerators/GetFeed/GetStories:
- Generator metadata from replica; missing single view remains undefined.
- GetFeed versioned Redis cache key includes viewer/feed/version/limit/cursor,
  30-second writes; native skeletons use localhost configured feedgen port,
  external generators use did:web host. Hydration omits lyrics at SELECT,
  narrow artist/user projections, batched likes and descending scrobble time.
- Stories resolves optional skeleton/followed users and short-circuits empty
  sources. Latest per-user distinct query starts at 30 days, falls back to
  full history if short. Batched like counts and viewer state, timestamp JSON.
- Stories source uses localhost:8002 only for localhost PUBLIC_URL, otherwise
  public did:web host, unlike GetFeed's native-feed optimization; retained.
- Following without authentication throws outside fallback. Source Cache.make
  is evaluated anew per request, so no cross-request stories cache is retained.
- test:feed covers cache isolation/hits/writes, routing, metadata, hydration,
  lyrics exclusion, URI overrides, likes, recent/all-time scan, following and
  empty-feed short circuits, auth guard and missing metadata representation.

Implemented Scrobble.CreateScrobble:
- Shared Track parser and validation messages; missing DID400; bot and rate
  guards429; expired ATProto session401 before durable acceptance.
- Idempotency-Key length/type validation after session check; mirror-provider
  tealfm skips forwarding; enqueueSubmission returns empty JSON acknowledgement.
- SubmissionUnavailable503, generic500 safety net, active-span attributes,
  rejection events and exception status. Dependency-injected handler enables
  service-free testing while register uses real guards/agent/queue helpers.
- test:create-scrobble covers validation, guard order, both429s, expired session,
  invalid keys, canonical track text, durable acceptance, mirror skip,503/500.

Build warning-free. New playlist/feed/create-scrobble tests pass; all seven
PureScript specs and real-lexicon registration suite pass. Existing twenty
behavior suites passed at prior checkpoint after the shared timeout fix.

Still missing: playlist insertDirectory/insertFiles/startPlaylist are source
placeholders (each only opens a transaction and selects playlists, with no
actual mutation/playback). Preserve/document these in source-limitation audit;
do not invent a mutation to satisfy presence counts. Feed recommendations
(track/album/artist) still missing and substantial. Next useful work is
Scrobble.GetScrobble/GetScrobbles and Song handlers, followed by remaining REST,
recommendations/stats/cloud/player, scripts/OAuth and full entrypoint audit.

## Continuation checkpoint — scrobble reads, song reads/catalog identity

Inventory: 282 mapped / 58 missing of 340. XRPC: 123 handlers / 19 groups.
Full-port goal remains active.

Implemented Scrobble.GetScrobbles:
- Versioned30-second Redis cache; DID/following/pagination/filter in key;
  pooled cancellable primary reads; following-user short circuit.
- Exact RSQL fields including array artist genres, planner-driven filteredPage
  for nonblank filters, count-free unfiltered recent pagination, narrow SELECT
  with lyrics omitted. DID without following affects like state only.
- Batched likes by track ID, timestamp-createdAt compatibility fields, retained
  track updatedAt and source output differences from feed hydration.
-20-second timeout, no added retry (source has none), filter validation outside
  fallback, original scrobbles[] fallback.

Implemented Scrobble.GetScrobble:
- Primary lookup, comma-separated artist lookups preserving order/duplicates,
  shared SHA-aware likes, distinct listeners, total plays, earliest attribution.
- Album URI from joined album, song URI distinct from scrobble URI, trimmed
  MBID/ISRC omission, serialized artists/scrobble dates and first-scrobble.

Implemented Song.GetSong:
- Trimmed URI/MBID/ISRC/Spotify ID OR lookup, separate user-track URI resolution,
  replica catalog/counts plus primary shared likes, ordered artist credits.
- Missing identifiers InvalidRequest; typed NotFound retained; other errors
  propagate instead of silently returning empty JSON. First-scrobble and counts.

Implemented Song.GetSongs:
- Direct identifier lookup + optional RSQL avoids aggregation, zero counts,
  direct-only lowercase mbid/isrc output; preserves limit0 via nullish defaults.
- Genre EXISTS query, filteredPage before history aggregation, global unique-
  listener ranking, deterministic filtered page order, zero-play catalog rows.
- Pooled replica reads,30-second cache,120-second timeout and transient retries.

Implemented Song.MatchSongUris catalogIdentity helper:
- Indexed hashes only for song/album/artist; independent settled lookups.
- Reject song URI when title/artist/album/ISRC/MBID/duration conflicts; selected
  catalog record bypasses revalidation as source requires. Independent matching
  album/artist URIs survive a failed song lookup. Joined-release identity never
  reuses a track's original album URI unless title/album-artist agree.
- Internal records use Maybe; public URI fields use Nullable.

Tests: test:scrobble-reads (cache, real SQL planner pagination, presentation,
credits/likes/counts, identifier resolution and typed errors), test:song-catalog
(direct filtering, genre/ranking, zero-play hydration and identifier output),
test:match-uris (hashes, conflicts, settled failures, joined releases).
Build passes warning-free after correcting catalog duration Int->Number math.
New suites pass; seven PureScript specs and real-lexicon registration suite pass.

Next: Song.MatchSong can consume completed MatchSongUris + Lib.Matching;
Song.CreateSong remains841 lines and must preserve validation/candidate policy
and provider enrichment. Feed recommendation trio, stats, remaining REST apps,
cloud/player/source-placeholder audit, scripts/OAuth and entrypoint wiring remain.

## Continuation checkpoint — song matching and creation

Inventory: 284 mapped / 56 missing of 340. XRPC:125 handlers /19 groups.
Full-port goal remains active.

Song.MatchSong completed:
- Calls Lib.Matching with normalized request, retains selected service result
  or first ambiguous suggestion, preserves provider order, no legacy Redis
  shortcut. Unmatched -> matches[]. Service failures propagate.
- Catalog identity helper supplies verified URIs; only populated catalog
  metadata overrides provider values, duration<=1 is excluded. Checked release
  identity overrides catalog title/artist/album; joined album art/date/year and
  artist picture are enriched independently. Catalog counts use record ID.
- Provider views preserve score rounding, provider rank, safe positive Deezer
  numeric IDs, MB credits, signed previews/links; catalog suggestions omitted
  from matches. Optional/nullable output fields follow source.
- test:song-match covers matched/ambiguous/unmatched, normalized service call,
  providers, ranking, safe IDs, catalog metadata precedence, joined releases,
  missing metadata, service outages and registered handler JSON.

Song.CreateSong completed with CreateRecords/CreateService helpers:
- Auth/agent setup precedes Track validation; existing catalog paths can succeed
  with a missing agent, while record writes fail. Error fallback and120-second
  timeout/transient retry retained. Invalid Track input is rethrown: source
  safeParse.data becomes undefined and produces an Effect defect outside its
  catchAll; locally verified Effect's defect behavior with installed runtime.
- Source Option.fromNullable fails on a missing track/album/artist: retain this
  limitation rather than silently creating new catalog entries. Existing rows
  with missing URI can create validated ATProto records.
- Source generateRkey is evaluated at module load; all record writes reuse it.
  Preserved and tested explicitly. Record fields differ from Nowplaying, so
  dedicated PS builders preserve empty lyrics/composer, disc0->1, no extra tags.
- Missing track URI metadata updates, delayed ingestion fetches (delay is BEFORE
  each attempt), relationship lookup/inserts with conflict-ignore returning,
  maximum15 attempts, original logging counter and publish-only-before15 rule.
- Dedicated NATS payload preserves source relationship object shape; shared
  Tracks.Service would add fields and has different ingestion behavior.
- test:create-song covers missing catalog failure, existing success, inserts,
  URI update/polling limit, no publication at15, exact relationship payload,
  record validation, repeated module-level rkey, source-specific record fields.

Build passes warning-free. New song-match/create-song tests and related matching,
URI, scrobble-read/catalog suites pass; all7 specs and125-handler registration
suite pass. No live services used. Parent worktree changes remain untouched.

Remaining: feed recommendations(track/album/artist), stats wrapped modules,
cloud listing/player/source-placeholder audit, Uploads.App/Users.App/Index,
all remaining scripts and OAuth overrides, full source-parity/integration audit.

## Continuation checkpoint — cloud listings, wrapped, source placeholders, OAuth, scripts

Full-port goal remains active. Inventory: 317 mapped / 23 missing of340 (file
presence only). 150 registered XRPC handlers /23 groups. No live services used.

- Dropbox/Googledrive.GetFiles implement parallel directory/file queries with
  ownership, parent/grandparent aliases, path-or-file-ID selection, exact
  trailing-slash-before-trim normalization, ordered results, ISO dates, nullable
  track IDs, directory->file parent fallback and provider-specific xataVersion
  omission. test:cloud-listings passed.
- Stats.WrappedQuery preserves source materialized SQL, index scan/aggregate
  snapshot, tie ordering, genres, historical artist exclusion and bounded
  top IDs. Stats.GetWrapped adds calendar/rolling windows (JS UTC month overflow,
  not dayjs clamping), 30min cache, replica hydration, numeric conversion,
  stable ties, sparse metadata, first/last scrobbles, leap-year streaks and
  fallback. test:wrapped passed.
- Audited and ported original TypeScript placeholders AS SOURCE LIMITATIONS:
  API-key XRPC returns empty objects/list; player transport no-ops; cloud
  download throws original Not implemented yet; metadata/link/file responses
  empty. Player queue/file/directory and playlist insertion/start preserve
  actual reads/transactions, with no invented writes. addDirectoryToQueue source
  is an empty file, so its PS module registers nothing. addItemsToQueue preserves
  grouping and whole-table IN operands (questionable source SQL), posts original
  items to tracklist.addTracks within transaction. Source catches read errors
  as {}, preventing transient retries; single attempt retained/tested. These
  are not newly implemented playback/cloud/API-key features.
  test:source-placeholders passes auth, bodies/errors/no-content, reads/tx,
  grouped SQL, tracklist post, rollback and no-retry behavior.
- Removed application OAuth negotiation/authorize logic from package JS FFI.
  New Rocksky.Auth.OauthClientAuth/OauthClient implement it in PS. Package
  Runtime bindings only wrap SDK operations; installAuthorize bridges PS Aff
  callback to SDK URL promise. Auth.Client installs override after construction.
  Generic Fetch.URL bindings and Foreign truthy/stringValue + Error.typeError
  added. test:oauth-client covers negotiation/kid selection, errors, PKCE/state,
  raw login hints, prompt/identity omission, signals, PAR, protocols, URL limits
  and installed callback. New code compiles without warnings; foundational
  rebuild emits8 inherited chart warnings.
- Scripts.Avatar/Spotify/SeedFeed ported. Avatar preserves partial updates,
  skip flag, fresh DB NATS payload, batched100/sequential per-user recovery,
  targeted failure propagation, pacing/flush. Spotify encrypts+conflict-ignore.
  SeedFeed only first100 source records (no pagination), accepts both #main
  and short type tags, user ID association and conflict-ignore. Basic script
  tests pass; no operational scripts executed against live services.
- Auth.SessionMaintenance holds previously missing src/db.ts helpers, split
  out to avoid Db/Context import cycle. Exp script initial backfill/refresh and
  every-minute cron. Source selects ALL future expiries (not short threshold),
  excludes literal 'NULL' sentinel and actual NULL via > now, orders ascending,
  getPreferences then200ms pause. updateExpiresAt visits all rows, preserves
  explicit null, fails missing expiry (Kysely empty update fails in source).
  test:session-maintenance passes against real in-memory SQLite migrations.

All32 prior JS suites passed together after OAuth changes; then new basic-script
and session-maintenance suites passed (34 total now). All7 specs passed before
OAuth/script changes. Latest builds pass. Inventory regenerated. Parent
worktree edits untouched; no commits.

Remaining: 3 feed recommendation handlers; Uploads.App, Users.App, Index;
17 operational scripts (see inventory); complete mapped-source/FFI audit,
entrypoint/bundle validation and full regression run. Source placeholder
limitations above must remain explicit in final reporting. Db maintenance
helpers are now present in Auth.SessionMaintenance, so wire Index cron there.

ReplayGain backfill continuation:
- Scripts.BackfillReplaygain fully ported. Managed-storage-only keyset pages,
  optional user ownership, MIME extensions, preexisting RG skip, dry-run no
  tagging/writes, original-buffer identity failure, per-file recovery,
  tagged-success limit (not scanned count), same S3 key/content type and updated
  DB fileSize. Injectable IO keeps orchestration testable; sameBuffer FFI is
  only JS reference identity. Real main uses music-metadata/ensureReplayGain/S3.
- Build warning-free; test:replaygain-backfill passes managed/user conditions,
  cursor advance, success limit, skip/failure counters, upload/size persistence
  and dry-run. 35 JS suites total; latest new suite passed independently.
- Inventory318 mapped/22 missing. Goal still active, no blockers.
- Next inspected backfill-analysis.ts in full. Must preserve seen-track dedup,
  consumed-row cursor (NOT whole page), target=min(distinct count,limit), page
  batchSize*4, concurrent downloads incl abort timeout covering body, storage
  client promise cache by managed or user:provider, batch native progress,
  first-success fingerprint-property compatibility guard, COALESCE writes,
  dry-run analysis-without-writes, download failures not incrementing processed.
  Rocksky.Analysis already exposes analyzeBatch/supportsFingerprint.
  Storage.App.resolveStorageClient ctx userId MaybeProvider returns client/bucket.
  Aws.S3.getObject lacks abort-signal support; add a low-level SDK binding for
  abortable GET (signal must cover response body too) before implementing it.

## Continuation checkpoint — analysis and Discogs backfills

Full-port goal ACTIVE. Inventory320 mapped/20 missing.150 XRPC handlers.
37 JS suites now; new analysis-backfill/discogs-backfill suites and related
Discogs/rest-storage/xrpc suites pass; all7 specs pass; latest build warning-free.
No live service actions, commits or unrelated parent edits.

Scripts.BackfillAnalysis:
- Distinct-track target, missing-field/fingerprint-only filters, optional user,
  batchSize*4 pages, seen-track dedup, consumed-row cursor, parallel downloads,
  download failures separate from processed count, native batch progress,
  result counters, dry-run analysis without writes and shared COALESCE storage.
- cachedDownload stores promises (including rejection) by managed or user:provider,
  shares managed client across users, abort timeout begins before resolution
  and covers body consumption; new Fetch.Abort.withTimeout and SDK getObjectWithSignal.
- Fixed Rocksky.Analysis FFI normalizer: preserve absent fingerprint property.
  Previously it added null, hiding the original stale-native-binding guard.
  First result with analysis checks supportsFingerprint before writes.
- Tests cover cursor skipping bug, duplicates, target counting with failed
  downloads, sparse native results, dry run, missing fingerprint, cached clients,
  stalled body cancellation and timer cleanup.

Scripts.BackfillDiscogs:
- Strict node:util.parseArgs via generic Scripts.Common binding; PS validates
  digit-only safe-integer offset (including >Int range). Added Drizzle.offsetNumber.
- Source exact timestamp/id tuple comparison inside PG retains microseconds;
  offset applied only first page, pending-link predicate, target=min(pending-offset,limit).
- DB retries wrap reads and entire replay-safe enrichment. Unavailable retried
  up to3 with60sec cooldown, pacing after every non-dry-run item including last,
  status counters and progress/ETA logs. Dry-run never enriches or sleeps.
- Tests cover safe offset parsing, SQL tuple precision, one-time offset,
  source statuses, cooldown/spacing sequence, target and dry-run.

Remaining20 modules: 14 scripts (backfill-isrc-mbid,backfill-likes,backfill-riff,
backfill-track-uri,collections,dedup-records,dedup,event,feed,genres,
sync-library-playlist,sync-library,sync,typesense-import); 3 recommendation
handlers; Uploads.App/Users.App/Index. Then full mapped-source/FFI audit, wiring,
bundle and broad final regression verification. Presence is not parity proof.

## Continuation checkpoint — likes backfill and scrobble dedup

Goal ACTIVE; inventory322 mapped/18 missing.150 XRPC registrations.39 JS suites.
Build warning-free; new likes-backfill and scrobble-dedup-script suites pass.

Scripts.BackfillLikes preserves user creation/profile lookup + NATS publication,
DID/@handle resolution, per-user failure isolation, cache (including failed song
lookups) shared across users, URI -> userTracks URI -> fetched record SHA256
resolution, both duplicate checks, conflict-ignore returning, createdAt/default,
exact NATS like payload and cursor pagination. Tests cover duplicates/conflicts,
resolve precedence, cached failures, invalid subjects, pages, timestamps/payload.
Scripts.Dedup preserves source deletion checks and one-second deletion-only
pacing. SOURCE LIMITATION: reads response cursor but never passes it to next
listRecords; can repeatedly revisit first page while cursor stays truthy. This
was deliberately retained and tested, not silently fixed as part of a port.
No live operational scripts executed, no commits/parent edits.

Inspected dedup-records.ts fully; still NOT ported. Next implementation should
preserve identityKey lowercased whole strings (artist name, album title/artist,
song title/artist/album); reject missing fields; list all records, derive rkey,
createdAt fallback empty; linked user URI preferred, otherwise oldest localeCompare
createdAt/rkey; group insertion order; applyWrites deletes in100-record batches,
500ms pause after EACH; delete all planned groups before repointing; references:
artist:userArtists.uri,artists.uri,tracks.artistUri,albums.artistUri;
album:userAlbums.uri,albums.uri,tracks.albumUri; song:userTracks.uri,tracks.uri.
Each repoint independently catches/logs failure. Dry-run reads/plans only.
CLI source parsing uses --only comma list, --dry-run, first non-option not equal
to onlyValue; optional agent failure exits1. No mutations required to port/test.

## Continuation checkpoint — record deduplication and synchronization

Goal ACTIVE; inventory325 mapped/15 missing.150 XRPC registrations.41 JS suites.
New record-dedup/sync-scripts tests pass, existing Discogs/subscriber URI-repair
suite passes after shared refactor. Build passes;8 inherited chart warnings on
foundational rebuild, no new module warnings. No live scripts or commits.

Scripts.DedupRecords implements source grouping/selection, CLI flags, full
pagination and concurrent linked-URI lookup. Preserves insertion order of groups,
localeCompare(createdAt,rkey), linked user record preference, oldest fallback,
100-record applyWrites batches with500ms pause after each, deletes all planned
records before sequential reference repair. Each reference update catches its
own failure. Dry run never writes or pauses. New Drizzle.executeResult exposes
SDK metadata for rowCount; Common.localeCompare wraps JS primitive. Tests cover
all of these incl deliberate one-reference failure and album field SQL.

Scripts.Sync uses shared Subscribers.Scrobble updateUrisWithLimit and
refreshScrobblesWithLimit (original subscriber still5). SYNC_SIZE retains JS
parseInt(value,10), default20 for absent/empty. New Common.parseInt10 and
Drizzle.limitNumber avoid truncating/rewriting JS values. Background pull
subscription sequentially waits15s then URI repair with configured size,
refreshes5 without summary; targeted refresh configured size and summary.
Existing per-scrobble publish failure isolation retained. Script tests cover
background ordering, size parsing and fixed refresh limit. Existing subscriber
suite still passes.
Scripts.SyncLibrary scans tracks in100-offset pages, skips missing URIs (source
logs deletion but performs none), checks joined artistAlbums, fetches artist and
album in parallel, inserts only missing relationships with conflict-ignore,
skips missing catalog entries. All branches covered by script test.

Next source inspected completely: sync-library-playlist.ts (190 lines).
Implement owner+playlist checks, navidrome tracks ordered createdAt asc, warn
missing track URI, dry-run before agent lookup; ensurePlaylistRecord; read
playlist.song records from public PDS (extractPdsFromDid + Api.newAtpAgent) with
cursor pagination into Set of songs matching playlistUri; filter existing URI
WITHOUT deduping remaining tracks; add one at a time and catch each failure.
Use Library.PlaylistMirror.ensurePlaylistRecord ctx agent did playlistId;
Playlists.Service.addSongsToPlaylist ctx agent did playlistUri [songUri];
Playlists.Service.playlistSongCollection constant. ExtractPdsFromDid returns
MaybeString, fail if absent as source new URL(undefined) would. CLI requires DID
prefix and nonempty playlistId, --dry-run only in trailing flags, exits0 success.

## Continuation checkpoint — playlist sync and track URI backfill

Goal ACTIVE.327 mapped/13 missing.150 XRPC registrations.43 JS suites now.
Latest build warning-free; new playlist-sync-script and track-uri-backfill tests
pass. No live services/scripts, commits, or parent changes.

Scripts.SyncLibraryPlaylist implements owner/playlist checks, ordered tracks,
missing-URI warnings, dry run before agent/PDS, ensurePlaylistRecord integration,
public PDS full playlist.song pagination scoped to playlist URI, existing URI
exclusion, duplicate remaining songs preserved, sequential addSongsToPlaylist
with per-song recovery. Main validates DID/playlist and trailing dry-run flag.
Tests cover owner query, ordering, pagination, dedup of already-published entries,
dry-run no auth, preserved duplicates and recovery. Usage printed on all main
errors currently (source prints only validation/session errors); audit CLI log
parity later if needed.

Scripts.BackfillTrackUri implements two passes: guarded user_tracks->tracks
UPDATE or dry-run count; missing hashes; candidate users (all or scrobbles/user
track existence); bounded worker pool with isolated failures; PDS song pagination
with empty-page stop; lowercase ingest hash, missing album->empty, first found
URI wins; guarded writes with per-write recovery, dry-run no writes. Only creates
PG pools (source does not instantiate full Context). Found rows kept in insertion
order to preserve source update order. Array membership currently linear; can
replace with ordered map+set if large-run performance audit requires it.
Tests cover both guarded SQL statements, hashed matches/first wins, cursor and
empty page, bounded concurrency, failed worker continuation, zero concurrency,
full dry-run orchestration and source candidate-user SQL.

Remaining13: Index, Uploads.App, Users.App,3 recommendation handlers, and7 scripts:
backfill-isrc-mbid, backfill-riff, collections, event, feed, genres, typesense-import.
Then full source/FFI audit, wiring, bundle and full regression verification.

## Continuation checkpoint — feed, genres, Typesense import

Goal ACTIVE.330 mapped/10 missing.150 XRPC registrations.45 JS test suites.
Build warning-free. New feed-genres-scripts/typesense-import-script tests and
existing Typesense search/library suite pass. No live writes/scripts or commits.

Scripts.Feed: interactive prompts preserve UTF16 name/description bounds,
DID/rkey regexes, default-true confirmation and cancellation before agent lookup;
resolve user, publish feed.generator with requested rkey and timestamp. SDK
validate:true explicitly gives source default behavior. Tests cover invalid
inputs, confirmation/cancel and exact record shape. Aborted text prompt fails
(source missing .value would throw); confirm abort cancels successfully.
Scripts.Genres: beta-user token/account/app join, random token selection,
decrypt refresh+secret, URLencoded token POST, search first artist; only update
nonempty genres and absent picture; any error retries indefinitely with1s pace,
also1s after success; original1000-offset pagination over shrinking NULL-genres
set retained. Source intentionally reads HTTP JSON without status rejection.
Tests cover encrypted token body/beta filter, HTTP body behavior, retry order,
missing result, existing picture and empty composer handling where relevant.
Scripts.TypesenseImport: CLI search/library/reset selection, search collection
order, ensure/recreate integration,500-row pages, batch-error isolation with
row counts, library ordered upload join, source sparse snake-case document,
concurrent settled per-document library errors. Source accesses track.year though
tracks schema has no such column: omitted (runtime field lookup preserves it
if a supplied row has one). Tests cover selection, zero/empty pages,500 batch
progress and failure counts, exact sparse fields (including0/empty preservation),
millisecond timestamp and per-document outcomes.

Remaining10 modules: Index, Uploads.App, Users.App,3 feed recommendations;
4 scripts: backfill-isrc-mbid, backfill-riff, collections, event. Then full source
and FFI parity audit, complete app/entrypoint wiring, bundles and regression.

## Continuation checkpoint — identifier backfill

Goal ACTIVE.331 mapped/9 missing.150 XRPC handlers.46 JS behavior suites.
Build warning-free; new test:isrc-backfill passes. No live script execution.

Scripts.BackfillIsrcMbid: scoped missing-ID filter, centrally selected matching,
selected-field updates without overwriting existing IDs, delay after successful
matching (even no result), database cause diagnostics, per-row matching/write
failure isolation, shared atomic claim/count and bounded concurrency, numeric
page/limit controls, source cumulative identifier-count offset preserved.
Tests cover SQL filters, identifier preservation, matching delay and failure,
nested database errors, concurrency and multi-page cumulative offset behavior.
Source log colors omitted; operational counts/diagnostics retained.

Read entire scripts/event.ts next; no Event edits yet. It prompts calendar and
music annotation fields, dates with retry, picture HEAD MIME+extension fallback,
artist lookup, similar same-headliner UTC-day duplicate warning/confirmation,
then publisher session after final confirmation, poster sharp metadata + blob
upload, calendar record then music subject strong ref, optional fields omitted.
Ctrl-C must exit0 at any prompt. Poster non2xx/absent dimensions skips media;
network/sharp/upload errors propagate. Calendar createRecord validates by default.
Remaining9: Index, Uploads.App, Users.App,3 recommendation handlers, scripts
BackfillRiff, Collections, Event. Then full parity audit, wiring/bundle/regression.

## Continuation checkpoint — event and collection scripts

Goal ACTIVE.333 mapped/7 missing.150 XRPC handlers.48 JS behavior suites.
Build warning-free; test:event-script and test:collections-script pass;7/7 Spago
specs pass. No live services/publication or commits. Parent files untouched.

Scripts.Event: all CLI prompts, trimmed/optional values, date retry+ISO conversion,
mode-specific physical/geo/online locations, festival stages, artist URI defaults,
ordered lineup, optional tags/external IDs, duplicate headliner+UTC-day SQL and
false-default override confirmation, final true-default confirmation before auth,
Ctrl-C exits0, DID resolution, HTTP(S) image HEAD accepted MIME and extension
fallback, Sharp poster decoding+upload, calendar then strongly referenced music
records. Non2xx poster skipped; invalid image/network/upload errors propagate.
Tests include real Sharp PNG metadata, mocked HTTP/blob/repo calls, scope/date
queries, duplicate cancellation, optional fields and virtual attendance.

Scripts.Collections: fetch scrobble/song/artist/album records sequentially with
100-row pagination incl empty-page cursor; insert artist/album/song/scrobble in
dependency order, parallel records within each collection, lowercase SHA hashes,
source catalog metadata+fallback art, user entity upserts reset scrobbles to1,
relationship insert-ignore, catalog conflict lookups, album metadata conflict
updates, scrobble URI OR composite identity recovery then publication. Song
errors caught per record; artist/album errors propagate; scrobble catalog+insert
errors propagate while conflict lookup/publication errors are caught, as source.
Tests cover orchestration, field mappings, hashes/dates, upserts, fallback queries,
missing song dependency skips and error boundaries. Dynamic field helper preserves
explicit null separately from undefined. CLI diagnostic wording/colors simplified.

Remaining7: Index, Uploads.App, Users.App,3 recommendations, Scripts.BackfillRiff.
Read first110 lines of backfill-riff.ts only; no Riff edits yet. It parallel-walks
tracks/albums/artists with missing metadata, default500page/4workers, per-entity
limit, only=all|tracks|albums|artists, dryrun, quiet. Replaces art starting with
https://cdn.rocksky.app or https://cdn.bsky.app deliberately; other existing fields
preserved. Need read rest. Afterwards full mapped-source/FFI audit and executable
entrypoint wiring, bundles, broad regression. Presence inventory is not parity.

## Continuation checkpoint — Riff backfill

Goal ACTIVE.334 mapped/6 missing.150 XRPC handlers.49 JS behavior suites.
Build warning-free; test:riff-backfill passes. No live backfill or commits.

Scripts.BackfillRiff: startup health check5s; requests30s signal, non2xx misses,
network/JSON errors increment entity errors; memo caches completed hits AND
misses (not pending promises, as source); tracks central matching then Spotify ID,
albums link lookup then ordered normalized title search, artists link then name.
Exact title regex ladder/primary artist search, first-image-only foreign CDN
selection, sparse updates preserve existing values incl empty strings/0, deliberate
old-CDN art replacement, partial parseInt year, unique spotify_link/23505 retries
without link (no retry if no remaining fields), dryrun increments outcomes without
writes, quiet logging, parallel entity keyset walks with bounded workers, per-entity
limit/counters and source last-page-row cursor. Art replacement counted before write
as source, so it remains counted if write fails. Final summaries after all walks.
Tests cover helpers/variants, central match path, memoized hit/miss requests,
patch fields/preservation, unique retry, dryrun, worker bounds/limit/error isolation,
SQL scopes/keyset, HTTP errors. Main health path and full live DB not executed.

Read full getArtistRecommendations.ts next; no recommendation edits yet.
It has200-entry5minute cache keyed did|limit(default50), optional DRIFT_URL
/v1/recommendations/artists absolute path with3s timeout and limit cap100; failed
Drift falls back to legacy retryTransientDb+30s timeout; outer error =>artists[].
Legacy: user did OR handle(readDb), heard userArtists; empty heard exits. Loved
track IDs from primary db, artist genres weighted by scrobbles plus50 per liked
artist genre (first200tracks), >=5% total/top10. Top50 neighbours shared distinct
artists/heard count. Neighbour unseen artists500rows, decayed sum(exp(-.02 age)),
score=max(similarity*playScore) per artist, extra heard-set filter beyond500 SQL
cap. Genre prefilter (Various Artists excluded). Main85% and serendipity15% tail,
DB genre supplements excluding first2000heard+full heard-set and alreadyReturned.
Source serendipity supplement DOES NOT exclude serendipity tail IDs, only main
alreadyReturned set, so duplicates possible and must preserve. Hydration builds
candidateMap last-wins and iterates IDs (duplicates preserved), authoritative
genres filter, Various Artists drop, optional uri/picture omitted, genres[].
Remaining6: Index, Uploads.App, Users.App and3 recommendation handlers. Then
complete source/FFI audit, wiring, bundles and broad regression. Goal incomplete.

## Continuation checkpoint — shared recommendation pipeline

Goal ACTIVE.334 mapped/6 missing still; no actual recommendation handler yet.
150 XRPC handlers.50 JS behavior suites. New shared pipeline/cache builds cleanly
and test:recommendation-common passes. Broad Fetch.URL dependent build reports
only8 inherited Charts.GetScrobblesChart warnings; subsequent incremental clean.

Added Lib.ResultCache PureScript bounded LRU cache with atomic claim, shared AVar
pending lookups, cached success/failure, TTL measured from completion, inclusive
expiration boundary matching Effect.Cache (expires only when now > expiry).
Lookup runs in fork so callers await same result. Separate from existing QueryCache,
whose failures are intentionally evicted (other handlers depend on that).
Verified local ../node_modules/effect/src/internal/cache.ts for result/failure TTL
and LRU behavior. Remaining audit nuance: Effect.Cache lookup is leader-owned and
interrupts deferred/clears entry on leader interruption; ResultCache currently
forks independently and completes/cache-fills if caller is canceled. Also source
can reinsert an evicted pending result on completion; new cache generation-guards
against stale reinsertion. Decide exact parity before full audit completion.

Added Xrpc...Feed.RecommendationCommon: did|limit default50 key, final-pipe decode,
uncapped limit in key but lookup caps100, DRIFT_URL optional, absolute URL path
resolution, did/limit URL params,3s AbortSignal, non2xx/JSON/network failures fall
back to legacy30s timeout+transient retry.200entries/5min cache instantiated once;
outer errors logged and supplied empty response. Fetch.URL.resolve wraps only
new URL(path,base). No application logic FFI.
Tests LRU touches/eviction, shared pending, cached failures, completion TTL/boundary,
key defaults/pipes/distinct overcap limits, Drift URL/limit, fallback and cached
legacy error =>empty. No live services. Other files preserved; no commits.

Next implement GetArtistRecommendations from already-read full TS source using
RecommendationCommon.cached/register. Previous checkpoint has algorithm details.
Then album/track handlers, Users.App, Uploads.App, Index and full audit/bundling.

## Continuation checkpoint — artist recommendations

Goal ACTIVE.335 mapped/5 missing.151 XRPC handlers/23 groups.51 JS suites.
Build warning-free; new test:artist-recommendations, shared recommendation test,
and real-lexicon XRPC registration/REST guard suite pass. No live services/commits.

GetArtistRecommendations complete: readDb user by DID/handle, heard artists,
primary-db loved tracks, weighted genre profile(5%/top10,+50liked), parallel genre
queries, neighbour overlap/decayed plays, max score per artist with insertion-order
tie preservation and complete heard-set filtering beyond SQL500 exclusion cap,
genre prefilter, main85%/serendipity15%, random DB supplements with2000heard SQL cap
and full Set exclusions, source duplicate serendipity-tail quirk retained. Hydrate
last-wins candidate map while preserving duplicate IDs, Various Artists+authoritative
genre filtering, sparse uri/picture and genres[]. Shared Drift/cache registered once.
Tests weighted/liked profile, no-history/user error, score maxima, beyond500heard,
random supplements and limits,200liked cap, duplicate-tail score override, response.

Resolved prior ResultCache cancellation audit note: generalBracket owns first
lookup, cancellation kills shared AVar and removes key so next lookup recovers;
no independent fork. Completed results reinsert even if evicted pending, matching
local Effect.Cache. Added cancellation regression; shared tests still pass.

Read getAlbumRecommendations.ts lines95–280 (not rest yet). Album pipeline starts
user, parallel heard album IDs +track albumURI fallback, top200 userArtists ordered
scrobbles; familiar null->0 (unlike artist handler null->1), loved primary DB then
same weighted/liked genres; known artist IDs->URIs excluding Various Artists;
PoolA albums by known artist URI excluding ALL heard album IDs AND URIs,500limit;
score by familiarity map lookup using URI->artistID, source known-artist.
Need read entire remaining album source before implementation. Could reuse exported
artist genreProfile by converting null familiarity to0 for albums. Do not infer
other pools. Remaining5: album recommendations, track recommendations, Users.App,
Uploads.App, Index. Then full mapped-source/FFI audit, entrypoint bundle/regression.

## Continuation checkpoint — album recommendations

Goal ACTIVE.336 mapped/4 missing.152 XRPC handlers/23 groups.52 JS suites.
Build warning-free. New album recommendations suite, artist regression and real
lexicon registration/REST guard suite pass. No live services or commits.

GetAlbumRecommendations: parallel heard album IDs and track albumURI fallback,
top200 known artists/familiarity(null0), weighted+liked genres reuse artist helper,
known artistURI->ID scores,500 known albums excluding ALL heard IDs+URIs, top50
neighbours ->150 decayed artist rows ->max similarity scores, authoritative genre
filter/Various Artists exclusion only for new artist pool,500 new albums excluding
heard plus poolA IDs, stable merged descending sort/dedup/toplimit. Hydrate removes
Various Artists but deliberately does NOT genre-filter known artist albums, as TS.
Optional fields omitted and year0 preserved. Shared Drift/cache wired once.
Tests history ID+URI SQL, known URI familiarity mapping,0null familiarity, genre
filter, no profile admits untagged artists, pool dedup, score/source, sparse output.

Read full remaining getRecommendations.ts this turn; no Track handler edits yet.
Key differences from Artist handler:
- Heard distinct scrobble track IDs PLUS primary-db loved IDs form exclusion Set.
- Artist profile distinct scrobble artists ordered decayed plays limit200; empty
  exits. Genres from userArtists innerJoin artists ordered scrobbles limit200,
  null scrobbles->1; liked artist genre +50 first200tracks. top10 >=5% as others.
- Neighbours50 overlap. Primary-db neighbour-loved tracks excludes ALL excluded
  IDs. Neighbour scrobble tracks500 rows with SQL excluded first500 and full Set
  JS exclusion. Score max(similarity*decayed*5 if that neighbour loved), update
  source social/neighbour alongside winning score. Add neighbour-loved tracks
  absent from scoreMap at similarity*5 even score0, but not heard/loved by user.
- Genre-prefilter track pool via joined artists.genres, Various Artists drop.
  Main limit-ceil(limit*.15), sorted; supplement genre-matched random tracks joined
  artists with SQL excluded first500, limit needed*5, JS full Set+alreadyPicked.
- Serendipity: distinct neighbour artists not user's profile, count desc limit150,
  artist genre filter(allow all if no profile)+Various Artists drop, resolve URIs,
  random tracks by those URIs excluding ALL IDs, limit serendipityCount*3, exclude
  main IDs and take count. No extra supplement. Scores0/source serendipity.
- Hydrate parallel readDb tracks leftJoin artists/albums and primary-db like counts.
  Build last-wins maps, retain candidate order/duplicates then Various Artists and
  authoritative genre filter. Sort score descending, partition first per artistUri
  (null fallback trackID) vs overflow, concatenate both (all entries retained,
  so diversity is prioritization, not removal). Presentation omits ID, title/artist/
  album/art/trackUri/artistUri/albumUri nullable omitted; genres[], score/source,
  likesCount Number count default0. Same shared Drift/cache default50/max100.
Remaining4: track recommendations, Users.App, Uploads.App, Index. Then complete
source/FFI audit, entrypoint wiring/bundles and broad regression. Goal incomplete.

## Continuation checkpoint — track recommendations

Goal ACTIVE.337 mapped/3 missing.153 XRPC handlers/23 groups.53 JS suites.
Build warning-free; new test:track-recommendations and real lexicon registration/
REST guard suite pass. All3 recommendation handlers now wired. No live calls.

GetRecommendations: complete source legacy algorithm and shared Drift/cache.
Scrobbled+loved exclusions, recency artist profile200, weighted/liked genre profile,
neighbour50 scoring max with5x loved boost and matching source label, loved-only
candidates (including score0), full JS exclusions beyond SQL500 slice, genre pool
filter, random supplement needed*5, new-neighbour-artist serendipity150 ->genre/URI
resolution ->random tracks count*3 excluding all history and main IDs. Parallel
track hydration/readDb and primary-db likes, sparse output/no ID, authoritative
artist genres, Various Artists drop, unique-artist-first then overflow (no loss).
Tests winning score/source, social boost, loved-only, heard/loved exclusion beyond
500 SQL cap, supplemental random limits, serendipity genre/URI, nullable fields,
string SQL like count conversion, diversity order and null-artist groups.

Read uploads/app.ts first160 lines only; no Uploads.App edits yet. It contains
MIME signature detection (prefix ID3/MPEG/fLaC/OggS/RIFF/FORM; ftyp at4), metadata
SHA256 lower title-artist-album, content buffer SHA256, cover MD5 lower albumArtist
-album, managed S3 client from env, auth split space second token trimmed rejects
empty/'null', verifyToken then primary DB user by DID limit1. Existing Uploads
Analysis/DeleteService/Replaygain and Tracks.Service, Storage.App, Typesense.Library
are ported. Need read rest of uploads source; do not infer pipeline/routes.
Remaining3 source modules: Uploads.App(1062lines), Users.App(1903), Index(722).
Then full mapped-source/FFI audit, final wiring/bundle and broad regression.

## Continuation checkpoint — upload validation

Goal ACTIVE.337 mapped/3 missing; Uploads.App not created yet.153 handlers.
54 JS suites. Build warning-free; test:upload-metadata passes. No live services.

Added Uploads.Metadata pure validation: magic byte detection via first8buffer
bytes, MIME/cover extension maps, metadata/content hashes+coverMD5, NO_TAGS vs
INCOMPLETE_METADATA, UTF16 bounds/trim, duration round+native TLEN parseInt fallback,
album art required, albumArtist fallback/limit, disc0/missing->1, date with '-' only
(date takes nullish precedence over originaldate), gain tag presence including0.
Source malformed TLEN produces NaN, which passes duration<1 check; preserved/tested.
Raw music-metadata parseUploadBuffer binding preserves arrays/native tags; existing
parseBuffer binding normalizes lyrics/picture and is unsuitable for this route.
Raw binding preserves source actual two-argument call parseBuffer(buf,{mimeType,
duration:true}) (unlike normalized binding's third duration option). Tests raw PCM
WAV parser, format signatures, tag limits, TLEN, defaults, hashes and NaN parity.

Read ENTIRE uploads/app.ts over this turn. Next implement app/pipeline, may split
helpers into Uploads modules. Pipeline details first520lines in source, important:
- auth second header token trim, no scheme validation; empty/'null'->null; verify
  failures propagate. multipart failure400 text; missing file400 NO_FILE.
- parse/validate422. Replaygain before dedup if no dB; hash STORED bytes; duplicate
  user+r2key409. Metadata hash tracks lookup. Cover upload even if existing track,
  managed covers bucket, failures warn+continue. Unsupported image format silently
  no cover. If no track requireAgent/createAgent else401 after cover; saveTrack
  payload source raw fields incl common.lyrics ARRAY (not normalized string), then
 3s delay. Requery track by SHA. resolveStorageClient(userId,form provider/null),
 PUT metadata userId/trackId/encoded originalFilename. Insert returning upload.
 fireforget audio analysis if any key/bpm/fingerprint missing; fireforget Typesense
 document. Track schema lacks year: optional runtime lookup omission as prior script.
- GET / list q Typesense search->primary DB join uploads+tracks leftalbums, preserve
 search order; otherwise albumURI precedence else albumArtist+albumName filter,
 sort trackNo/title/artist if album else title/artist, size Number||50 cap200,
 offset Number||0. /count scoped count::int, anonymous JSON401 (others text401).
 /albums group albumArtist+album aggregates max art/URIs,count uploads; /artists
 group albumArtist maxURI,countuploads,countdistinctalbums; lowercase LIKE optionalq.
- /stream-token crypto20byteshex TTL cast86400 else3600 Redis stream:token=userID.
 OPTIONS /:id/stream CORS204; GET token query takes precedence (invalid token does
 NOT fall back to bearer); owner scoped upload; **source streaming always managed
 S3 bucket/client even BYO upload** preserve; Range ->206 headers, Body webstream,
 missing Body500. No presigned URL route despite unused getSignedUrl import.
- /queue GET state JSON list->owned upload/track join map order duplicates preserve,
 missing IDs dropped, songURI null->"", currentIndex unchanged. Empty=>0.
 PUT validates Array uploadIds (not element types) and numeric currentIndex, upsert
 JSON string, updatedAt only conflict update.
- deletes /album via album filter(400missing), /by-track/:trackId first owner match,
 /by-album/:albumId albumTracks join, /:id first owner match; purgeUploads existing
 service. Single missing404; empty album returns deleted0; all owner scoped.
Remaining3: Uploads.App, Users.App, Index; full audit/wiring/bundles after that.

## Continuation checkpoint — upload library routes

Goal ACTIVE.337 mapped/3 missing, Uploads.App still absent.153XRPC/55JS suites.
Build warning-free; new upload-library and existing Typesense suites pass.
No live calls/commits. Existing unrelated files preserved.

Added Uploads.Library.register(ctx,app): GET / listings with album URI precedence
or artist+name fallback, numeric limit/offset, search Typesense then scoped full
DB hydration preserving relevance; GET/count JSON401 special case; /albums and
/artists aggregates/group/order/search; GET/PUT queue preserving duplicates/order,
missing uploads removed, nullsongURI->empty, currentIndex unchanged except empty0;
PUT accepts any array elements and numeric currentIndex as source, updatedAt only
upsert set. DELETE /album,/by-album/:albumId,/by-track/:trackId,/:id scoped queries
and existing purgeUploads service; missing filter400, missing single404,emptyalbum0.
Shared Rest.resolveUser bearer semantics match source. Auth failures propagate.
Tests listing SQL/order/scopes, fractional pagination, Typesense ordering +negative
page calculation, aggregates, queue duplicates/sparse data/body types, all anonymous
guards and authenticated deletion preconditions. Actual deletion service already
has own tests; these tests don't delete external objects.

Typesense.Library gained searchLibraryTracksNumber for Number pagination used by
uploads; existing Int API delegates. Source Math.floor(offset/perPage)+1 replaces
old Int division (difference for negative offsets); sparse document presentation
unchanged. This retains source numeric behavior without truncating route params.

Next: Uploads.Stream register token/options/stream routes (source detailed prior
checkpoint), Uploads.Ingest POST pipeline then full Uploads.App assembly. Need add
Hono.options binding (primitive method wrapper), Aws.S3 ranged raw get/body webstream
primitive if absent. No pipeline/dependency stubs created. Full uploads source
was read in previous turn; detailed source behavior recorded above.
Remaining3 source modules Uploads.App, Users.App, Index. Then full audit/wiring/
bundles and broad regression. Goal still incomplete.

## Continuation checkpoint — upload streaming

Goal ACTIVE.337 mapped/3 missing (Uploads.App not assembled).153XRPC/56JS suites.
Build warning-free. New test:upload-stream and upload-library regression pass.
No live storage/token/service calls, no commits.

Added Uploads.Stream.register(ctx,app) plus injectable registerWith for tests:
/stream-token crypto20bytes hex, cast86400s/default3600s Redis stream:token->userID;
OPTIONS /:id/stream unauthenticated204 exact CORS; GET opaque token precedence over
JWT (invalid token cannot fallback), user/owned upload queries, missing401/404,
managed S3 GET with optional Range, absentBody500, body transformToWebStream,
206 iff nonempty Range, ContentType upload->S3->mpeg fallback, optional length/
ContentRange and exact caching/CORS/accept-ranges headers. Deliberately preserves
source managed-only streaming even if upload has storageProviderId (not a fix).
Added only primitive Hono.options method wrapper and Aws.S3.getObjectRaw SDK call
+transformToWebStream binding; application behavior stays in PureScript.
Tests actual Hono Requests/Responses including byte stream, token TTL/auth scope,
no bearer fallback, ownership,404/500, header precedence, CORS, Range command input.

Next implement Uploads.Ingest POST /track pipeline then assemble Uploads.App
registering Ingest, Library, Stream. Full source already read and prior checkpoint
contains pipeline details. Inspect Tracks.Service.saveTrack signature and raw
lyrics compatibility: MusicMetadata.parseUploadBuffer preserves source array,
while typed Track may expect String; source bypasses schema validator in uploads.
Do not silently normalize source raw payload. Then Users.App and Index remain,
followed by complete parity audit/wiring/bundles/broad regression.

## Continuation checkpoint — complete upload ingestion and app

Goal ACTIVE.338 mapped/2 missing.153 XRPC/57 JS suites. Build warning-free.
All4 upload suites pass (metadata/library/stream/ingest). No live calls/commits.

Added Uploads.Ingest with actual POST pipeline and injectable Operations for
behavior tests; Uploads.App assembles Ingest+Library+Stream. Raw metadata payload
preserves lyrics arrays/extra genre through saveTrack call (source bypasses schema),
nullish MBID precedence incl empty string, ISRCtrim, date/year, cover metadata.
ReplayGain before stored-byte SHA/dedup; covers attempted even existing tracks,
unsupported picture skips, failed cover warns; missing agent401 after cover;
new saveTrack only then3s pace; requery track; managed/BYO resolve+audio PUT with
metadata and contentlength; insert upload+sampleRate; async analysis if any key/bpm/
fingerprint absent; async Typesense sparse document; source final track response.
Added primitive Aws.S3.putObjectWithMetadata for SDK Metadata field.
Tests actual Hono multipart/auth/validation/statuses, retagged-byte hash, duplicate
shortcircuit, cover failure, existing track path, missing agent, source raw payload,
store args/upload row, background failure isolation, analysis skip, SDK metadata
input, assembled-app anonymous guards. Full real save/storage live calls not run.
Uploads app will be mounted when implementing Index (Server is separate XRPC).

Next Users.App: source1903lines,37routes. Only read imports/route inventory and
first65lines this turn, NOT entire implementation yet. Existing Users.Utils and
all service dependencies already mapped. Source imports Drizzle alias/joins,
createAgent, fetchBskyProfile, withLikes, verifyToken, likeTrack/unLikeTrack,
createShout/likeShout/replyShout/unlikeShout, shoutSchema, dedupeTracksKeepLyrics.
Shared shout media columns gifUrl,gifPreviewUrl,gifAlt,gifWidth,gifHeight,facets
must appear in projections AND groupBy.
Routes read: user likes/scrobbles/albums/artists/tracks/playlists; record scrobble/
artist/album/song/playlist detail; artist tracks/albums; user profile; shouts on
artist/album/song/scrobble/user, likes/replies/report/unreport/delete shout;
like/unlike songs by URI and trackID; user stats. Need read bodies before port.
Remaining2 modules Users.App and Index; then complete mapped-source/FFI audit,
entrypoint wiring/bundles and broad regression. Goal not complete.

## Continuation checkpoint — Users library routes

Goal ACTIVE.338 mapped/2 missing; Users.App not assembled yet.153XRPC/58JS suites.
Build warning-free. New test:users-library passes. No live calls/commits.

Added Users.Common numeric query defaults and URI/GET metrics wrapper. Added
Users.Library.register8GET routes: likes raw joined rows didORhandle ordered recent;
scrobbles analytics library.getScrobbles raw; albums/artists/tracks corresponding
library.getTopX plus tags[] overwrite; playlists correlated trackCount numeric;
artist record tracks/albums preserve source artistId==ATURI query (source comment
acknowledges issue), xata_version from join, albums first-ID dedup. Numeric defaults
10/0, fractions/negatives preserved,0/NaN fallback. Tests Hono responses, Axios
request payloads, metrics, DB query/order/pagination, counts and duplicate albums.

Read Users source through line615 this turn. Next detail/profile routes (bodies
read through end profile, first artist-shout beginning):
- scrobble: select scrobbles lefttracks/users uri limit1,404; parallel count(*)
 userTracks and scrobbles by trackID, source counts kept raw SQL value with ||1
 (string"0" stays"0", number0->1). Return spread joined row then id=scrobble.id,
 listeners,count scrobbles overwrites nested scrobbles(!),tags[].
- artist: userArtists leftartists where either URI limit1,404; parallel userArtists
 and scrobble counts artistID; spread artist +id/listeners||1/scrobbles||1/tags[].
- album: userAlbums leftalbums eitherURI limit1,404; albumTracks lefttracks by ID
 ordered trackNumber; parallel userAlbums/scrobble counts; spread album + counts,
 label first track label||"", tracks dedupeTracksKeepLyrics then JS sort on
 snake_case track_number. Source Drizzle returns camelCase, helper reads snake_case
 so missing fields can collapse tracks; preserve actual source behavior.
- song: parallel tracks by URI and userTracks lefttracks by userTrackURI, prefer
 direct row,404; userTracks/scrobble counts; spread track +counts/tags[].
- playlist: playlists leftusers URI (no limit),404; playlistTracks leftplaylists/
 tracks URI, order createdAt, no groupBy. Optional bearer verify failures swallowed;
 withLikes(ctx,tracks,didMaybe), return spread playlist+curatedBy user+tracks.
- profile /:did: optional bearer verify failure propagates; if valid createAgent;
 if agent resolveDidToHandle(did), fetchBskyProfile(did,agent); if handle update
 handle and only returned avatar/displayName, reselect then publish rocksky.user.
 Final lookup user didORhandle limit1 ->404 or raw JSON. All route metrics first.
Shout/mutation source beyond615 still needs reading. Existing service helpers
available. Keep helper routes in separate modules then assemble full Users.App.
Remaining Users.App and Index; full audit/wiring/bundles/regression afterward.

## Continuation checkpoint — Users details and profile

Goal ACTIVE.338 mapped/2 missing; Users.App not assembled.153XRPC/60JS suites.
Build warning-free; test:users-details and test:users-profile pass. No live calls.
Added Users.Details5GET routes: scrobble/artist/album/song/playlist record detail.
Parallel counts with JS truthy ||1 preserve numeric0->1 and string0 unchanged;
source scrobble nested row overwrite retained. Album raw snake-case position dedup
uses existing Utils (camelCase rows collapse with lyric preference as TS), sort
preserves missing NaN comparison and null0. Song direct-track preference with
userTrack alias fallback and falsey missing404. Playlist ordered entries, optional
JWT errors swallowed, withLikes joins/shared SHA semantics and curatedBy.
Tests404s, raw counts, source overwrite/dedup, direct preference, playlist invalid
bearer still200 and like counts/shape. No source quirks silently repaired.

Added Users.Profile GET/:did with injectable ops for tests; optional bearer failure
propagates, caller session then target DID handle/profile lookup; only update if
handle truthy, avatar/displayName sparse including explicitly empty string; reselect
then NATS rocksky.user publication; final didORhandle user read404/rawJSON. Tests
anonymous/no-user, sparse preservation, caller vs target, ordering, emptyhandle and
invalid token. Main operations call existing createAgent/fetchBskyProfile/resolver.

Users.Library8routes +Details5+Profile1 now14routes. Remaining Users shouts/likes/
replies/report/delete/stats routes start source line580 onward. Read only first
artist-shout portion through615 previously; need remaining bodies before coding.
Profile registration should follow record detail/library registrations when
assembling Users.App. Index still absent. Full audit/wiring/bundles afterwards.


## Final implementation and validation — 2026-10-18

All 340 original non-generated/non-test source modules now have mapped targets.
Users.App assembles all 37 routes; Index mounts every REST subapp, installs the
source middleware order (internal submissions before public rate limiting),
starts subscriptions and serves port 8000. All 153 original XRPC handler NSIDs
are registered in 23 groups. Source registration comparisons are automated.
Operational script modules remain runnable through `bin/run.js`.

Final user work: twelve shout/like/reply mutations, eight shout/stats reads,
report/unreport/delete with ownership checks and original deletion sequence.
Tests cover optional bearer failures, GIF/facet projections, author aliases,
caller flags, raw/null fields, agent ordering, missing-track asymmetry and
source response shapes. All user routes use existing PureScript services.

Final REST work: image proxy, durable now-playing submissions and typed guard/
queue failures, playback-state precedence, likes and track saves, public/private
scrobbles, chart selection, catalog lookup and artist-credit filtering. Added
Number pagination to the loved-track service while retaining its Int API.
Tests cover guards/order, malformed input, session expiry, idempotency limits,
submission headers, 429/503 errors, null preservation and streaming image bytes.

Entrypoint validation found and fixed two older issues: Express.Cors had an
import/export identifier collision, and the XRPC materialized-view cron did not
release its dedicated client if SET failed. The latter now uses `finally`, with
failure tests for SET, refresh and VACUUM. Bundles now keep npm dependencies
external: embedding native profiling dependencies compiled but failed at import.
Both generated bundles load with startup omitted, so the smoke test performs no
live connections and opens no listener. Bundles require installed node_modules.

Audit: all mapping targets exist; all original handler NSIDs match runtime
registration; main/user REST route sets match original source; all 87 JS binding
files pass Node syntax checks. No bindings import/delegate to original TS code.
Remaining app FFI is JS runtime interoperability (errors, JSON, AbortSignal,
fetch Request rewriting, process/ffmpeg and SDK references). OAuth application
negotiation and all new route business logic are PureScript. Generated lexicon
TypeScript is replaced by loading original JSON lexicons.

Original source limitations remain intentional: API-key XRPC empty results,
player transport no-ops, cloud download Not implemented yet, and empty player
addDirectoryToQueue. Existing regression tests assert these behaviors; the port
does not invent features absent from TypeScript. Historical checkpoints above
record additional source quirks preserved during implementation.

Validation commands: `bun run test:all`, `bun run bundle`,
`bun run check:bundles`, `bun run audit:port`. The complete regression runner is
now checked in as bin/test-all.js. No deployment, production scripts, live
DB/PDS/NATS/storage requests or commit were performed. Parent workspace edits
remain untouched. README documents startup, dependency and lexicon requirements.

Final results: build passed with zero warnings/errors; 7/7 PureScript specs and
64/64 registered JS regression suites passed together. Both REST and XRPC
bundles rebuilt successfully and passed import smoke checks. Inventory reports
340 mapped / 0 missing. No required implementation or local validation remains.
Live-service integration/deployment is outside this local port verification.
