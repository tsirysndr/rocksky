# rocksky-appview

A self-hostable Rocksky, as one binary.

It serves the same `app.rocksky.*` XRPC surface as `apps/api`, over SQLite by
default, with the web UI compiled in. Nothing else has to be stood up first:
point it at an empty directory and it creates its databases, generates its
signing key, writes a starter `config.toml` and starts listening.

This does not replace `apps/api`. The TypeScript API keeps running unchanged —
this is an alternative deployment shape for people who want to run their own
instance rather than operate a Postgres cluster and eight companion services.

```sh
docker compose -f crates/appview/docker-compose.yml up --build
```

```
    ____             __        __
   / __ \____  _____/ /_______/ /____  __
  / /_/ / __ \/ ___/ //_/ ___/ //_/ / / /
 / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /
/_/ |_|\____/\___/_/|_/____/_/|_|\__, /
                                /____/
```

Then open <http://localhost:3004> and sign in with your ATProto handle.

## What it needs

| dependency | required | what breaks without it                                     |
|------------|----------|------------------------------------------------------------|
| SQLite     | built in | —                                                          |
| NATS       | **yes**  | the scrobble mirrors, the Spotify poller and the playlist importer never fire |
| Typesense  | **yes**  | the search box, and search over your own uploads           |
| Redis      | no       | nothing — the response cache falls back to an in-process map |
| Postgres   | no       | nothing, unless you point it at an existing Rocksky database |

Both required dependencies default to a local server on its standard port,
which is what `docker-compose.yml` provides — so "required" costs nothing when
you use that file, and is a clear failure at boot when you do not:

```
Error: cannot reach NATS at nats://127.0.0.1:4222: Connection refused.
NATS is required — the Spotify poller, the scrobble mirrors and the playlist
importer all learn about changes through it, so an instance without it would
silently stop half the system. Start one (the docker-compose file includes it)
or point [events].nats_url at yours.
```

They are required rather than optional because neither has a working
substitute. An earlier version treated Typesense as an accelerator with a
"SQLite FTS fallback" that did not exist: `GET /uploads?q=` answered 501 and the
search box returned nothing. A dependency that is declared optional but has no
alternative is just an unreported outage.

## Running it

The compose file at the top is the short path: it brings up the two required
dependencies and points the appview at them. Its image builds from source in
three stages — the web UI with bun, the binary with cargo, then a slim runtime
that carries neither toolchain. The first build compiles the whole dependency
graph and is slow; after that the BuildKit cache mounts keep a rebuild down to
seconds.

To run the binary outside a container, the dependencies have to exist first:

```sh
docker run -d -p 4222:4222 nats:2-alpine
docker run -d -p 8108:8108 typesense/typesense:27.1 \
  --data-dir=/tmp/typesense --api-key=rocksky

cargo run --release -p rocksky-appview
```

Both default to those addresses, so nothing needs configuring. Point them
elsewhere with `NATS_URL` and `TYPESENSE_URL`.

### Against an existing Rocksky database

```sh
rocksky-appview --database-url postgres://user:pass@host/rocksky
```

It reads and writes the Postgres schema but never migrates it: those migrations
belong to `apps/api`'s drizzle setup. A read replica is used for the queries
that tolerate lag when `APPVIEW_DB_READ_URL` is set.

On first boot against a populated database, the search collections are created
and filled from it, so search works without an import step.

### Keeping existing sessions

The OAuth session store is byte-compatible with the one `apps/api` writes.
Point `[database].auth_url` at an existing `atproto.sqlite` and everyone stays
signed in — no one has to log in again. This is verified against a copy of the
production session database by an `#[ignore]`d test; see
`tests/oauth_interop.rs`.

## Configuration

Four sources, highest precedence first:

1. command-line flags (`--help`)
2. environment variables
3. `<data-dir>/config.toml`
4. built-in defaults

Every key is optional. The generated `config.toml` is entirely commented out,
so the file as shipped changes nothing.

```sh
rocksky-appview --print-config   # the resolved configuration, secrets redacted
```

The environment variable names are `apps/api`'s, so an existing `.env` works
unchanged — including `ROCKSKY_XPRC_PORT`, which is misspelled in `server.ts`
and accepted here for that reason.

A `.env` in the working directory is loaded, which is worth knowing when
running from a checkout of this repository: the one at the root points `NATS_URL`
and the Typesense key at the deployed instances, so a local run picks those up
rather than the defaults. `--print-config` shows what actually resolved.

### Logging in

Two ways, and which are available depends on whether `domain` is set:

