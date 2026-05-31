package app.rocksky.resource

import app.rocksky.ApiKey

/**
 * Mutable spec for creating an API key. `name` is required.
 *
 * ```kotlin
 * val key = client.apiKey.create { name = "dev-laptop" }
 * val key2 = client.apiKey.builder().name("ci").description("github actions").send()
 * ```
 */
@RockskyDsl
public class ApiKeySpec internal constructor(private val resource: ApiKeyResource) {
    public var name: String? = null
    public var description: String? = null

    public fun name(value: String): ApiKeySpec = apply { name = value }
    public fun description(value: String?): ApiKeySpec = apply { description = value }

    public suspend fun send(): ApiKey {
        val n = name ?: error("name is required")
        return resource.create(name = n, description = description)
    }
}
