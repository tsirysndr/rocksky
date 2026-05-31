package app.rocksky

import kotlinx.serialization.json.JsonElement

/** Base class for all Rocksky SDK exceptions. */
public open class RockskyException(message: String, cause: Throwable? = null) :
    RuntimeException(message, cause)

/**
 * Raised when the API returns a non-2xx response.
 *
 * @property statusCode HTTP status code.
 * @property method XRPC method id (e.g. `app.rocksky.song.getSong`).
 * @property error Short error code returned by the server, when present.
 * @property serverMessage Human-readable message returned by the server, when present.
 * @property body Parsed JSON body if any, otherwise null.
 */
public open class ApiException(
    public val statusCode: Int,
    public val method: String,
    public val error: String? = null,
    public val serverMessage: String? = null,
    public val body: JsonElement? = null,
) : RockskyException(
    "[$statusCode] $method: ${serverMessage ?: error ?: "no message"}",
)

public class AuthenticationException(
    statusCode: Int, method: String, error: String? = null,
    serverMessage: String? = null, body: JsonElement? = null,
) : ApiException(statusCode, method, error, serverMessage, body)

public class PermissionException(
    statusCode: Int, method: String, error: String? = null,
    serverMessage: String? = null, body: JsonElement? = null,
) : ApiException(statusCode, method, error, serverMessage, body)

public class NotFoundException(
    statusCode: Int, method: String, error: String? = null,
    serverMessage: String? = null, body: JsonElement? = null,
) : ApiException(statusCode, method, error, serverMessage, body)

public class RateLimitException(
    statusCode: Int, method: String, error: String? = null,
    serverMessage: String? = null, body: JsonElement? = null,
) : ApiException(statusCode, method, error, serverMessage, body)

public class ServerException(
    statusCode: Int, method: String, error: String? = null,
    serverMessage: String? = null, body: JsonElement? = null,
) : ApiException(statusCode, method, error, serverMessage, body)

/** Raised when the request fails before getting a response (network, timeout, etc.). */
public class TransportException(message: String, cause: Throwable? = null) :
    RockskyException(message, cause)

internal fun apiExceptionFor(
    statusCode: Int,
    method: String,
    error: String? = null,
    serverMessage: String? = null,
    body: JsonElement? = null,
): ApiException = when {
    statusCode == 401 -> AuthenticationException(statusCode, method, error, serverMessage, body)
    statusCode == 403 -> PermissionException(statusCode, method, error, serverMessage, body)
    statusCode == 404 -> NotFoundException(statusCode, method, error, serverMessage, body)
    statusCode == 429 -> RateLimitException(statusCode, method, error, serverMessage, body)
    statusCode >= 500 -> ServerException(statusCode, method, error, serverMessage, body)
    else -> ApiException(statusCode, method, error, serverMessage, body)
}
