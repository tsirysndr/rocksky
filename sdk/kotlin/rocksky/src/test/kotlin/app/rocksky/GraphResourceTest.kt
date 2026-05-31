package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class GraphResourceTest {

    @Test
    fun `getFollowers returns parsed FollowList with subject`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.graph.getFollowers" to MockedResponse(
                    """
                    {
                      "subject": {"did":"did:plc:foo","handle":"foo.test"},
                      "followers": [
                        {"did":"did:plc:a","handle":"a.test"},
                        {"did":"did:plc:b","handle":"b.test"}
                      ],
                      "cursor": "next-page",
                      "count": 2
                    }
                    """.trimIndent(),
                ),
            ),
        )

        val list = tc.client.graph.getFollowers(actor = "did:plc:foo", limit = 10)

        assertNotNull(list.subject)
        assertEquals("foo.test", list.subject?.handle)
        assertEquals(2, list.size)
        assertEquals("a.test", list[0].handle)
        assertEquals("next-page", list.cursor)
        assertEquals(2, list.count)
        tc.close()
    }

    @Test
    fun `follow procedure passes account as query param`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.graph.followAccount" to MockedResponse("""{"ok":true}""")),
        )

        tc.client.graph.follow(account = "did:plc:friend")

        val req = tc.recorded.single()
        assertEquals("POST", req.httpMethod)
        assertEquals(listOf("did:plc:friend"), req.query["account"])
        assertEquals("Bearer test-token", req.authHeader)
        tc.close()
    }
}
