# Rocksky Kotlin SDK

Kotlin/JVM bindings to the shared Rocksky Rust core (`rocksky-sdk`) via
[UniFFI](https://mozilla.github.io/uniffi-rs/) (JNA-loaded): AppView reads, AT
Protocol PDS writes (scrobble fan-out, like, follow, shout, now-playing), a local
duplicate-prevention index, and the identity hashes — the same engine behind
every Rocksky SDK. Lives in the `:rocksky` Gradle module, package `app.rocksky`.

## Install

```kotlin
dependencies {
    implementation("app.rocksky:rocksky-kotlin:0.6.0")
}
```

The published jar bundles the native library for each platform. For a local
checkout, build it once: `./build-core.sh`. `mise.toml` pins Kotlin + a JDK.

## Quick start

```kotlin
import app.rocksky.*

// Reads — unauthenticated. Pass a base URL to override https://api.rocksky.app.
val av = AppView()  // or AppView(base, token) for auth-gated reads
println(av.globalStats().scrobbles)
av.topTracks(10u, 0u).forEach { println("${it.artist} — ${it.title}") }

// Typed date-window charts, and a bare title+artist resolved to canonical metadata.
av.topTracksInterval(10u, 0u, DateInterval.LastDays(7u))
    .forEach { println("${it.artist} — ${it.title}") }
val meta = av.matchSong("Chaser", "Calibro 35", null, null)  // JSON string

// Writes — log in once (session persisted at the given path).
val agent = login("session.json", "alice.bsky.social", "app-password")
val out = agent.scrobble(ScrobbleInput(
    title = "Chaser", artist = "Calibro 35",
    album = "Jazzploitation", albumArtist = "Calibro 35", durationMs = 182320,
))
println(out.scrobbleUri)   // also artistUri / albumUri / songUri
```

## API

### Reads — `AppView(base: String? = null, token: String? = null)`

Pass a base URL to target a custom AppView; pass `token` to send
`Authorization: Bearer <token>` on every read (for auth-gated queries). Counts
are `UInt`.

**Typed views**: `profile(actor)`, `scrobbles(actor, limit, offset)`,
`songs(actor, limit, offset)`, `albums`, `artists`, `lovedSongs`, `catalogAlbums`,
`catalogArtists`, `catalogSongs`, `albumTracks(uri)`, `artistAlbums(uri)`,
`artistTracks`, `scrobbleFeed`, `scrobble(uri)` (single), `follows`, `followers`,
`knownFollowers`, `topTracks(limit, offset)`, `topArtists(limit, offset)`,
`globalStats()`.

**Typed date-window charts**: `topTracksInterval(limit, offset, interval)` and
`topArtistsInterval(...)`, where `interval` is a `DateInterval`:
`DateInterval.AllTime`, `DateInterval.LastDays(7u)`, `LastWeeks`, `LastMonths`,
`LastYears`, `Range(start, end)` (RFC-3339 bounds). `topTracks` / `topArtists`
are the all-time shorthands.

**Match**: `matchSong(title, artist, mbId, isrc)` resolves a bare title+artist
into full canonical metadata (returns a JSON string).

**Raw-JSON long tail** (each returns a JSON string): `album`, `artist`, `song`,
`playlists`, `playlist`, `stats`, `wrapped`, `scrobblesChart`, `recommendations`,
`neighbours`, shouts, and more.

**Universal escape hatch**: `av.get(nsid, mapOf(...))` calls *any* read query by
NSID and returns a JSON string.

### Writes — `Agent`

`login(sessionPath, identifier, password, appview? = null, dedupPath? = null)`
returns an agent (`appview`/`dedupPath` default to none). Then:

- `scrobble(ScrobbleInput)` — from full metadata, writes the scrobble; with a
  dedup store, skips an existing same-second scrobble of the same track.
- `scrobbleMatch(title, artist, album, mbId, isrc)` — resolves the track via
  `matchSong` first, then fans out the same way (`album` / `mbId` / `isrc`
  optional).
- `createSong(SongInput)`, `createAlbum(AlbumInput)`, `createArtist(ArtistInput)`
- `like(uri, cid)`, `unlike(uri)`, `follow(did)`, `unfollow(did)`
- `shout(subjectUri, subjectCid, message)`, `replyShout(...)`
- `setNowPlaying(NowPlayingInput)`, `clearNowPlaying()`
- `refreshSession()`, `did()`, `profile()`
- `syncRepo()` — mirror the repo into the local dedup index, returning
  per-collection counts as JSON (needs `dedupPath`)
- `hydrateFromJetstream()` — keep the dedup index live off the Jetstream firehose
  (needs `dedupPath`)

Write verbs throw `RockskyException` on failure.

### Identity hashes

`songHash(title, artist, album)`, `albumHash(album, albumArtist)`,
`artistHash(albumArtist)` — lowercase-hex SHA-256, identical to the server and
every other Rocksky SDK.

## Example

```sh
./gradlew :examples:run -PmainClass=app.rocksky.examples.NativeCoreKt
```

## License

MIT.
