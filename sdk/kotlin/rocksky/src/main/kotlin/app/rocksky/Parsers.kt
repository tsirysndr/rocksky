package app.rocksky

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer

/**
 * Decode `data` into a model `T`. Empty / non-object payloads become an empty object so
 * callers don't crash on 200-with-empty-body responses (e.g. `getProfile` for an unknown
 * handle).
 */
internal inline fun <reified T : Any> parseModel(data: JsonElement?): T {
    val payload: JsonElement = when (data) {
        null, JsonNull -> JsonObject(emptyMap())
        is JsonObject -> data
        else -> JsonObject(emptyMap())
    }
    return RockskyJson.decodeFromJsonElement(serializer<T>(), payload)
}

/**
 * Decode `data` into `List<T>`. If `key` is given, the list is unwrapped from that key.
 * Returns an empty list when the input is missing or wrong-shaped.
 */
internal inline fun <reified T : Any> parseList(data: JsonElement?, key: String? = null): List<T> {
    val raw: JsonElement = if (key != null) {
        (data as? JsonObject)?.get(key) ?: return emptyList()
    } else {
        data ?: return emptyList()
    }
    val array = raw as? JsonArray ?: return emptyList()
    return RockskyJson.decodeFromJsonElement(ListSerializer(serializer<T>()), array)
}
