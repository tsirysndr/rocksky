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

// Writes — log in with an app password (resolves the PDS automatically).
agent, _ := rocksky.Login(ctx, "alice.bsky.social", "app-password")
uri, _ := agent.Scrobble(ctx, gen.ScrobbleRecord{
    Title: "Chaser", Artist: "Calibro 35",
    Album: "Jazzploitation", AlbumArtist: "Calibro 35", Duration: 182320,
})
```

## API

**Reads — `Client`**: `Profile`, `Scrobbles`, `Songs`, `Albums`, `Artists`,
`TopTracks`, `TopArtists`, `Search`, `GlobalStats`.

**Writes — `Agent`**: `Scrobble`, `CreateSong`/`CreateAlbum`/`CreateArtist`,
`Like`, `Follow`, `Shout`/`ReplyShout`, `SetNowPlaying`/`ClearNowPlaying`,
`Delete`, `RefreshSession`. Records are the generated `gen.*Record` types.

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
