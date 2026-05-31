# Rocksky Swift SDK

A typed, async/await Swift client for the [Rocksky](https://rocksky.app) XRPC
API. Covers every `app.rocksky.*` endpoint declared in the official lexicon.

- Swift 5.9+ · iOS 15 · macOS 12 · tvOS 15 · watchOS 8 · visionOS 1 · Linux
- 100% `Sendable` / strict-concurrency clean
- Zero non-Foundation dependencies
- Pluggable `URLSession` for mocking and proxies

## Install

In your `Package.swift`:

```swift
.package(url: "https://github.com/tsirysndr/rocksky.git", from: "0.1.0")
```

then add the dependency to your target:

```swift
.target(name: "MyApp", dependencies: [
    .product(name: "Rocksky", package: "rocksky")
])
```

## Quick start

```swift
import Rocksky

let client = RockskyClient()  // defaults to https://api.rocksky.app

// Read endpoints are public.
let profile = try await client.actor.getProfile(did: "tsiry.rocksky.app")
let chart = try await client.charts.getTopArtists(limit: 10)
for a in chart.artists {
    print("\(a.name ?? "?") — \(a.playCount ?? 0) plays")
}
```

## Authentication

Write endpoints need a credential. Two strategies are supported:

```swift
// Long-lived API key (created via app.rocksky.apikey.createApikey).
let client = RockskyClient(auth: .apiKey("rk_live_..."))

// Or a short-lived JWT obtained from the standard Rocksky auth flow.
let client = RockskyClient(auth: .bearer(jwt))
```

Both render as `Authorization: Bearer <token>` on the wire — the distinction
exists so call sites express intent.

You can rotate credentials on an existing client:

```swift
await client.transport.setAuth(.bearer(newToken))
```

## Namespaces

`RockskyClient` exposes one struct per lexicon namespace:

| Property              | Lexicon prefix                    |
| --------------------- | --------------------------------- |
| `client.actor`        | `app.rocksky.actor.*`             |
| `client.album`        | `app.rocksky.album.*`             |
| `client.apikey`       | `app.rocksky.apikey.*`            |
| `client.artist`       | `app.rocksky.artist.*`            |
| `client.charts`       | `app.rocksky.charts.*`            |
| `client.dropbox`      | `app.rocksky.dropbox.*`           |
| `client.feed`         | `app.rocksky.feed.*`              |
| `client.googleDrive`  | `app.rocksky.googledrive.*`       |
| `client.graph`        | `app.rocksky.graph.*`             |
| `client.like`         | `app.rocksky.like.*`              |
| `client.mirror`       | `app.rocksky.mirror.*`            |
| `client.player`       | `app.rocksky.player.*`            |
| `client.playlist`     | `app.rocksky.playlist.*`          |
| `client.scrobble`     | `app.rocksky.scrobble.*`          |
| `client.shout`        | `app.rocksky.shout.*`             |
| `client.song`         | `app.rocksky.song.*`              |
| `client.spotify`      | `app.rocksky.spotify.*`           |
| `client.stats`        | `app.rocksky.stats.*`             |

## Examples

### Scrobble a track

```swift
let client = RockskyClient(auth: .apiKey(ProcessInfo.processInfo.environment["ROCKSKY_API_KEY"]!))

// Convenience overload — pass fields directly:
let scrobble = try await client.scrobble.createScrobble(
    title: "Idioteque",
    artist: "Radiohead",
    album: "Kid A",
    duration: 309_000,
    timestamp: Int(Date().timeIntervalSince1970)
)
print("Scrobbled — at-uri:", scrobble.uri ?? "?")

// Or build a CreateScrobbleInput explicitly when you want to pass the same
// payload to multiple calls / store it / log it:
let payload = CreateScrobbleInput(title: "Idioteque", artist: "Radiohead")
_ = try await client.scrobble.createScrobble(payload)
```

The same shape applies to `createSong`, `createApikey`, `updateApikey`, and
`mirror.putMirrorSource` — every create/update endpoint offers both a direct
keyword-argument form and an explicit-input-type form.

### Paginate scrobbles

```swift
var offset = 0
let pageSize = 100
while true {
    let page = try await client.scrobble.getScrobbles(
        did: "tsiry.rocksky.app",
        limit: pageSize,
        offset: offset
    )
    if page.scrobbles.isEmpty { break }
    for s in page.scrobbles { print(s.title ?? "?", "—", s.artist ?? "?") }
    offset += page.scrobbles.count
}
```

### Search

```swift
let hits = try await client.feed.search(query: "boards of canada")
for hit in hits.hits ?? [] {
    switch hit {
    case .song(let s):     print("song:", s.title ?? "?")
    case .album(let a):    print("album:", a.title ?? "?")
    case .artist(let a):   print("artist:", a.name ?? "?")
    case .playlist(let p): print("playlist:", p.title ?? "?")
    case .profile(let p):  print("profile:", p.handle ?? "?")
    case .unknown:         break
    }
}
```

### Concurrent fetches

`async let` works exactly as you'd expect:

```swift
async let profile  = client.actor.getProfile(did: handle)
async let recent   = client.actor.getActorScrobbles(did: handle, limit: 5)
async let topYear  = client.stats.getWrapped(did: handle, year: 2025)
let (p, r, w) = try await (profile, recent, topYear)
```

### Custom session (proxies, retries, mocking)

```swift
let cfg = URLSessionConfiguration.default
cfg.httpAdditionalHeaders = ["X-Trace": UUID().uuidString]
let client = RockskyClient(
    baseURL: URL(string: "https://api.staging.rocksky.app")!,
    session: URLSession(configuration: cfg)
)
```

For tests, route requests through `URLProtocol` — see
`Tests/RockskyTests/MockURLProtocol.swift` for a working pattern.

## Error handling

All methods throw `RockskyError`:

```swift
do {
    _ = try await client.scrobble.createScrobble(...)
} catch RockskyError.http(let status, let body, _) {
    print("HTTP \(status): \(body?.message ?? "")")
} catch RockskyError.decoding(let inner) {
    print("Couldn't decode response:", inner)
} catch RockskyError.transport(let inner) {
    print("Network failure:", inner)
} catch {
    print("Unexpected:", error)
}
```

`RockskyError.http` carries the decoded XRPC error envelope
(`{ "error": "...", "message": "..." }`) when the server provides one.

## Running the examples

```bash
cd sdk/swift/Examples

# Public read — no auth required
swift run ProfileFetcher tsiry.rocksky.app
swift run TopArtists 20

# Write — needs an API key
ROCKSKY_API_KEY=rk_live_xxx swift run ScrobbleCLI "Pyramid Song" "Radiohead"
```

## Tests

```bash
cd sdk/swift
swift test
```

Tests use a `URLProtocol` mock — no network access required.

## License

[MIT](LICENSE) © Tsiry Sandratraina.
