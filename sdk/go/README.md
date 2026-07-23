# rocksky (Go)

Official Go SDK for [Rocksky](https://rocksky.app) — a music scrobbling &
discovery platform on the AT Protocol. Built on
[bluesky-social/indigo](https://github.com/bluesky-social/indigo): `Client` does
unauthenticated AppView reads, and `Agent` logs in with an app password and
writes `app.rocksky.*` records to the user's PDS.

## Install

```sh
go get github.com/tsirysndr/rocksky/sdk/go
```

## Quickstart

```go
import (
    "context"
    "github.com/tsirysndr/rocksky/sdk/go/rocksky"
    "github.com/tsirysndr/rocksky/sdk/go/rocksky/gen"
)

ctx := context.Background()

// Reads — unauthenticated. NewClient("") uses https://api.rocksky.app.
c := rocksky.NewClient("")
stats, _ := c.GlobalStats(ctx)
top, _ := c.TopTracks(ctx, 10, 0)
month, _ := c.TopTracksInterval(ctx, rocksky.LastDays(30), 50, 0)

// Optional bearer token for auth-gated queries.
me := rocksky.NewClient("").WithToken("<access-token>")
loved, _ := me.LovedSongs(ctx, "alice.bsky.social", 25, 0)

// Writes — log in with an app password (resolves the PDS automatically).
agent, _ := rocksky.Login(ctx, "alice.bsky.social", "app-password")
uri, _ := agent.Scrobble(ctx, gen.ScrobbleRecord{
    Title: "Chaser", Artist: "Calibro 35",
    Album: "Jazzploitation", AlbumArtist: "Calibro 35", Duration: 182320,
})
```

## API

**Reads — `Client`**: the full `app.rocksky.*` read surface. Basics: `Profile`,
`Scrobbles`, `Songs`, `Albums`, `Artists`, `TopTracks`, `TopArtists`, `Search`,
`GlobalStats`. Catalog & relations: `CatalogAlbums`, `CatalogArtists`,
`CatalogSongs`, `AlbumTracks`, `ArtistAlbums`, `ArtistTracks`, `LovedSongs`,
`ScrobbleFeed`, `Scrobble` (single by uri), `Follows`, `Followers`,
`KnownFollowers`, plus raw `json.RawMessage` detail methods (`Album`, `Artist`,
`Song`, `Playlists`, `Playlist`, `Stats`, `Wrapped`, `ScrobblesChart`,
`Recommendations`, `Neighbours`, `Shouts`, and more). `Get(ctx, nsid, params)` is
the universal escape hatch — calls any read query by nsid and returns raw
`json.RawMessage`; every named method is sugar over it. `MatchSong(ctx, title,
artist, mbID, isrc)` resolves a bare title + artist into full canonical metadata.
Attach a bearer token for auth-gated queries with `NewClient("").WithToken(token)`.

**Date-window charts**: `TopTracksInterval` / `TopArtistsInterval` take a typed
`DateInterval`, built with `rocksky.AllTime()`, `rocksky.LastDays(n)`,
`LastWeeks`, `LastMonths`, `LastYears`, or `rocksky.Range(start, end)`. Plain
`TopTracks` / `TopArtists` remain all-time shorthands.

**Writes — `Agent`**: `Scrobble` (fan-out from full metadata),
`ScrobbleMatch(ctx, appview, ScrobbleMatchInput{Title, Artist})` (resolves
metadata via `MatchSong`, then the same fan-out; Title/Artist required,
Album/MbID/ISRC/Timestamp optional pointers, `appview` "" = default),
`CreateSong`/`CreateAlbum`/`CreateArtist`, `Like`, `Follow`, `Shout`/`ReplyShout`,
`SetNowPlaying`/`ClearNowPlaying`, `Delete`, `RefreshSession`. Records are the
generated `gen.*Record` types.

**Identity hashes**: `SongHash`, `AlbumHash`, `ArtistHash` — lowercase-hex
SHA-256, identical to the server and every other Rocksky SDK.

## Duplicate prevention + real-time sync

An optional local index (embedded [bbolt](https://github.com/etcd-io/bbolt) KV —
no cgo/RocksDB) prevents duplicate writes and stays live off the firehose:

```go
idx, _ := rocksky.OpenIndex("dedup.db")
defer idx.Close()
agent.UseIndex(idx)

stats, _ := agent.SyncRepo(ctx)        // backfill from the repo CAR (com.atproto.sync.getRepo)
go agent.HydrateFromJetstream(ctx)     // keep it live from Jetstream (all 4 servers)
```

With an index attached, the write verbs skip records that already exist (return
the existing URI) and a same-second scrobble of the same track isn't duplicated.

## Example

```sh
go run ./examples/native
```

## License

MIT.
