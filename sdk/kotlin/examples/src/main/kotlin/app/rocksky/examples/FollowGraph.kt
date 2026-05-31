package app.rocksky.examples

import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

/**
 * Walk the follow graph: list a user's followers, page through with the cursor.
 *
 * Run: `./gradlew :examples:run -PmainClass=app.rocksky.examples.FollowGraphKt`
 */
fun main(args: Array<String>): Unit = runBlocking {
    val actor = args.firstOrNull() ?: "tsiry.bsky.social"

    RockskyClient().use { client ->
        var cursor: String? = null
        var page = 0
        do {
            val followers = client.graph.getFollowers(actor = actor, limit = 25, cursor = cursor)
            page++
            println("page $page — ${followers.size} followers")
            followers.take(5).forEach { p ->
                println("  • ${p.handle ?: p.did ?: "?"}")
            }
            cursor = followers.cursor
        } while (cursor != null && page < 3)
    }
}
