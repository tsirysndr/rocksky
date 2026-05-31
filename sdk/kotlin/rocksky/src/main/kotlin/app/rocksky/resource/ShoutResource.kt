package app.rocksky.resource

import app.rocksky.HttpTransport
import app.rocksky.Shout
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.shout.*` — profile/album/artist/song shoutbox. */
public class ShoutResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun create(message: String): Shout {
        val body = jsonBody { putIfNotNull("message", message) }
        val data = transport.procedure(
            "app.rocksky.shout.createShout",
            body = body,
            requireAuth = true,
        )
        return parseModel(data)
    }

    /** DSL form of [create] / [reply]. Setting `parent` flips this from create to reply. */
    public suspend fun create(configure: ShoutSpec.() -> Unit): Shout =
        builder().apply(configure).send()

    /** Fluent (Java-style) builder for shouts and replies. */
    public fun builder(): ShoutSpec = ShoutSpec(this)

    public suspend fun reply(shoutId: String, message: String): Shout {
        val body = jsonBody {
            putIfNotNull("shoutId", shoutId)
            putIfNotNull("message", message)
        }
        val data = transport.procedure(
            "app.rocksky.shout.replyShout",
            body = body,
            requireAuth = true,
        )
        return parseModel(data)
    }

    public suspend fun remove(shoutId: String): JsonElement = transport.procedure(
        "app.rocksky.shout.removeShout",
        params = mapOf("id" to shoutId),
        requireAuth = true,
    )

    public suspend fun report(shoutId: String, reason: String? = null): JsonElement {
        val body = jsonBody {
            putIfNotNull("shoutId", shoutId)
            putIfNotNull("reason", reason)
        }
        return transport.procedure("app.rocksky.shout.reportShout", body = body, requireAuth = true)
    }

    public suspend fun forProfile(did: String, limit: Int? = null, offset: Int? = null): List<Shout> {
        val data = transport.query(
            "app.rocksky.shout.getProfileShouts",
            params = mapOf("did" to did, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "shouts")
    }

    public suspend fun forAlbum(uri: String, limit: Int? = null, offset: Int? = null): List<Shout> {
        val data = transport.query(
            "app.rocksky.shout.getAlbumShouts",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "shouts")
    }

    public suspend fun forArtist(uri: String, limit: Int? = null, offset: Int? = null): List<Shout> {
        val data = transport.query(
            "app.rocksky.shout.getArtistShouts",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "shouts")
    }

    public suspend fun forTrack(uri: String): List<Shout> {
        val data = transport.query("app.rocksky.shout.getTrackShouts", mapOf("uri" to uri))
        return parseList(data, key = "shouts")
    }

    public suspend fun replies(uri: String, limit: Int? = null, offset: Int? = null): List<Shout> {
        val data = transport.query(
            "app.rocksky.shout.getShoutReplies",
            params = mapOf("uri" to uri, "limit" to limit, "offset" to offset),
        )
        val parsed = parseList<Shout>(data, key = "replies")
        return parsed.ifEmpty { parseList(data, key = "shouts") }
    }
}
