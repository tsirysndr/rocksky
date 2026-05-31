package app.rocksky

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Data models for Rocksky API responses.
 *
 * The API speaks camelCase JSON; each field is mapped explicitly with `@SerialName` so the
 * generated parser tolerates extra fields and missing fields. Every field is nullable —
 * server responses don't always include every key, and SDK consumers shouldn't crash on it.
 */

@Serializable
public data class ProfileBasic(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("updatedAt") public val updatedAt: String? = null,
)

@Serializable
public data class Profile(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("updatedAt") public val updatedAt: String? = null,
    @SerialName("spotifyConnected") public val spotifyConnected: Boolean? = null,
    @SerialName("spotifyUser") public val spotifyUser: JsonElement? = null,
    @SerialName("spotifyToken") public val spotifyToken: JsonElement? = null,
    public val googledrive: JsonElement? = null,
    public val dropbox: JsonElement? = null,
)

@Serializable
public data class ArtistBasic(
    public val id: String? = null,
    public val uri: String? = null,
    public val name: String? = null,
    public val picture: String? = null,
    public val sha256: String? = null,
    @SerialName("playCount") public val playCount: Long? = null,
    @SerialName("uniqueListeners") public val uniqueListeners: Long? = null,
    public val tags: List<String>? = null,
)

public typealias Artist = ArtistBasic

@Serializable
public data class AlbumBasic(
    public val id: String? = null,
    public val uri: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val year: Int? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("releaseDate") public val releaseDate: String? = null,
    public val sha256: String? = null,
    @SerialName("playCount") public val playCount: Long? = null,
    @SerialName("uniqueListeners") public val uniqueListeners: Long? = null,
)

@Serializable
public data class Album(
    public val id: String? = null,
    public val uri: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val year: Int? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("releaseDate") public val releaseDate: String? = null,
    public val sha256: String? = null,
    @SerialName("playCount") public val playCount: Long? = null,
    @SerialName("uniqueListeners") public val uniqueListeners: Long? = null,
    public val tags: List<String>? = null,
    public val tracks: List<SongBasic>? = null,
)

@Serializable
public data class FirstScrobble(
    public val handle: String? = null,
    public val avatar: String? = null,
    public val timestamp: String? = null,
)

