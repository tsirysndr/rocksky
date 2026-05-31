package app.rocksky.resource

import app.rocksky.Album
import app.rocksky.AlbumBasic
import app.rocksky.HttpTransport
import app.rocksky.SongBasic
import app.rocksky.parseList
import app.rocksky.parseModel

/** `app.rocksky.album.*` — album views. */
public class AlbumResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun get(uri: String): Album {
        val data = transport.query("app.rocksky.album.getAlbum", mapOf("uri" to uri))
        return parseModel(data)
    }

    public suspend fun list(
        limit: Int? = null,
        offset: Int? = null,
        genre: String? = null,
    ): List<AlbumBasic> {
        val data = transport.query(
            "app.rocksky.album.getAlbums",
            params = mapOf("limit" to limit, "offset" to offset, "genre" to genre),
        )
        return parseList(data, key = "albums")
    }

    public suspend fun getTracks(uri: String): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.album.getAlbumTracks",
            params = mapOf("uri" to uri),
        )
        return parseList(data, key = "tracks")
    }
}
