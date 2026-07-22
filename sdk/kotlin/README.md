# Rocksky Kotlin SDK

Kotlin/JVM bindings to the shared Rocksky Rust core (`rocksky-sdk`) via
[UniFFI](https://mozilla.github.io/uniffi-rs/) (JNA-loaded): AppView reads, AT
Protocol PDS writes (scrobble fan-out, like, follow, shout, now-playing), a local
duplicate-prevention index, and the identity hashes — the same engine behind
every Rocksky SDK. Lives in the `:rocksky` Gradle module, package `app.rocksky`.

## Install

```kotlin
dependencies {
    implementation("app.rocksky:rocksky-kotlin:0.5.0")
}
```

The published jar bundles the native library for each platform. For a local
checkout, build it once: `./build-core.sh`. `mise.toml` pins Kotlin + a JDK.

## Quick start

```kotlin
import app.rocksky.*

// Reads — unauthenticated. Pass a base URL to override https://api.rocksky.app.
val av = AppView()
println(av.globalStats().scrobbles)
av.topTracks(10u, 0u).forEach { println("${it.artist} — ${it.title}") }

// Writes — log in once (session persisted at the given path).
val agent = login("session.json", "alice.bsky.social", "app-password")
val out = agent.scrobble(ScrobbleInput(
    title = "Chaser", artist = "Calibro 35",
    album = "Jazzploitation", albumArtist = "Calibro 35", durationMs = 182320,
))
println(out.scrobbleUri)   // also artistUri / albumUri / songUri
```

## API

### Reads — `AppView(base: String?)`

`profile(actor)`, `scrobbles(actor, limit, offset)`, `songs(actor, limit, offset)`,
`topTracks(limit, offset)`, `topArtists(limit, offset)`, `globalStats()`. Pass a
base URL to `AppView(...)` to target a custom AppView. (Counts are `UInt`.)

### Writes — `Agent`

`login(sessionPath, identifier, password, appview? = null, dedupPath? = null)`
returns an agent (`appview`/`dedupPath` default to none). Then:

- `scrobble(ScrobbleInput)` — writes the scrobble; with a dedup store, skips an
  existing same-second scrobble of the same track.
- `createSong(SongInput)`, `createAlbum(AlbumInput)`, `createArtist(ArtistInput)`
- `like(uri, cid)`, `unlike(uri)`, `follow(did)`, `unfollow(did)`
- `shout(subjectUri, subjectCid, message)`, `replyShout(...)`
- `setNowPlaying(NowPlayingInput)`, `clearNowPlaying()`
- `refreshSession()`, `did()`, `profile()`, `syncRepo()` (needs `dedupPath`)

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
