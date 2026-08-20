# rocksky-spotify-proxy

Centralized, rate-limited, caching proxy in front of the Spotify Web API — the
single place every Rocksky component should talk to Spotify through, so we stop
hitting Spotify's rate limits from many services at once.

It mirrors Spotify's API paths, so switching a client to it is **just a
base-URL change**: point `https://api.spotify.com/v1` at
`http://localhost:8091/v1` and keep sending the same requests (the caller's
`Authorization` header is forwarded as-is). Responses are Spotify's raw JSON,
untouched.

## Behavior

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
- `X-Cache: HIT | MISS | STALE` response header for debugging.

## Run

```sh
bun run spotify-proxy   # or: cd spotify && go run main.go
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `SPOTIFY_PROXY_PORT` (or `PORT`) | `8091` | Listen port |
| `SPOTIFY_PROXY_RPS` | `5` | Sustained upstream requests per second |
| `SPOTIFY_PROXY_BURST` | `10` | Burst size for the limiter |
| `SPOTIFY_PROXY_MAX_WAIT` | `20` | Seconds a request may spend queued (limiter slot or short cooldown) before it is answered `429` |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | — | Optional app credentials for catalog requests without a forwarded token |

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
