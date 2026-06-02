// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

package app.rocksky.generated

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
public data class BlobRef(
    @SerialName("\$type") public val type: String? = null,
    public val ref: BlobCidRef? = null,
    @SerialName("mimeType") public val mimeType: String? = null,
    public val size: Int? = null,
)

@Serializable
public data class BlobCidRef(
    @SerialName("\$link") public val link: String? = null,
)


@Serializable
public data class ActorArtistViewBasic(
    public val id: String? = null,
    public val name: String? = null,
    public val picture: String? = null,
    public val uri: String? = null,
    @SerialName("user1Rank") public val user1Rank: Int? = null,
    @SerialName("user2Rank") public val user2Rank: Int? = null,
    public val weight: Int? = null,
)

@Serializable
public data class ActorCompatibilityViewBasic(
    @SerialName("compatibilityLevel") public val compatibilityLevel: Int? = null,
    @SerialName("compatibilityPercentage") public val compatibilityPercentage: Int? = null,
    @SerialName("sharedArtists") public val sharedArtists: Int? = null,
    @SerialName("topSharedArtistNames") public val topSharedArtistNames: List<String>? = null,
    @SerialName("topSharedDetailedArtists") public val topSharedDetailedArtists: List<ActorArtistViewBasic>? = null,
    @SerialName("user1ArtistCount") public val user1ArtistCount: Int? = null,
    @SerialName("user2ArtistCount") public val user2ArtistCount: Int? = null,
)

@Serializable
public data class ActorNeighbourViewBasic(
    @SerialName("userId") public val userId: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the actor's avatar image. */
    public val avatar: String? = null,
    /** The number of artists shared with the actor. */
    @SerialName("sharedArtistsCount") public val sharedArtistsCount: Int? = null,
    /** The similarity score with the actor. */
    @SerialName("similarityScore") public val similarityScore: Int? = null,
    /** The top shared artist names with the actor. */
    @SerialName("topSharedArtistNames") public val topSharedArtistNames: List<String>? = null,
    /** The top shared artist details with the actor. */
    @SerialName("topSharedArtistsDetails") public val topSharedArtistsDetails: List<ArtistViewBasic>? = null,
)

@Serializable
public data class ActorProfileViewBasic(
    /** The unique identifier of the actor. */
    public val id: String? = null,
    /** The DID of the actor. */
    public val did: String? = null,
    /** The handle of the actor. */
    public val handle: String? = null,
    /** The display name of the actor. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the actor's avatar image. */
    public val avatar: String? = null,
    /** The date and time when the actor was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    /** The date and time when the actor was last updated. */
    @SerialName("updatedAt") public val updatedAt: String? = null,
)

@Serializable
public data class ActorProfileViewDetailed(
    /** The unique identifier of the actor. */
    public val id: String? = null,
    /** The DID of the actor. */
    public val did: String? = null,
    /** The handle of the actor. */
    public val handle: String? = null,
    /** The display name of the actor. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the actor's avatar image. */
    public val avatar: String? = null,
    /** The date and time when the actor was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    /** The date and time when the actor was last updated. */
    @SerialName("updatedAt") public val updatedAt: String? = null,
)

@Serializable
public data class ActorTrackView(
    /** The name of the track. */
    public val name: String,
    /** The primary artist name. */
    public val artist: String,
    /** The album name. */
    public val album: String? = null,
    /** URL of the album cover image. */
    @SerialName("albumCoverUrl") public val albumCoverUrl: String? = null,
    /** Track duration in milliseconds. */
    @SerialName("durationMs") public val durationMs: Int? = null,
    /** Music service source, e.g. 'spotify' or 'listenbrainz'. */
    public val source: String? = null,
    /** MusicBrainz recording ID, if available. */
    @SerialName("recordingMbId") public val recordingMbId: String? = null,
)

@Serializable
public data class AddDirectoryToQueueParams(
    /** The directory to add to the queue */
    public val directory: String,
    @SerialName("playerId") public val playerId: String? = null,
    /** Position in the queue to insert the directory at, defaults to the end if not specified */
    public val position: Int? = null,
    /** Whether to shuffle the added directory in the queue */
    public val shuffle: Boolean? = null,
)

@Serializable
public data class AddItemsToQueueParams(
    public val items: List<String>,
    @SerialName("playerId") public val playerId: String? = null,
    /** Position in the queue to insert the items at, defaults to the end if not specified */
    public val position: Int? = null,
    /** Whether to shuffle the added items in the queue */
    public val shuffle: Boolean? = null,
)

@Serializable
public data class AlbumRecord(
    /** The title of the album. */
    public val title: String,
    /** The artist of the album. */
    public val artist: String,
    /** The date and time when the album was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** The duration of the album in seconds. */
    public val duration: Int? = null,
    /** The release date of the album. */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The year the album was released. */
    public val year: Int? = null,
    /** The genre of the album. */
    public val genre: String? = null,
    /** The album art of the album. */
    @SerialName("albumArt") public val albumArt: BlobRef? = null,
    /** The URL of the album art of the album. */
    @SerialName("albumArtUrl") public val albumArtUrl: String? = null,
    /** The tags of the album. */
    public val tags: List<String>? = null,
    /** The YouTube link of the album. */
    @SerialName("youtubeLink") public val youtubeLink: String? = null,
    /** The Spotify link of the album. */
    @SerialName("spotifyLink") public val spotifyLink: String? = null,
    /** The tidal link of the album. */
    @SerialName("tidalLink") public val tidalLink: String? = null,
    /** The Apple Music link of the album. */
    @SerialName("appleMusicLink") public val appleMusicLink: String? = null,
)

@Serializable
public data class AlbumViewBasic(
    /** The unique identifier of the album. */
    public val id: String? = null,
    /** The URI of the album. */
    public val uri: String? = null,
    /** The title of the album. */
    public val title: String? = null,
    /** The artist of the album. */
    public val artist: String? = null,
    /** The URI of the album's artist. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The year the album was released. */
    public val year: Int? = null,
    /** The URL of the album art image. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The release date of the album. */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The SHA256 hash of the album. */
    public val sha256: String? = null,
    /** The number of times the album has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the album. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
)

@Serializable
public data class AlbumViewDetailed(
    /** The unique identifier of the album. */
    public val id: String? = null,
    /** The URI of the album. */
    public val uri: String? = null,
    /** The title of the album. */
    public val title: String? = null,
    /** The artist of the album. */
    public val artist: String? = null,
    /** The URI of the album's artist. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The year the album was released. */
    public val year: Int? = null,
    /** The URL of the album art image. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The release date of the album. */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The SHA256 hash of the album. */
    public val sha256: String? = null,
    /** The number of times the album has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the album. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
    public val tags: List<String>? = null,
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class ApiKeyView(
    /** The unique identifier of the API key. */
    public val id: String? = null,
    /** The name of the API key. */
    public val name: String? = null,
    /** A description for the API key. */
    public val description: String? = null,
    /** The date and time when the API key was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class ArtistListenerViewBasic(
    /** The unique identifier of the actor. */
    public val id: String? = null,
    /** The DID of the listener. */
    public val did: String? = null,
    /** The handle of the listener. */
    public val handle: String? = null,
    /** The display name of the listener. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the listener's avatar image. */
    public val avatar: String? = null,
    @SerialName("mostListenedSong") public val mostListenedSong: ArtistSongViewBasic? = null,
    /** The total number of plays by the listener. */
    @SerialName("totalPlays") public val totalPlays: Int? = null,
    /** The rank of the listener among all listeners of the artist. */
    public val rank: Int? = null,
)

@Serializable
public data class ArtistMbid(
    /** The MusicBrainz Identifier (MBID) of the artist. */
    public val mbid: String? = null,
    /** The name of the artist. */
    public val name: String? = null,
)

