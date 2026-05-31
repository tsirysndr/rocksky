package app.rocksky.examples

import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

/**
 * Search the catalog and print the global top tracks of the week.
 *
 * Run: `./gradlew :examples:run -PmainClass=app.rocksky.examples.SearchAndChartsKt`
 */
fun main(args: Array<String>): Unit = runBlocking {
    val query = args.firstOrNull() ?: "radiohead"

    RockskyClient().use { client ->
        println("→ Search: $query")
        val results = client.feed.search(query = query)
        println("  ${results.estimatedTotalHits ?: results.hits.size} hits (showing first 5):")
        results.hits.take(5).forEach { hit -> println("  • $hit") }

        println("\n→ Top 10 tracks this week:")
        val tracks = client.charts.topTracks(limit = 10)
        tracks.forEachIndexed { i, t ->
            println("  ${(i + 1).toString().padStart(2)}. ${t.title ?: "?"} — ${t.artist ?: "?"}  (${t.playCount ?: 0} plays)")
        }
    }
}
