package app.rocksky.resource

import app.rocksky.HttpTransport
import app.rocksky.RecentListener
import app.rocksky.Song
import app.rocksky.SongBasic
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.song.*` — song views and creation. */
public class SongResource internal constructor(transport: HttpTransport) : Resource(transport) {

    /**
     * Look up a song by exactly one identifier (URI, MBID, ISRC, or Spotify track id).
     */
    public suspend fun get(
        uri: String? = null,
        mbid: String? = null,
        isrc: String? = null,
        spotifyId: String? = null,
    ): Song {
        val data = transport.query(
            "app.rocksky.song.getSong",
            params = mapOf(
                "uri" to uri,
                "mbid" to mbid,
                "isrc" to isrc,
                "spotifyId" to spotifyId,
            ),
        )
        return parseModel(data)
    }

    public suspend fun list(
        limit: Int? = null,
        offset: Int? = null,
        genre: String? = null,
        mbid: String? = null,
        isrc: String? = null,
        spotifyId: String? = null,
    ): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.song.getSongs",
            params = mapOf(
                "limit" to limit,
                "offset" to offset,
                "genre" to genre,
                "mbid" to mbid,
                "isrc" to isrc,
                "spotifyId" to spotifyId,
            ),
        )
        return parseList(data, key = "songs")
    }

    public suspend fun getRecentListeners(
        uri: String,
        limit: Int? = null,
        offset: Int? = null,
    ): List<RecentListener> {
        val data = transport.query(
            "app.rocksky.song.getSongRecentListeners",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "listeners")
    }

    /** Resolve title/artist (+ optional identifiers) to a canonical song. */
    public suspend fun match(
        title: String,
        artist: String,
        mbId: String? = null,
        isrc: String? = null,
    ): Song {
        val data = transport.query(
            "app.rocksky.song.matchSong",
            params = mapOf(
                "title" to title,
                "artist" to artist,
                "mbId" to mbId,
                "isrc" to isrc,
            ),
        )
        return parseModel(data)
    }

    /** Create a song record. Requires auth. */
    public suspend fun create(
        title: String,
        artist: String,
        album: String,
        albumArtist: String,
        duration: Long? = null,
        mbId: String? = null,
        isrc: String? = null,
        albumArt: String? = null,
        trackNumber: Int? = null,
        releaseDate: String? = null,
        year: Int? = null,
        discNumber: Int? = null,
        lyrics: String? = null,
    ): JsonElement {
        val body = jsonBody {
            putIfNotNull("title", title)
            putIfNotNull("artist", artist)
            putIfNotNull("album", album)
            putIfNotNull("albumArtist", albumArtist)
            putIfNotNull("duration", duration)
            putIfNotNull("mbId", mbId)
            putIfNotNull("isrc", isrc)
            putIfNotNull("albumArt", albumArt)
            putIfNotNull("trackNumber", trackNumber)
            putIfNotNull("releaseDate", releaseDate)
            putIfNotNull("year", year)
            putIfNotNull("discNumber", discNumber)
            putIfNotNull("lyrics", lyrics)
        }
        return transport.procedure(
            "app.rocksky.song.createSong",
            body = body,
            requireAuth = true,
        )
    }

    /** DSL form of [create]. `title`, `artist`, `album`, `albumArtist` are required. */
    public suspend fun create(configure: SongSpec.() -> Unit): JsonElement =
        builder().apply(configure).send()

    /** Fluent (Java-style) builder. */
    public fun builder(): SongSpec = SongSpec(this)
}
