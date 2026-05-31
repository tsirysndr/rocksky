package app.rocksky.examples

import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

/**
 * Look up a public profile and print a small summary.
 *
 * Run: `./gradlew :examples:run -PmainClass=app.rocksky.examples.BasicProfileKt`
 */
fun main(args: Array<String>): Unit = runBlocking {
    val handle = args.firstOrNull() ?: "tsiry.bsky.social"

    RockskyClient().use { client ->
        val profile = client.actor.getProfile(did = handle)
        println("did:         ${profile.did ?: "(unknown)"}")
        println("handle:      ${profile.handle ?: handle}")
        println("displayName: ${profile.displayName ?: "(none)"}")
        println("createdAt:   ${profile.createdAt ?: "?"}")

        val recent = client.actor.getScrobbles(did = profile.did ?: handle, limit = 5)
        println("\nLast ${recent.size} scrobbles:")
        recent.forEach { s ->
            println("  • ${s.title ?: "?"} — ${s.artist ?: "?"} @ ${s.date ?: "?"}")
        }
    }
}
