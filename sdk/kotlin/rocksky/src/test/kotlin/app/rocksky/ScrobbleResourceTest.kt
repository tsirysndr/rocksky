package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScrobbleResourceTest {

    @Test
    fun `list scrobbles parses list with array key`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.scrobble.getScrobbles" to MockedResponse(
                    """{"scrobbles":[{"id":"s1","title":"Karma Police","artist":"Radiohead"}]}""",
                ),
            ),
        )

        val scrobbles = tc.client.scrobble.list(did = "did:plc:foo", limit = 50)

        assertEquals(1, scrobbles.size)
        assertEquals("Karma Police", scrobbles[0].title)
        val req = tc.recorded.single()
        assertEquals(listOf("50"), req.query["limit"])
        assertNull(req.authHeader)
        tc.close()
    }

    @Test
    fun `list scrobbles with following triggers auth`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.scrobble.getScrobbles" to MockedResponse("""{"scrobbles":[]}""")),
        )

        tc.client.scrobble.list(following = true)

        val req = tc.recorded.single()
        assertEquals(listOf("true"), req.query["following"])
        assertEquals("Bearer test-token", req.authHeader)
        tc.close()
    }

    @Test
    fun `create scrobble sends camelCase body and drops nulls`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.scrobble.createScrobble" to MockedResponse(
                    """{"uri":"at://did:plc:me/app.rocksky.scrobble/3kabc"}""",
                ),
            ),
        )

        val result = tc.client.scrobble.create(
            title = "Paranoid Android",
            artist = "Radiohead",
            album = "OK Computer",
            duration = 387,
            mbId = "mb-123",
            trackNumber = 2,
        )

        val req = tc.recorded.single()
        assertEquals("POST", req.httpMethod)
        val body = RockskyJson.parseToJsonElement(req.body ?: "{}") as JsonObject
        assertEquals("Paranoid Android", body["title"]?.jsonPrimitive?.content)
        assertEquals("Radiohead", body["artist"]?.jsonPrimitive?.content)
        assertEquals("OK Computer", body["album"]?.jsonPrimitive?.content)
        assertEquals("387", body["duration"]?.jsonPrimitive?.content)
        assertEquals("mb-123", body["mbId"]?.jsonPrimitive?.content)
        assertEquals("2", body["trackNumber"]?.jsonPrimitive?.content)
        assertNull(body["isrc"], "null fields should be omitted")
        assertNotNull(result)
        assertTrue(req.authHeader?.startsWith("Bearer") == true)
        tc.close()
    }
}
