package app.rocksky.examples

import app.rocksky.ApiException
import app.rocksky.AuthenticationException
import app.rocksky.RockskyClient
import kotlinx.coroutines.runBlocking

/**
 * Create a scrobble for the currently playing track. Requires `ROCKSKY_TOKEN` in env.
 *
 * Run: `ROCKSKY_TOKEN=<bearer> ./gradlew :examples:run -PmainClass=app.rocksky.examples.CreateScrobbleKt`
 */
fun main(): Unit = runBlocking {
    val token = System.getenv("ROCKSKY_TOKEN")
        ?: error("ROCKSKY_TOKEN env var is required for this example")

    RockskyClient {
        this.token = token
        userAgent = "rocksky-kotlin-example/0.1.0"
    }.use { client ->
        try {
            val result = client.scrobble.create(
                title = "Idioteque",
                artist = "Radiohead",
                album = "Kid A",
                duration = 369,
                trackNumber = 8,
                isrc = "GBAYE0000259",
            )
            println("Scrobble created: $result")
        } catch (e: AuthenticationException) {
            System.err.println("Auth failed — is the token valid?  ${e.message}")
        } catch (e: ApiException) {
            System.err.println("Server rejected the scrobble: ${e.statusCode} ${e.error} — ${e.serverMessage}")
        }
    }
}
