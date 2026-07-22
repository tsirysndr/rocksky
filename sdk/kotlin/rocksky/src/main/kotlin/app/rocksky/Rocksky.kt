/**
 * Native core bindings for Rocksky, under the `app.rocksky.core` package.
 *
 * Thin aliases over the UniFFI-generated bindings to the shared Rust core
 * (`rocksky-sdk`), so the auth / record-write / dedup logic is identical across
 * the Rust, Python, Ruby, Clojure, and BEAM SDKs. This is the write + firehose
 * side (AT Protocol PDS writes); the sibling `app.rocksky` (`:rocksky`) module is
 * the ktor HTTP read side.
 *
 * ```kotlin
 * import app.rocksky.core.*
 *
 * val av = AppView(null)
 * println(av.globalStats().scrobbles)
 *
 * val agent = Agent.loginPassword("session.json", "alice.bsky.social", "app-pw", null, null)
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
typealias GlobalStats = uniffi.rocksky_uniffi.GlobalStats
typealias RockskyException = uniffi.rocksky_uniffi.RockskyException

/** Identity hash of a song — identical across every Rocksky SDK. */
fun songHash(title: String, artist: String, album: String): String =
    uniffi.rocksky_uniffi.songHash(title, artist, album)

/** Identity hash of an album. */
fun albumHash(album: String, albumArtist: String): String =
    uniffi.rocksky_uniffi.albumHash(album, albumArtist)

/** Identity hash of an artist. */
fun artistHash(albumArtist: String): String =
    uniffi.rocksky_uniffi.artistHash(albumArtist)
