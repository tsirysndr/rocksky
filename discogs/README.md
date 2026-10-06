# rocksky-discogs

Discogs API client service — the single place every Rocksky component should
talk to Discogs through. Discogs allows **60 authenticated requests per minute
per token**, an order of magnitude tighter than Deezer, so everything below
exists to spend that minute well and to behave sanely when it runs out.

It answers with normalized, Rocksky-shaped metadata (`/enrich`, same request
and response shape as [deezer](../deezer)) and with Discogs' own objects for
direct lookups (`/releases/:id`, `/masters/:id`, `/artists/:id`,
`/labels/:id`).

## Authentication

A personal access token is **required**: `DISCOGS_TOKEN`. The service exits
immediately when it is unset — an unauthenticated client gets a quarter of the
quota and no images at all. Create one at
<https://www.discogs.com/settings/developers>.

Every request also carries a `User-Agent` identifying this service; Discogs
blocks requests made with a default library agent.

## Behavior

- **Rate limiting**: a rolling-window limiter admits at most
  `DISCOGS_RATE_LIMIT` sends in any 60-second window and **queues** the rest —
  not a token bucket, which with burst _n_ and refill _n_/window emits 2*n*
  inside one window and trips a per-token quota while looking compliant.
- **Queueing**: a request waits for its slot up to `DISCOGS_MAX_WAIT`, shared
  across the whole `/enrich` fan-out. Past that budget it is answered `429`
  with `Retry-After` rather than left holding an open connection.
- **Circuit breaker**: five consecutive upstream failures pause outbound calls
  for 30s, doubling per failed probe up to 5 minutes. A `404` is Discogs
  answering, not refusing, so it never counts.
- **Caching**: successes for 6h — the catalogue is near-static and the quota is
  the scarce resource — failures for 90s. Concurrent identical queries collapse
  into one upstream call.
- **Quota visibility**: the `X-Discogs-Ratelimit-*` headers are tracked and
  served on `/ratelimit` and `/health`, logged as a warning under 5 remaining,
  and recorded on each `/enrich` span.
- **Status codes**: `429` local queue saturated · `503` breaker open · `499`
  caller hung up · `504` deadline · `404` no such release · `502` genuine
  upstream failure, with Discogs' own message carried through.

A search that legitimately finds nothing is **not** an error: it returns `200`
with an empty `matches` list.

## Cost of one enrichment

`/enrich` is one search plus one release fetch, plus the master only when the
pressing is a reissue or has no year of its own — about 20 enrichments per
minute. Candidate matches are deliberately **not** deep-fetched: a per-match
release lookup would cost more quota than the extra fields are worth.

Because Discogs search results carry no track titles, scoring leans on the
album and artist when an album is given. The matched track (position, duration,
per-track credits) comes out of the release's tracklist after the deep-fetch.
Vinyl positions keep their sleeve numbering: `C2` is disc 2, track 2.

## Endpoints

| Method | Path             | Description                                                      |
| ------ | ---------------- | ---------------------------------------------------------------- |
| `POST` | `/enrich`        | `{ title, artist, album? }` → best enriched track + ranked matches |
| `POST` | `/search`        | Alias of `/enrich`                                               |
| `GET`  | `/search`        | Same, as `?title=&artist=&album=`                                |
| `GET`  | `/releases/:id`  | Full Discogs release                                             |
| `GET`  | `/masters/:id`   | Full Discogs master                                              |
| `GET`  | `/artists/:id`   | Full Discogs artist                                              |
| `GET`  | `/labels/:id`    | Full Discogs label                                               |
| `GET`  | `/ratelimit`     | Quota Discogs last reported                                      |
| `GET`  | `/health`        | Liveness, quota and current cooldown                             |

```sh
curl -sS -X POST localhost:8095/enrich \
  -H 'Content-Type: application/json' \
  -d '{"title":"Get Lucky","artist":"Daft Punk","album":"Random Access Memories"}'
```

## Run

```sh
DISCOGS_TOKEN=... bun run discogs   # or: cd discogs && go run main.go
```

## Environment

| Variable                 | Default    | Description                                             |
| ------------------------ | ---------- | ------------------------------------------------------- |
| `DISCOGS_TOKEN`          | _required_ | Personal access token; the service exits without it     |
| `DISCOGS_PORT` / `PORT`  | `8095`     | Listen port                                             |
| `DISCOGS_RATE_LIMIT`     | `55`       | Requests per rolling 60s window, under Discogs' 60      |
| `DISCOGS_MAX_WAIT`       | `30`       | Seconds a request may stay queued before it gets `429`  |

## Tests

```sh
cd discogs && go test ./...
DISCOGS_SMOKE=1 DISCOGS_TOKEN=... go test ./service/discogs -run TestSmokeRealDiscogsAPI -v
```
