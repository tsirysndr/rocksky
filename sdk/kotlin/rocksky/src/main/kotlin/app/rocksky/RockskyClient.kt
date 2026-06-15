package app.rocksky

import app.rocksky.resource.ActorResource
import app.rocksky.resource.AlbumResource
import app.rocksky.resource.ApiKeyResource
import app.rocksky.resource.ArtistResource
import app.rocksky.resource.ChartsResource
import app.rocksky.resource.FeedResource
import app.rocksky.resource.GraphResource
import app.rocksky.resource.LikeResource
import app.rocksky.resource.RockboxResource
import app.rocksky.resource.PlayerResource
import app.rocksky.resource.PlaylistResource
import app.rocksky.resource.ScrobbleResource
import app.rocksky.resource.ShoutResource
import app.rocksky.resource.SongResource
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine

/**
 * Top-level entry point for the Rocksky SDK.
 *
 * ## Quick start
 * ```kotlin
 * val client = RockskyClient()
 * val profile = client.actor.getProfile(did = "did:plc:...")
 *
 * // Or with a builder DSL:
 * val authed = RockskyClient {
 *     token = System.getenv("ROCKSKY_TOKEN")
 *     userAgent = "my-app/1.0"
 * }
 * authed.use { c ->
 *     val mine = c.actor.getProfile()
 * }
 * ```
 *
 * The client owns an HTTP client by default; call [close] (or use [use]) when done. To
 * supply your own [HttpClient] instance, pass it via the builder — in that case you remain
 * responsible for closing it.
 */
public class RockskyClient internal constructor(
    public val transport: HttpTransport,
) : AutoCloseable {

    public val actor: ActorResource = ActorResource(transport)
    public val album: AlbumResource = AlbumResource(transport)
    public val apiKey: ApiKeyResource = ApiKeyResource(transport)
    public val artist: ArtistResource = ArtistResource(transport)
    public val charts: ChartsResource = ChartsResource(transport)
    public val feed: FeedResource = FeedResource(transport)
    public val graph: GraphResource = GraphResource(transport)
    public val like: LikeResource = LikeResource(transport)
    public val rockbox: RockboxResource = RockboxResource(transport)
    public val player: PlayerResource = PlayerResource(transport)
    public val playlist: PlaylistResource = PlaylistResource(transport)
    public val scrobble: ScrobbleResource = ScrobbleResource(transport)
    public val shout: ShoutResource = ShoutResource(transport)
    public val song: SongResource = SongResource(transport)

    /** Current bearer token, if any. */
    public fun token(): String? = transport.token()

    /** Update the bearer token used for subsequent requests. */
    public fun setToken(token: String?) {
        transport.setToken(token)
    }

    override fun close() {
        transport.close()
    }

    public companion object {
        /** Construct a client with default settings (no token). */
        public operator fun invoke(): RockskyClient = RockskyClient(HttpTransport.create())

        /**
         * Construct a client using the builder DSL.
         *
         * ```
         * RockskyClient {
         *   baseUrl = "https://api.rocksky.app"
         *   token = "<bearer>"
         *   userAgent = "my-app/1.0"
         * }
         * ```
         */
        public operator fun invoke(configure: Builder.() -> Unit): RockskyClient {
            val builder = Builder().apply(configure)
            return builder.build()
        }
    }

    /** Builder for [RockskyClient]. */
    public class Builder {
        public var baseUrl: String = HttpTransport.DEFAULT_BASE_URL
        public var token: String? = null
        public var userAgent: String = HttpTransport.DEFAULT_USER_AGENT
        public var timeoutMillis: Long = 30_000

        /** Provide a custom Ktor [HttpClientEngine] (e.g. OkHttp, Java, Apache). */
        public var engine: HttpClientEngine? = null

        /**
         * Provide a fully constructed [HttpClient] to share with the rest of your app. When
         * set, the SDK will NOT close it — call [HttpClient.close] yourself.
         */
        public var httpClient: HttpClient? = null

        private var configureClient: HttpClientConfig<*>.() -> Unit = {}

        /** Tweak the underlying Ktor client (timeouts, logging, etc.). Ignored if [httpClient] is set. */
        public fun configureClient(block: HttpClientConfig<*>.() -> Unit) {
            configureClient = block
        }

        internal fun build(): RockskyClient {
            val transport = HttpTransport.create(
                baseUrl = baseUrl,
                token = token,
                userAgent = userAgent,
                timeoutMillis = timeoutMillis,
                engine = engine,
                httpClient = httpClient,
                configureClient = configureClient,
            )
            return RockskyClient(transport)
        }
    }
}
