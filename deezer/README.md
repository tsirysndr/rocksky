# rocksky-deezer

Metadata enrichment service in front of the public Deezer API. It is the
fallback source across every Rocksky enrichment pipeline (`matchSong`,
nowplaying, the status subscriber, backfill, the Rust scrobblers) when Spotify
and MusicBrainz cannot resolve a track.

Deezer's quota is **50 requests per 5 seconds per IP**, and a single `/enrich`
costs several upstream calls, so nearly everything below exists to spend that
window well and to behave sanely when it runs out.

## Behavior

- **Rate limiting**: a rolling-window limiter admits at most `DEEZER_RATE_LIMIT`
  sends in any 5-second window and **queues** the rest. This is deliberately not
  a token bucket: a bucket with burst _n_ and refill _n_/window emits _n_
  immediately and another _n_ over the next window — 2*n* inside one window,
  which trips a fixed per-IP quota while looking compliant.
- **Queueing**: a request waits for its slot up to `DEEZER_MAX_WAIT`, shared
  across the whole `/enrich` fan-out. Past that budget it is answered `429` with
  `Retry-After` rather than left holding an open connection until its caller
  times out.
- **Circuit breaker**: five consecutive upstream failures pause outbound calls
  for 15s, doubling per failed probe up to 5 minutes, then one probe at a time
  is let through. Without it a blocked IP or an exhausted quota turns the whole
  incoming scrobble stream into upstream rejections, which keeps the block warm.
- **Caching**: successful searches and lookups for 1h; **failures for 90s**, so
  a refusing upstream is not asked the same question by every scrobble behind
  it. Concurrent identical queries collapse into one upstream call.
- **Status codes**: `429` local queue saturated · `503` Deezer is refusing us,
  breaker open · `499` caller hung up · `504` deadline · `502` genuine upstream
  failure. The upstream status is logged rather than swallowed.

A search that legitimately finds nothing is **not** an error: it returns `200`
with an empty `matches` list.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/enrich` | `{ title, artist, album? }` → best enriched track + ranked matches |
| `POST` | `/search` | Alias of `/enrich` |
| `GET` | `/track/:id` | Fully hydrated track by Deezer ID |
| `GET` | `/health` | Liveness |

## Run

```sh
cd deezer && go run main.go
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `DEEZER_PORT` / `PORT` | `8090` | Listen port |
| `DEEZER_RATE_LIMIT` | `45` | Requests per rolling 5s window. Under Deezer's 50 on purpose: their clock is not ours |
| `DEEZER_MAX_WAIT` | `20` | Seconds one request may stay queued before it is answered `429` |

## Diagnosing 502s

A `502` means Deezer itself refused the request; the log line now carries the
upstream status. Two very different causes look alike in the access log:

- **`403`** — Deezer is blocking the egress IP. Common on datacenter ranges. No
  amount of rate limiting fixes this; the service needs different egress.
- **`429`, or `200` with `{"error":{"code":4}}`** — quota. Lower
  `DEEZER_RATE_LIMIT`; the breaker and the failure cache will keep the retry
  storm off Deezer while it recovers.

Check from the host running the service:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H 'User-Agent: rocksky-deezer/0.1.0 ( https://github.com/tsirysndr/rocksky )' \
  'https://api.deezer.com/search?q=track%3A%22Tokka%22'
```