@Serializable
public data class SongBasic(
    public val id: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("albumArtist") public val albumArtist: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    public val uri: String? = null,
    public val album: String? = null,
    public val duration: Long? = null,
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    @SerialName("discNumber") public val discNumber: Int? = null,
    @SerialName("playCount") public val playCount: Long? = null,
    @SerialName("uniqueListeners") public val uniqueListeners: Long? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val sha256: String? = null,
    public val mbid: String? = null,
    public val isrc: String? = null,
    public val tags: List<String>? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class Song(
    public val id: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("albumArtist") public val albumArtist: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    public val uri: String? = null,
    public val album: String? = null,
    public val duration: Long? = null,
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    @SerialName("discNumber") public val discNumber: Int? = null,
    @SerialName("playCount") public val playCount: Long? = null,
    @SerialName("uniqueListeners") public val uniqueListeners: Long? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val sha256: String? = null,
    public val mbid: String? = null,
    public val isrc: String? = null,
    public val tags: List<String>? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    public val artists: List<ArtistBasic>? = null,
    @SerialName("firstScrobble") public val firstScrobble: FirstScrobble? = null,
)

@Serializable
public data class RecentListener(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
    public val timestamp: String? = null,
    @SerialName("scrobbleUri") public val scrobbleUri: String? = null,
)

@Serializable
public data class ArtistListener(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
    @SerialName("mostListenedSong") public val mostListenedSong: JsonElement? = null,
    @SerialName("totalPlays") public val totalPlays: Long? = null,
    public val rank: Int? = null,
)

@Serializable
public data class Scrobble(
    public val id: String? = null,
    public val user: String? = null,
    @SerialName("userDisplayName") public val userDisplayName: String? = null,
    @SerialName("userAvatar") public val userAvatar: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val album: String? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    public val cover: String? = null,
    public val date: String? = null,
    public val uri: String? = null,
    public val sha256: String? = null,
    public val liked: Boolean? = null,
    @SerialName("likesCount") public val likesCount: Long? = null,
    public val listeners: Long? = null,
    public val scrobbles: Long? = null,
    public val artists: List<ArtistBasic>? = null,
    @SerialName("firstScrobble") public val firstScrobble: FirstScrobble? = null,
)

@Serializable
public data class ShoutAuthor(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
)

@Serializable
public data class Shout(
    public val id: String? = null,
    public val message: String? = null,
    public val parent: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    public val author: ShoutAuthor? = null,
)

@Serializable
public data class ApiKey(
    public val id: String? = null,
    public val name: String? = null,
    public val description: String? = null,
    public val enabled: Boolean? = null,
    @SerialName("apiKey") public val apiKey: String? = null,
    @SerialName("sharedSecret") public val sharedSecret: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("updatedAt") public val updatedAt: String? = null,
)

@Serializable
public data class PlaylistBasic(
    public val id: String? = null,
    public val title: String? = null,
    public val uri: String? = null,
    @SerialName("curatorDid") public val curatorDid: String? = null,
    @SerialName("curatorHandle") public val curatorHandle: String? = null,
    @SerialName("curatorName") public val curatorName: String? = null,
    @SerialName("curatorAvatarUrl") public val curatorAvatarUrl: String? = null,
    public val description: String? = null,
    @SerialName("coverImageUrl") public val coverImageUrl: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("trackCount") public val trackCount: Int? = null,
)

@Serializable
public data class Playlist(
    public val id: String? = null,
    public val title: String? = null,
    public val uri: String? = null,
    @SerialName("curatorDid") public val curatorDid: String? = null,
    @SerialName("curatorHandle") public val curatorHandle: String? = null,
    @SerialName("curatorName") public val curatorName: String? = null,
    @SerialName("curatorAvatarUrl") public val curatorAvatarUrl: String? = null,
    public val description: String? = null,
    @SerialName("coverImageUrl") public val coverImageUrl: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("trackCount") public val trackCount: Int? = null,
    public val tracks: List<SongBasic>? = null,
)

@Serializable
public data class FeedGenerator(
    public val id: String? = null,
    public val name: String? = null,
    public val description: String? = null,
    public val uri: String? = null,
    public val avatar: String? = null,
    public val creator: ProfileBasic? = null,
)

@Serializable
public data class FeedItem(
    public val scrobble: Scrobble? = null,
)

@Serializable
public data class Feed(
    public val feed: List<FeedItem> = emptyList(),
    public val cursor: String? = null,
)

@Serializable
public data class Story(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    public val avatar: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val album: String? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    @SerialName("albumArtist") public val albumArtist: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("trackId") public val trackId: String? = null,
    @SerialName("trackUri") public val trackUri: String? = null,
    public val uri: String? = null,
)

@Serializable
public data class Recommendation(
    public val title: String? = null,
    public val artist: String? = null,
    public val album: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("trackUri") public val trackUri: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    public val genres: List<String>? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    public val source: String? = null,
    @SerialName("likesCount") public val likesCount: Long? = null,
)

@Serializable
public data class Recommendations(
    public val recommendations: List<Recommendation> = emptyList(),
    public val cursor: String? = null,
)

@Serializable
public data class RecommendedArtist(
    public val id: String? = null,
    public val uri: String? = null,
    public val name: String? = null,
    public val picture: String? = null,
    public val genres: List<String>? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    public val source: String? = null,
)

@Serializable
public data class RecommendedAlbum(
    public val id: String? = null,
    public val uri: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val year: Int? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    public val source: String? = null,
)

@Serializable
public data class SearchResults(
    public val hits: List<JsonElement> = emptyList(),
    @SerialName("processingTimeMs") public val processingTimeMs: Int? = null,
    public val limit: Int? = null,
    public val offset: Int? = null,
    @SerialName("estimatedTotalHits") public val estimatedTotalHits: Int? = null,
)

@Serializable
public data class Compatibility(
    @SerialName("compatibilityLevel") public val compatibilityLevel: Int? = null,
    @SerialName("compatibilityPercentage") public val compatibilityPercentage: Int? = null,
    @SerialName("sharedArtists") public val sharedArtists: Int? = null,
    @SerialName("topSharedArtistNames") public val topSharedArtistNames: List<String>? = null,
    @SerialName("topSharedDetailedArtists") public val topSharedDetailedArtists: List<ArtistBasic>? = null,
    @SerialName("user1ArtistCount") public val user1ArtistCount: Int? = null,
    @SerialName("user2ArtistCount") public val user2ArtistCount: Int? = null,
)

@Serializable
public data class Neighbour(
    @SerialName("userId") public val userId: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
    @SerialName("sharedArtistsCount") public val sharedArtistsCount: Int? = null,
    @SerialName("similarityScore") public val similarityScore: Int? = null,
    @SerialName("topSharedArtistNames") public val topSharedArtistNames: List<String>? = null,
    @SerialName("topSharedArtistsDetails") public val topSharedArtistsDetails: List<ArtistBasic>? = null,
)

@Serializable
public data class MirrorSource(
    public val id: String? = null,
    public val kind: String? = null,
    public val enabled: Boolean? = null,
    public val config: JsonElement? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    @SerialName("updatedAt") public val updatedAt: String? = null,
)

/**
 * Paged result returned by `getFollowers` / `getFollows` / `getKnownFollowers`. Iterates
 * directly over [entries].
 */
public data class FollowList(
    public val subject: ProfileBasic? = null,
    public val entries: List<ProfileBasic> = emptyList(),
    public val cursor: String? = null,
    public val count: Int? = null,
) : List<ProfileBasic> by entries
