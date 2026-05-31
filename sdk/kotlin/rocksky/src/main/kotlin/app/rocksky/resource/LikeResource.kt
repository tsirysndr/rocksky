package app.rocksky.resource

import app.rocksky.HttpTransport
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.put

/** `app.rocksky.like.*` — like / dislike songs and shouts. */
public class LikeResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun likeSong(uri: String): JsonElement = transport.procedure(
        "app.rocksky.like.likeSong",
        body = jsonBody { put("uri", uri) },
        requireAuth = true,
    )

    public suspend fun dislikeSong(uri: String): JsonElement = transport.procedure(
        "app.rocksky.like.dislikeSong",
        body = jsonBody { put("uri", uri) },
        requireAuth = true,
    )

    public suspend fun likeShout(uri: String): JsonElement = transport.procedure(
        "app.rocksky.like.likeShout",
        body = jsonBody { put("uri", uri) },
        requireAuth = true,
    )

    public suspend fun dislikeShout(uri: String): JsonElement = transport.procedure(
        "app.rocksky.like.dislikeShout",
        body = jsonBody { put("uri", uri) },
        requireAuth = true,
    )
}
