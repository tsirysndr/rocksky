/**
 * Rocksky Kotlin SDK, under the `app.rocksky` package.
 *
 * Thin bindings over the UniFFI-generated core (`rocksky-sdk`) — the same auth /
 * record-write / dedup engine behind every Rocksky SDK. AppView reads + Agent
 * writes (scrobble, like, follow, shout, now-playing) + identity hashes.
 *
 * ```kotlin
 * import app.rocksky.*
 *
 * val av = AppView()                       // or AppView("https://my-appview")
 * println(av.globalStats().scrobbles)
 *
 * val agent = login("session.json", "alice.bsky.social", "app-pw")
 * val out = agent.scrobble(ScrobbleInput(
 *     title = "Chaser", artist = "Calibro 35",
 *     album = "Jazzploitation", albumArtist = "Calibro 35", durationMs = 182320,
 * ))
 * println(out.scrobbleUri)
 * ```
 */
package app.rocksky

typealias AppView = uniffi.rocksky_uniffi.AppView
typealias Agent = uniffi.rocksky_uniffi.Agent
typealias ScrobbleInput = uniffi.rocksky_uniffi.ScrobbleInput
typealias SongInput = uniffi.rocksky_uniffi.SongInput
typealias AlbumInput = uniffi.rocksky_uniffi.AlbumInput
typealias ArtistInput = uniffi.rocksky_uniffi.ArtistInput
typealias NowPlayingInput = uniffi.rocksky_uniffi.NowPlayingInput
typealias ScrobbleResult = uniffi.rocksky_uniffi.ScrobbleResult
typealias Profile = uniffi.rocksky_uniffi.Profile
typealias ProfileView = uniffi.rocksky_uniffi.ProfileView
typealias ScrobbleView = uniffi.rocksky_uniffi.ScrobbleView
typealias SongView = uniffi.rocksky_uniffi.SongView
typealias ArtistView = uniffi.rocksky_uniffi.ArtistView
typealias AlbumView = uniffi.rocksky_uniffi.AlbumView
typealias GlobalStats = uniffi.rocksky_uniffi.GlobalStats
typealias DateInterval = uniffi.rocksky_uniffi.DateInterval
typealias RockskyException = uniffi.rocksky_uniffi.RockskyException

/**
 * Read client for the default Rocksky AppView (`https://api.rocksky.app`). Use
 * `AppView("https://…")` to target a custom endpoint.
 */
fun AppView(): AppView = uniffi.rocksky_uniffi.AppView(null)

/**
 * Log in with an app password, persisting the session at [sessionPath]. Pass
 * [appview] to override the AppView URL and [dedupPath] to enable the local
 * dedup index.
 */
fun login(
    sessionPath: String,
    identifier: String,
    password: String,
    appview: String? = null,
    dedupPath: String? = null,
): Agent = uniffi.rocksky_uniffi.Agent.loginPassword(sessionPath, identifier, password, appview, dedupPath)

/** Identity hash of a song — identical across every Rocksky SDK. */
fun songHash(title: String, artist: String, album: String): String =
    uniffi.rocksky_uniffi.songHash(title, artist, album)

/** Identity hash of an album. */
fun albumHash(album: String, albumArtist: String): String =
    uniffi.rocksky_uniffi.albumHash(album, albumArtist)

/** Identity hash of an artist. */
fun artistHash(albumArtist: String): String =
    uniffi.rocksky_uniffi.artistHash(albumArtist)
