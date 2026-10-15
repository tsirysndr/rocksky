# MusicBrainz proxy

`go run .` (or `go build .`) serves search, hydrate and recording lookup on port
8088. The read-only riff-mb catalog is backed by a persistent SQLite metadata
overlay. All three routes share the same upstream rate limiter and cache.

| Setting | Default |
| --- | --- |
| `MBRIFF_URL` | `http://localhost:8094` |
| `MBRIFF_TIMEOUT` | `1s` |
| `MB_UPSTREAM_URL` | `https://musicbrainz.org/ws/2` |
| `MB_CACHE_PATH` | `${DB_PATH}.metadata.sqlite` (`./piper.db.metadata.sqlite` by default) |
| `MB_CACHE_TTL` | `720h` (recordings; minimum `1m`) |

The cache directory must be writable and on persistent local storage. WAL and
synchronous FULL preserve completed cache writes across restarts. No new required
configuration or DuckDB migration is needed for the proxy fix.

Successful upstream searches also cache their recordings by MBID. Local search
results leave recording lookups to riff-mb so release expansions are preserved. Full recording responses
outrank search snippets, which outrank standalone local records. Search results
live for one hour; authoritative upstream 404s and empty searches for five
minutes. A local catalog miss is never cached as a global not-found. Positive
entries can be served for seven days past expiry when refresh fails. Cleanup
removes at most 500 expired entries every five minutes.

Identical concurrent requests share one operation. Individual cancellation does
not cancel another caller's lookup. At most 32 distinct operations run at once;
each has a five-second deadline. Public API traffic shares a one-request-per-second
limiter, with at most 250 ms spent waiting for admission. Upstream calls have a
three-second timeout and redirects are not followed automatically. Transient
failures trigger a cooldown (five seconds by default; upstream Retry-After is
respected). Neither transport failures nor throttling are stored as not-found.

Overload/outages return 503 with Retry-After; caller cancellations are recorded as
499. Search errors are no longer disguised as a successful empty match.
`X-MusicBrainz-Source` reports cache, stale-cache, riff-mb or musicbrainz-api.
This limits latency and repeated misses; a completely cold cache still depends
on local dataset coverage and upstream availability.

The production catalog was verified to contain 133,144 standalone recordings,
not the full album recording catalog. See [riff-mb import instructions](../riff/README.md#riff-mb--the-same-trick-for-musicbrainz)
for the offline release-dump expansion. Build on a staging copy and verify before
swapping the live database; do not import into the running service's file.

Tests use local fake upstreams and temporary SQLite databases:

```sh
go test -race ./...
```
