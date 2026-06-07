package app.rocksky.resource

import app.rocksky.Feed
import app.rocksky.FeedGenerator
import app.rocksky.HttpTransport
import app.rocksky.RecommendedAlbum
import app.rocksky.RecommendedArtist
import app.rocksky.Recommendations
import app.rocksky.SearchResults
import app.rocksky.Story
import app.rocksky.parseList
import app.rocksky.parseModel

/** `app.rocksky.feed.*` — feeds, recommendations, search, stories. */
public class FeedResource internal constructor(transport: HttpTransport) : Resource(transport) {

    public suspend fun get(feed: String, limit: Int? = null, cursor: String? = null): Feed {
        val data = transport.query(
            "app.rocksky.feed.getFeed",
            params = mapOf("feed" to feed, "limit" to limit, "cursor" to cursor),
        )
        return parseModel(data)
    }

    public suspend fun getGenerator(feed: String): FeedGenerator {
        val data = transport.query("app.rocksky.feed.getFeedGenerator", mapOf("feed" to feed))
        return parseModel(data)
    }

    public suspend fun listGenerators(size: Int? = null): List<FeedGenerator> {
        val data = transport.query(
            "app.rocksky.feed.getFeedGenerators",
            params = mapOf("size" to size),
        )
        return parseList(data, key = "feeds")
    }

    public suspend fun search(query: String): SearchResults {
        val data = transport.query("app.rocksky.feed.search", mapOf("query" to query))
        return parseModel(data)
    }

    /**
     * Return the latest scrobble per user.
     *
     * @param feed restrict to scrobbles in the given feed generator (at-uri)
     * @param following restrict to users the viewer follows (requires auth)
     */
    public suspend fun stories(
        size: Int? = null,
        feed: String? = null,
        following: Boolean? = null,
    ): List<Story> {
        val data = transport.query(
            "app.rocksky.feed.getStories",
            params = mapOf("size" to size, "feed" to feed, "following" to following),
            requireAuth = following == true,
        )
        return parseList(data, key = "stories")
    }

    public suspend fun recommendations(did: String, limit: Int? = null): Recommendations {
        val data = transport.query(
            "app.rocksky.feed.getRecommendations",
            params = mapOf("did" to did, "limit" to limit),
        )
        return parseModel(data)
    }

    public suspend fun artistRecommendations(did: String, limit: Int? = null): List<RecommendedArtist> {
        val data = transport.query(
            "app.rocksky.feed.getArtistRecommendations",
            params = mapOf("did" to did, "limit" to limit),
        )
        return parseList(data, key = "artists")
    }

    public suspend fun albumRecommendations(did: String, limit: Int? = null): List<RecommendedAlbum> {
        val data = transport.query(
            "app.rocksky.feed.getAlbumRecommendations",
            params = mapOf("did" to did, "limit" to limit),
        )
        return parseList(data, key = "albums")
    }
}
