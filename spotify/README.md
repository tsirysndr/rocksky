# rocksky-spotify-proxy

Centralized, rate-limited, caching proxy in front of the Spotify Web API — the
single place every Rocksky component should talk to Spotify through, so we stop
hitting Spotify's rate limits from many services at once.

It mirrors Spotify's API paths, so switching a client to it is **just a
base-URL change**: point `https://api.spotify.com/v1` at
`http://localhost:8091/v1` and keep sending the same requests (the caller's
`Authorization` header is forwarded as-is). Responses are Spotify's raw JSON,
untouched.

## Catalog reads go to riff first

`search`, `artists`, `albums`, `tracks` and `audio-features` are answered by
[riff](../riff) — the local service that serves our Spotify Parquet dump on
Spotify's own paths — before Spotify is considered at all.

riff runs on loopback, so those calls take **no rate limiter slot, no cooldown
and no cache entry**. Catalog lookups are the bulk of what we ask Spotify for,
so serving them locally leaves the quota to the requests that genuinely need it.

Spotify is reached only when riff produces no results — an empty search, an
unknown id, a batch that resolved nothing — and that fallback still goes through
the full rate-limited, cached path. riff being down or slow is not an error
either: it falls back the same way.

Routed to riff (GET only):

```text
/search                     /albums                 /tracks
/artists                    /albums/{id}            /tracks/{id}
/artists/{id}               /albums/{id}/tracks     /audio-features
/artists/{id}/albums                                /audio-features/{id}
/artists/{id}/top-tracks
```

Everything else — `/me/*`, the player, playlists, recommendations,
related-artists, and every non-GET — goes straight to Spotify. The list is
explicit rather than a prefix match, so a path riff cannot answer does not spend
a round trip finding that out.

`X-Source: riff | spotify` on every response says who answered, so it is visible
at a glance whether a request cost Spotify quota.

Two caveats worth knowing:

- riff mirrors a dump, so it lags Spotify. A brand-new release misses and falls
  back — which is the intended behavior, not a failure.
- `market=` is ignored by riff, so a market-filtered request answered locally is
  not filtered. Callers can read `available_markets` off the response.

Set `RIFF_URL=""` to turn all of this off and send everything to Spotify.

## Behavior

- **riff first** for catalog reads (see above), unrate-limited and uncached.
- **Rate limiting**: one shared token-bucket limiter for all upstream calls
  (default 5 req/s, burst 10). On a Spotify `429`, the proxy enters a cooldown
  honoring `Retry-After` (capped at 5 minutes) and stops hitting Spotify.
- **Caching** (GET only, statuses 200/204):
  - `/me/*` (currently-playing, player state): 3s TTL, keyed per user token —
    absorbs tight polling loops without ever mixing users' data.
  - `/search*`: 1h TTL.
  - Catalog (`/artists`, `/albums`, `/tracks`, ...): 24h TTL.
  - Catalog and search entries are kept up to another 23–24h past expiry and
    served **stale** while Spotify is rate limiting or erroring (`X-Cache: STALE`).
- **Player controls** (PUT/POST/DELETE under `/me/player/*`): passed through
  uncached, still rate limited.
- **Auth**: forwards the caller's `Authorization` header. Catalog requests
  without one fall back to a client-credentials app token when
  `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are set.
- `X-Cache: HIT | MISS | STALE` and `X-Source: riff | spotify` response headers
  for debugging.

## Run

```sh
bun run spotify-proxy   # or: cd spotify && go run main.go
```

## Environment

| Variable                                      | Default                    | Description                                                                                     |
| --------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `RIFF_URL`                                    | `http://127.0.0.1:8092/v1` | Local riff instance for catalog reads. Empty string disables riff entirely                      |
| `RIFF_TIMEOUT`                                | `10` (seconds)             | How long a riff lookup may take before it is treated as a miss and Spotify is tried             |
| `SPOTIFY_PROXY_PORT` (or `PORT`)              | `8091`                     | Listen port                                                                                     |
| `SPOTIFY_PROXY_RPS`                           | `5`                        | Sustained upstream requests per second (Spotify only; riff is not limited)                      |
| `SPOTIFY_PROXY_BURST`                         | `10`                       | Burst size for the limiter                                                                      |
| `SPOTIFY_PROXY_MAX_WAIT`                      | `20`                       | Seconds a request may spend queued (limiter slot or short cooldown) before it is answered `429` |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | —                          | Optional app credentials for catalog requests without a forwarded token                         |

### Queueing

A request that cannot be served immediately waits — for a rate limiter slot, or
for a 429 cooldown to expire — and then tries again, up to
`SPOTIFY_PROXY_MAX_WAIT`. Anything that will not fit in that budget is answered
`429` with `Retry-After` right away rather than parked on an open connection.
The bound matters: an unbounded queue just converts load into a wall of client
timeouts, which the proxy then logged as `502`.

Callers must set their own request timeout **and** actually abort the request
when it fires — a caller that abandons a promise but leaves the socket open
keeps holding a queue slot until its runtime's socket timeout (300s in Node)
kicks in.

## Switching clients over

Every Spotify API call site reads `SPOTIFY_API_URL` and falls back to
`https://api.spotify.com/v1` when unset — so switching a component to the
proxy is just setting `SPOTIFY_API_URL=http://localhost:8091/v1` in its
environment:

- `crates/spotify` (Rust Spotify scrobbler)
- `crates/webscrobbler`, `crates/scrobbler`, `crates/playlists`, `crates/mirror`
- `apps/api` (player controls, matchSong, nowplaying, genres/backfill scripts)

Token refresh (`accounts.spotify.com`) intentionally stays direct — it is not
subject to the same rate limits and carries per-user secrets.
