# rocksky-go

Official Go SDK for the [Rocksky](https://rocksky.app) XRPC API.

Rocksky is an open music-scrobbling network built on the [AT Protocol](https://atproto.com).
This package wraps the `app.rocksky.*` XRPC endpoints exposed by
[`api.rocksky.app`](https://api.rocksky.app) behind a typed, idiomatic Go client.

## Install

```bash
go get github.com/tsirysndr/rocksky/sdk/go/rocksky
```

Requires Go 1.22+.

## Quick start

```go
package main

import (
    "context"
    "fmt"

    "github.com/tsirysndr/rocksky/sdk/go/rocksky"
)

func main() {
    client := rocksky.NewClient()

    profile, err := client.Actor.GetProfile(context.Background(), rocksky.GetProfileParams{
        Actor: "tsiry.bsky.social",
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("@%s (%s)\n", profile.Handle, profile.DID)
}
```

## Authentication

Read-only queries (profiles, charts, scrobble feed, search…) work without
credentials. Procedures that mutate state require a bearer JWT:

```go
client := rocksky.NewClient(
    rocksky.WithBearerToken(os.Getenv("ROCKSKY_TOKEN")),
)

_, err := client.Scrobble.CreateScrobble(ctx, rocksky.CreateScrobbleInput{
    Title:     "Black Hole Sun",
    Artist:    "Soundgarden",
    Album:     "Superunknown",
    Duration:  320000, // ms
    Timestamp: time.Now().Unix(),
})
```

Get a token by signing in to your Rocksky account; the JWT lives in the API
response from the OAuth callback.

## Configuration

`NewClient` takes functional options:

| Option              | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `WithBaseURL`       | Override the API host (self-hosted instance, `httptest`). |
| `WithBearerToken`   | Authenticate as a Rocksky user.                           |
| `WithHTTPClient`    | Inject a custom `*http.Client` (tracing, retries).        |
| `WithUserAgent`     | Override the `User-Agent` header.                         |
| `WithHeader`        | Add an extra header to every request.                     |

Default base URL: `https://api.rocksky.app`. Default timeout: 30s.

## API surface

Methods are grouped into namespaced services that mirror the XRPC schema:

```
client.Actor    // app.rocksky.actor.*
client.Album    // app.rocksky.album.*
client.Artist   // app.rocksky.artist.*
client.Song     // app.rocksky.song.*
client.Scrobble // app.rocksky.scrobble.*
client.Charts   // app.rocksky.charts.*
client.Stats    // app.rocksky.stats.*
client.Feed     // app.rocksky.feed.*
client.Graph    // app.rocksky.graph.*
client.Like     // app.rocksky.like.*
client.Shout    // app.rocksky.shout.*
```

Each method takes a `context.Context` plus a typed params/input struct, and
returns the decoded response or an error. Zero-valued option fields are simply
omitted from the outgoing query string.

### Pagination

Offset-based endpoints (most lists) accept `PaginationParams{Limit, Offset}`.
Cursor-based feed endpoints accept `CursorPagination{Limit, Cursor}` and return
a `Cursor` field to feed back into the next call.

### Fluent builders

For a handful of endpoints with many optional fields, the SDK also exposes a
chainable builder alongside the struct-param form:

```go
// Write op with lots of optional metadata
out, err := client.Scrobble.NewScrobble("Black Hole Sun", "Soundgarden").
    Album("Superunknown").
    Duration(320_000).
    ISRC("USXXX1234567").
    Year(1994).
    Timestamp(time.Now().Unix()).
    Send(ctx)

// Multi-filter query
chart, err := client.Charts.NewScrobblesChart().
    Actor("tsiry.bsky.social").
    From("2025-01-01").
    To("2025-12-31").
    Do(ctx)

// Shouts and replies
shout, err := client.Shout.NewShout("listening to this on repeat").Send(ctx)
reply, err := client.Shout.NewReply(parentURI, "agreed!").Send(ctx)
```

Use `.Do(ctx)` to fire a query and `.Send(ctx)` to fire a procedure. Every other
endpoint sticks to the idiomatic struct-literal form — the builder layer only
exists where chaining is genuinely nicer.

### Error handling

Non-2xx responses are returned as `*rocksky.Error`, which carries the HTTP
status, the XRPC error kind/message, and helpers like `IsUnauthorized`,
`IsNotFound`, `IsRateLimited`:

```go
_, err := client.Scrobble.CreateScrobble(ctx, in)
var apiErr *rocksky.Error
if errors.As(err, &apiErr) && apiErr.IsRateLimited() {
    // back off and retry
}
```

## Examples

Runnable programs live under [`examples/`](./examples):

| Path                    | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `examples/profile`      | Print a user's profile and lifetime stats.         |
| `examples/feed`         | Stream the public (or actor-scoped) scrobble feed. |
| `examples/search`       | Run a global search and print mixed-type results.  |
| `examples/scrobble`     | Record a scrobble (requires `ROCKSKY_TOKEN`).      |

Run any of them with:

```bash
go run ./examples/profile -actor tsiry.bsky.social
```

## Types

Public model types are derived from the [Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons) and live in `rocksky/gen` (package `gen`). The package-level type aliases in `rocksky/types.go` re-export them under their historical names. Regenerate with `bun run lexgen:types` at the repo root.


## Testing

```bash
go test ./...
```

The SDK is tested against `httptest.NewServer` so the suite is fast, offline,
and exercises the real HTTP path end-to-end.

## Status

The SDK covers the read-only and core write endpoints used by Rocksky clients
today: profiles, scrobbles, charts, stats (including Wrapped), search,
recommendations, the social graph, likes and shouts. Niche namespaces
(Dropbox / Google Drive bridges, the in-player remote-control endpoints,
playlists, API key management) can be added in the same shape — open a PR or
file an issue.

## License

[MIT](LICENSE) © Tsiry Sandratraina.
