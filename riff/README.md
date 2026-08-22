# riff

A **read-only Spotify Web API served straight from Parquet**.

Rocksky keeps a full Spotify catalog dump as Parquet files. riff puts DuckDB in
front of them and answers on Spotify's own paths, with Spotify's own object
shapes — so pointing a client at it is a base-URL change and nothing else:

```sh
SPOTIFY_API_URL=http://localhost:8092/v1
```

No Spotify credentials, no egress, no rate limits, no 429s from upstream.

This is the complement to [`spotify/`](../spotify), the caching proxy in front of
the real API. The proxy is for anything user-scoped and live; riff is for catalog
lookups, which is the overwhelming majority of what Rocksky asks Spotify for.
**Catalog only** — `/me`, player and playlists are not here and never will be,
because the dump does not contain them.

Most callers do not talk to riff directly: **the proxy already routes `search`,
`artists`, `albums`, `tracks` and `audio-features` here by default**,
unrate-limited, and only falls back to Spotify when riff returns no results. So
pointing a component at `spotify/` gets it riff for free.

## Endpoints

| Endpoint                          | Notes                                                 |
| --------------------------------- | ----------------------------------------------------- |
| `GET /`                           | ASCII banner, description, endpoint list (plain text) |
| `GET /health`                     | `{"status":"ok"}`                                     |
| `GET /v1/search`                  | `?q=&type=artist,album,track&limit=&offset=`          |
| `GET /v1/artists/{id}`            |                                                       |
| `GET /v1/artists?ids=`            | max 50                                                |
| `GET /v1/artists/{id}/albums`     | `?include_groups=album,single,compilation,appears_on` |
| `GET /v1/artists/{id}/top-tracks` | at most 10, by popularity                             |
| `GET /v1/albums/{id}`             | embeds the first 50 tracks                            |
| `GET /v1/albums?ids=`             | max 20                                                |
| `GET /v1/albums/{id}/tracks`      |                                                       |
| `GET /v1/tracks/{id}`             |                                                       |
| `GET /v1/tracks?ids=`             | max 50                                                |
| `GET /v1/audio-features/{id}`     |                                                       |
| `GET /v1/audio-features?ids=`     | max 100                                               |

Errors use Spotify's envelope, so a client that already parses Spotify failures
needs no special casing:

```json
{ "error": { "status": 404, "message": "non existing id" } }
```

`href`, `uri` and `external_urls` are emitted with Spotify's canonical hosts
rather than riff's, so responses stay byte-comparable with the real API and a
client that persists those URLs keeps persisting the same values.

### Search

Field filters are the primary path, because that is how Rocksky actually
searches — `apps/api`'s `matchSong` sends:

```
/v1/search?type=track&q=track:"Blue Monday" artist:"New Order"
```

Recognized filters: `track:` `artist:` `album:` `genre:` `isrc:` `upc:` `year:`
(`year:2019` or `year:1990-1999`). Values may be quoted or bare. Bare words with
no filter match a title, a credited artist, or an album. Repeated `artist:`
filters are OR'd — `matchSong` sends every artist it knows about, and a track row
that only carries the primary artist would fail an AND.

Results rank exact (case-insensitive) title matches first, then popularity.
`tag:new` / `tag:hipster` have no equivalent in the dump and are dropped rather
than matched literally.

