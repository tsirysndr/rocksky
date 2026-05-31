package app.rocksky.resource

import app.rocksky.AlbumBasic
import app.rocksky.Artist
import app.rocksky.ArtistBasic
import app.rocksky.ArtistListener
import app.rocksky.HttpTransport
import app.rocksky.RecentListener
import app.rocksky.SongBasic
import app.rocksky.parseList
import app.rocksky.parseModel

/** `app.rocksky.artist.*` — artist views. */
public class ArtistResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun get(uri: String): Artist {
        val data = transport.query("app.rocksky.artist.getArtist", mapOf("uri" to uri))
        return parseModel(data)
    }

    public suspend fun list(
        limit: Int? = null,
        offset: Int? = null,
        names: List<String>? = null,
        genre: String? = null,
    ): List<ArtistBasic> {
        val data = transport.query(
            "app.rocksky.artist.getArtists",
            params = mapOf(
                "limit" to limit,
                "offset" to offset,
                "names" to names,
                "genre" to genre,
            ),
        )
        return parseList(data, key = "artists")
    }

    public suspend fun getAlbums(uri: String): List<AlbumBasic> {
        val data = transport.query(
            "app.rocksky.artist.getArtistAlbums",
            params = mapOf("uri" to uri),
        )
        return parseList(data, key = "albums")
    }

    public suspend fun getTracks(uri: String, limit: Int? = null, offset: Int? = null): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.artist.getArtistTracks",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "tracks")
    }

    public suspend fun getListeners(uri: String, limit: Int? = null, offset: Int? = null): List<ArtistListener> {
        val data = transport.query(
            "app.rocksky.artist.getArtistListeners",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "listeners")
    }

    public suspend fun getRecentListeners(uri: String, limit: Int? = null, offset: Int? = null): List<RecentListener> {
        val data = transport.query(
            "app.rocksky.artist.getArtistRecentListeners",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "listeners")
    }
}
