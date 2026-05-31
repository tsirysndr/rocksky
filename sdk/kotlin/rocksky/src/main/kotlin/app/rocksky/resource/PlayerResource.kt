package app.rocksky.resource

import app.rocksky.HttpTransport
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.player.*` — remote playback control. */
public class PlayerResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun currentlyPlaying(playerId: String? = null, actor: String? = null): JsonElement =
        transport.query(
            "app.rocksky.player.getCurrentlyPlaying",
            params = mapOf("playerId" to playerId, "actor" to actor),
        )

    public suspend fun queue(playerId: String? = null): JsonElement = transport.query(
        "app.rocksky.player.getPlaybackQueue",
        params = mapOf("playerId" to playerId),
    )

    public suspend fun play(playerId: String? = null): JsonElement = transport.procedure(
        "app.rocksky.player.play",
        params = mapOf("playerId" to playerId),
        requireAuth = true,
    )

    public suspend fun pause(playerId: String? = null): JsonElement = transport.procedure(
        "app.rocksky.player.pause",
        params = mapOf("playerId" to playerId),
        requireAuth = true,
    )

    public suspend fun next(playerId: String? = null): JsonElement = transport.procedure(
        "app.rocksky.player.next",
        params = mapOf("playerId" to playerId),
        requireAuth = true,
    )

    public suspend fun previous(playerId: String? = null): JsonElement = transport.procedure(
        "app.rocksky.player.previous",
        params = mapOf("playerId" to playerId),
        requireAuth = true,
    )

    public suspend fun seek(position: Long, playerId: String? = null): JsonElement = transport.procedure(
        "app.rocksky.player.seek",
        params = mapOf("playerId" to playerId, "position" to position),
        requireAuth = true,
    )

    public suspend fun playFile(fileId: String, playerId: String? = null): JsonElement =
        transport.procedure(
            "app.rocksky.player.playFile",
            params = mapOf("playerId" to playerId, "fileId" to fileId),
            requireAuth = true,
        )

    public suspend fun playDirectory(
        directoryId: String,
        playerId: String? = null,
        shuffle: Boolean? = null,
        recurse: Boolean? = null,
        position: Int? = null,
    ): JsonElement = transport.procedure(
        "app.rocksky.player.playDirectory",
        params = mapOf(
            "playerId" to playerId,
            "directoryId" to directoryId,
            "shuffle" to shuffle,
            "recurse" to recurse,
            "position" to position,
        ),
        requireAuth = true,
    )

    public suspend fun addItemsToQueue(
        items: List<String>,
        playerId: String? = null,
        position: Int? = null,
        shuffle: Boolean? = null,
    ): JsonElement = transport.procedure(
        "app.rocksky.player.addItemsToQueue",
        params = mapOf(
            "playerId" to playerId,
            "items" to items,
            "position" to position,
            "shuffle" to shuffle,
        ),
        requireAuth = true,
    )
}
