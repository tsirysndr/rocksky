package app.rocksky.resource

import app.rocksky.HttpTransport
import app.rocksky.Scrobble
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.scrobble.*` — scrobble feed and creation. */
public class ScrobbleResource internal constructor(transport: HttpTransport) : Resource(transport) {

    /** Get a single scrobble by AT-URI. */
    public suspend fun get(uri: String): Scrobble {
        val data = transport.query("app.rocksky.scrobble.getScrobble", mapOf("uri" to uri))
        return parseModel(data)
    }

    /**
     * List scrobbles, optionally filtered by actor or restricted to the authenticated
     * user's follow graph (`following = true`, which requires auth).
     */
    public suspend fun list(
        did: String? = null,
        following: Boolean? = null,
        limit: Int? = null,
        offset: Int? = null,
    ): List<Scrobble> {
        val data = transport.query(
            "app.rocksky.scrobble.getScrobbles",
            params = mapOf(
                "did" to did,
                "following" to following,
                "limit" to limit,
                "offset" to offset,
            ),
            requireAuth = following != null,
        )
        return parseList(data, key = "scrobbles")
    }

    /**
     * Create a new scrobble. Requires auth. `timestamp` is Unix seconds — omit to let the
     * server stamp it.
     */
    public suspend fun create(
        title: String,
        artist: String,
        album: String? = null,
        duration: Long? = null,
        mbId: String? = null,
        isrc: String? = null,
        albumArt: String? = null,
        trackNumber: Int? = null,
        releaseDate: String? = null,
        year: Int? = null,
        discNumber: Int? = null,
        lyrics: String? = null,
        composer: String? = null,
        copyrightMessage: String? = null,
        label: String? = null,
        artistPicture: String? = null,
        spotifyLink: String? = null,
        lastfmLink: String? = null,
        tidalLink: String? = null,
        appleMusicLink: String? = null,
        youtubeLink: String? = null,
        deezerLink: String? = null,
        timestamp: Long? = null,
    ): JsonElement {
        val body = jsonBody {
            putIfNotNull("title", title)
            putIfNotNull("artist", artist)
            putIfNotNull("album", album)
            putIfNotNull("duration", duration)
            putIfNotNull("mbId", mbId)
            putIfNotNull("isrc", isrc)
            putIfNotNull("albumArt", albumArt)
            putIfNotNull("trackNumber", trackNumber)
            putIfNotNull("releaseDate", releaseDate)
            putIfNotNull("year", year)
            putIfNotNull("discNumber", discNumber)
            putIfNotNull("lyrics", lyrics)
            putIfNotNull("composer", composer)
            putIfNotNull("copyrightMessage", copyrightMessage)
            putIfNotNull("label", label)
            putIfNotNull("artistPicture", artistPicture)
            putIfNotNull("spotifyLink", spotifyLink)
            putIfNotNull("lastfmLink", lastfmLink)
            putIfNotNull("tidalLink", tidalLink)
            putIfNotNull("appleMusicLink", appleMusicLink)
            putIfNotNull("youtubeLink", youtubeLink)
            putIfNotNull("deezerLink", deezerLink)
            putIfNotNull("timestamp", timestamp)
        }
        return transport.procedure(
            "app.rocksky.scrobble.createScrobble",
            body = body,
            requireAuth = true,
        )
    }

    /**
     * Build a scrobble incrementally and send it. Equivalent to calling [create] with named
     * arguments, but reads better when many fields are set.
     *
     * ```kotlin
     * client.scrobble.create {
     *     title = "Idioteque"; artist = "Radiohead"; album = "Kid A"
     * }
     * ```
     */
    public suspend fun create(configure: ScrobbleSpec.() -> Unit): JsonElement =
        builder().apply(configure).send()

    /** Fluent (Java-style) builder. Call [ScrobbleSpec.send] when ready. */
    public fun builder(): ScrobbleSpec = ScrobbleSpec(this)
}
