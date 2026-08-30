# drift

**Precomputed music recommendations for Rocksky**, built to beat Last.fm's
recommender at its own game — and to be fast enough that nobody ever waits on
it.

The legacy endpoint (`apps/api` `getRecommendations`) recomputed neighbours and
candidates *per request* with ~10 sequential Postgres queries. drift inverts
that: one set-based DuckDB pass scores **every user at once** on a refresh
interval and lands the results in a dedicated DuckDB database file
(`recommendations.ddb`); serving is a sub-millisecond lookup on that table —
Postgres is never on the request path.

## Why it beats Last.fm

Last.fm's recommender is pure collaborative filtering over all-time play
counts. Each of drift's scoring terms targets one of its known failure modes:

| Last.fm failure mode | drift's answer |
| --- | --- |
| No audio signal — only co-listening | Cosine similarity between the user's **taste vector** and each candidate's Spotify audio features (danceability, energy, valence, acousticness, instrumentalness, liveness, speechiness, tempo, loudness). Features are **z-scored across the catalog** first — raw Spotify features are all-positive and correlated, so raw cosine saturates near 1; standardized cosine actually discriminates. |
| Popularity bias — recommends what everyone already knows | Scores are divided by `ln(e + global plays)`, so the globally obvious doesn't drown the personally right. |
| Fossilized profiles — that ska phase in 2009 still haunts you | Exponential recency decay (λ = 0.02/day ≈ 35-day half-life) on every play weight. Taste is what you play *now*. |
| Genre echo chamber *or* genre chaos | Soft genre gate with a content escape hatch: a track outside the user's top genres still passes when it *sounds* like their taste (cos ≥ 0.5). Cross-genre discovery a genre-only filter can never make. |
| Artist echo — ten tracks by the same artist | Diversity cap: each artist's best track ranks first, runner-ups only fill leftover slots. Plus a 15 % serendipity quota from artists the user has **never** played, rotated daily. |
| Play-count-only signal | A neighbour's loved track is an explicit 5× endorsement (`source: "social"`); neighbour similarity is proper cosine over decay-weighted artist vectors, not raw shared counts. |
| Scrobble spam pollutes the graph | `users.is_bot` (written by the scrobble-abuse sweep) excludes flagged accounts from the neighbour graph and the charts. |

Users with too little history for collaborative filtering get the decayed
global chart (one track per artist, heard tracks excluded, `source: "chart"`)
instead of an empty list.

The same refresh also precomputes **artist** and **album** recommendations:

- **Artists** reuse the track machinery — CF over the neighbour graph
  (artists the user has never played), a content term from the artist's mean
  audio-feature vector, the soft genre gate, popularity de-bias, a daily-rotated
  serendipity quota, and a chart fallback (`source: "neighbour" | "serendipity"
  | "chart"`).
- **Albums** mirror the legacy endpoint's two pools: unheard albums by artists
  the user already plays (`source: "known-artist"`, scored by artist
  familiarity) and albums by the CF-recommended new artists
  (`source: "new-artist"`), with a per-artist diversity cap and a chart
  fallback. "Heard" covers both `scrobbles.album_id` and albums reached through
  the scrobbled tracks' `album_uri`.

## Architecture

```
Postgres (live)                  riff's parquet
scrobbles, loved_tracks,         track_audio_features
users, tracks, artists                  │
        │                               │
        ▼                               ▼
   ┌─────────────────────────────────────────┐
   │  refresh (every 30 min, or POST-ed)     │
   │  one set-based DuckDB pass:             │
   │  decay → neighbours → CF candidates →   │
   │  taste vectors → score → diversify →    │
   │  serendipity → chart fallback           │
   └────────────────────┬────────────────────┘
                        ▼
      recommendations.ddb: `recommendations` +
      `artist_recommendations` + `album_recommendations` + `meta`
                        │  (CREATE OR REPLACE swap; MVCC keeps
                        │   readers on the old version mid-refresh)
                        ▼
        GET /v1/recommendations[/artists|/albums]  — one indexed query, sub-ms
```

User history comes from **Postgres directly** (not the parquet dump), so
recommendations track scrobbles with at most one refresh interval of lag. Audio
features come from riff's `track_audio_features.parquet`, joined via
`tracks.spotify_link`; a missing file degrades gracefully (content terms go
neutral, everything else still works).

Because the snapshot is a plain DuckDB file, a restart serves the previous
run's recommendations immediately (no cold start while the first refresh runs),
and the results are inspectable offline:

```sh
duckdb recommendations.ddb "SELECT title, artist, score, source
                            FROM recommendations WHERE handle = 'tsiry.dev'
                            ORDER BY final_rank LIMIT 20"
```

Refresh intermediates are staged in the same file and dropped at the end of
each run, followed by a `CHECKPOINT` to keep it compact.

Two things keep the loop cheap:

