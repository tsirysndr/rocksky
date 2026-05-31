package app.rocksky.resource

import app.rocksky.AlbumBasic
import app.rocksky.ArtistBasic
import app.rocksky.Compatibility
import app.rocksky.HttpTransport
import app.rocksky.Neighbour
import app.rocksky.PlaylistBasic
import app.rocksky.Profile
import app.rocksky.Scrobble
import app.rocksky.SongBasic
import app.rocksky.parseList
import app.rocksky.parseModel

/** `app.rocksky.actor.*` — profiles and per-actor library views. */
public class ActorResource internal constructor(transport: HttpTransport) : Resource(transport) {

    /**
     * Get a profile by DID or handle. With no argument, returns the authenticated user's
     * profile (requires a token).
     */
    public suspend fun getProfile(did: String? = null): Profile {
        val data = transport.query(
            "app.rocksky.actor.getProfile",
            params = mapOf("did" to did),
            requireAuth = did == null,
        )
        return parseModel(data)
    }

    public suspend fun getAlbums(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
        startDate: String? = null,
        endDate: String? = null,
    ): List<AlbumBasic> {
        val data = transport.query(
            "app.rocksky.actor.getActorAlbums",
            params = mapOf(
                "did" to did,
                "limit" to limit,
                "offset" to offset,
                "startDate" to startDate,
                "endDate" to endDate,
            ),
        )
        return parseList(data, key = "albums")
    }

    public suspend fun getArtists(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
        startDate: String? = null,
        endDate: String? = null,
    ): List<ArtistBasic> {
        val data = transport.query(
            "app.rocksky.actor.getActorArtists",
            params = mapOf(
                "did" to did,
                "limit" to limit,
                "offset" to offset,
                "startDate" to startDate,
                "endDate" to endDate,
            ),
        )
        return parseList(data, key = "artists")
    }

    public suspend fun getSongs(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
        startDate: String? = null,
        endDate: String? = null,
    ): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.actor.getActorSongs",
            params = mapOf(
                "did" to did,
                "limit" to limit,
                "offset" to offset,
                "startDate" to startDate,
                "endDate" to endDate,
            ),
        )
        return parseList(data, key = "songs")
    }

    public suspend fun getScrobbles(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
    ): List<Scrobble> {
        val data = transport.query(
            "app.rocksky.actor.getActorScrobbles",
            params = mapOf("did" to did, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "scrobbles")
    }

    public suspend fun getLovedSongs(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
    ): List<SongBasic> {
        val data = transport.query(
            "app.rocksky.actor.getActorLovedSongs",
            params = mapOf("did" to did, "limit" to limit, "offset" to offset),
        )
        val loved = parseList<SongBasic>(data, key = "lovedSongs")
        return loved.ifEmpty { parseList(data, key = "songs") }
    }

    public suspend fun getPlaylists(
        did: String,
        limit: Int? = null,
        offset: Int? = null,
    ): List<PlaylistBasic> {
        val data = transport.query(
            "app.rocksky.actor.getActorPlaylists",
            params = mapOf("did" to did, "limit" to limit, "offset" to offset),
        )
        return parseList(data, key = "playlists")
    }

    public suspend fun getNeighbours(did: String): List<Neighbour> {
        val data = transport.query(
            "app.rocksky.actor.getActorNeighbours",
            params = mapOf("did" to did),
        )
        return parseList(data, key = "neighbours")
    }

    public suspend fun getCompatibility(did: String): Compatibility {
        val data = transport.query(
            "app.rocksky.actor.getActorCompatibility",
            params = mapOf("did" to did),
            requireAuth = true,
        )
        return parseModel(data)
    }
}