@Serializable
public data class ArtistRecentListenerView(
    /** The unique identifier of the listener. */
    public val id: String? = null,
    /** The DID of the listener. */
    public val did: String? = null,
    /** The handle of the listener. */
    public val handle: String? = null,
    /** The display name of the listener. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the listener's avatar image. */
    public val avatar: String? = null,
    /** The timestamp of the listener's most recent scrobble of this artist. */
    public val timestamp: String? = null,
    /** The URI of the listener's most recent scrobble of this artist. */
    @SerialName("scrobbleUri") public val scrobbleUri: String? = null,
)

@Serializable
public data class ArtistRecord(
    /** The name of the artist. */
    public val name: String,
    /** The date when the artist was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** The biography of the artist. */
    public val bio: String? = null,
    /** The picture of the artist. */
    public val picture: BlobRef? = null,
    /** The URL of the picture of the artist. */
    @SerialName("pictureUrl") public val pictureUrl: String? = null,
    /** The tags of the artist. */
    public val tags: List<String>? = null,
    /** The birth date of the artist. */
    public val born: String? = null,
    /** The death date of the artist. */
    public val died: String? = null,
    /** The birth place of the artist. */
    @SerialName("bornIn") public val bornIn: String? = null,
)

@Serializable
public data class ArtistSongViewBasic(
    /** The URI of the song. */
    public val uri: String? = null,
    /** The title of the song. */
    public val title: String? = null,
    /** The number of times the song has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
)

@Serializable
public data class ArtistViewBasic(
    /** The unique identifier of the artist. */
    public val id: String? = null,
    /** The URI of the artist. */
    public val uri: String? = null,
    /** The name of the artist. */
    public val name: String? = null,
    /** The picture of the artist. */
    public val picture: String? = null,
    /** The SHA256 hash of the artist. */
    public val sha256: String? = null,
    /** The number of times the artist has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the artist. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
    public val tags: List<String>? = null,
)

@Serializable
public data class ArtistViewDetailed(
    /** The unique identifier of the artist. */
    public val id: String? = null,
    /** The URI of the artist. */
    public val uri: String? = null,
    /** The name of the artist. */
    public val name: String? = null,
    /** The picture of the artist. */
    public val picture: String? = null,
    /** The SHA256 hash of the artist. */
    public val sha256: String? = null,
    /** The number of times the artist has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the artist. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
    public val tags: List<String>? = null,
)

@Serializable
public data class ChartsScrobbleViewBasic(
    /** The date of the scrobble. */
    public val date: String? = null,
    /** The number of scrobbles on this date. */
    public val count: Int? = null,
)

@Serializable
public data class ChartsView(
    public val scrobbles: List<ChartsScrobbleViewBasic>? = null,
)

@Serializable
public data class CreateApikeyInput(
    /** The name of the API key. */
    public val name: String,
    /** A description for the API key. */
    public val description: String? = null,
)

@Serializable
public data class CreatePlaylistParams(
    /** The name of the playlist */
    public val name: String,
    /** A brief description of the playlist */
    public val description: String? = null,
)

@Serializable
public data class CreateScrobbleInput(
    /** The title of the track being scrobbled */
    public val title: String,
    /** The artist of the track being scrobbled */
    public val artist: String,
    /** The album of the track being scrobbled */
    public val album: String? = null,
    /** The duration of the track in milliseconds */
    public val duration: Int? = null,
    /** The MusicBrainz ID of the track, if available */
    @SerialName("mbId") public val mbId: String? = null,
    /** The International Standard Recording Code (ISRC) of the track, if available */
    public val isrc: String? = null,
    /** The URL of the album art for the track */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The track number of the track in the album */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The release date of the track, formatted as YYYY-MM-DD */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The year the track was released */
    public val year: Int? = null,
    /** The disc number of the track in the album, if applicable */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The lyrics of the track, if available */
    public val lyrics: String? = null,
    /** The composer of the track, if available */
    public val composer: String? = null,
    /** The copyright message for the track, if available */
    @SerialName("copyrightMessage") public val copyrightMessage: String? = null,
    /** The record label of the track, if available */
    public val label: String? = null,
    /** The URL of the artist's picture, if available */
    @SerialName("artistPicture") public val artistPicture: String? = null,
    /** The Spotify link for the track, if available */
    @SerialName("spotifyLink") public val spotifyLink: String? = null,
    /** The Last.fm link for the track, if available */
    @SerialName("lastfmLink") public val lastfmLink: String? = null,
    /** The Tidal link for the track, if available */
    @SerialName("tidalLink") public val tidalLink: String? = null,
    /** The Apple Music link for the track, if available */
    @SerialName("appleMusicLink") public val appleMusicLink: String? = null,
    /** The Youtube link for the track, if available */
    @SerialName("youtubeLink") public val youtubeLink: String? = null,
    /** The Deezer link for the track, if available */
    @SerialName("deezerLink") public val deezerLink: String? = null,
    /** The timestamp of the scrobble in seconds since epoch (Unix timestamp) */
    public val timestamp: Int? = null,
)

@Serializable
public data class CreateShoutInput(
    /** The content of the shout */
    public val message: String? = null,
)

@Serializable
public data class CreateSongInput(
    /** The title of the song */
    public val title: String,
    /** The artist of the song */
    public val artist: String,
    /** The album artist of the song, if different from the main artist */
    @SerialName("albumArtist") public val albumArtist: String,
    /** The album of the song, if applicable */
    public val album: String,
    /** The duration of the song in seconds */
    public val duration: Int? = null,
    /** The MusicBrainz ID of the song, if available */
    @SerialName("mbId") public val mbId: String? = null,
    /** The International Standard Recording Code (ISRC) of the song, if available */
    public val isrc: String? = null,
    /** The URL of the album art for the song */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The track number of the song in the album, if applicable */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The release date of the song, formatted as YYYY-MM-DD */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The year the song was released */
    public val year: Int? = null,
    /** The disc number of the song in the album, if applicable */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The lyrics of the song, if available */
    public val lyrics: String? = null,
)

@Serializable
public data class DescribeFeedGeneratorOutput(
    /** The DID of the feed generator. */
    public val did: String? = null,
    /** List of feed URIs generated by this feed generator. */
    public val feeds: List<FeedUriView>? = null,
)

@Serializable
public class DescribeFeedGeneratorParams

@Serializable
public data class DislikeShoutInput(
    /** The unique identifier of the shout to dislike */
    public val uri: String? = null,
)

@Serializable
public data class DislikeSongInput(
    /** The unique identifier of the song to dislike */
    public val uri: String? = null,
)

@Serializable
public data class DownloadFileParams(
    /** The unique identifier of the file to download */
    @SerialName("fileId") public val fileId: String,
)

@Serializable
public data class DropboxFileListView(
    /** A list of files in the Dropbox. */
    public val files: List<DropboxFileView>? = null,
)

@Serializable
public data class DropboxFileView(
    /** The unique identifier of the file. */
    public val id: String? = null,
    /** The name of the file. */
    public val name: String? = null,
    /** The lowercased path of the file. */
    @SerialName("pathLower") public val pathLower: String? = null,
    /** The display path of the file. */
    @SerialName("pathDisplay") public val pathDisplay: String? = null,
    /** The last modified date and time of the file on the client. */
    @SerialName("clientModified") public val clientModified: String? = null,
    /** The last modified date and time of the file on the server. */
    @SerialName("serverModified") public val serverModified: String? = null,
)

@Serializable
public data class DropboxTemporaryLinkView(
    /** The temporary link to access the file. */
    public val link: String? = null,
)

@Serializable
public data class FeedGeneratorsView(
    public val feeds: List<FeedGeneratorView>? = null,
)

@Serializable
public data class FeedGeneratorView(
    public val id: String? = null,
    public val name: String? = null,
    public val description: String? = null,
    public val uri: String? = null,
    public val avatar: String? = null,
    public val creator: ActorProfileViewBasic? = null,
)

