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
typealias ScrobbleMatchInput = uniffi.rocksky_uniffi.ScrobbleMatchInput
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

// ── Remote player / controller (remote-control WebSocket) ────────────────────
typealias RemotePlayer = uniffi.rocksky_uniffi.RemotePlayer
typealias RemoteController = uniffi.rocksky_uniffi.RemoteController
typealias RemoteNowPlaying = uniffi.rocksky_uniffi.RemoteNowPlaying
typealias RemoteQueueItem = uniffi.rocksky_uniffi.RemoteQueueItem
typealias RemoteStatus = uniffi.rocksky_uniffi.RemoteStatus
typealias RemoteCommand = uniffi.rocksky_uniffi.RemoteCommand
typealias RemoteDevice = uniffi.rocksky_uniffi.RemoteDevice
typealias RemoteEvent = uniffi.rocksky_uniffi.RemoteEvent

/**
 * Read client for the default Rocksky AppView (`https://api.rocksky.app`).
 *
 * These fill in the arities the generated two-arg constructor lacks: `AppView()`
 * and `AppView(base)`. For an auth-gated read client pass a bearer token via the
 * generated constructor directly — `AppView(base, token)`.
 */
fun AppView(): AppView = uniffi.rocksky_uniffi.AppView(null, null)

fun AppView(base: String?): AppView = uniffi.rocksky_uniffi.AppView(base, null)

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

// ── Remote player / controller convenience ───────────────────────────────────
//
// The generated [RemotePlayer] / [RemoteController] speak the remote-control
// WebSocket protocol (see remote-ws/PROTOCOL.md) but use a *poll* model: their
// `nextCommand()` / `nextEvent()` block until something arrives, so a host runs
// them in a loop on a background thread. The factories below connect (mirroring
// `AppView(...)`/`login(...)`), and the `listen { … }` extensions run that loop
// on a daemon thread and dispatch to handler lambdas — TypeScript-SDK `.on()`
// ergonomics, Kotlin DSL style.

/**
 * Connect a Rocksky-controllable player and register it in the background.
 * [name] is the display name in the miniplayer device picker; [url] defaults to
 * the public endpoint when null. Advertise state with `setNowPlaying` /
 * `setStatus` / `setQueue`, and dispatch commands via [listen].
 */
fun remotePlayer(token: String, name: String, url: String? = null): RemotePlayer =
    uniffi.rocksky_uniffi.RemotePlayer.connect(token, name, url)

/**
 * Connect a remote controller (a remote UI) and register it in the background.
 * Drive players with `play`/`pause`/`seek`/… and observe them via [listen].
 */
fun remoteController(token: String, name: String, url: String? = null): RemoteController =
    uniffi.rocksky_uniffi.RemoteController.connect(token, name, url)

/** Command handlers for a [RemotePlayer]; unset handlers are ignored. */
class RemotePlayerHandlers {
    var onPlay: (() -> Unit)? = null
    var onPause: (() -> Unit)? = null
    var onNext: (() -> Unit)? = null
    var onPrevious: (() -> Unit)? = null
    var onSeek: ((positionMs: ULong) -> Unit)? = null
    var onQueueJump: ((index: UInt) -> Unit)? = null
    var onQueueRemove: ((index: UInt) -> Unit)? = null
    var onEnqueue: ((cmd: uniffi.rocksky_uniffi.RemoteCommand.Enqueue) -> Unit)? = null
}

/**
 * Poll [RemotePlayer.nextCommand] on a background daemon thread and dispatch to
 * the handlers configured in [configure]. Returns the already-started [Thread];
 * it ends when the player disconnects. Non-blocking.
 *
 * ```kotlin
 * val player = remotePlayer(token, "My Player")
 * player.listen {
 *     onPlay = { engine.play() }
 *     onPause = { engine.pause() }
 *     onSeek = { ms -> engine.seek(ms) }
 * }
 * player.setNowPlaying(RemoteNowPlaying(title = "Chaser", artist = "Calibro 35"))
 * player.setStatus(RemoteStatus.PLAYING)
 * ```
 */