| `domain` | OAuth client   | refresh tokens | good for                |
|----------|----------------|----------------|-------------------------|
| unset    | loopback       | short-lived    | local use               |
| set      | confidential   | long-lived     | a real deployment       |

With `domain` set, an ES256 keyset is generated into `oauth-keys.json` on first
boot and published at `/jwks.json`, and the client authenticates with
`private_key_jwt`. Keep that file: losing it signs every OAuth user out.

App-password login (`POST /login`) works either way, including on localhost.

## Filling the database

Three sources, and they can all be used together — the projection is keyed on
content hashes, so a record arriving twice updates a row rather than
duplicating it.

| source            | what it does                                             |
|-------------------|----------------------------------------------------------|
| `--backfill`      | downloads each configured repository's CAR and ingests every `app.rocksky.*` record, then exits |
| Tap               | a verified, filtered, backfilling firehose consumer — the recommended way to stay current |
| Jetstream         | the firehose directly, when you would rather not run Tap |

```sh
# your full history, from your own repository
rocksky-appview --backfill
```

Safe to re-run: it is how you recover from a wipe or a schema change.

### What records do not carry

A record describes the thing it is about and nothing it references: a scrobble
names its artist and album but carries no artist picture, and an album row
created from a record that had no cover has no art. So an instance filled from
the firehose alone shows a lot of grey squares and nameless accounts.

Three background sweeps fix that, on a timer, from whatever is already to hand
first and `https://api.rocksky.app` second:

| sweep                     | fills                                     |
|---------------------------|-------------------------------------------|
| `profiles`                | handles, display names and avatars, from each account's PDS |
| `enrich::albums`          | album art — from the album's own tracks where possible, then the API |
| `enrich::artists`         | artist pictures, and genres where the API has them |

The API is rate limited, and both `enrich` sweeps share **one** request budget
because they talk to the same service: one batch every 20 seconds, alternating.
A large instance therefore takes hours to fill in — tens of thousands of rows
at a few dozen per batch — which is fine, since a missing cover renders a
placeholder rather than an error. The count still outstanding is logged at
startup.

Set `ROCKSKY_ARTIST_METADATA_URL` to point the sweeps somewhere else, or to
empty to switch them off. Pointing them at this instance is detected and
ignored.

### The search index

Typesense is a projection of the database too, and it is rebuilt the same way:
in the background, on boot, for any collection whose document count is
materially behind its table. That covers being pointed at a database this
binary did not fill, and it repairs an index whose build was interrupted —
which "was the collection just created?" cannot.

It is **not** built before the server binds. Importing a large catalogue is
hundreds of thousands of documents; done inline the container looks hung for
minutes, and if it is killed in that window the next boot starts over. The
import is also paced against Typesense's own write queue: `GET /health`
answers `{"ok":false}` while it is behind, and the backfill waits rather than
piling on — that reply is what a container healthcheck reads, so outrunning it
is how a healthy server gets declared dead.

## The surface

```
GET  /healthz                        runs a query, not just a 200
GET  /xrpc/app.rocksky.*             the XRPC API
POST /login                          app-password login
GET  /login?handle=…                 OAuth login
GET  /oauth/callback
GET  /client-metadata.json           confidential-client metadata
GET  /jwks.json
GET  /profile
GET  /uploads                        your library; ?q= searches it
POST /uploads/track                  add a file
GET  /uploads/{id}/stream            range-aware audio streaming
GET  /uploads/stream-token           a streaming-only credential for <audio>
GET  /apikeys, /access-tokens        credentials
GET  /storage/providers              bring-your-own S3
GET  /                               the web UI
```

Audio is streamed *through* the server rather than by redirecting to the
bucket, so object URLs and storage credentials never reach the browser. That is
also why `/uploads/{id}/stream` takes an opaque token as a query parameter: an
`<audio>` element cannot send an `Authorization` header, and putting a
full-privilege bearer token in a URL would leak it into history and logs.

### Coverage

The lexicons declare 151 methods. A test enumerates the registered routes and
reports which are served, so the number in this README cannot drift from
reality:

```sh
cargo test -p rocksky-appview --test lexicon_coverage -- --nocapture
```

Unimplemented methods answer 404 rather than a plausible-looking empty result.

## The crates

