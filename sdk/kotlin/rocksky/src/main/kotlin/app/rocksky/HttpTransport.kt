package app.rocksky

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpRequestRetry
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.URLBuilder
import io.ktor.http.appendPathSegments
import io.ktor.http.contentType
import io.ktor.http.content.TextContent
import io.ktor.http.isSuccess
import io.ktor.http.takeFrom
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal val RockskyJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    encodeDefaults = false
    explicitNulls = false
    isLenient = true
}

/**
 * Thin HTTP layer that speaks XRPC. Owned by [RockskyClient] and shared by every
 * resource. You usually don't construct this directly.
 */
public class HttpTransport internal constructor(
    public val baseUrl: String,
    initialToken: String?,
    private val httpClient: HttpClient,
    private val ownsClient: Boolean,
    public val userAgent: String,
) : AutoCloseable {

    @Volatile
    private var token: String? = initialToken

    public fun token(): String? = token

    public fun setToken(newToken: String?) {
        token = newToken
    }

    override fun close() {
        if (ownsClient) httpClient.close()
    }

    /** Perform an XRPC `query` (HTTP GET). */
    public suspend fun query(
        method: String,
        params: Map<String, Any?> = emptyMap(),
        requireAuth: Boolean = false,
    ): JsonElement = request(HttpMethod.Get, method, params, body = null, requireAuth)

    /** Perform an XRPC `procedure` (HTTP POST). */
    public suspend fun procedure(
        method: String,
        params: Map<String, Any?> = emptyMap(),
        body: JsonElement? = null,
        requireAuth: Boolean = true,
    ): JsonElement = request(HttpMethod.Post, method, params, body, requireAuth)

    private suspend fun request(
        verb: HttpMethod,
        method: String,
        params: Map<String, Any?>,
        body: JsonElement?,
        requireAuth: Boolean,
    ): JsonElement {
        val authToken = token
        if (requireAuth && authToken.isNullOrBlank()) {
            throw apiExceptionFor(
                401,
                method,
                error = "MissingToken",
                serverMessage = "this method requires authentication — pass `token` to RockskyClient",
            )
        }

        val response: HttpResponse = try {
            httpClient.request {
                this.method = verb
                url {
                    takeFrom(baseUrl)
                    appendXrpcMethod(method)
                }
                applyParams(params)
                accept(ContentType.Application.Json)
                if (requireAuth) header(HttpHeaders.Authorization, "Bearer $authToken")
                if (body != null) {
                    // Serialize the JSON ourselves so we don't depend on ContentNegotiation
                    // having a converter installed for JsonElement specifically.
                    contentType(ContentType.Application.Json)
                    setBody(TextContent(RockskyJson.encodeToString(JsonElement.serializer(), body), ContentType.Application.Json))
                }
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: Throwable) {
            throw TransportException("request to $method failed: ${e.message}", e)
        }

        return parseResponse(response, method)
    }

    private fun HttpRequestBuilder.applyParams(params: Map<String, Any?>) {
        for ((key, value) in params) {
            when (value) {
                null -> Unit
                is Boolean -> parameter(key, if (value) "true" else "false")
                is Iterable<*> -> for (v in value) if (v != null) parameter(key, v.toString())
                is Array<*> -> for (v in value) if (v != null) parameter(key, v.toString())
                else -> parameter(key, value.toString())
            }
        }
    }

    private fun URLBuilder.appendXrpcMethod(method: String) {
        // XRPC method ids contain dots and should be preserved verbatim — append them as a
        // single encoded path segment so the dotted name doesn't get split.
        appendPathSegments("xrpc", method)
    }

    private suspend fun parseResponse(response: HttpResponse, method: String): JsonElement {
        if (response.status.value == 204) return JsonNull

        if (!response.status.isSuccess()) {
            val raw = response.bodyAsText()
            val parsed = runCatching { RockskyJson.parseToJsonElement(raw) }.getOrNull()
            val obj = parsed as? JsonObject
            val errCode = obj?.get("error")?.let { it as? JsonPrimitive }?.contentOrNull
            val msg = obj?.get("message")?.let { it as? JsonPrimitive }?.contentOrNull
                ?: if (parsed == null && raw.isNotBlank()) raw else null
            throw apiExceptionFor(response.status.value, method, errCode, msg, parsed)
        }

        // Try JSON, fall back to text wrapped as primitive, fall back to null
        val text = response.bodyAsText()
        if (text.isBlank()) return JsonNull
        return try {
            RockskyJson.parseToJsonElement(text)
        } catch (_: SerializationException) {
            JsonPrimitive(text)
        }
    }

    public companion object {
        public const val DEFAULT_BASE_URL: String = "https://api.rocksky.app"
        public const val DEFAULT_USER_AGENT: String = "rocksky-kotlin/0.1.0"

        public fun create(
            baseUrl: String = DEFAULT_BASE_URL,
            token: String? = null,
            userAgent: String = DEFAULT_USER_AGENT,
            timeoutMillis: Long = 30_000,
            engine: HttpClientEngine? = null,
            httpClient: HttpClient? = null,
            configureClient: HttpClientConfig<*>.() -> Unit = {},
        ): HttpTransport {
            val ownsClient = httpClient == null
            val client = httpClient ?: buildClient(timeoutMillis, userAgent, engine, configureClient)
            return HttpTransport(
                baseUrl = baseUrl.trimEnd('/'),
                initialToken = token,
                httpClient = client,
                ownsClient = ownsClient,
                userAgent = userAgent,
            )
        }

        private fun buildClient(
            timeoutMillis: Long,
            userAgent: String,
            engine: HttpClientEngine?,
            extra: HttpClientConfig<*>.() -> Unit,
        ): HttpClient {
            val factory: HttpClientConfig<*>.() -> Unit = {
                expectSuccess = false
                install(ContentNegotiation) {
                    json(RockskyJson)
                }
                install(HttpTimeout) {
                    requestTimeoutMillis = timeoutMillis
                    connectTimeoutMillis = timeoutMillis
                    socketTimeoutMillis = timeoutMillis
                }
                install(HttpRequestRetry) {
                    maxRetries = 2
                    retryOnExceptionIf { _, cause -> cause !is ApiException }
                    exponentialDelay()
                }
                defaultRequest {
                    header(HttpHeaders.UserAgent, userAgent)
                }
                extra()
            }
            return if (engine != null) HttpClient(engine, factory) else HttpClient(CIO, factory)
        }
    }
}