@Serializable
public data class FeedItemView(
    public val scrobble: ScrobbleViewBasic? = null,
)

@Serializable
public data class FeedRecommendationsView(
    public val recommendations: List<FeedRecommendationView>? = null,
    public val cursor: String? = null,
)

@Serializable
public data class FeedRecommendationView(
    public val title: String? = null,
    public val artist: String? = null,
    public val album: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("trackUri") public val trackUri: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    public val genres: List<String>? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    /** neighbour | social | serendipity */
    public val source: String? = null,
    @SerialName("likesCount") public val likesCount: Int? = null,
)

@Serializable
public data class FeedRecommendedAlbumsView(
    public val albums: List<FeedRecommendedAlbumView>? = null,
    public val cursor: String? = null,
)

@Serializable
public data class FeedRecommendedAlbumView(
    public val id: String? = null,
    public val uri: String? = null,
    public val title: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val year: Int? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    /** known-artist | new-artist | serendipity */
    public val source: String? = null,
)

@Serializable
public data class FeedRecommendedArtistsView(
    public val artists: List<FeedRecommendedArtistView>? = null,
    public val cursor: String? = null,
)

@Serializable
public data class FeedRecommendedArtistView(
    public val id: String? = null,
    public val uri: String? = null,
    public val name: String? = null,
    public val picture: String? = null,
    public val genres: List<String>? = null,
    @SerialName("recommendationScore") public val recommendationScore: Int? = null,
    /** neighbour | social | serendipity */
    public val source: String? = null,
)

@Serializable
public data class FeedSearchResultsView(
    public val hits: List<JsonElement>? = null,
    @SerialName("processingTimeMs") public val processingTimeMs: Int? = null,
    public val limit: Int? = null,
    public val offset: Int? = null,
    @SerialName("estimatedTotalHits") public val estimatedTotalHits: Int? = null,
)

@Serializable
public data class FeedStoriesView(
    public val stories: List<FeedStoryView>? = null,
)

@Serializable
public data class FeedStoryView(
    public val album: String? = null,
    @SerialName("albumArt") public val albumArt: String? = null,
    @SerialName("albumArtist") public val albumArtist: String? = null,
    @SerialName("albumUri") public val albumUri: String? = null,
    public val artist: String? = null,
    @SerialName("artistUri") public val artistUri: String? = null,
    public val avatar: String? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
    public val did: String? = null,
    public val handle: String? = null,
    public val id: String? = null,
    public val title: String? = null,
    @SerialName("trackId") public val trackId: String? = null,
    @SerialName("trackUri") public val trackUri: String? = null,
    public val uri: String? = null,
)

@Serializable
public data class FeedUriView(
    /** The feed URI. */
    public val uri: String? = null,
)

@Serializable
public data class FeedView(
    public val feed: List<FeedItemView>? = null,
    /** The pagination cursor for the next set of results. */
    public val cursor: String? = null,
)

@Serializable
public data class FollowAccountOutput(
    public val subject: ActorProfileViewBasic,
    public val followers: List<ActorProfileViewBasic>,
    /** A cursor value to pass to subsequent calls to get the next page of results. */
    public val cursor: String? = null,
)

@Serializable
public data class FollowAccountParams(
    public val account: String,
)

@Serializable
public data class FollowRecord(
    @SerialName("createdAt") public val createdAt: String,
    public val subject: String,
    public val via: StrongRef? = null,
)

@Serializable
public data class GeneratorRecord(
    public val did: String,
    @SerialName("displayName") public val displayName: String,
    @SerialName("createdAt") public val createdAt: String,
    public val avatar: BlobRef? = null,
    public val description: String? = null,
)

@Serializable
public data class GetActorAlbumsOutput(
    public val albums: List<AlbumViewBasic>? = null,
)

@Serializable
public data class GetActorAlbumsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The start date to filter albums from (ISO 8601 format) */
    @SerialName("startDate") public val startDate: String? = null,
    /** The end date to filter albums to (ISO 8601 format) */
    @SerialName("endDate") public val endDate: String? = null,
)

@Serializable
public data class GetActorArtistsOutput(
    public val artists: List<ArtistViewBasic>? = null,
)

@Serializable
public data class GetActorArtistsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The start date to filter albums from (ISO 8601 format) */
    @SerialName("startDate") public val startDate: String? = null,
    /** The end date to filter albums to (ISO 8601 format) */
    @SerialName("endDate") public val endDate: String? = null,
)

@Serializable
public data class GetActorCompatibilityOutput(
    public val compatibility: ActorCompatibilityViewBasic? = null,
)

@Serializable
public data class GetActorCompatibilityParams(
    /** DID or handle to get compatibility for */
    public val did: String,
)

@Serializable
public data class GetActorLovedSongsOutput(
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class GetActorLovedSongsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
)

@Serializable
public data class GetActorNeighboursOutput(
    public val neighbours: List<ActorNeighbourViewBasic>? = null,
)

@Serializable
public data class GetActorNeighboursParams(
    /** The DID or handle of the actor */
    public val did: String,
)

@Serializable
public data class GetActorPlaylistsOutput(
    public val playlists: List<PlaylistViewBasic>? = null,
)

@Serializable
public data class GetActorPlaylistsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
)

@Serializable
public data class GetActorScrobblesOutput(
    public val scrobbles: List<ScrobbleViewBasic>? = null,
)

@Serializable
public data class GetActorScrobblesParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
)

@Serializable
public data class GetActorSongsOutput(
    public val songs: List<SongViewBasic>? = null,
)

@Serializable
public data class GetActorSongsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The start date to filter albums from (ISO 8601 format) */
    @SerialName("startDate") public val startDate: String? = null,
    /** The end date to filter albums to (ISO 8601 format) */
    @SerialName("endDate") public val endDate: String? = null,
)

@Serializable
public data class GetAlbumParams(
    /** The URI of the album to retrieve. */
    public val uri: String,
)

@Serializable
public data class GetAlbumRecommendationsParams(
    /** DID or handle of the user to recommend for. */
    public val did: String,
    public val limit: Int? = null,
)

@Serializable
public data class GetAlbumShoutsOutput(
    public val shouts: List<JsonElement>? = null,
)

@Serializable
public data class GetAlbumShoutsParams(
    /** The unique identifier of the album to retrieve shouts for */
    public val uri: String,
    /** The maximum number of shouts to return */
    public val limit: Int? = null,
    /** The number of shouts to skip before starting to collect the result set */
    public val offset: Int? = null,
)

@Serializable
public data class GetAlbumsOutput(
    public val albums: List<AlbumViewBasic>? = null,
)

@Serializable
public data class GetAlbumsParams(
    /** The maximum number of albums to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The genre to filter artists by */
    public val genre: String? = null,
)

