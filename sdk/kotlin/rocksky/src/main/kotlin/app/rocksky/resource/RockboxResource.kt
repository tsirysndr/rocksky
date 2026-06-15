package app.rocksky.resource

import app.rocksky.HttpTransport
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/** `app.rocksky.rockbox.*` — Rockbox audio settings. */
public class RockboxResource internal constructor(transport: HttpTransport) : Resource(transport) {

    /**
     * Get Rockbox audio settings.
     * - Pass a [did] to fetch any user's settings publicly (no auth needed).
     * - Omit [did] (or pass `null`) to fetch the authenticated caller's own settings.
     */
    public suspend fun getAudioSettings(did: String? = null): JsonElement {
        val params = if (did != null) mapOf("did" to did) else emptyMap()
        return transport.query(
            "app.rocksky.rockbox.getAudioSettings",
            params = params,
            requireAuth = did == null,
        )
    }

    /**
     * Upsert Rockbox audio settings. Only provided sections are merged; omit a section
     * to leave it unchanged on the server.
     */
    public suspend fun putAudioSettings(
        crossfade: JsonObject? = null,
        equalizer: JsonObject? = null,
        replayGain: JsonObject? = null,
        tone: JsonObject? = null,
    ): JsonElement = transport.procedure(
        "app.rocksky.rockbox.putAudioSettings",
        body = buildJsonObject {
            crossfade?.let { put("crossfade", it) }
            equalizer?.let { put("equalizer", it) }
            replayGain?.let { put("replayGain", it) }
            tone?.let { put("tone", it) }
        },
        requireAuth = true,
    )
}
