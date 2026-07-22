package app.rocksky.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CoreSmokeTest {
    @Test fun songHashMatchesServer() {
        assertEquals(
            "14038f1349d05112000dfa116f76e2c891891ae17031ab15b40a40b9799577a0",
            songHash("Papercut", "Linkin Park", "Hybrid Theory (Bonus Edition)"),
        )
    }

    @Test fun liveGlobalStatsAndTopTracks() {
        val av = AppView(null)
        val s = av.globalStats()
        assertTrue(s.scrobbles > 0u, "scrobbles should be > 0")
        val top = av.topTracks(3u, 0u)
        assertEquals(3, top.size)
        println("global_stats: ${s.scrobbles} ${s.users} ${s.tracks}")
        top.forEach { println("  top: ${it.artist} - ${it.title}") }
    }
}
