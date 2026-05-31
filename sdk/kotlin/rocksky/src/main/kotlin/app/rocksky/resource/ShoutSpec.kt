package app.rocksky.resource

import app.rocksky.Shout

/**
 * Mutable spec for creating a shout. `message` is required. Optionally set [parent] (a shout
 * id) to post a reply instead.
 *
 * ```kotlin
 * client.shout.create { message = "Banger." }
 * client.shout.builder().message("nice").parent("3kabc").send()  // reply form
 * ```
 */
@RockskyDsl
public class ShoutSpec internal constructor(private val resource: ShoutResource) {
    public var message: String? = null
    public var parent: String? = null

    public fun message(value: String): ShoutSpec = apply { message = value }
    public fun parent(value: String?): ShoutSpec = apply { parent = value }

    public suspend fun send(): Shout {
        val m = message ?: error("message is required")
        val p = parent
        return if (p == null) resource.create(m) else resource.reply(p, m)
    }
}
