# Rocksky API in PureScript — conventions

This workspace ports `../apps/api` (TypeScript) to PureScript, targeting
Node.js. Bun is the package manager (`bun install`), spago 1.0 the build tool.

## Layout

```
spago.yaml                 workspace root (package set 81.5.0); no package here
package.json               npm deps (every runtime dependency of apps/api)
packages/<npm-name>/       one spago package per npm dependency (FFI bindings)
  spago.yaml  src/*.purs  src/*.js
packages/drizzle/          copy of ../purescript-drizzle + Drizzle.Builder etc.
api/                       package `rocksky-api`: the application
  src/Rocksky/...          modules mirror apps/api/src paths (see below)
  test/Test/...            purescript-spec tests (spago test)
bin/run.js                 `node bin/run.js Rocksky.Index` runs a module's main
```

Build: `spago build` (whole workspace) or `spago build -p rocksky-api`.
Errors mention the module path, so filter with `grep "api/src/Rocksky/Xrpc"`.

## Module naming (TS path → PS module)

| TS                                        | PureScript                                   |
|-------------------------------------------|----------------------------------------------|
| src/index.ts                              | Rocksky.Index                                |
| src/server.ts                             | Rocksky.Server                               |
| src/context.ts                            | Rocksky.Context                              |
| src/db.ts / src/drizzle.ts / src/sqliteKv.ts | Rocksky.Db / Rocksky.Drizzle / Rocksky.SqliteKv |
| src/lib/foo.ts                            | Rocksky.Lib.Foo                              |
| src/schema/album-tracks.ts                | Rocksky.Schema.AlbumTracks (+ Rocksky.Schema re-exports all) |
| src/types/track.ts                        | Rocksky.Types.Track                          |
| src/xrpc/app/rocksky/actor/getProfile.ts  | Rocksky.Xrpc.App.Rocksky.Actor.GetProfile    |
| src/xrpc/index.ts                         | Rocksky.Xrpc.Index                           |
| src/users/app.ts                          | Rocksky.Users.App                            |
| src/nowplaying/nowplaying.service.ts      | Rocksky.Nowplaying.Service                   |
| src/subscribers/scrobble.ts               | Rocksky.Subscribers.Scrobble                 |
| src/scripts/sync.ts                       | Rocksky.Scripts.Sync                         |
| src/lexicon/**  (generated TS)            | NOT ported: lexicon JSON is loaded at runtime (Rocksky.Lexicon) |

## Effect-TS is not ported

Pipelines like `pipe(x, retrieve, Effect.flatMap(presentation), Effect.retry(transientDbRetry), Effect.timeout("120 seconds"), Effect.catchAll(...))`
become plain `Aff` code using `Rocksky.Lib.Aff`:

```purescript
result <- recoverWith { albums: [] } $ timeoutMs 120000 $ retryTransientDb do
  rows <- retrieve ctx params
  pure (presentation rows)
```

- `Effect.tryPromise` → just `Aff` (errors are `Error` thrown in Aff).
- `Effect.catchAll(err => { consola.error(err); return Effect.succeed(fallback) })`
  → `recoverWith fallback` (logs and returns the fallback).
- `Effect.retry(transientDbRetry)` → `retryTransientDb`.
- `Effect.timeout(d)` → `timeoutMs ms` (throws a timeout Error).
- `Effect.all([...])` → `parSequence` / `parTraverse` from `Control.Parallel`.
- `queryCache(lookup, ttl)` → `Rocksky.Lib.QueryCache.queryCache` (TTL cache
  keyed by the JSON-encoded params, shared in-flight lookups).
- lodash/ramda/zod are replaced by PureScript (no bindings): `R.omit` →
  `Record.delete`, `_.get` → `Rocksky.Lib.Foreign.path`, zod schemas →
  `Rocksky.Types.*` decoders built on `Rocksky.Lib.Validate`.

## Records, nullability and JSON

- DB rows: `Nullable a` for nullable columns (as the drizzle binding does),
  `JSDate` for timestamps. Convert with `Data.Nullable.toMaybe` when needed.
- API responses: build a PureScript record and hand it to the response as
  `Foreign` with `Rocksky.Lib.Foreign.toForeign`. Use `Nullable`, not `Maybe`,
  in records that cross to JS; `Maybe` would be encoded as a PS data value.
  Optional fields the client should not see at all: use `Rocksky.Lib.Foreign.undefined`-
  valued `Nullable` via `Rocksky.Lib.Foreign.omitNulls` (drops null keys).
- Reading request params/bodies: `Rocksky.Lib.Foreign` (`readString`,
  `readInt`, `readNullable`, `path`) or the `Validate` decoders. XRPC params are
  already validated against the lexicon by `@atproto/xrpc-server`, so
  `Rocksky.Xrpc.Util.params :: forall r. HandlerInput -> Record r` coerces them
  (document the record type next to the handler, matching the lexicon JSON in
  ../apps/api/lexicons/**).

## Drizzle

- Tables live in `Rocksky.Schema.<Table>` as `table :: Table Postgres Cols`
  plus `cols = columns table` with the SAME camelCase field names as the TS
  schema. `Rocksky.Schema` re-exports them as `tables.users`-style records:
  `import Rocksky.Schema as T` then `T.users`, `T.usersC.did` (columns).
- Simple selects: `Drizzle.Query` (`select t # where_ c # limit n`, typed rows).
- Everything else: `Drizzle.Builder` (projections, joins, groupBy, subqueries,
  onConflict, aliasTable) with caller-annotated row types.
- Conditions: `Drizzle.SQL` (`eq (toSQL T.usersC.did) (string did)`,
  `andAll [..]` → Maybe SQL, `template ["lower(", ")"] [x]` for sql`` ).
- `ctx.db` is the primary, `ctx.readDb` the replica; keep the TS choice.

## FFI style for bindings (packages/*)

- One module per npm package (sub-modules for sub-paths like `hono/streaming`).
- Promise-returning JS → `Effect (Promise a)` + `toAffE`; expose `Aff`.
- Optional JS fields → `Nullable` in PS, dropped in JS when null.
- Exported FFI names must be valid PS identifiers (no `'`).
- Opaque JS objects → `foreign import data X :: Type`.
- Document each export with the JS call it wraps.

## Comments

Only genuinely non-obvious things; port the TS comments that explain *why*.

## Porting handlers and apps (read before writing any handler)

Reference implementations to copy the style from:
- XRPC handler: `api/src/Rocksky/Xrpc/App/Rocksky/Actor/GetActorAlbums.purs`
  (queryCache + timeoutMs + retryTransientDb + recoverWith, Drizzle.Builder
  projections, groupBy, `SQL.as "play_count" SQL.count`, parallel queries).
- navidrome proxies: `Rocksky.Lib.Navidrome.proxyMethod ctx "getSong" defaultProxyOptions`.
- Hono middleware: `api/src/Rocksky/Ratelimiter.purs`.
- Entrypoint: `api/src/Rocksky/Server.purs`.

XRPC:
- Module per TS file: `xrpc/app/rocksky/actor/getProfile.ts` →
  `Rocksky.Xrpc.App.Rocksky.Actor.GetProfile` exporting
  `register :: Server -> Context -> Effect Unit` (Server from Rocksky.Lexicon).
- Register with `Atproto.XrpcServer.method server "<nsid>" { auth: Just ctx.authVerifier, handler }`.
  Handler returns `Json foreign` / `Failure status message` (HandlerOutput).
  `params input` (Rocksky.Xrpc.Util) coerces the lexicon-validated params to
  the `QueryParams` record you declare from `../apps/api/lexicons/**/<method>.json`
  (optional → `Nullable`). Procedures: `inputRecord input`. Auth DID: `authDid input`.
- Each group writes ONE aggregator `Rocksky.Xrpc.Groups.<Group>` with
  `register :: Server -> Context -> Effect Unit` calling all its handlers.
  The lead wires the aggregators into `Rocksky.Xrpc.Index`; never edit Index.
- Responses must match the TS JSON exactly (field names, camelCase vs snake,
  `deepCamelCaseKeys` where the TS used it, `toISOString` on dates where the
  TS did, omitted vs null: use `omitNulls` where TS produced `undefined`).
- `R.omit(["x"], row)` → `deleteKeys ["x"] (toForeign row)` or Record.delete.

Hono apps:
- `src/foo/app.ts` → `Rocksky.Foo.App` exporting `app :: Context -> Effect Hono.App`.
- `c.json(x)` → `Hono.json c (toForeign x)`, `c.status(401); c.text("Unauthorized")`
  → `liftEffect (Hono.status c 401 *> Hono.text c "Unauthorized")`.
- Bearer auth: `bearerFrom (Hono.reqHeader c "authorization")` (Rocksky.Lib.AuthVerifier)
  then `verifyToken ctx.db bearer`; a thrown verify error must become the
  same response the TS produced (TS let Hono turn it into a 500).
- Metrics: `liftEffect (Metrics.count ctx.metrics "GET" "/route")`.
- `c.req.query("size")` with `+x || 100` → `fromMaybe 100 (reqQuery c "size" >>= Int.fromString)`
  (and 0 → default, matching `||`).

Shared modules already available (import, never recreate): everything under
`api/src/Rocksky/Lib/*`, `Rocksky.Context`, `Rocksky.Schema`, `Rocksky.Types.*`,
`Rocksky.Db`, `Rocksky.Drizzle`, `Rocksky.Lexicon`, `Rocksky.Metrics`,
`Rocksky.Auth.Client` (scopes), `Rocksky.Ratelimiter`, `Rocksky.Lib.Navidrome`.
The previous parallel-port session has ended. There are no active sibling
agents to wait for. Consult `port-inventory.json` and `PORTING.md` for missing
modules and implement real dependencies; never stub missing services.

Build with your own output dir to avoid clashing:
`spago build -p rocksky-api --output output-<you> 2>&1 | grep -E "^\[(ERROR|WARNING)|Build succeeded|Failed" -A12 | head -150`.
Fix all errors and warnings in your files; ignore other people's files.
