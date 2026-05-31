package app.rocksky

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RockskyClientTest {

    @Test
    fun `setToken updates subsequent requests`() = runTest {
        var capturedAuth: String? = null
        val engine = MockEngine { request ->
            capturedAuth = request.headers[HttpHeaders.Authorization]
            respond(
                content = ByteReadChannel("""{"handle":"me.test"}"""),
                status = io.ktor.http.HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }

        val client = RockskyClient {
            baseUrl = "https://api.test"
            token = "first"
            this.engine = engine
        }

        client.actor.getProfile()
        assertEquals("Bearer first", capturedAuth)

        client.setToken("second")
        client.actor.getProfile()
        assertEquals("Bearer second", capturedAuth)

        client.setToken(null)
        // After clearing, an authed call should fail before reaching the network.
        assertNull(client.token())
        client.close()
    }

    @Test
    fun `baseUrl with trailing slash is normalized`() = runTest {
        var capturedPath: String? = null
        val engine = MockEngine { request ->
            capturedPath = request.url.encodedPath
            respond(
                content = ByteReadChannel("{}"),
                status = io.ktor.http.HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }

        val client = RockskyClient {
            baseUrl = "https://api.test/"
            token = "t"
            this.engine = engine
        }

        client.actor.getProfile(did = "did:plc:foo")
        assertEquals("/xrpc/app.rocksky.actor.getProfile", capturedPath)
        client.close()
    }
}
