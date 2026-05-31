package app.rocksky.resource

import app.rocksky.ArtistBasic
import app.rocksky.HttpTransport
import app.rocksky.SongBasic
import app.rocksky.parseList
import kotlinx.serialization.json.JsonElement

/** `app.rocksky.charts.*` — chart queries. */
public class ChartsResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun topTracks(
        limit: Int? = null,
        offset: Int? = null,
        startDate: String? = null,
        endDate: String? = null,
    ): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.charts.getTopTracks",
            params = mapOf(
                "limit" to limit,
                "offset" to offset,
                "startDate" to startDate,
                "endDate" to endDate,
            ),
        )
        return parseList(data, key = "tracks")
    }

    public suspend fun topArtists(
        limit: Int? = null,
        offset: Int? = null,
        startDate: String? = null,
        endDate: String? = null,
    ): List<ArtistBasic> {
        val data = transport.query(
            "app.rocksky.charts.getTopArtists",
            params = mapOf(
                "limit" to limit,
                "offset" to offset,
                "startDate" to startDate,
                "endDate" to endDate,
            ),
        )
        return parseList(data, key = "artists")
    }

    /** Scrobble counts over time. Server returns a time-series JSON document. */
    public suspend fun scrobblesChart(
        did: String? = null,
        artistUri: String? = null,
        albumUri: String? = null,
        songUri: String? = null,
        genre: String? = null,
        from: String? = null,
        to: String? = null,
    ): JsonElement {
        return transport.query(
            "app.rocksky.charts.getScrobblesChart",
            params = mapOf(
                "did" to did,
                "artisturi" to artistUri,
                "albumuri" to albumUri,
                "songuri" to songUri,
                "genre" to genre,
                "from" to from,
                "to" to to,
            ),
        )
    }
}