@Serializable
public data class GetAlbumTracksOutput(
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class GetAlbumTracksParams(
    /** The URI of the album to retrieve tracks from */
    public val uri: String,
)

@Serializable
public data class GetApikeysOutput(
    @SerialName("apiKeys") public val apiKeys: List<JsonElement>? = null,
)

@Serializable
public data class GetApikeysParams(
    /** The number of API keys to skip before starting to collect the result set. */
    public val offset: Int? = null,
    /** The number of API keys to return per page. */
    public val limit: Int? = null,
)

@Serializable
public data class GetArtistAlbumsOutput(
    public val albums: List<AlbumViewBasic>? = null,
)

@Serializable
public data class GetArtistAlbumsParams(
    /** The URI of the artist to retrieve albums from */
    public val uri: String,
)

@Serializable
public data class GetArtistListenersOutput(
    public val listeners: List<ArtistListenerViewBasic>? = null,
)

@Serializable
public data class GetArtistListenersParams(
    /** The URI of the artist to retrieve listeners from */
    public val uri: String,
    /** Number of items to skip before returning results */
    public val offset: Int? = null,
    /** Maximum number of results to return */
    public val limit: Int? = null,
)

@Serializable
public data class GetArtistParams(
    /** The URI of the artist to retrieve details from */
    public val uri: String,
)

@Serializable
public data class GetArtistRecentListenersOutput(
    public val listeners: List<ArtistRecentListenerView>? = null,
)

@Serializable
public data class GetArtistRecentListenersParams(
    /** The URI of the artist to retrieve recent listeners from */
    public val uri: String,
    /** Number of items to skip before returning results */
    public val offset: Int? = null,
    /** Maximum number of results to return */
    public val limit: Int? = null,
)

@Serializable
public data class GetArtistRecommendationsParams(
    /** DID or handle of the user to recommend for. */
    public val did: String,
    public val limit: Int? = null,
)

@Serializable
public data class GetArtistShoutsOutput(
    public val shouts: List<JsonElement>? = null,
)

@Serializable
public data class GetArtistShoutsParams(
    /** The URI of the artist to retrieve shouts for */
    public val uri: String,
    /** The maximum number of shouts to return */
    public val limit: Int? = null,
    /** The number of shouts to skip before starting to collect the result set */
    public val offset: Int? = null,
)

@Serializable
public data class GetArtistsOutput(
    public val artists: List<ArtistViewBasic>? = null,
)

@Serializable
public data class GetArtistsParams(
    /** The maximum number of artists to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The names of the artists to return */
    public val names: String? = null,
    /** The genre to filter artists by */
    public val genre: String? = null,
)

@Serializable
public data class GetArtistTracksOutput(
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class GetArtistTracksParams(
    /** The URI of the artist to retrieve albums from */
    public val uri: String? = null,
    /** The maximum number of tracks to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
)

@Serializable
public data class GetCurrentlyPlayingParams(
    @SerialName("playerId") public val playerId: String? = null,
    /** Handle or DID of the actor to retrieve the currently playing track for. If not provided, defaults to the current user. */
    public val actor: String? = null,
)

@Serializable
public data class GetFeedGeneratorOutput(
    public val view: FeedGeneratorView? = null,
)

@Serializable
public data class GetFeedGeneratorParams(
    /** AT-URI of the feed generator record. */
    public val feed: String,
)

@Serializable
public data class GetFeedGeneratorsParams(
    /** The maximum number of feed generators to return. */
    public val size: Int? = null,
)

@Serializable
public data class GetFeedParams(
    /** The feed URI. */
    public val feed: String,
    /** The maximum number of scrobbles to return */
    public val limit: Int? = null,
    /** The cursor for pagination */
    public val cursor: String? = null,
)

@Serializable
public data class GetFeedSkeletonOutput(
    public val scrobbles: List<ScrobbleViewBasic>? = null,
    /** The pagination cursor for the next set of results. */
    public val cursor: String? = null,
)

@Serializable
public data class GetFeedSkeletonParams(
    /** The feed URI. */
    public val feed: String,
    /** The maximum number of scrobbles to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The pagination cursor. */
    public val cursor: String? = null,
)

@Serializable
public data class GetFileParams(
    /** The unique identifier of the file to retrieve */
    @SerialName("fileId") public val fileId: String,
)

@Serializable
public data class GetFilesParams(
    /** Path to the Dropbox folder or root directory */
    public val at: String? = null,
)

@Serializable
public data class GetFollowersOutput(
    public val subject: ActorProfileViewBasic,
    public val followers: List<ActorProfileViewBasic>,
    /** A cursor value to pass to subsequent calls to get the next page of results. */
    public val cursor: String? = null,
    /** The total number of followers. */
    public val count: Int? = null,
)

@Serializable
public data class GetFollowersParams(
    public val actor: String,
    public val limit: Int? = null,
    /** If provided, filters the followers to only include those with DIDs in this list. */
    public val dids: List<String>? = null,
    public val cursor: String? = null,
)

@Serializable
public data class GetFollowsOutput(
    public val subject: ActorProfileViewBasic,
    public val follows: List<ActorProfileViewBasic>,
    /** A cursor value to pass to subsequent calls to get the next page of results. */
    public val cursor: String? = null,
    /** The total number of follows. */
    public val count: Int? = null,
)

@Serializable
public data class GetFollowsParams(
    public val actor: String,
    public val limit: Int? = null,
    /** If provided, filters the follows to only include those with DIDs in this list. */
    public val dids: List<String>? = null,
    public val cursor: String? = null,
)

@Serializable
public data class GetKnownFollowersOutput(
    public val subject: ActorProfileViewBasic,
    public val followers: List<ActorProfileViewBasic>,
    /** A cursor value to pass to subsequent calls to get the next page of results. */
    public val cursor: String? = null,
)

@Serializable
public data class GetKnownFollowersParams(
    public val actor: String,
    public val limit: Int? = null,
    public val cursor: String? = null,
)

@Serializable
public data class GetMetadataParams(
    /** Path to the file or folder in Dropbox */
    public val path: String,
)

@Serializable
public data class GetMirrorSourcesOutput(
    public val sources: List<MirrorSourceView>,
)

@Serializable
public class GetMirrorSourcesParams

@Serializable
public data class GetPlaybackQueueParams(
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class GetPlaylistParams(
    /** The URI of the playlist to retrieve. */
    public val uri: String,
)

@Serializable
public data class GetPlaylistsOutput(
    public val playlists: List<PlaylistViewBasic>? = null,
)

@Serializable
public data class GetPlaylistsParams(
    /** The maximum number of playlists to return. */
    public val limit: Int? = null,
    /** The offset for pagination, used to skip a number of playlists. */
    public val offset: Int? = null,
)

@Serializable
public data class GetProfileParams(
    /** The DID or handle of the actor */
    public val did: String? = null,
)

@Serializable
public data class GetProfileShoutsOutput(
    public val shouts: List<JsonElement>? = null,
)

@Serializable
public data class GetProfileShoutsParams(
    /** The DID or handle of the actor */
    public val did: String,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The maximum number of shouts to return */
    public val limit: Int? = null,
)

@Serializable
public data class GetRecommendationsParams(
    /** DID or handle of the user to recommend for. */
    public val did: String,
    public val limit: Int? = null,
)

@Serializable
public data class GetScrobbleParams(
    /** The unique identifier of the scrobble */
    public val uri: String,
)

@Serializable
public data class GetScrobblesChartParams(
    /** The DID or handle of the actor */
    public val did: String? = null,
    /** The URI of the artist to filter by */
    public val artisturi: String? = null,
    /** The URI of the album to filter by */
    public val albumuri: String? = null,
    /** The URI of the track to filter by */
    public val songuri: String? = null,
    /** The genre to filter by */
    public val genre: String? = null,
    /** Start date (ISO 8601). Defaults to 6 months ago. */
    public val from: String? = null,
    /** End date (ISO 8601). Defaults to today. */
    public val to: String? = null,
)

@Serializable
public data class GetScrobblesOutput(
    public val scrobbles: List<ScrobbleViewBasic>? = null,
)

@Serializable
public data class GetScrobblesParams(
    /** The DID or handle of the actor */
    public val did: String? = null,
    /** If true, only return scrobbles from actors the viewer is following. */
    public val following: Boolean? = null,
    /** The maximum number of scrobbles to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
)

@Serializable
public data class GetShoutRepliesOutput(
    public val shouts: List<JsonElement>? = null,
)

@Serializable
public data class GetShoutRepliesParams(
    /** The URI of the shout to retrieve replies for */
    public val uri: String,
    /** The maximum number of shouts to return */
    public val limit: Int? = null,
    /** The number of shouts to skip before starting to collect the result set */
    public val offset: Int? = null,
)

@Serializable
public data class GetSongParams(
    /** The AT-URI of the song to retrieve */
    public val uri: String? = null,
    /** The MusicBrainz ID of the song to retrieve */
    public val mbid: String? = null,
    /** The International Standard Recording Code (ISRC) of the song to retrieve */
    public val isrc: String? = null,
    /** The Spotify track ID of the song to retrieve (resolved internally to the Spotify track URL) */
    @SerialName("spotifyId") public val spotifyId: String? = null,
)

@Serializable
public data class GetSongRecentListenersOutput(
    public val listeners: List<SongRecentListenerView>? = null,
)

@Serializable
public data class GetSongRecentListenersParams(
    /** The URI of the song to retrieve recent listeners from */
    public val uri: String,
    /** Number of items to skip before returning results */
    public val offset: Int? = null,
    /** Maximum number of results to return */
    public val limit: Int? = null,
)

@Serializable
public data class GetSongsOutput(
    public val songs: List<SongViewBasic>? = null,
)

@Serializable
public data class GetSongsParams(
    /** The maximum number of songs to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The genre to filter artists by */
    public val genre: String? = null,
    /** Filter songs by MusicBrainz ID */
    public val mbid: String? = null,
    /** Filter songs by International Standard Recording Code (ISRC) */
    public val isrc: String? = null,
    /** Filter songs by Spotify track ID (resolved internally to the Spotify track URL) */
    @SerialName("spotifyId") public val spotifyId: String? = null,
)

@Serializable
public data class GetStatsParams(
    /** The DID or handle of the user to get stats for. */
    public val did: String,
)

@Serializable
public data class GetStoriesParams(
    /** The maximum number of stories to return. */
    public val size: Int? = null,
)

@Serializable
public data class GetTemporaryLinkParams(
    /** Path to the file in Dropbox */
    public val path: String,
)

@Serializable
public data class GetTopArtistsOutput(
    public val artists: List<ArtistViewBasic>? = null,
)

@Serializable
public data class GetTopArtistsParams(
    /** The maximum number of artists to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The start date to filter artists from (ISO 8601 format) */
    @SerialName("startDate") public val startDate: String? = null,
    /** The end date to filter artists to (ISO 8601 format) */
    @SerialName("endDate") public val endDate: String? = null,
)

@Serializable
public data class GetTopTracksOutput(
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class GetTopTracksParams(
    /** The maximum number of tracks to return */
    public val limit: Int? = null,
    /** The offset for pagination */
    public val offset: Int? = null,
    /** The start date to filter tracks from (ISO 8601 format) */
    @SerialName("startDate") public val startDate: String? = null,
    /** The end date to filter tracks to (ISO 8601 format) */
    @SerialName("endDate") public val endDate: String? = null,
)

@Serializable
public data class GetTrackShoutsOutput(
    public val shouts: List<JsonElement>? = null,
)

@Serializable
public data class GetTrackShoutsParams(
    /** The URI of the track to retrieve shouts for */
    public val uri: String,
)

@Serializable
public data class GetWrappedParams(
    /** The DID or handle of the user */
    public val did: String,
    /** The year to get wrapped stats for (defaults to current year) */
    public val year: Int? = null,
)

@Serializable
public data class GoogledriveFileListView(
    public val files: List<GoogledriveFileView>? = null,
)

@Serializable
public data class GoogledriveFileView(
    /** The unique identifier of the file. */
    public val id: String? = null,
)

/** indicates that a handle or DID could not be resolved */
@Serializable
public data class GraphNotFoundActor(
    public val actor: String,
    @SerialName("notFound") public val notFound: Boolean,
)

@Serializable
public data class GraphRelationship(
    public val did: String,
    /** if the actor follows this DID, this is the AT-URI of the follow record */
    public val following: String? = null,
    /** if the actor is followed by this DID, contains the AT-URI of the follow record */
    @SerialName("followedBy") public val followedBy: String? = null,
)

@Serializable
public data class InsertDirectoryParams(
    /** The URI of the playlist to start */
    public val uri: String,
    /** The directory (id) to insert into the playlist */
    public val directory: String,
    /** The position in the playlist to insert the directory at, if not specified, the directory will be appended */
    public val position: Int? = null,
)

@Serializable
public data class InsertFilesParams(
    /** The URI of the playlist to start */
    public val uri: String,
    public val files: List<String>,
    /** The position in the playlist to insert the files at, if not specified, files will be appended */
    public val position: Int? = null,
)

@Serializable
public data class LikeRecord(
    /** The date when the like was created. */
    @SerialName("createdAt") public val createdAt: String,
    public val subject: StrongRef,
)

@Serializable
public data class LikeShoutInput(
    /** The unique identifier of the shout to like */
    public val uri: String? = null,
)

@Serializable
public data class LikeSongInput(
    /** The unique identifier of the song to like */
    public val uri: String? = null,
)

@Serializable
public data class MatchSongParams(
    /** The title of the song to retrieve */
    public val title: String,
    /** The artist of the song to retrieve */
    public val artist: String,
    /** Optional MusicBrainz recording ID to anchor the match */
    @SerialName("mbId") public val mbId: String? = null,
    /** Optional International Standard Recording Code (ISRC) to anchor the match */
    public val isrc: String? = null,
)

@Serializable
public data class MirrorSourceView(
    /** One of: lastfm, listenbrainz, tealfm */
    public val provider: String,
    /** Whether scrobbles from this source are being mirrored into Rocksky. */
    public val enabled: Boolean,
    /** True when an API key is stored. Last.fm/ListenBrainz only; always false for Teal.fm. */
    @SerialName("hasCredentials") public val hasCredentials: Boolean,
    /** Username on the external service (Last.fm / ListenBrainz). Null for Teal.fm. */
    @SerialName("externalUsername") public val externalUsername: String? = null,
    /** The last time the mirror process successfully polled this source. */
    @SerialName("lastPolledAt") public val lastPolledAt: String? = null,
    /** Watermark — scrobbles from the external service older than this are skipped. */
    @SerialName("lastScrobbleSeenAt") public val lastScrobbleSeenAt: String? = null,
)

@Serializable
public data class NextParams(
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class PauseParams(
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class PlayDirectoryParams(
    @SerialName("directoryId") public val directoryId: String,
    @SerialName("playerId") public val playerId: String? = null,
    public val shuffle: Boolean? = null,
    public val recurse: Boolean? = null,
    public val position: Int? = null,
)

@Serializable
public data class PlayerCurrentlyPlayingViewDetailed(
    /** The title of the currently playing track */
    public val title: String? = null,
)

@Serializable
public data class PlayerPlaybackQueueViewDetailed(
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class PlayFileParams(
    @SerialName("fileId") public val fileId: String,
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class PlaylistItemRecord(
    public val subject: StrongRef,
    /** The date the playlist was created. */
    @SerialName("createdAt") public val createdAt: String,
    public val track: SongViewBasic,
    /** The order of the item in the playlist. */
    public val order: Int,
)

@Serializable
public data class PlaylistRecord(
    /** The name of the playlist. */
    public val name: String,
    /** The date the playlist was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** The playlist description. */
    public val description: String? = null,
    /** The picture of the playlist. */
    public val picture: BlobRef? = null,
    /** The URL of the picture of the artist. */
    @SerialName("pictureUrl") public val pictureUrl: String? = null,
    /** The Spotify link of the playlist. */
    @SerialName("spotifyLink") public val spotifyLink: String? = null,
    /** The Tidal link of the playlist. */
    @SerialName("tidalLink") public val tidalLink: String? = null,
    /** The YouTube link of the playlist. */
    @SerialName("youtubeLink") public val youtubeLink: String? = null,
    /** The Apple Music link of the playlist. */
    @SerialName("appleMusicLink") public val appleMusicLink: String? = null,
)

/** Basic view of a playlist, including its metadata */
@Serializable
public data class PlaylistViewBasic(
    /** The unique identifier of the playlist. */
    public val id: String? = null,
    /** The title of the playlist. */
    public val title: String? = null,
    /** The URI of the playlist. */
    public val uri: String? = null,
    /** The DID of the curator of the playlist. */
    @SerialName("curatorDid") public val curatorDid: String? = null,
    /** The handle of the curator of the playlist. */
    @SerialName("curatorHandle") public val curatorHandle: String? = null,
    /** The name of the curator of the playlist. */
    @SerialName("curatorName") public val curatorName: String? = null,
    /** The URL of the avatar image of the curator. */
    @SerialName("curatorAvatarUrl") public val curatorAvatarUrl: String? = null,
    /** A description of the playlist. */
    public val description: String? = null,
    /** The URL of the cover image for the playlist. */
    @SerialName("coverImageUrl") public val coverImageUrl: String? = null,
    /** The date and time when the playlist was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    /** The number of tracks in the playlist. */
    @SerialName("trackCount") public val trackCount: Int? = null,
)

/** Detailed view of a playlist, including its tracks and metadata */
@Serializable
public data class PlaylistViewDetailed(
    /** The unique identifier of the playlist. */
    public val id: String? = null,
    /** The title of the playlist. */
    public val title: String? = null,
    /** The URI of the playlist. */
    public val uri: String? = null,
    /** The DID of the curator of the playlist. */
    @SerialName("curatorDid") public val curatorDid: String? = null,
    /** The handle of the curator of the playlist. */
    @SerialName("curatorHandle") public val curatorHandle: String? = null,
    /** The name of the curator of the playlist. */
    @SerialName("curatorName") public val curatorName: String? = null,
    /** The URL of the avatar image of the curator. */
    @SerialName("curatorAvatarUrl") public val curatorAvatarUrl: String? = null,
    /** A description of the playlist. */
    public val description: String? = null,
    /** The URL of the cover image for the playlist. */
    @SerialName("coverImageUrl") public val coverImageUrl: String? = null,
    /** The date and time when the playlist was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    /** A list of tracks in the playlist. */
    public val tracks: List<SongViewBasic>? = null,
)

@Serializable
public data class PlayParams(
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class PreviousParams(
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class ProfileRecord(
    @SerialName("displayName") public val displayName: String? = null,
    /** Free-form profile description text. */
    public val description: String? = null,
    /** Small image to be displayed next to posts from account. AKA, 'profile picture' */
    public val avatar: BlobRef? = null,
    /** Larger horizontal image to display behind profile view. */
    public val banner: BlobRef? = null,
    /** Self-label values, specific to the Bluesky application, on the overall account. */
    public val labels: JsonElement? = null,
    @SerialName("joinedViaStarterPack") public val joinedViaStarterPack: StrongRef? = null,
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class PutMirrorSourceInput(
    /** One of: lastfm, listenbrainz, tealfm */
    public val provider: String,
    /** Enable or disable mirroring for this provider. */
    public val enabled: Boolean? = null,
    /** External username (Last.fm / ListenBrainz). Required when enabling those providers. Ignored for Teal.fm. */
    @SerialName("externalUsername") public val externalUsername: String? = null,
    /** API key / token to be encrypted at rest. Omit to leave the existing key unchanged. Pass an empty string to clear it. */
    @SerialName("apiKey") public val apiKey: String? = null,
)

@Serializable
public data class RadioRecord(
    /** The name of the radio station. */
    public val name: String,
    /** The URL of the radio station. */
    public val url: String,
    /** The date when the radio station was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** A description of the radio station. */
    public val description: String? = null,
    /** The genre of the radio station. */
    public val genre: String? = null,
    /** The logo of the radio station. */
    public val logo: BlobRef? = null,
    /** The website of the radio station. */
    public val website: String? = null,
)

@Serializable
public data class RadioViewBasic(
    /** The unique identifier of the radio. */
    public val id: String? = null,
    /** The name of the radio. */
    public val name: String? = null,
    /** A brief description of the radio. */
    public val description: String? = null,
    /** The date and time when the radio was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class RadioViewDetailed(
    /** The unique identifier of the radio. */
    public val id: String? = null,
    /** The name of the radio. */
    public val name: String? = null,
    /** A brief description of the radio. */
    public val description: String? = null,
    /** The website of the radio. */
    public val website: String? = null,
    /** The streaming URL of the radio. */
    public val url: String? = null,
    /** The genre of the radio. */
    public val genre: String? = null,
    /** The logo of the radio station. */
    public val logo: String? = null,
    /** The date and time when the radio was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class RemoveApikeyParams(
    /** The ID of the API key to remove. */
    public val id: String,
)

@Serializable
public data class RemovePlaylistParams(
    /** The URI of the playlist to remove */
    public val uri: String,
)

@Serializable
public data class RemoveShoutParams(
    /** The ID of the shout to be removed */
    public val id: String,
)

@Serializable
public data class RemoveTrackParams(
    /** The URI of the playlist to remove the track from */
    public val uri: String,
    /** The position of the track to remove in the playlist */
    public val position: Int,
)

@Serializable
public data class ReplyShoutInput(
    /** The unique identifier of the shout to reply to */
    @SerialName("shoutId") public val shoutId: String,
    /** The content of the reply */
    public val message: String,
)

@Serializable
public data class ReportShoutInput(
    /** The unique identifier of the shout to report */
    @SerialName("shoutId") public val shoutId: String,
    /** The reason for reporting the shout */
    public val reason: String? = null,
)

@Serializable
public data class ScrobbleFirstScrobbleView(
    /** The handle of the user who first scrobbled this song. */
    public val handle: String? = null,
    /** The avatar URL of the user who first scrobbled this song. */
    public val avatar: String? = null,
    /** The timestamp of the first scrobble. */
    public val timestamp: String? = null,
)

@Serializable
public data class ScrobbleRecord(
    /** The title of the song. */
    public val title: String,
    /** The artist of the song. */
    public val artist: String,
    /** The album artist of the song. */
    @SerialName("albumArtist") public val albumArtist: String,
    /** The album of the song. */
    public val album: String,
    /** The duration of the song in milliseconds. */
    public val duration: Int,
    /** The date when the song was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** The artists of the song with MusicBrainz IDs. */
    public val artists: List<ArtistMbid>? = null,
    /** The track number of the song in the album. */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The disc number of the song in the album. */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The release date of the song. */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The year the song was released. */
    public val year: Int? = null,
    /** The genre of the song. */
    public val genre: String? = null,
    /** The tags of the song. */
    public val tags: List<String>? = null,
    /** The composer of the song. */
    public val composer: String? = null,
    /** The lyrics of the song. */
    public val lyrics: String? = null,
    /** The copyright message of the song. */
    @SerialName("copyrightMessage") public val copyrightMessage: String? = null,
    /** Informations about the song */
    public val wiki: String? = null,
    /** The album art of the song. */
    @SerialName("albumArt") public val albumArt: BlobRef? = null,
    /** The URL of the album art of the song. */
    @SerialName("albumArtUrl") public val albumArtUrl: String? = null,
    /** The YouTube link of the song. */
    @SerialName("youtubeLink") public val youtubeLink: String? = null,
    /** The Spotify link of the song. */
    @SerialName("spotifyLink") public val spotifyLink: String? = null,
    /** The Tidal link of the song. */
    @SerialName("tidalLink") public val tidalLink: String? = null,
    /** The Apple Music link of the song. */
    @SerialName("appleMusicLink") public val appleMusicLink: String? = null,
    /** The MusicBrainz ID of the song. */
    public val mbid: String? = null,
    /** The label of the song. */
    public val label: String? = null,
    /** The International Standard Recording Code (ISRC) of the song. */
    public val isrc: String? = null,
)

@Serializable
public data class ScrobbleViewBasic(
    /** The unique identifier of the scrobble. */
    public val id: String? = null,
    /** The handle of the user who created the scrobble. */
    public val user: String? = null,
    /** The display name of the user who created the scrobble. */
    @SerialName("userDisplayName") public val userDisplayName: String? = null,
    /** The avatar URL of the user who created the scrobble. */
    @SerialName("userAvatar") public val userAvatar: String? = null,
    /** The title of the scrobble. */
    public val title: String? = null,
    /** The artist of the song. */
    public val artist: String? = null,
    /** The URI of the artist. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The album of the song. */
    public val album: String? = null,
    /** The URI of the album. */
    @SerialName("albumUri") public val albumUri: String? = null,
    /** The album art URL of the song. */
    public val cover: String? = null,
    /** The timestamp when the scrobble was created. */
    public val date: String? = null,
    /** The URI of the scrobble. */
    public val uri: String? = null,
    /** The SHA256 hash of the scrobble data. */
    public val sha256: String? = null,
    public val liked: Boolean? = null,
    @SerialName("likesCount") public val likesCount: Int? = null,
)

@Serializable
public data class ScrobbleViewDetailed(
    /** The unique identifier of the scrobble. */
    public val id: String? = null,
    /** The handle of the user who created the scrobble. */
    public val user: String? = null,
    /** The title of the scrobble. */
    public val title: String? = null,
    /** The artist of the song. */
    public val artist: String? = null,
    /** The URI of the artist. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The album of the song. */
    public val album: String? = null,
    /** The URI of the album. */
    @SerialName("albumUri") public val albumUri: String? = null,
    /** The album art URL of the song. */
    public val cover: String? = null,
    /** The timestamp when the scrobble was created. */
    public val date: String? = null,
    /** The URI of the scrobble. */
    public val uri: String? = null,
    /** The SHA256 hash of the scrobble data. */
    public val sha256: String? = null,
    public val liked: Boolean? = null,
    @SerialName("likesCount") public val likesCount: Int? = null,
    /** The number of listeners */
    public val listeners: Int? = null,
    /** The number of scrobbles for this song */
    public val scrobbles: Int? = null,
    public val artists: List<ArtistViewBasic>? = null,
    /** The first scrobble of this song on Rocksky. */
    @SerialName("firstScrobble") public val firstScrobble: ScrobbleFirstScrobbleView? = null,
)

@Serializable
public data class SearchParams(
    /** The search query string */
    public val query: String,
)

@Serializable
public data class SeekParams(
    /** The position in seconds to seek to */
    public val position: Int,
    @SerialName("playerId") public val playerId: String? = null,
)

@Serializable
public data class ShoutAuthor(
    /** The unique identifier of the author. */
    public val id: String? = null,
    /** The decentralized identifier (DID) of the author. */
    public val did: String? = null,
    /** The handle of the author. */
    public val handle: String? = null,
    /** The display name of the author. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the author's avatar image. */
    public val avatar: String? = null,
)

@Serializable
public data class ShoutRecord(
    /** The message of the shout. */
    public val message: String,
    /** The date when the shout was created. */
    @SerialName("createdAt") public val createdAt: String,
    public val subject: StrongRef,
    public val parent: StrongRef? = null,
)

@Serializable
public data class ShoutView(
    /** The unique identifier of the shout. */
    public val id: String? = null,
    /** The content of the shout. */
    public val message: String? = null,
    /** The ID of the parent shout if this is a reply, otherwise null. */
    public val parent: String? = null,
    /** The date and time when the shout was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    /** The author of the shout. */
    public val author: ShoutAuthor? = null,
)

@Serializable
public data class SongFirstScrobbleView(
    /** The handle of the user who first scrobbled this song. */
    public val handle: String? = null,
    /** The avatar URL of the user who first scrobbled this song. */
    public val avatar: String? = null,
    /** The timestamp of the first scrobble. */
    public val timestamp: String? = null,
)

@Serializable
public data class SongRecentListenerView(
    /** The unique identifier of the listener. */
    public val id: String? = null,
    /** The DID of the listener. */
    public val did: String? = null,
    /** The handle of the listener. */
    public val handle: String? = null,
    /** The display name of the listener. */
    @SerialName("displayName") public val displayName: String? = null,
    /** The URL of the listener's avatar image. */
    public val avatar: String? = null,
    /** The timestamp of the listener's most recent scrobble of this song. */
    public val timestamp: String? = null,
    /** The URI of the listener's most recent scrobble of this song. */
    @SerialName("scrobbleUri") public val scrobbleUri: String? = null,
)

@Serializable
public data class SongRecord(
    /** The title of the song. */
    public val title: String,
    /** The artist of the song. */
    public val artist: String,
    /** The album artist of the song. */
    @SerialName("albumArtist") public val albumArtist: String,
    /** The album of the song. */
    public val album: String,
    /** The duration of the song in milliseconds. */
    public val duration: Int,
    /** The date when the song was created. */
    @SerialName("createdAt") public val createdAt: String,
    /** The artists of the song with MusicBrainz IDs. */
    public val artists: List<ArtistMbid>? = null,
    /** The track number of the song in the album. */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The disc number of the song in the album. */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The release date of the song. */
    @SerialName("releaseDate") public val releaseDate: String? = null,
    /** The year the song was released. */
    public val year: Int? = null,
    /** The genre of the song. */
    public val genre: String? = null,
    /** The tags of the song. */
    public val tags: List<String>? = null,
    /** The composer of the song. */
    public val composer: String? = null,
    /** The lyrics of the song. */
    public val lyrics: String? = null,
    /** The copyright message of the song. */
    @SerialName("copyrightMessage") public val copyrightMessage: String? = null,
    /** Informations about the song */
    public val wiki: String? = null,
    /** The album art of the song. */
    @SerialName("albumArt") public val albumArt: BlobRef? = null,
    /** The URL of the album art of the song. */
    @SerialName("albumArtUrl") public val albumArtUrl: String? = null,
    /** The YouTube link of the song. */
    @SerialName("youtubeLink") public val youtubeLink: String? = null,
    /** The Spotify link of the song. */
    @SerialName("spotifyLink") public val spotifyLink: String? = null,
    /** The Tidal link of the song. */
    @SerialName("tidalLink") public val tidalLink: String? = null,
    /** The Apple Music link of the song. */
    @SerialName("appleMusicLink") public val appleMusicLink: String? = null,
    /** The MusicBrainz ID of the song. */
    public val mbid: String? = null,
    /** The label of the song. */
    public val label: String? = null,
    /** The International Standard Recording Code (ISRC) of the song. */
    public val isrc: String? = null,
)

@Serializable
public data class SongViewBasic(
    /** The unique identifier of the song. */
    public val id: String? = null,
    /** The title of the song. */
    public val title: String? = null,
    /** The artist of the song. */
    public val artist: String? = null,
    /** The artist of the album the song belongs to. */
    @SerialName("albumArtist") public val albumArtist: String? = null,
    /** The URL of the album art image. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The URI of the song. */
    public val uri: String? = null,
    /** The album of the song. */
    public val album: String? = null,
    /** The duration of the song in milliseconds. */
    public val duration: Int? = null,
    /** The track number of the song in the album. */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The disc number of the song in the album. */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The number of times the song has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the song. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
    /** The URI of the album the song belongs to. */
    @SerialName("albumUri") public val albumUri: String? = null,
    /** The URI of the artist of the song. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The SHA256 hash of the song. */
    public val sha256: String? = null,
    /** The MusicBrainz ID of the song. */
    public val mbid: String? = null,
    /** The International Standard Recording Code (ISRC) of the song. */
    public val isrc: String? = null,
    public val tags: List<String>? = null,
    /** The timestamp when the song was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
)

@Serializable
public data class SongViewDetailed(
    /** The unique identifier of the song. */
    public val id: String? = null,
    /** The title of the song. */
    public val title: String? = null,
    /** The artist of the song. */
    public val artist: String? = null,
    /** The artist of the album the song belongs to. */
    @SerialName("albumArtist") public val albumArtist: String? = null,
    /** The URL of the album art image. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The URI of the song. */
    public val uri: String? = null,
    /** The album of the song. */
    public val album: String? = null,
    /** The duration of the song in milliseconds. */
    public val duration: Int? = null,
    /** The track number of the song in the album. */
    @SerialName("trackNumber") public val trackNumber: Int? = null,
    /** The disc number of the song in the album. */
    @SerialName("discNumber") public val discNumber: Int? = null,
    /** The number of times the song has been played. */
    @SerialName("playCount") public val playCount: Int? = null,
    /** The number of unique listeners who have played the song. */
    @SerialName("uniqueListeners") public val uniqueListeners: Int? = null,
    /** The URI of the album the song belongs to. */
    @SerialName("albumUri") public val albumUri: String? = null,
    /** The URI of the artist of the song. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The SHA256 hash of the song. */
    public val sha256: String? = null,
    /** The MusicBrainz ID of the song. */
    public val mbid: String? = null,
    /** The International Standard Recording Code (ISRC) of the song. */
    public val isrc: String? = null,
    public val tags: List<String>? = null,
    /** The timestamp when the song was created. */
    @SerialName("createdAt") public val createdAt: String? = null,
    public val artists: List<ArtistViewBasic>? = null,
    /** The first scrobble of this song on Rocksky. */
    @SerialName("firstScrobble") public val firstScrobble: SongFirstScrobbleView? = null,
)

@Serializable
public data class SpotifyTrackView(
    /** The unique identifier of the Spotify track. */
    public val id: String? = null,
    /** The name of the track. */
    public val name: String? = null,
    /** The name of the artist. */
    public val artist: String? = null,
    /** The name of the album. */
    public val album: String? = null,
    /** The duration of the track in milliseconds. */
    public val duration: Int? = null,
    /** A URL to a preview of the track. */
    @SerialName("previewUrl") public val previewUrl: String? = null,
)

@Serializable
public data class StartPlaylistParams(
    /** The URI of the playlist to start */
    public val uri: String,
    /** Whether to shuffle the playlist when starting it */
    public val shuffle: Boolean? = null,
    /** The position in the playlist to start from, if not specified, starts from the beginning */
    public val position: Int? = null,
)

@Serializable
public data class StatsView(
    /** The total number of scrobbles. */
    public val scrobbles: Int? = null,
    /** The total number of unique artists scrobbled. */
    public val artists: Int? = null,
    /** The total number of tracks marked as loved. */
    @SerialName("lovedTracks") public val lovedTracks: Int? = null,
    /** The total number of unique albums scrobbled. */
    public val albums: Int? = null,
    /** The total number of unique tracks scrobbled. */
    public val tracks: Int? = null,
)

@Serializable
public data class StatsWrappedAlbum(
    /** The unique identifier of the album. */
    public val id: String? = null,
    /** The title of the album. */
    public val title: String? = null,
    /** The artist of the album. */
    public val artist: String? = null,
    /** The album art URL. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The AT-URI of the album. */
    public val uri: String? = null,
    /** Number of plays in the wrapped period. */
    @SerialName("playCount") public val playCount: Int? = null,
)

@Serializable
public data class StatsWrappedArtist(
    /** The unique identifier of the artist. */
    public val id: String? = null,
    /** The name of the artist. */
    public val name: String? = null,
    /** The picture URL of the artist. */
    public val picture: String? = null,
    /** The AT-URI of the artist. */
    public val uri: String? = null,
    /** Number of plays in the wrapped period. */
    @SerialName("playCount") public val playCount: Int? = null,
)

@Serializable
public data class StatsWrappedDayCount(
    /** The date (YYYY-MM-DD). */
    public val date: String? = null,
    /** Number of scrobbles on this day. */
    public val count: Int? = null,
)

@Serializable
public data class StatsWrappedGenreCount(
    /** The genre name. */
    public val genre: String? = null,
    /** Number of scrobbles for this genre. */
    public val count: Int? = null,
)

@Serializable
public data class StatsWrappedMilestone(
    /** The title of the track. */
    @SerialName("trackTitle") public val trackTitle: String? = null,
    /** The name of the artist. */
    @SerialName("artistName") public val artistName: String? = null,
    /** The timestamp of the scrobble. */
    public val timestamp: String? = null,
    /** AT-URI of the track record, used to build a clickable link to the song page. */
    @SerialName("trackUri") public val trackUri: String? = null,
)

@Serializable
public data class StatsWrappedMonthCount(
    /** Month number (1-12). */
    public val month: Int? = null,
    /** Number of scrobbles in this month. */
    public val count: Int? = null,
)

@Serializable
public data class StatsWrappedTrack(
    /** The unique identifier of the track. */
    public val id: String? = null,
    /** The title of the track. */
    public val title: String? = null,
    /** The artist of the track. */
    public val artist: String? = null,
    /** The album art URL. */
    @SerialName("albumArt") public val albumArt: String? = null,
    /** The AT-URI of the track. */
    public val uri: String? = null,
    /** The AT-URI of the artist. */
    @SerialName("artistUri") public val artistUri: String? = null,
    /** The AT-URI of the album. */
    @SerialName("albumUri") public val albumUri: String? = null,
    /** Number of plays in the wrapped period. */
    @SerialName("playCount") public val playCount: Int? = null,
)

@Serializable
public data class StatsWrappedView(
    /** The year of the wrapped stats. */
    public val year: Int? = null,
    /** Total scrobbles in the year. */
    @SerialName("totalScrobbles") public val totalScrobbles: Int? = null,
    /** Total listening time in minutes. */
    @SerialName("totalListeningTimeMinutes") public val totalListeningTimeMinutes: Int? = null,
    /** Top 5 artists by play count. */
    @SerialName("topArtists") public val topArtists: List<StatsWrappedArtist>? = null,
    /** Top 5 tracks by play count. */
    @SerialName("topTracks") public val topTracks: List<StatsWrappedTrack>? = null,
    /** Top 5 albums by play count. */
    @SerialName("topAlbums") public val topAlbums: List<StatsWrappedAlbum>? = null,
    /** Top genres by play count. */
    @SerialName("topGenres") public val topGenres: List<StatsWrappedGenreCount>? = null,
    /** Scrobble counts per month. */
    @SerialName("scrobblesPerMonth") public val scrobblesPerMonth: List<StatsWrappedMonthCount>? = null,
    /** The most active day of the year. */
    @SerialName("mostActiveDay") public val mostActiveDay: StatsWrappedDayCount? = null,
    /** The most active hour of the day (0-23). */
    @SerialName("mostActiveHour") public val mostActiveHour: Int? = null,
    /** Number of artists heard for the first time this year. */
    @SerialName("newArtistsCount") public val newArtistsCount: Int? = null,
    /** Longest consecutive days streak. */
    @SerialName("longestStreak") public val longestStreak: Int? = null,
    /** The first scrobble of the year. */
    @SerialName("firstScrobble") public val firstScrobble: StatsWrappedMilestone? = null,
    /** The last scrobble of the year. */
    @SerialName("lastScrobble") public val lastScrobble: StatsWrappedMilestone? = null,
)

@Serializable
public data class StatusRecord(
    /** The track currently being played. */
    public val track: ActorTrackView,
    /** When the track started playing. */
    @SerialName("startedAt") public val startedAt: String,
    /** When the status expires. Defaults to startedAt plus track duration plus idle time. */
    @SerialName("expiresAt") public val expiresAt: String? = null,
)

@Serializable
public data class StrongRef(
    public val uri: String,
    public val cid: String,
)

@Serializable
public data class UnfollowAccountOutput(
    public val subject: ActorProfileViewBasic,
    public val followers: List<ActorProfileViewBasic>,
    /** A cursor value to pass to subsequent calls to get the next page of results. */
    public val cursor: String? = null,
)

@Serializable
public data class UnfollowAccountParams(
    public val account: String,
)

@Serializable
public data class UpdateApikeyInput(
    /** The ID of the API key to update. */
    public val id: String,
    /** The new name of the API key. */
    public val name: String,
    /** A new description for the API key. */
    public val description: String? = null,
)