- **Nothing-changed refreshes are skipped.** Each run starts by fingerprinting
  Postgres (row counts + newest scrobble), the day number (the serendipity salt
  rotates daily) and the scoring config in one cheap query; when the
  fingerprint matches the last successful run's, the rebuild is skipped —
  a quiet interval costs one round trip instead of a full fetch and pipeline.
  `POST /v1/refresh` forces past the skip.
- **Only the last `--history-days` (default 548 ≈ 18 months) of scrobbles are
  fetched.** At the default decay a play that old carries weight ~2e-5 —
  invisible to every score — so the window bounds the fetch as history grows
  with no observable change to the output. Set it to 0 to fetch everything.

The snapshot itself is written sorted by `(did, final_rank)` alongside a tiny
`rec_users` (did, handle) map: serving resolves a handle to its DID there
first, so the query against `recommendations` is a zone-map-pruned equality on
the sort key rather than an `OR handle = ?` scan.

Responses are shaped exactly like the `app.rocksky.feed.defs` views
(`recommendationView`, `recommendedArtistView`, `recommendedAlbumView`), so
`apps/api` returns drift's body verbatim (set `DRIFT_URL` there; it falls
back to the legacy path if drift is unreachable).

## Endpoints

| Endpoint                          | Notes                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `GET /`                           | ASCII banner, endpoint list (plain text)               |
| `GET /health`                     | `{"status":"ok"}`                                      |
| `GET /v1/status`                  | Last refresh time/duration, user and row counts        |
| `GET /v1/recommendations`         | `?did=<did-or-handle>&limit=50` (limit clamped to 100) |
| `GET /v1/recommendations/artists` | Same parameters; `{"artists":[...]}`                   |
| `GET /v1/recommendations/albums`  | Same parameters; `{"albums":[...]}`                    |
| `POST /v1/refresh`                | Forces a refresh (bypasses the nothing-changed skip); 409 if one is already running |

Errors use the same envelope as riff:
`{ "error": { "status": 404, "message": "..." } }`.

## Running

```sh
DRIFT_DATABASE_URL=postgres://... \
DRIFT_FEATURES_PARQUET=/path/to/track_audio_features.parquet \
cargo run --release
```

Every option takes a flag **or** an environment variable:

| Flag                      | Env                           | Default                        | Description                                  |
| ------------------------- | ----------------------------- | ------------------------------ | -------------------------------------------- |
| `-p, --port`              | `DRIFT_PORT`                  | `8093`                         | Listen port                                  |
| `-H, --host`              | `DRIFT_HOST`                  | `127.0.0.1`                    | Bind address                                 |
| `--db`                    | `DRIFT_DB`                    | `recommendations.ddb`          | DuckDB file results are written to/served from |
| `--database-url`          | `DRIFT_DATABASE_URL`          | *(falls back to DATABASE_URL)* | Postgres connection string                   |
| `--features-parquet`      | `DRIFT_FEATURES_PARQUET`      | `track_audio_features.parquet` | riff's audio-features parquet                |
| `--refresh-interval-secs` | `DRIFT_REFRESH_INTERVAL_SECS` | `1800`                         | Seconds between automatic refreshes          |
| `--limit-per-user`        | `DRIFT_LIMIT_PER_USER`        | `100`                          | Rows precomputed per user                    |
| `--neighbours`            | `DRIFT_NEIGHBOURS`            | `50`                           | Neighbour graph fan-out                      |
| `--decay-lambda`          | `DRIFT_DECAY_LAMBDA`          | `0.02`                         | Per-day recency decay                        |
| `--content-weight`        | `DRIFT_CONTENT_WEIGHT`        | `0.6`                          | Exponent on audio-feature similarity (0 off) |
| `--serendipity-ratio`     | `DRIFT_SERENDIPITY_RATIO`     | `0.15`                         | Serendipity share of each response           |
| `--memory-limit`          | `DRIFT_MEMORY_LIMIT`          | `2GB`                          | DuckDB memory ceiling (spills instead of OOM) |
| `--candidate-limit`       | `DRIFT_CANDIDATE_LIMIT`       | `500`                          | Candidates scored per user before ranking    |
| `--profile-limit`         | `DRIFT_PROFILE_LIMIT`         | `500`                          | Most-played + loved tracks the profile uses  |
| `--history-days`          | `DRIFT_HISTORY_DAYS`          | `548`                          | Scrobble window fetched per refresh (0 = all) |

The first refresh runs before the server accepts traffic; if it fails (e.g.
Postgres briefly down) drift still starts, answers `503` until a refresh
succeeds, and retries on the interval.

DuckDB's `parquet` extension is linked in rather than autoloaded, so drift —
like riff — works on a box with no egress.

For production there is a unit at
[`systemd/rocksky-drift.service`](../systemd/rocksky-drift.service) (loopback
bind, `DATABASE_URL` via doppler, snapshot in `/var/lib/drift`, feature
overrides in `/etc/default/rocksky-drift`).
