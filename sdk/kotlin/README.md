# Rocksky Kotlin SDK

A coroutine-based, Kotlin-first client for the [Rocksky](https://rocksky.app) XRPC API.

- **Idiomatic Kotlin** — suspending functions, default parameters, builder DSL, `AutoCloseable`.
- **Strongly typed** — every endpoint returns a `@Serializable` data class.
- **Resilient** — every model field is nullable, unknown JSON keys are ignored, and 4xx/5xx responses become typed exceptions.
- **JVM 17+** — uses [Ktor 2.x](https://ktor.io) + `kotlinx.serialization`. Bring your own Ktor engine (CIO is the default).

## Install

The SDK is published as a single module:

```kotlin
dependencies {
    implementation("app.rocksky:rocksky-kotlin:0.2.0")
}
```

Until artifacts land in Maven Central, build locally with `./gradlew :rocksky:publishToMavenLocal` and use `mavenLocal()`.

## Quick start

```kotlin
import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    RockskyClient().use { client ->
        val profile = client.actor.getProfile(did = "did:plc:example")
        println("${profile.handle} — ${profile.displayName}")

        val top = client.charts.topTracks(limit = 10)
        top.forEach { println("${it.title} by ${it.artist}") }
    }
}
```

### Three styles for create methods

Heavier write endpoints (`scrobble.create`, `song.create`, `playlist.create`, `shout.create`, `apiKey.create`) come in three flavors — pick whichever reads best:

```kotlin
// 1. Named arguments (default)
client.scrobble.create(title = "Idioteque", artist = "Radiohead", album = "Kid A", duration = 369)

// 2. Kotlin DSL
client.scrobble.create {
    title = "Idioteque"
    artist = "Radiohead"
    album = "Kid A"
    duration = 369
}

// 3. Fluent builder (Java-friendly)
client.scrobble.builder()
    .title("Idioteque").artist("Radiohead").album("Kid A").duration(369L)
    .send()
```

All three produce the same request. Required fields are validated on `send()` — calling without them throws `IllegalStateException` before any HTTP call.

### Authenticated calls

Many endpoints (`createScrobble`, `like.likeSong`, `apiKey.list`, …) require a bearer token. Pass it via the builder DSL:

```kotlin
val client = RockskyClient {
    token = System.getenv("ROCKSKY_TOKEN")
    userAgent = "my-app/1.0"
}
```

You can also swap tokens at runtime: `client.setToken("…")`.

## API surface

Resources are grouped by XRPC namespace and accessed as properties on `RockskyClient`:

| Resource          | Methods (highlights) |
| ----------------- | -------------------- |
| `client.actor`    | `getProfile`, `getAlbums`, `getArtists`, `getSongs`, `getScrobbles`, `getLovedSongs`, `getPlaylists`, `getNeighbours`, `getCompatibility` |
| `client.album`    | `get`, `list`, `getTracks` |
| `client.apiKey`   | `list`, `create`, `update`, `remove` |
| `client.artist`   | `get`, `list`, `getAlbums`, `getTracks`, `getListeners`, `getRecentListeners` |
| `client.charts`   | `topTracks`, `topArtists`, `scrobblesChart` |
| `client.feed`     | `get`, `getGenerator`, `listGenerators`, `search`, `stories`, `recommendations`, `artistRecommendations`, `albumRecommendations` |
| `client.graph`    | `follow`, `unfollow`, `getFollowers`, `getFollows`, `getKnownFollowers` |
| `client.like`     | `likeSong`, `dislikeSong`, `likeShout`, `dislikeShout` |
| `client.player`   | `play`, `pause`, `next`, `previous`, `seek`, `playFile`, `playDirectory`, `currentlyPlaying`, `queue`, `addItemsToQueue` |
| `client.playlist` | `get`, `list`, `create`, `remove`, `start`, `insertFiles`, `insertDirectory` |
| `client.scrobble` | `get`, `list`, `create` |
| `client.shout`    | `create`, `reply`, `remove`, `report`, `forProfile`, `forAlbum`, `forArtist`, `forTrack`, `replies` |
| `client.song`     | `get`, `list`, `match`, `create`, `getRecentListeners` |

## Errors

Every non-2xx response becomes a typed exception:

```kotlin
import app.rocksky.AuthenticationException
import app.rocksky.NotFoundException
import app.rocksky.RateLimitException
import app.rocksky.ApiException

try {
    client.scrobble.create(title = "…", artist = "…", album = "…")
} catch (e: AuthenticationException) {
    // 401 — refresh token
} catch (e: RateLimitException) {
    // 429 — back off
} catch (e: NotFoundException) {
    // 404
} catch (e: ApiException) {
    // any other API error — `e.statusCode`, `e.error`, `e.serverMessage`, `e.body`
}
```

Network errors surface as `TransportException`. All exceptions inherit from `RockskyException`.

## Configuration

```kotlin
val client = RockskyClient {
    baseUrl       = "https://api.rocksky.app"  // default
    token         = "…"                         // optional bearer token
    userAgent     = "my-app/1.0"
    timeoutMillis = 30_000

    // (Optional) swap engines — Ktor supports OkHttp, Java, Apache, CIO, …
    // engine = OkHttp.create()

    // (Optional) bring your own HttpClient. When set, you own its lifecycle.
    // httpClient = myExistingKtorClient

    configureClient {
        // Tweak the Ktor client further — install logging, custom retry, etc.
    }
}
```

## Examples

The `examples` module ships runnable samples:

```bash
./gradlew :examples:run                                           # BasicProfile (default)
./gradlew :examples:run -PmainClass=app.rocksky.examples.SearchAndChartsKt
ROCKSKY_TOKEN=… ./gradlew :examples:run -PmainClass=app.rocksky.examples.CreateScrobbleKt
```

See [`examples/src/main/kotlin/app/rocksky/examples/`](examples/src/main/kotlin/app/rocksky/examples/) for source.

## Types

Public model types are derived from the [Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons) and live in `app.rocksky.generated`. The `app.rocksky.Models` typealiases re-export them under their historical names; `Profile`, `ApiKey`, and `FollowList` extend with SDK-specific fields. Regenerate with `bun run lexgen:types` at the repo root.


## Build & test

```bash
./gradlew :rocksky:build           # compile + test + jar
./gradlew :rocksky:test            # tests only
./gradlew :rocksky:publishToMavenLocal
```

Tests use Ktor's `MockEngine` — no network access required.

Java 17 is required for the toolchain. If you use [`mise`](https://mise.jdx.dev) the bundled `mise.toml` pins it; otherwise install a JDK 17 yourself.

## License

[MIT](LICENSE) © Tsiry Sandratraina.
