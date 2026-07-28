/**
 * Remote player + controller tour (needs a real Rocksky access token).
 *
 *   ./gradlew :examples:run -PmainClass=app.rocksky.examples.RemoteKt --args="<ACCESS_TOKEN>"
 *
 * A RemotePlayer advertises what "this device" is playing and reacts to commands
 * from a controller; a RemoteController lists the user's players, picks a
 * primary, observes their state, and sends commands. Both use a background poll
 * thread — configure handlers in `listen { … }`.
 *
 * Needs the native lib — run ../build-core.sh first.
 */
package app.rocksky.examples

import app.rocksky.RemoteNowPlaying
import app.rocksky.RemoteQueueItem
import app.rocksky.RemoteStatus
import app.rocksky.listen
import app.rocksky.remoteController
import app.rocksky.remotePlayer

fun main(args: Array<String>) {
    val token = args.firstOrNull() ?: run {
        println("usage: RemoteKt <ACCESS_TOKEN>")
        return
    }

    // ── player: expose this process as a controllable device ─────────────────
    val player = remotePlayer(token, "Kotlin Example Player")
    player.listen {
        onPlay = { println("[player] play") }
        onPause = { println("[player] pause") }
        onNext = { println("[player] next") }
        onPrevious = { println("[player] previous") }
        onSeek = { ms -> println("[player] seek -> ${ms}ms") }
        onQueueJump = { i -> println("[player] queue jump -> $i") }
        onQueueRemove = { i -> println("[player] queue remove -> $i") }
        onEnqueue = { cmd -> println("[player] enqueue ${cmd.tracks.size} track(s), mode=${cmd.mode}") }
    }

    // Advertise a track + queue so controllers have something to show.
    player.setNowPlaying(
        RemoteNowPlaying(
            title = "Chaser",
            artist = "Calibro 35",
            album = "Jazzploitation",
            albumArtist = "Calibro 35",
            albumArt = "",
            durationMs = 182320uL,
            elapsedMs = 0uL,
            isPlaying = true,
        ),
    )
    player.setStatus(RemoteStatus.PLAYING)
    player.setQueue(
        listOf(
            RemoteQueueItem(
                uploadId = "",
                trackId = "",
                title = "Chaser",
                artist = "Calibro 35",
                album = "Jazzploitation",
                albumArtist = "Calibro 35",
                albumArt = "",
                durationMs = 182320uL,
                songUri = "",
                albumUri = "",
                trackNumber = 0,
            ),
        ),
        0u,
    )

    // ── controller: observe + drive the user's players ───────────────────────
    val controller = remoteController(token, "Kotlin Example Controller")
    controller.listen {
        onDevices = { e -> println("[controller] ${e.devices.size} device(s), primary=${e.primaryDevice}") }
        onNowPlaying = { e -> println("[controller] ${e.deviceName}: ${e.track.artist} — ${e.track.title}") }
        onStatus = { e -> println("[controller] ${e.deviceName}: ${e.status}") }
        onQueue = { e -> println("[controller] ${e.deviceName}: queue index ${e.index}") }
    }

    // Drive whatever devices exist (null target = broadcast to all).
    Thread.sleep(1000)
    controller.pause(null)
    controller.seek(null, 42000uL)

    println("listening for 30s — control this player from the Rocksky miniplayer…")
    Thread.sleep(30_000)

    controller.disconnect()
    player.disconnect()
}
