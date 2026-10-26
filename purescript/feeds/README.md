# Rocksky feed generator

PureScript port of `apps/feeds`, targeting Node.js >=22.15 in this workspace.
All 52 algorithm definitions, query selection, pagination, optional-auth policy,
configuration, and HTTP handlers live in `src/Rocksky/Feeds/`.

From `purescript/`:

```sh
bun install
bun run build:feeds
bun run start:feeds
bun run test:feeds
bun run bundle:feeds
# Alternatively, run the bundle with workspace npm dependencies available:
node feeds/dist/index.js
```

The entrypoint loads `.env` from the current directory. Configuration:

| Variable | Development default / behavior |
| --- | --- |
| `NODE_ENV` | `development`; also accepts `test` and `production` |
| `ROCKSKY_FEEDGEN_DOMAIN` | `localhost`; required in production |
| `ROCKSKY_FEEDGEN_PORT` | `8002`; required in production |
| `XATA_POSTGRES_URL` | `postgresql://postgres:mysecretpassword@localhost:5433/rocksky?sslmode=disable`; required in production |
| `XATA_READ_POSTGRES_URL` | Preferred when nonempty; otherwise use `XATA_POSTGRES_URL` |
| `COMMIT_SHA` | `unknown`; exposed by the health endpoint |
| `OTEL_ENABLED` | Set `true` to start the Node OpenTelemetry SDK |
| `OTEL_DENO` | `true` also enables the Node SDK, for compatibility with existing deployment settings |
| `OTEL_SERVICE_NAME` | `rocksky-feeds` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318`; per-signal endpoint variables override it |

The service exposes `/`, `/xrpc/_health`, `/.well-known/did.json`,
`/xrpc/app.rocksky.feed.describeFeedGenerator`, and
`/xrpc/app.rocksky.feed.getFeedSkeleton`. Discovery preserves the publisher DID,
algorithm order, and every original feed URI. Skeletons return
`{ feed: [{ scrobble: uri }], cursor? }`, matching the running source handlers
(the source's generated lexicon output types are stale).

`Query.purs` uses the workspace's **Drizzle bindings** and shared
`Rocksky.Schema.Scrobbles` / `Rocksky.Schema.Artists` tables. The all feed uses
the typed query builder. Genre feeds use parameterized Drizzle SQL with the
same bounded `LATERAL` query as the original. Pool sizing, replica preference,
query timeouts, and the `rocksky-feeds:replica` application name are preserved.
This read-only service does not create tables or apply migrations.

Pagination defaults to 50 rows and uses an exclusive timestamp cursor. The
accepted `offset` parameter remains unused, matching the source. Invalid
cursor strings fail for the all feed and are ignored by genre feeds. Only
genre feeds filter null scrobble URIs. Timestamp ties have the same pagination
limitations as the original service.

Bearer JWTs are signature-verified through the AT Protocol library. As in the
source, authentication is optional, invalid tokens become anonymous, and no
audience or lexicon-method restriction is imposed. All current feeds are public.
Tokens are not printed in error logs.

FFI covers JWT verification, cursor number conversion, Node lifecycle, and
OpenTelemetry adapters. Node replaces Deno's server and built-in telemetry;
the workspace SDK supplies OTLP export and HTTP instrumentation. Feed and SQL
spans and metric names are preserved. SQL bound values and caller DIDs are not
added to custom telemetry attributes. SIGINT/SIGTERM close the HTTP server,
database pool, and telemetry exporter.

Tests exercise HTTP contracts, all source algorithm mappings, real Drizzle SQL
generation and row decoding, optional authentication, errors, and telemetry
adapters. To also execute both query paths against PostgreSQL:

```sh
TEST_FEEDS_DATABASE_URL=postgresql://... bun run test:feeds
```

That test creates connection-local temporary `artists` and `scrobbles` tables;
they disappear when the connection closes. It does not modify application tables.
