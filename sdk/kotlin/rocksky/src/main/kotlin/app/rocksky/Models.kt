package app.rocksky

import app.rocksky.generated.ActorCompatibilityViewBasic
import app.rocksky.generated.ActorNeighbourViewBasic
import app.rocksky.generated.ActorProfileViewBasic
import app.rocksky.generated.AlbumViewBasic
import app.rocksky.generated.AlbumViewDetailed
import app.rocksky.generated.ArtistListenerViewBasic
import app.rocksky.generated.ArtistViewBasic
import app.rocksky.generated.FeedGeneratorView
import app.rocksky.generated.FeedItemView
import app.rocksky.generated.FeedRecommendationView
import app.rocksky.generated.FeedRecommendationsView
import app.rocksky.generated.FeedRecommendedAlbumView
import app.rocksky.generated.FeedRecommendedArtistView
import app.rocksky.generated.FeedSearchResultsView
import app.rocksky.generated.FeedStoryView
import app.rocksky.generated.FeedView
import app.rocksky.generated.MirrorSourceView
import app.rocksky.generated.PlaylistViewBasic
import app.rocksky.generated.PlaylistViewDetailed
import app.rocksky.generated.ScrobbleViewDetailed
import app.rocksky.generated.ShoutView
import app.rocksky.generated.SongFirstScrobbleView
import app.rocksky.generated.SongRecentListenerView
import app.rocksky.generated.SongViewBasic
import app.rocksky.generated.SongViewDetailed
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Public response models. Most types alias to the lexicon-generated shapes in
 * `app.rocksky.generated`. A handful of types (Profile, ApiKey, FollowList)
 * extend the generated shape with SDK-specific or paging fields.
 */

public typealias ProfileBasic = ActorProfileViewBasic
public typealias ArtistBasic = ArtistViewBasic
public typealias Artist = ArtistBasic
public typealias AlbumBasic = AlbumViewBasic
public typealias Album = AlbumViewDetailed
public typealias FirstScrobble = SongFirstScrobbleView
public typealias SongBasic = SongViewBasic
public typealias Song = SongViewDetailed
public typealias RecentListener = SongRecentListenerView
public typealias ArtistListener = ArtistListenerViewBasic
public typealias Scrobble = ScrobbleViewDetailed
public typealias Shout = ShoutView
public typealias PlaylistBasic = PlaylistViewBasic
public typealias Playlist = PlaylistViewDetailed
public typealias FeedGenerator = FeedGeneratorView
public typealias FeedItem = FeedItemView
public typealias Feed = FeedView
public typealias Story = FeedStoryView
public typealias Recommendation = FeedRecommendationView
public typealias Recommendations = FeedRecommendationsView
public typealias RecommendedArtist = FeedRecommendedArtistView
public typealias RecommendedAlbum = FeedRecommendedAlbumView
public typealias SearchResults = FeedSearchResultsView
public typealias Compatibility = ActorCompatibilityViewBasic
public typealias Neighbour = ActorNeighbourViewBasic
public typealias MirrorSource = MirrorSourceView

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

@Serializable
public data class ShoutAuthor(
    public val id: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    public val avatar: String? = null,
)
