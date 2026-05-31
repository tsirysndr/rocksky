package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class BuilderAndDslTest {

    @Test
    fun `scrobble DSL produces same body as positional create`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.scrobble.createScrobble" to MockedResponse("""{"uri":"at://x"}""")),
        )

        tc.client.scrobble.create {
            title = "Idioteque"
            artist = "Radiohead"
            album = "Kid A"
            duration = 369
            isrc = "GBAYE0000259"
        }

        val body = RockskyJson.parseToJsonElement(tc.recorded.single().body ?: "{}") as JsonObject
        assertEquals("Idioteque", body["title"]?.jsonPrimitive?.content)
        assertEquals("Radiohead", body["artist"]?.jsonPrimitive?.content)
        assertEquals("Kid A", body["album"]?.jsonPrimitive?.content)
        assertEquals("369", body["duration"]?.jsonPrimitive?.content)
        assertEquals("GBAYE0000259", body["isrc"]?.jsonPrimitive?.content)
        assertNull(body["mbId"], "unset fields should be omitted from body")
        tc.close()
    }

    @Test
    fun `scrobble fluent builder reaches the same endpoint`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.scrobble.createScrobble" to MockedResponse("""{"uri":"at://x"}""")),
        )

        tc.client.scrobble.builder()
            .title("Karma Police")
            .artist("Radiohead")
            .album("OK Computer")
            .duration(265L)
            .send()

        val req = tc.recorded.single()
        assertEquals("POST", req.httpMethod)
        val body = RockskyJson.parseToJsonElement(req.body ?: "{}") as JsonObject
        assertEquals("Karma Police", body["title"]?.jsonPrimitive?.content)
        assertEquals("Radiohead", body["artist"]?.jsonPrimitive?.content)
        assertEquals("OK Computer", body["album"]?.jsonPrimitive?.content)
        tc.close()
    }

    @Test
    fun `scrobble DSL without title fails before request`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.scrobble.createScrobble" to MockedResponse("""{}""")),
        )

        assertFailsWith<IllegalStateException> {
            tc.client.scrobble.create { artist = "Radiohead" }
        }
        assertEquals(0, tc.recorded.size, "validation should fail before any HTTP call")
        tc.close()
    }

    @Test
    fun `shout builder routes to reply when parent is set`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.shout.createShout" to MockedResponse("""{"id":"new"}"""),
                "app.rocksky.shout.replyShout" to MockedResponse("""{"id":"reply"}"""),
            ),
        )

        val plain = tc.client.shout.create { message = "Banger." }
        val reply = tc.client.shout.builder().message("agreed").parent("orig-id").send()

        assertEquals("new", plain.id)
        assertEquals("reply", reply.id)
        assertEquals(2, tc.recorded.size)
        assertEquals("app.rocksky.shout.createShout", tc.recorded[0].method)
        assertEquals("app.rocksky.shout.replyShout", tc.recorded[1].method)
        tc.close()
    }

    @Test
    fun `apiKey builder name required`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.apikey.createApikey" to MockedResponse("""{}""")),
        )

        assertFailsWith<IllegalStateException> {
            tc.client.apiKey.builder().description("oops, no name").send()
        }
        tc.close()
    }
}
