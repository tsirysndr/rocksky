package app.rocksky.resource

import app.rocksky.Playlist

/**
 * Mutable spec for creating a playlist. `name` is required.
 *
 * ```kotlin
 * client.playlist.create { name = "Sunday morning" }
 * client.playlist.builder().name("Workout").description("…").send()
 * ```
 */
@RockskyDsl
public class PlaylistSpec internal constructor(private val resource: PlaylistResource) {
    public var name: String? = null
    public var description: String? = null

    public fun name(value: String): PlaylistSpec = apply { name = value }
    public fun description(value: String?): PlaylistSpec = apply { description = value }

    public suspend fun send(): Playlist {
        val n = name ?: error("name is required")
        return resource.create(name = n, description = description)
    }
}
