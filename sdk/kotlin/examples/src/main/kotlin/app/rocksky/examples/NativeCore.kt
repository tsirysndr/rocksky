/**
 * Read-only tour of the native Rocksky core (no auth needed).
 *
 *   ./gradlew :examples:run -PmainClass=app.rocksky.examples.NativeCoreKt
 *
 * Needs the native lib — run ../build-core.sh first.
 */
package app.rocksky.examples

import app.rocksky.core.AppView
import app.rocksky.core.ScrobbleInput
import app.rocksky.core.songHash

fun main() {
    val av = AppView(null)
    val s = av.globalStats()
    println("global: ${s.scrobbles} scrobbles · ${s.users} users · ${s.tracks} tracks")

    println("top tracks:")
    av.topTracks(5u, 0u).forEach { println("  ${it.artist} — ${it.title}") }

    println("song hash: " + songHash("Chaser", "Calibro 35", "Jazzploitation"))

    // --- write side (uncomment with real credentials) ---
    // val agent = app.rocksky.core.Agent.loginPassword("session.json", "alice.bsky.social", "app-pw", null, null)
    // val out = agent.scrobble(ScrobbleInput(
    //     title = "Chaser", artist = "Calibro 35",
    //     album = "Jazzploitation", albumArtist = "Calibro 35", durationMs = 182320,
    // ))
    // println("scrobbled: ${out.scrobbleUri}")
}