fun RemotePlayer.listen(configure: RemotePlayerHandlers.() -> Unit): Thread {
    val handlers = RemotePlayerHandlers().apply(configure)
    return Thread({
        while (true) {
            when (val cmd = nextCommand() ?: break) {
                is uniffi.rocksky_uniffi.RemoteCommand.Play -> handlers.onPlay?.invoke()
                is uniffi.rocksky_uniffi.RemoteCommand.Pause -> handlers.onPause?.invoke()
                is uniffi.rocksky_uniffi.RemoteCommand.Next -> handlers.onNext?.invoke()
                is uniffi.rocksky_uniffi.RemoteCommand.Previous -> handlers.onPrevious?.invoke()
                is uniffi.rocksky_uniffi.RemoteCommand.Seek -> handlers.onSeek?.invoke(cmd.positionMs)
                is uniffi.rocksky_uniffi.RemoteCommand.QueueJump -> handlers.onQueueJump?.invoke(cmd.index)
                is uniffi.rocksky_uniffi.RemoteCommand.QueueRemove -> handlers.onQueueRemove?.invoke(cmd.index)
                is uniffi.rocksky_uniffi.RemoteCommand.Enqueue -> handlers.onEnqueue?.invoke(cmd)
            }
        }
    }, "rocksky-remote-player").apply { isDaemon = true; start() }
}

/** Event handlers for a [RemoteController]; unset handlers are ignored. */
class RemoteControllerHandlers {
    var onDevices: ((uniffi.rocksky_uniffi.RemoteEvent.Devices) -> Unit)? = null
    var onDeviceRegistered: ((uniffi.rocksky_uniffi.RemoteEvent.DeviceRegistered) -> Unit)? = null
    var onDeviceUnregistered: ((uniffi.rocksky_uniffi.RemoteEvent.DeviceUnregistered) -> Unit)? = null
    var onPrimaryChanged: ((uniffi.rocksky_uniffi.RemoteEvent.PrimaryChanged) -> Unit)? = null
    var onNowPlaying: ((uniffi.rocksky_uniffi.RemoteEvent.NowPlaying) -> Unit)? = null
    var onStatus: ((uniffi.rocksky_uniffi.RemoteEvent.Status) -> Unit)? = null
    var onQueue: ((uniffi.rocksky_uniffi.RemoteEvent.Queue) -> Unit)? = null
}

/**
 * Poll [RemoteController.nextEvent] on a background daemon thread and dispatch to
 * the handlers configured in [configure]. Returns the already-started [Thread];
 * it ends when the controller disconnects. Non-blocking.
 *
 * ```kotlin
 * val controller = remoteController(token, "My Controller")
 * controller.listen {
 *     onDevices = { e -> render(e.devices) }
 *     onNowPlaying = { e -> showTrack(e.deviceId, e.track) }
 * }
 * controller.setPrimary(deviceId)
 * controller.seek(deviceId, 42000u)
 * ```
 */
fun RemoteController.listen(configure: RemoteControllerHandlers.() -> Unit): Thread {
    val handlers = RemoteControllerHandlers().apply(configure)
    return Thread({
        while (true) {
            when (val event = nextEvent() ?: break) {
                is uniffi.rocksky_uniffi.RemoteEvent.Devices -> handlers.onDevices?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.DeviceRegistered -> handlers.onDeviceRegistered?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.DeviceUnregistered -> handlers.onDeviceUnregistered?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.PrimaryChanged -> handlers.onPrimaryChanged?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.NowPlaying -> handlers.onNowPlaying?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.Status -> handlers.onStatus?.invoke(event)
                is uniffi.rocksky_uniffi.RemoteEvent.Queue -> handlers.onQueue?.invoke(event)
            }
        }
    }, "rocksky-remote-controller").apply { isDaemon = true; start() }
}
