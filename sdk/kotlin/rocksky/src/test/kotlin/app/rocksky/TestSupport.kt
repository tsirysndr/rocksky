package app.rocksky

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.fullPath
import io.ktor.http.headersOf
import io.ktor.utils.io.ByteReadChannel

internal data class MockedResponse(
    val body: String,
    val status: HttpStatusCode = HttpStatusCode.OK,
)

internal data class MockRecorded(
    val method: String,
    val httpMethod: String,
    val query: Map<String, List<String>>,
    val authHeader: String?,
    val body: String?,
)

/**
 * A test client paired with the list of requests its engine observed. The list is shared
 * with the mock engine, so it grows in-place as `client` makes calls.
 */
internal class TestClient(
    val client: RockskyClient,
    val recorded: MutableList<MockRecorded>,
) : AutoCloseable {
    override fun close() {
        client.close()
    }
}

internal fun mockedClient(responses: Map<String, MockedResponse>): TestClient {
    val recorded = mutableListOf<MockRecorded>()
    val handler: MockRequestHandler = { request ->
        val path = request.url.fullPath
        val method = path
            .substringAfter("/xrpc/", missingDelimiterValue = "")
            .substringBefore("?")
        recorded += MockRecorded(
            method = method,
            httpMethod = request.method.value,
            query = request.url.parameters.entries().associate { (k, v) -> k to v },
            authHeader = request.headers[HttpHeaders.Authorization],
            body = (request.body as? io.ktor.http.content.TextContent)?.text,
        )
        val match = responses[method] ?: responses["*"]
            ?: error("no mocked response for XRPC method '$method'")
        respond(
            content = ByteReadChannel(match.body),
            status = match.status,
            headers = headersOf(HttpHeaders.ContentType, "application/json"),
        )
    }
    val client = RockskyClient {
        baseUrl = "https://api.test"
        token = "test-token"
        engine = MockEngine(handler)
    }
    return TestClient(client, recorded)
}