```
rocksky-core              343   the content hashes and timestamp format
rocksky-db              5,123   models, dialect layer, RSQL, sea-query schema
rocksky-lexicon        11,034   generated from the lexicon JSON
rocksky-atproto         1,616   DID resolution, CAR read/write, MST, records
rocksky-audio             759   tags, loudness, ReplayGain
rocksky-lexicon-codegen 3,202   lexicon JSON -> Rust, incl. actix handlers
rocksky-mock-pds        2,416   an in-memory PDS with real CAR/MST, for tests
rocksky-appview        29,498   the server
```

`rocksky-core` sits at the bottom and depends on nothing in this list, so the
graph is acyclic and the SDK and the players can use the pieces they need
without pulling in a web server.

### Regenerating the lexicon types

```sh
cargo run -p rocksky-lexicon-codegen            # regenerate
cargo run -p rocksky-lexicon-codegen -- --check  # fail if drifted
```

The generator formats its own output, so `--check` compares like with like — it
used to report all 190 files as drifted the moment anyone ran `cargo fmt`.

Lexicon JSON is itself generated. Edit `apps/api/pkl/defs/**.pkl` first.

## Two backends, one query

Queries are built with [sea-query] and rendered by `Backend` for whichever
database is live, so a handler never names a dialect:

```rust
let mut query = Query::select();
db.select_model(&mut query, TRACK_COLS, Some("t"));
query.from_as(Tracks::Table, Alias::new("t"))
     .and_where(Expr::col((Alias::new("t"), Tracks::Sha256)).eq(&hash));

let tracks: Vec<Track> = db.fetch_all(&query).await?;
```

The `Iden` enums in `rocksky-db`'s `schema` module are generated from the
migration and checked against it by a test, so a column that is renamed in the
schema and not here stops compiling rather than producing a query that fails at
runtime.

Two things genuinely differ between the backends and are handled centrally:
Postgres needs casts for columns whose native type will not decode into the
Rust field (`int4` into `i64`, `text[]` into a `String`), and timestamps are
ISO-8601 text on SQLite against `timestamptz` on Postgres.

[sea-query]: https://github.com/SeaQL/sea-query

## Tests

```sh
cargo test --release -p rocksky-appview
```

They run against real things wherever a fake would prove less:

| what                    | how                                                   |
|-------------------------|-------------------------------------------------------|
| SQLite                  | in-memory, per test                                   |
| a PDS                   | `rocksky-mock-pds`, with real CAR and MST encoding    |
| object storage          | MinIO in Docker                                       |
| audio                   | real files, including ones with no embedded cover art |
| search                  | a real Typesense, gated on `ROCKSKY_TYPESENSE_URL`    |
| session interop         | a copy of the production auth database, `#[ignore]`d  |

Doing it that way found four upload bugs, two session-interop bugs, a schema
bug and a race in the search index setup that a mocked test would have passed.

The Typesense tests are environment-gated rather than `#[ignore]`d, because an
ignored test is one nobody runs:

```sh
docker run -d -p 8108:8108 typesense/typesense:27.1 \
  --data-dir=/tmp/ts --api-key=rocksky
ROCKSKY_TYPESENSE_URL=http://127.0.0.1:8108 \
  cargo test --release -p rocksky-appview --test search
```

## Differences from `apps/api`

Deliberate, and each one is a case where reproducing the TypeScript behaviour
would have meant reproducing a defect.

- **A malformed `filter` is a 400, not an empty list.** `apps/api` wraps its
  handlers in `Effect.catchAll` and answers `{ "scrobbles": [] }` for anything
  that goes wrong, so an unparseable RSQL expression is indistinguishable from
  a valid one that matched nothing. Transient database failures still answer
  empty, as they do upstream.
- **Uploads write their catalogue rows directly.** `apps/api` publishes the
  ATProto records and then polls its own database for up to fifteen seconds
  waiting for the firehose indexer to write them back, failing the upload if
  they never arrive. That assumes an indexer is always running; here the sync
  source is optional, so the rows are projected locally and the records
  published afterwards.
- **`GET /uploads?q=` returns the same row shape as `GET /uploads`.**
  Upstream, the search path answers with a narrower object than the listing —
  the same endpoint returning a different shape depending on whether a search
  box had text in it.
- **An API-key update cannot rewrite the key.** `PUT /apikeys/{id}` upstream
  passes the request body to `set()`, which lets a caller overwrite
  `api_key` and `shared_secret` through an endpoint meant for renaming.

Bugs found in `apps/api` while porting are listed in the commit messages rather
than fixed here.

## What is not implemented

- The legacy REST surface, deliberately. `/xrpc/*` is the API.
- Dropbox and Google Drive, out of scope for this crate.
- The remaining XRPC methods listed by the coverage test above.
