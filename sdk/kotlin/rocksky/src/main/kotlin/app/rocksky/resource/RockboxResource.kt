package app.rocksky.resource

import app.rocksky.HttpTransport
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/** `app.rocksky.rockbox.*` — Rockbox audio settings. All methods require auth. */
public class RockboxResource internal constructor(transport: HttpTransport) : Resource(transport) {

    /** Get the authenticated user's Rockbox audio settings. */
    public suspend fun getAudioSettings(): JsonElement =
        transport.query("app.rocksky.rockbox.getAudioSettings", requireAuth = true)

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