Paging stops at 1000 items, as on Spotify, and `total` is capped there — see
[Performance](#performance).

## Running

```sh
cargo run --release --bin riff-fixtures        # writes testdata/*.parquet
cargo run --release --bin riff                 # serves them on :8092
```

Every option takes a flag **or** an environment variable:

| Flag                 | Env                     | Default           | Description                                 |
| -------------------- | ----------------------- | ----------------- | ------------------------------------------- |
| `-p, --port`         | `RIFF_PORT`             | `8092`            | Listen port                                 |
| `-H, --host`         | `RIFF_HOST`             | `127.0.0.1`       | Bind address                                |
| `-d, --data-dir`     | `RIFF_DATA_DIR`         | `testdata`        | Directory of catalog parquet files          |
| `--db-path`          | `RIFF_DB_PATH`          | —                 | Persistent DuckDB file instead of in-memory |
| `--pool-size`        | `RIFF_POOL_SIZE`        | CPU count (min 4) | DuckDB connections                          |
| `--rate-limit-rps`   | `RIFF_RATE_LIMIT_RPS`   | `50`              | Sustained req/s per remote IP               |
| `--rate-limit-burst` | `RIFF_RATE_LIMIT_BURST` | `200`             | Burst per remote IP                         |
| `--trust-proxy`      | `RIFF_TRUST_PROXY`      | `false`           | Read the client IP from `X-Forwarded-For`   |

### Rate limits

Per-IP token bucket, deliberately generous — it exists to stop one remote client
from monopolizing the DuckDB pool, not to meter usage.

**Loopback is never rate limited**, whatever the flags say. Everything colocated
with riff (the API, the scrobblers, a developer with curl) talks to it over
127.0.0.1, and throttling those callers would only reintroduce the queueing that
moving off the Spotify proxy removed. IPv6 loopback and IPv4-mapped loopback
(`::1`, `::ffff:127.0.0.1`) count as loopback too.

Only enable `--trust-proxy` behind a proxy you control: otherwise any caller can
forge `X-Forwarded-For` and mint itself a fresh bucket.

## Expected data layout

`--data-dir` must contain these files. Column names and types are checked at
startup, so a drift upstream fails immediately with the offending file named
rather than producing half-empty JSON at request time.

Every `rowid` is the internal join key; `id` is the base62 Spotify id. All joins
go through row ids, and Spotify ids only appear at the edges.

**Required** — riff refuses to start without them:

```text
artists.parquet
    rowid, id, fetched_at, name, followers_total, popularity

albums.parquet
    rowid, id, fetched_at, name, album_type, available_markets_rowid,
    external_id_upc, copyright_c, copyright_p, label, popularity,
    release_date, release_date_precision, total_tracks, external_id_amgid

tracks.parquet
    rowid, id, fetched_at, name, preview_url, album_rowid, track_number,
    external_id_isrc, popularity, available_markets_rowid, disc_number,
    duration_ms, explicit

artist_albums.parquet
    artist_rowid, album_rowid, is_appears_on, is_implicit_appears_on,
    index_in_album
```

**Optional** — an absent file degrades to empty rather than failing:

```text
artist_genres.parquet
    artist_rowid, genre

artist_images.parquet
    artist_rowid, width, height, url

album_images.parquet
    album_rowid, width, height, url

track_artists.parquet
    track_rowid, artist_rowid            -- plus an optional index_in_track

available_markets.parquet
    rowid, markets

track_audio_features.parquet          -- every column is VARCHAR, including the numeric ones
    rowid, track_id, fetched_at, null_response, duration_ms, time_signature,
    tempo, key, mode, danceability, energy, loudness, speechiness,
    acousticness, instrumentalness, liveness, valence
```

| File                           | Effect when absent                         |
| ------------------------------ | ------------------------------------------ |
| `artist_genres.parquet`        | `artist.genres` is `[]`                    |
| `artist_images.parquet`        | `artist.images` is `[]`                    |
| `album_images.parquet`         | `album.images` is `[]`                     |
| `track_artists.parquet`        | artists derived from the album — see below |
| `available_markets.parquet`    | `available_markets` is `[]`                |
| `track_audio_features.parquet` | audio-features endpoints 404               |

### What production ships

All ten files:

```text
album_images  albums  artist_albums  artist_genres  artist_images  artists
available_markets  track_artists  track_audio_features  tracks
```

So both relations riff can do without are in fact present:

- **`track_artists.parquet`** means featured and per-track credits are accurate.
  The album-artist derivation described above is a safety net for a partial dump,
  not the normal path.

  It is `(track_rowid, artist_rowid)` with **no ordering column**. Order still
  matters — callers read `track.artists[0]` as the primary artist — so riff falls
  back to the file's own row order, made explicit with `file_row_number` rather
  than left to scan order, which SQL does not promise. Credits therefore have to
  be written primary-first. If an `index_in_track` column ever appears, riff uses
  it instead, with no other change.
- **`available_markets.parquet`** populates `available_markets` on albums and
  tracks. riff expects `(rowid, markets)` with `markets` a comma-separated list
  of ISO-3166-1 alpha-2 codes. The column list is validated at startup, so if the
  real file is shaped differently riff refuses to start and names the file rather
  than quietly serving `[]` — correct that one `TableSpec` in `src/db.rs` and
  nothing else changes, since everything downstream keys off row ids.

`market=` is accepted and ignored on every endpoint. Filtering is left to the
caller, which can read `available_markets` off the response.

## Performance

`track_audio_features` is ~255M rows. Parquet has no index, so a lookup by
`track_id` prunes only by row-group min/max statistics — if the file is not
sorted by `track_id`, that is a full scan per request. Two ways out:

- Sort the parquet by `track_id` when producing it, so zone maps actually prune.
- Or materialize into a persistent DuckDB file once and point `--db-path` at it:

  ```sql
  ATTACH 'riff.duckdb' AS riff;
  CREATE TABLE riff.track_audio_features AS
    SELECT * FROM read_parquet('track_audio_features.parquet');
  CREATE INDEX taf_track_id ON riff.track_audio_features (track_id);
  ```

  riff creates its views with `CREATE OR REPLACE`, so a materialized table of the
  same name is picked up on restart.

Search `total` is capped at 1000 for the same reason: an exact `COUNT(*)` over
the tracks parquet is a full scan on every query, to produce a number no client
can page into anyway.

### Concurrency

DuckDB reads concurrently and riff leans on that: connections to one database run
in parallel under MVCC, and an individual scan is itself multi-threaded across
cores. Concurrent readers are the workload it is built for.

What the Rust binding adds is a type constraint, not an engine limit: a
`duckdb::Connection` is `Send` but not `Sync`, so a single handle cannot be driven
by two threads at once. The r2d2 pool hands each in-flight request its own handle
— `try_clone` opens a new connection onto the same shared database, so views
registered once at startup are visible to all of them — and DuckDB executes those
handles in parallel.

Queries run inside `web::block` so a long scan occupies a blocking thread rather
than parking an actix worker.

## Deployment

`systemd/rocksky-riff.service` runs it on the server. riff is its own cargo
workspace, so its binary is under `riff/target`, not the shared `target/`:

```sh
cd /root/github/rocksky/riff && cargo build --release
sudo cp systemd/rocksky-riff.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rocksky-riff
```

The unit binds **loopback only** (`RIFF_HOST=127.0.0.1`) on purpose: the only
caller is the Spotify proxy on the same host, and riff serves the whole catalog
with no auth of its own. It reads the dump from `RIFF_DATA_DIR=/root/spotify-dump`;
override that in `/etc/default/rocksky-riff` rather than editing the unit.

`rocksky-spotify-proxy.service` is ordered after it with `Wants=`, not
`Requires=` — the proxy falls back to Spotify by itself when riff is down, so
riff must never be able to keep the proxy from starting.

The first build compiles DuckDB's bundled C++ amalgamation and takes a while;
subsequent ones do not.

## Testing

```sh
cargo test --release
```

- `src/search.rs` — query-grammar unit tests, including the exact string
  `matchSong` sends.
- `src/ratelimit.rs` — bucket behavior, and that loopback is exempt in all three
  spellings.
- `src/fixtures.rs` — the generated files match prod's column names and types,
  and generation is byte-for-byte deterministic.
- `tests/e2e.rs` — the real routes over real DuckDB over real Parquet. Nothing is
  mocked. Also covers the degraded paths: a missing `track_artists.parquet`, a
  missing optional relation, a missing required one, and a schema drift.

CI (`.github/workflows/riff.yml`) additionally runs fmt, clippy and a smoke test
against the actual binary over a real socket.

## Test fixtures

`cargo run --release --bin riff-fixtures` writes a ~40-track catalog in the exact
shape of the production dump — same column names, same types, including the
all-`VARCHAR` audio features. Total size is a few KB, so there is never a reason
to pull the real files down to develop against.

The catalog is fictional on purpose: inventing popularity scores and audio
features for real artists would produce fixtures that look authoritative and are
not. It deliberately includes the awkward cases — a year-precision release date,
an album with no label or copyright, a narrower market set, a featured artist, a
compilation with `appears_on` credits, and one track whose `null_response` says
Spotify had no analysis for it.
