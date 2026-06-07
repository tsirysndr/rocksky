package app.rocksky.examples

import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

private val FEEDS = mapOf(
    "metalcore" to "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore",
    "trap" to "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap",
    "synthwave" to "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave",
)

/**
 * Show the latest scrobble per user, optionally filtered by feed or restricted
 * to people you follow.
 *
 * Run:
 *   ./gradlew :examples:run -PmainClass=app.rocksky.examples.StoriesKt
 *   ./gradlew :examples:run -PmainClass=app.rocksky.examples.StoriesKt --args="metalcore"
 *   ROCKSKY_TOKEN=… ./gradlew :examples:run -PmainClass=app.rocksky.examples.StoriesKt --args="following"
 */
fun main(args: Array<String>): Unit = runBlocking {
    val mode = args.firstOrNull()
    val token = System.getenv("ROCKSKY_TOKEN")

    val client = if (token.isNullOrBlank()) RockskyClient() else RockskyClient { this.token = token }
    client.use {
        val stories = when {
            mode in FEEDS.keys -> it.feed.stories(size = 10, feed = FEEDS[mode])
            mode == "following" -> it.feed.stories(size = 10, following = true)
            else -> it.feed.stories(size = 10)
        }
        stories.forEach { s ->
            println("@${s.handle ?: "?"}  ${s.artist ?: "?"} — ${s.title ?: "?"}")
        }
        println("\n${stories.size} stories")
    }
}
