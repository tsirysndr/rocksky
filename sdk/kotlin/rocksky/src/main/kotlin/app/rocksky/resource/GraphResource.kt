package app.rocksky.resource

import app.rocksky.FollowList
import app.rocksky.HttpTransport
import app.rocksky.ProfileBasic
import app.rocksky.parseList
import app.rocksky.parseModel
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/** `app.rocksky.graph.*` — follow graph. */
public class GraphResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun follow(account: String): JsonElement = transport.procedure(
        "app.rocksky.graph.followAccount",
        params = mapOf("account" to account),
        requireAuth = true,
    )

    public suspend fun unfollow(account: String): JsonElement = transport.procedure(
        "app.rocksky.graph.unfollowAccount",
        params = mapOf("account" to account),
        requireAuth = true,
    )

    public suspend fun getFollowers(
        actor: String,
        limit: Int? = null,
        cursor: String? = null,
        dids: List<String>? = null,
    ): FollowList {
        val data = transport.query(
            "app.rocksky.graph.getFollowers",
            params = mapOf("actor" to actor, "limit" to limit, "cursor" to cursor, "dids" to dids),
        )
        return parseFollowList(data, "followers")
    }

    public suspend fun getFollows(
        actor: String,
        limit: Int? = null,
        cursor: String? = null,
        dids: List<String>? = null,
    ): FollowList {
        val data = transport.query(
            "app.rocksky.graph.getFollows",
            params = mapOf("actor" to actor, "limit" to limit, "cursor" to cursor, "dids" to dids),
        )
        return parseFollowList(data, "follows")
    }

    public suspend fun getKnownFollowers(
        actor: String,
        limit: Int? = null,
        cursor: String? = null,
    ): FollowList {
        val data = transport.query(
            "app.rocksky.graph.getKnownFollowers",
            params = mapOf("actor" to actor, "limit" to limit, "cursor" to cursor),
            requireAuth = true,
        )
        return parseFollowList(data, "followers")
    }

    private fun parseFollowList(data: JsonElement, listKey: String): FollowList {
        val obj = data as? JsonObject ?: return FollowList()
        val subject = obj["subject"]?.let { parseModel<ProfileBasic>(it) }
        val entries = parseList<ProfileBasic>(obj, key = listKey)
        val cursor = (obj["cursor"] as? JsonPrimitive)?.contentOrNull
        val count = (obj["count"] as? JsonPrimitive)?.intOrNull
            ?: runCatching { obj["count"]?.jsonPrimitive?.intOrNull }.getOrNull()
        return FollowList(subject = subject, entries = entries, cursor = cursor, count = count)
    }
}
