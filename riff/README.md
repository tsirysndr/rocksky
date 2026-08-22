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
no filter match a title, a credited artist, or an album — as complete names.
Repeated `artist:` filters are OR'd — `matchSong` sends every artist it knows
about, and a track row that only carries the primary artist would fail an AND.

**Matching is exact (case-insensitive), not substring.** This is the load-bearing
decision: substring `ILIKE` over the 256M-row tracks relation is a full 23G scan
per query, which is precisely how the first production deploy died — each search
held a pooled connection for minutes, the pool starved, and every request timed
out. Exact match hits the sorted `*_names` lookup tables, where zone maps prune
it to a few row groups. The fuzzy cases riff loses are exactly the ones the
Spotify proxy falls back on: a riff miss costs one Spotify call; a riff scan
cost the whole service. (`genre:` keeps substring matching — that relation is
tiny.)

Results rank by popularity. `tag:new` / `tag:hipster` have no equivalent in the
dump and are dropped rather than matched literally.

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
    rowid, available_markets            -- projected internally as `markets`

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
  tracks. It is `(rowid, available_markets)`, the column carrying a `VARCHAR` of
  ISO-3166-1 alpha-2 codes; riff projects it as `markets` internally so the view
  is not `available_markets.available_markets`.

  The dump's schema pins the column as `VARCHAR` but not its *encoding*, so the
  parser accepts the plausible spellings — `US,CA`, `US CA`, `["US","CA"]` —
  rather than betting on one. Betting wrong would yield a single bogus market per
  row instead of a visible failure.

`market=` is accepted and ignored on every endpoint. Filtering is left to the
caller, which can read `available_markets` off the response.

## Performance

The dump is large (23G tracks, 14G audio features) and parquet has no indexes —
only per-row-group min/max statistics ("zone maps"), which prune a scan **only
when the file is sorted by the queried column**. The production files are sorted
by `rowid`, so riff splits its access paths in two:

- **Hydration reads the parquet directly.** Fetching rows by `row_id IN (...)`
  prunes to a couple of row groups; no copy needed.
- **Everything else goes through materialized lookup tables** — sorted copies
  built once per dump refresh by `riff-materialize`:

  ```sh
  riff-materialize --data-dir /root/spotify-dump --db /root/riff.duckdb
  riff --data-dir /root/spotify-dump --db-path /root/riff.duckdb
  ```

  That builds `track_ids` / `artist_ids` / `album_ids` (id → row id, sorted by
  id), `*_names` (lowercased name → row id + popularity, what search runs on),
  `track_isrcs`, `track_artists_by_artist` and `artist_albums_expanded` (the
  artist-side orderings, carrying popularity / album_type / release_date so the
  hot endpoints never join a big relation), plus sorted copies of
  `track_audio_features`, `album_images` and `artist_genres` whose files are not
  sorted by their lookup key. ~35G on disk, tens of minutes to build, rerunnable
  (tables are built under a scratch name and swapped in).

Without the materialized file riff still starts — the same relations exist as
views over the parquet — and the startup log says so. That mode is for fixtures
and tests; on production data every search and id lookup would be a full scan.

Search `total` is capped at 1000: an exact `COUNT(*)` per query buys a number no
client can page into anyway.

Each in-flight request holds one pooled DuckDB connection, and waits at most
`--pool-timeout` (default 5s) for one. Short on purpose: an exhausted pool means
riff is overloaded, and shedding immediately lets the proxy fall back to Spotify
instead of queueing every caller into a timeout.

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
  mocked. Also covers the degraded paths (missing files, schema drift) and the
  materialized mode end to end, including rebuild idempotence.
- `tests/prod_sample.rs` — the same routes over `tests/prod-sample/`, a 128K
  committed slice of the **actual production dump** (four artists, their albums
  and tracks, and everything those rows reference). It carries the real quirks
  the synthetic fixtures imitate — all-VARCHAR audio features, the market-list
  encoding, `track_artists` without an ordering column — and its assertions are
  discovered from the slice, so re-extracting a different slice does not rewrite
  the suite. One named test pins the exact search that caused the 2026-08-22
  outage.

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
