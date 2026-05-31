package app.rocksky

import io.ktor.client.engine.mock.MockEngine
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ErrorsTest {

    @Test
    fun `404 raises NotFoundException with parsed body`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.song.getSong" to MockedResponse(
                    """{"error":"NotFound","message":"song does not exist"}""",
                    status = HttpStatusCode.NotFound,
                ),
            ),
        )

        val ex = assertFailsWith<NotFoundException> { tc.client.song.get(uri = "at://x") }
        assertEquals(404, ex.statusCode)
        assertEquals("NotFound", ex.error)
        assertEquals("song does not exist", ex.serverMessage)
        assertTrue(ex.message?.contains("song does not exist") == true)
        tc.close()
    }

    @Test
    fun `500 raises ServerException`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.song.getSong" to MockedResponse(
                    """{"error":"InternalError"}""",
                    status = HttpStatusCode.InternalServerError,
                ),
            ),
        )

        val ex = assertFailsWith<ServerException> { tc.client.song.get(uri = "at://x") }
        assertEquals(500, ex.statusCode)
        assertEquals("InternalError", ex.error)
        tc.close()
    }

    @Test
    fun `missing token raises Authentication without sending request`() = runTest {
        val engine = MockEngine { _ -> error("should not be called") }

        val client = RockskyClient {
            baseUrl = "https://api.test"
            token = null
            this.engine = engine
        }

        val ex = assertFailsWith<AuthenticationException> { client.actor.getProfile() }
        assertEquals(401, ex.statusCode)
        assertEquals("MissingToken", ex.error)
        assertNull(ex.body)
        client.close()
    }

    @Test
    fun `429 raises RateLimitException`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.feed.search" to MockedResponse(
                    """{"error":"RateLimited","message":"slow down"}""",
                    status = HttpStatusCode.TooManyRequests,
                ),
            ),
        )

        val ex = assertFailsWith<RateLimitException> { tc.client.feed.search("radiohead") }
        assertEquals(429, ex.statusCode)
        tc.close()
    }
}
