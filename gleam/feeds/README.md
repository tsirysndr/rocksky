# Rocksky feed generator in Gleam

`rocksky_feeds` ports `apps/feeds` into the Gleam workspace, targeting Node.js.
The catalog, routing, request validation, pagination, response encoding, and SQL
composition live in Gleam. It has no runtime dependency on the original Deno or
TypeScript service.

Database access uses **Drizzle** through `rocksky_feeds/drizzle` bindings for SQL
fragments, bound values, schema tables, compilation, and execution. Drizzle owns
parameter numbering and executes through its node-postgres adapter. The `pg`
pool is only the transport. The genre query retains the original bounded lateral
scan: select matching artists, fetch at most one page per artist, then select the
newest page across those results.

From the `gleam` directory, after installing the repository's dependencies:

```sh
bun run build:feeds
bun run feeds
# Start the previously compiled service:
bun run prod:feeds
```

The entrypoint is `feeds/main.mjs`. It loads `.env` from the working directory,
starts optional OpenTelemetry, then imports the compiled Gleam package. Building
the workspace does not start the service or open a database connection.

## Configuration

| Variable | Behavior |
| --- | --- |
| `ROCKSKY_FEEDGEN_DOMAIN` | Public hostname; defaults to `localhost` outside production; required in production |
| `ROCKSKY_FEEDGEN_PORT` | HTTP port; defaults to `8002` |
| `XATA_READ_POSTGRES_URL` | Preferred read-replica URL |
| `XATA_POSTGRES_URL` | Primary URL when no replica is configured; a local development URL is used outside production |
| `COMMIT_SHA` | Health response version; defaults to `unknown` |
| `OTEL_ENABLED` | Set to `true` to enable the Node OpenTelemetry SDK |
| `OTEL_DENO` | Existing `true` setting also enables telemetry for migration compatibility |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Standard OTLP collector endpoint; setting it enables telemetry |
| `OTEL_SERVICE_NAME` | Defaults to `rocksky-feeds`, with namespace `rocksky` |
| `OTEL_SDK_DISABLED` | `true` disables exporters |

Pool limits match the source service: 20 connections, 30-second idle timeout,
5-second connection timeout, 60-second statement timeout, and 30-second idle
transaction timeout. SIGINT/SIGTERM stop HTTP acceptance and close the pool and
telemetry exporters. This service does not create tables or run migrations.

## Compatibility

- All 52 feed URIs and their order are retained under publisher
  `did:plc:vegqomyce4ssoqs7zwqvgqty`, including exact genre names such as `r&b`.
- Discovery: `/.well-known/did.json` and
  `/xrpc/app.rocksky.feed.describeFeedGenerator`.
- Skeletons: `/xrpc/app.rocksky.feed.getFeedSkeleton?feed=<at-uri>&limit=50`.
- Health: `/xrpc/_health`, with the original root welcome text.
- Responses retain the actual service's `{feed: [{scrobble}], cursor?}` shape,
  even though its generated legacy lexicon declares `scrobbles` instead.
- Cursors remain epoch milliseconds with strict timestamp-less-than pagination;
  ties at the boundary retain the source service's behavior. Empty pages omit
  the cursor. The global feed retains nullable URIs; genre feeds exclude them.
- `offset` is validated but ignored, matching the source. There is no newly
  imposed maximum limit. Genre feeds ignore unparseable cursors; the global
  feed returns `InvalidRequest` for an invalid cursor instead of passing an
  invalid date to the database.
- Authentication remains optional. Bearer tokens use AT Protocol signature and
  expiry verification; audience and method checks remain disabled as in the
  source. Invalid tokens fall back to anonymous access. No algorithm currently
  requires authentication. Token previews and caller DIDs are not logged.

The Node SDK replaces Deno's built-in telemetry, preserving feed, HTTP, and
PostgreSQL metric names, spans, incoming W3C trace context, and error logs.
Telemetry excludes credentials, caller DIDs, URL query strings, and bound SQL
values. Unknown HTTP paths share one metric label to bound cardinality.

## Tests

```sh
bun run test:feeds
# With initdb and pg_ctl installed, run against a disposable local cluster:
sh feeds/test/postgres-smoke.sh
```

The default suite tests source-catalog parity, routes, validation, optional auth,
Drizzle query construction, timestamp decoding, telemetry, and an actual local
HTTP listener. The PostgreSQL case is enabled by `FEEDS_TEST_DATABASE_URL`;
it creates temporary tables in a transaction and rolls them back. The smoke
script creates and removes its own temporary cluster and never connects to the
application database. Both suites need permission to open local sockets.
