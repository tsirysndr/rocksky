package app.rocksky.resource

import app.rocksky.ApiKey
import app.rocksky.HttpTransport
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonArray

/** `app.rocksky.apikey.*` — manage the authenticated user's API keys. */
public class ApiKeyResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun list(limit: Int? = null, offset: Int? = null): List<ApiKey> {
        val data = transport.query(
            "app.rocksky.apikey.getApikeys",
            params = mapOf("limit" to limit, "offset" to offset),
            requireAuth = true,
        )
        if (data is JsonArray) return parseList(data)
        val byKey = parseList<ApiKey>(data, key = "apiKeys")
        return byKey.ifEmpty { parseList(data, key = "keys") }
    }

    public suspend fun create(name: String, description: String? = null): ApiKey {
        val body = jsonBody {
            putIfNotNull("name", name)
            putIfNotNull("description", description)
        }
        val data = transport.procedure(
            "app.rocksky.apikey.createApikey",
            body = body,
            requireAuth = true,
        )
        return parseModel(data)
    }

    /** DSL form of [create]. `name` is required. */
    public suspend fun create(configure: ApiKeySpec.() -> Unit): ApiKey =
        builder().apply(configure).send()

    /** Fluent (Java-style) builder. */
    public fun builder(): ApiKeySpec = ApiKeySpec(this)

    public suspend fun update(id: String, name: String, description: String? = null): ApiKey {
        val body = jsonBody {
            putIfNotNull("id", id)
            putIfNotNull("name", name)
            putIfNotNull("description", description)
        }
        val data = transport.procedure(
            "app.rocksky.apikey.updateApikey",
            body = body,
            requireAuth = true,
        )
        return parseModel(data)
    }

    public suspend fun remove(id: String): ApiKey {
        val data = transport.procedure(
            "app.rocksky.apikey.removeApikey",
            params = mapOf("id" to id),
            requireAuth = true,
        )
        return parseModel(data)
    }
}
