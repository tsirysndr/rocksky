# MusicBrainz proxy

`go run .` (or `go build .`) serves search, hydrate and recording lookup on port
8088. Requests use a persistent SQLite cache, then the public MusicBrainz API.
The proxy does not call riff-mb. `MBRIFF_URL` and `MBRIFF_TIMEOUT` are unused.
OpenTelemetry is disabled: ordinary HTTP and upstream-error logs go to stdout/stderr.

| Setting | Default |
| --- | --- |
| `MB_UPSTREAM_URL` | `https://musicbrainz.org/ws/2` (only allowed upstream) |
| `MB_CACHE_PATH` | `${DB_PATH}.metadata.sqlite` (`./piper.db.metadata.sqlite` by default) |
| `MB_CACHE_TTL` | `720h` (recordings; minimum `1m`) |

The cache directory must be writable and on persistent local storage. WAL and
synchronous FULL preserve completed cache writes across restarts. Existing
upstream recording entries remain usable. Old local recording entries are ignored;
searches use a new namespace to avoid previously cached partial riff-mb results.
No database replacement or new required environment variables are needed.

Production startup rejects a non-official upstream URL. Outbound requests connect
straight to MusicBrainz over IPv4; HTTP(S)_PROXY/ALL_PROXY are not used. This avoids
the production IPv6 path's TLS EOF failures without changing global networking.
DNS resolution and TLS certificate/hostname verification remain enabled.

Successful searches also cache their recordings by MBID. Full recording responses
outrank search snippets. Search results live for one hour; authoritative upstream
404s and empty searches for five minutes. Positive entries can be served for seven
days past expiry when refresh fails. Cleanup removes at most 500 expired entries
every five minutes. Failures and throttling are never cached as not-found.

All three routes and redirect hops share a one-request-per-second limiter. Identical
concurrent requests share one operation. At most 32 distinct operations run at
once; each has a five-second deadline and individual HTTP requests have a
three-second timeout. Admission can wait up to 1.1 seconds to use the next slot,
without building an unbounded backlog. These limits are per process: replicas
sharing a public IP must coordinate admission outside this service.

Same-origin redirects are followed up to five hops, preserving JSON/expansion
parameters. Merged recording IDs are cached under both the old and canonical IDs.
Redirects to another origin are rejected. Upstream 429/5xx responses trigger a
cooldown using Retry-After (seconds or HTTP date), or five seconds when absent.
Transport failures also trigger a five-second cooldown. Cache hits remain available.

`X-MusicBrainz-Source` reports cache, stale-cache or musicbrainz-api.
`X-MusicBrainz-Error` and ordinary logs distinguish:

- `local_rate_limit` / `local_capacity`: HTTP 429 with Retry-After.
- `upstream_http`: upstream 429 is returned as 429; 5xx as 503; other unexpected
  statuses as 502. The log includes the original upstream status.
- `upstream_cooldown`: HTTP 503 with the remaining cooldown in Retry-After.
- `upstream_transport`: HTTP 502 for connection/read failures.
- `upstream_redirect` / `invalid_upstream_response`: HTTP 502.

Caller cancellations return 499. Search errors are not disguised as empty matches.
A cold cache still depends on upstream availability and cannot exceed its quota.

Tests use local fake upstreams and temporary SQLite databases:

```sh
go test -race ./...
```
