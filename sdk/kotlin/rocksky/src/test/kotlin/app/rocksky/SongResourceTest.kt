package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class SongResourceTest {

    @Test
    fun `getSong forwards identifier parameter`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.song.getSong" to MockedResponse(
                    """{"id":"s1","title":"Idioteque","artist":"Radiohead","isrc":"GBAYE0500001"}""",
                ),
            ),
        )

        val song = tc.client.song.get(isrc = "GBAYE0500001")

        assertEquals("Idioteque", song.title)
        assertEquals("GBAYE0500001", song.isrc)
        assertEquals(listOf("GBAYE0500001"), tc.recorded.single().query["isrc"])
        tc.close()
    }

    @Test
    fun `matchSong forwards title and artist`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.song.matchSong" to MockedResponse(
                    """{"id":"s1","title":"15 Step","artist":"Radiohead"}""",
                ),
            ),
        )

        val song = tc.client.song.match(title = "15 Step", artist = "Radiohead")

        assertEquals("15 Step", song.title)
        val req = tc.recorded.single()
        assertEquals(listOf("15 Step"), req.query["title"])
        assertEquals(listOf("Radiohead"), req.query["artist"])
        tc.close()
    }
}
