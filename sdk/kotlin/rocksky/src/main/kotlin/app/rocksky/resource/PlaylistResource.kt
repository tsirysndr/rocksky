package app.rocksky.resource

import app.rocksky.HttpTransport
import app.rocksky.Playlist
import app.rocksky.PlaylistBasic
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.playlist.*` — playlist CRUD. */
public class PlaylistResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun get(uri: String): Playlist {
        val data = transport.query("app.rocksky.playlist.getPlaylist", mapOf("uri" to uri))
        return parseModel(data)
    }

    public suspend fun list(limit: Int? = null, offset: Int? = null): List<PlaylistBasic> {
        val data = transport.query(
            "app.rocksky.playlist.getPlaylists",
            params = mapOf("limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "playlists")
    }

    public suspend fun create(name: String, description: String? = null): Playlist {
        val data = transport.procedure(
            "app.rocksky.playlist.createPlaylist",
            params = mapOf("name" to name, "description" to description),
            requireAuth = true,
        )
        return parseModel(data)
    }

    /** DSL form of [create]. `name` is required. */
    public suspend fun create(configure: PlaylistSpec.() -> Unit): Playlist =
        builder().apply(configure).send()

    /** Fluent (Java-style) builder. */
    public fun builder(): PlaylistSpec = PlaylistSpec(this)

    public suspend fun remove(uri: String): JsonElement = transport.procedure(
        "app.rocksky.playlist.removePlaylist",
        params = mapOf("uri" to uri),
        requireAuth = true,
    )

    public suspend fun start(uri: String, shuffle: Boolean? = null, position: Int? = null): JsonElement =
        transport.procedure(
            "app.rocksky.playlist.startPlaylist",
            params = mapOf("uri" to uri, "shuffle" to shuffle, "position" to position),
            requireAuth = true,
        )

    public suspend fun insertFiles(uri: String, files: List<String>, position: Int? = null): JsonElement =
        transport.procedure(
            "app.rocksky.playlist.insertFiles",
            params = mapOf("uri" to uri, "files" to files, "position" to position),
            requireAuth = true,
        )

    public suspend fun insertDirectory(uri: String, directory: String, position: Int? = null): JsonElement =
        transport.procedure(
            "app.rocksky.playlist.insertDirectory",
            params = mapOf("uri" to uri, "directory" to directory, "position" to position),
            requireAuth = true,
        )
}
