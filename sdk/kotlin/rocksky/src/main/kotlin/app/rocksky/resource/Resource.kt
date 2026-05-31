package app.rocksky.resource

import app.rocksky.HttpTransport
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Shared base for resource classes. */
public abstract class Resource internal constructor(internal val transport: HttpTransport)

/**
 * Build a JSON object body, dropping any keys whose `String?` / `Number?` / `Boolean?` value is
 * null. Lets callers write the body inline without sprinkling `if`s for every optional field.
 */
internal inline fun jsonBody(builder: JsonObjectBuilder.() -> Unit): JsonObject =
    buildJsonObject(builder)

internal fun JsonObjectBuilder.putIfNotNull(key: String, value: String?) {
    if (value != null) put(key, value)
}

internal fun JsonObjectBuilder.putIfNotNull(key: String, value: Int?) {
    if (value != null) put(key, value)
}

internal fun JsonObjectBuilder.putIfNotNull(key: String, value: Long?) {
    if (value != null) put(key, value)
}

internal fun JsonObjectBuilder.putIfNotNull(key: String, value: Boolean?) {
    if (value != null) put(key, value)
}
