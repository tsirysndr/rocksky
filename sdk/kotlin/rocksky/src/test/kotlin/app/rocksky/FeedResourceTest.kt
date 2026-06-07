package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class FeedResourceTest {

    @Test
    fun `stories forwards size, feed and following params and requires auth when following`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.feed.getStories" to MockedResponse(
                    """{"stories":[{"id":"st1","handle":"alice","title":"Heaven","artist":"BMTH"}]}""",
                ),
            ),
        )

        val stories = tc.client.feed.stories(
            size = 10,
            feed = "at://did:plc:abc/app.rocksky.feed.generator/metalcore",
            following = true,
        )

        assertEquals(1, stories.size)
        assertEquals("BMTH", stories[0].artist)
        val req = tc.recorded.single()
        assertEquals(listOf("10"), req.query["size"])
        assertEquals(
            listOf("at://did:plc:abc/app.rocksky.feed.generator/metalcore"),
            req.query["feed"],
        )
        assertEquals(listOf("true"), req.query["following"])
        assertEquals("Bearer test-token", req.authHeader)
        tc.close()
    }

    @Test
    fun `stories without following omits auth header`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.feed.getStories" to MockedResponse("""{"stories":[]}""")),
        )

        tc.client.feed.stories(size = 5)

        val req = tc.recorded.single()
        assertEquals(listOf("5"), req.query["size"])
        assertEquals(null, req.query["feed"])
        assertEquals(null, req.query["following"])
        assertEquals(null, req.authHeader)
        tc.close()
    }
}
