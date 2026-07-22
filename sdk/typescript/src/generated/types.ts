// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

export interface BlobRef {
  $type?: "blob";
  ref?: { $link?: string };
  mimeType?: string;
  size?: number;
}

export type CidLink = string;
export type DateTime = string;
export type AtUri = string;
export type AtIdentifier = string;
export type Did = string;
export type Cid = string;
export type Uri = string;

export interface ActorArtistViewBasic {
  id?: string;
  name?: string;
  picture?: Uri;
  uri?: AtUri;
  user1Rank?: number;
  user2Rank?: number;
  weight?: number;
}

export interface ActorCompatibilityViewBasic {
  compatibilityLevel?: number;
  compatibilityPercentage?: number;
  sharedArtists?: number;
  topSharedArtistNames?: string[];
  topSharedDetailedArtists?: ActorArtistViewBasic[];
  user1ArtistCount?: number;
  user2ArtistCount?: number;
}

export interface ActorNeighbourViewBasic {
  userId?: string;
  did?: string;
  handle?: string;
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: Uri;
  /** The number of artists shared with the actor. */
  sharedArtistsCount?: number;
  /** The similarity score with the actor. */
  similarityScore?: number;
  /** The top shared artist names with the actor. */
  topSharedArtistNames?: string[];
  /** The top shared artist details with the actor. */
  topSharedArtistsDetails?: ArtistViewBasic[];
}

export interface ActorProfileViewBasic {
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: Uri;
  /** The date and time when the actor was created. */
  createdAt?: DateTime;
  /** The date and time when the actor was last updated. */
  updatedAt?: DateTime;
}

export interface ActorProfileViewDetailed {
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the actor. */
  did?: string;
  /** The handle of the actor. */
  handle?: string;
  /** The display name of the actor. */
  displayName?: string;
  /** The URL of the actor's avatar image. */
  avatar?: Uri;
  /** The date and time when the actor was created. */
  createdAt?: DateTime;
  /** The date and time when the actor was last updated. */
  updatedAt?: DateTime;
}

export interface ActorTrackView {
  /** The name of the track. */
  name: string;
  /** The primary artist name. */
  artist: string;
  /** The album name. */
  album?: string;
  /** URL of the album cover image. */
  albumCoverUrl?: Uri;
  /** Track duration in milliseconds. */
  durationMs?: number;
  /** Music service source, e.g. 'spotify' or 'listenbrainz'. */
  source?: string;
  /** MusicBrainz recording ID, if available. */
  recordingMbId?: string;
}

export interface AddDirectoryToQueueParams {
  playerId?: string;
  /** The directory to add to the queue */
  directory: string;
  /** Position in the queue to insert the directory at, defaults to the end if not specified */
  position?: number;
  /** Whether to shuffle the added directory in the queue */
  shuffle?: boolean;
}

export interface AddItemsToQueueParams {
  playerId?: string;
  items: string[];
  /** Position in the queue to insert the items at, defaults to the end if not specified */
  position?: number;
  /** Whether to shuffle the added items in the queue */
  shuffle?: boolean;
}

export interface AlbumRecord {
  /** The title of the album. */
  title: string;
  /** The artist of the album. */
  artist: string;
  /** The duration of the album in milliseconds. */
  duration?: number;
  /** The release date of the album. */
  releaseDate?: DateTime;
  /** The year the album was released. */
  year?: number;
  /** The genre of the album. */
  genre?: string;
  /** The album art of the album. */
  albumArt?: BlobRef;
  /** The URL of the album art of the album. */
  albumArtUrl?: Uri;
  /** The tags of the album. */
  tags?: string[];
  /** The YouTube link of the album. */
  youtubeLink?: Uri;
  /** The Spotify link of the album. */
  spotifyLink?: Uri;
  /** The tidal link of the album. */
  tidalLink?: Uri;
  /** The Apple Music link of the album. */
  appleMusicLink?: Uri;
  /** The date and time when the album was created. */
  createdAt: DateTime;
}

export interface AlbumViewBasic {
  /** The unique identifier of the album. */
  id?: string;
  /** The URI of the album. */
  uri?: AtUri;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The URI of the album's artist. */
  artistUri?: AtUri;
  /** The year the album was released. */
  year?: number;
  /** The URL of the album art image. */
  albumArt?: Uri;
  /** The release date of the album. */
  releaseDate?: string;
  /** The SHA256 hash of the album. */
  sha256?: string;
  /** The number of times the album has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number;
}

export interface AlbumViewDetailed {
  /** The unique identifier of the album. */
  id?: string;
  /** The URI of the album. */
  uri?: AtUri;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The URI of the album's artist. */
  artistUri?: AtUri;
  /** The year the album was released. */
  year?: number;
  /** The URL of the album art image. */
  albumArt?: Uri;
  /** The release date of the album. */
  releaseDate?: string;
  /** The SHA256 hash of the album. */
  sha256?: string;
  /** The number of times the album has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the album. */
  uniqueListeners?: number;
  tags?: string[];
  tracks?: SongViewBasic[];
}

export interface ApiKeyView {
  /** The unique identifier of the API key. */
  id?: string;
  /** The name of the API key. */
  name?: string;
  /** A description for the API key. */
  description?: string;
  /** The date and time when the API key was created. */
  createdAt?: DateTime;
}

export interface ArtistListenerViewBasic {
  /** The unique identifier of the actor. */
  id?: string;
  /** The DID of the listener. */
  did?: string;
  /** The handle of the listener. */
  handle?: string;
  /** The display name of the listener. */
  displayName?: string;
  /** The URL of the listener's avatar image. */
  avatar?: Uri;
  mostListenedSong?: ArtistSongViewBasic;
  /** The total number of plays by the listener. */
  totalPlays?: number;
  /** The rank of the listener among all listeners of the artist. */
  rank?: number;
}

export interface ArtistMbid {
  /** The MusicBrainz Identifier (MBID) of the artist. */
  mbid?: string;
  /** The name of the artist. */
  name?: string;
}

export interface ArtistRecentListenerView {
  /** The unique identifier of the listener. */
  id?: string;
  /** The DID of the listener. */
  did?: string;
  /** The handle of the listener. */
  handle?: string;
  /** The display name of the listener. */
  displayName?: string;
  /** The URL of the listener's avatar image. */
  avatar?: Uri;
  /** The timestamp of the listener's most recent scrobble of this artist. */
  timestamp?: DateTime;
  /** The URI of the listener's most recent scrobble of this artist. */
  scrobbleUri?: AtUri;
}

export interface ArtistRecord {
  /** The name of the artist. */
  name: string;
  /** The biography of the artist. */
  bio?: string;
  /** The picture of the artist. */
  picture?: BlobRef;
  /** The URL of the picture of the artist. */
  pictureUrl?: Uri;
  /** The tags of the artist. */
  tags?: string[];
  /** The birth date of the artist. */
  born?: DateTime;
  /** The death date of the artist. */
  died?: DateTime;
  /** The birth place of the artist. */
  bornIn?: string;
  /** The date when the artist was created. */
  createdAt: DateTime;
}

export interface ArtistSongViewBasic {
  /** The URI of the song. */
  uri?: AtUri;
  /** The title of the song. */
  title?: string;
  /** The number of times the song has been played. */
  playCount?: number;
}

export interface ArtistViewBasic {
  /** The unique identifier of the artist. */
  id?: string;
  /** The URI of the artist. */
  uri?: AtUri;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string;
  /** The SHA256 hash of the artist. */
  sha256?: string;
  /** The number of times the artist has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number;
  tags?: string[];
}

export interface ArtistViewDetailed {
  /** The unique identifier of the artist. */
  id?: string;
  /** The URI of the artist. */
  uri?: AtUri;
  /** The name of the artist. */
  name?: string;
  /** The picture of the artist. */
  picture?: string;
  /** The SHA256 hash of the artist. */
  sha256?: string;
  /** The number of times the artist has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the artist. */
  uniqueListeners?: number;
  tags?: string[];
}

export interface ChartsScrobbleViewBasic {
  /** The date of the scrobble. */
  date?: DateTime;
  /** The number of scrobbles on this date. */
  count?: number;
}

export interface ChartsView {
  scrobbles?: ChartsScrobbleViewBasic[];
}

export interface CreateApikeyInput {
  /** The name of the API key. */
  name: string;
  /** A description for the API key. */
  description?: string;
}

export interface CreatePlaylistParams {
  /** The name of the playlist */
  name: string;
  /** A brief description of the playlist */
  description?: string;
}

export interface CreateScrobbleInput {
  /** The title of the track being scrobbled */
  title: string;
  /** The artist of the track being scrobbled */
  artist: string;
  /** The album of the track being scrobbled */
  album?: string;
  /** The duration of the track in milliseconds (e.g., 240000 for 4 minutes) */
  duration?: number;
  /** The MusicBrainz ID of the track, if available */
  mbId?: string;
  /** The International Standard Recording Code (ISRC) of the track, if available */
  isrc?: string;
  /** The URL of the album art for the track */
  albumArt?: Uri;
  /** The track number of the track in the album */
  trackNumber?: number;
  /** The release date of the track, formatted as YYYY-MM-DD */
  releaseDate?: string;
  /** The year the track was released */
  year?: number;
  /** The disc number of the track in the album, if applicable */
  discNumber?: number;
  /** The lyrics of the track, if available */
  lyrics?: string;
  /** The composer of the track, if available */
  composer?: string;
  /** The copyright message for the track, if available */
  copyrightMessage?: string;
  /** The record label of the track, if available */
  label?: string;
  /** The URL of the artist's picture, if available */
  artistPicture?: Uri;
  /** The Spotify link for the track, if available */
  spotifyLink?: Uri;
  /** The Last.fm link for the track, if available */
  lastfmLink?: Uri;
  /** The Tidal link for the track, if available */
  tidalLink?: Uri;
  /** The Apple Music link for the track, if available */
  appleMusicLink?: Uri;
  /** The Youtube link for the track, if available */
  youtubeLink?: Uri;
  /** The Deezer link for the track, if available */
  deezerLink?: Uri;
  /** The timestamp of the scrobble in seconds since epoch (Unix timestamp) */
  timestamp?: number;
}

export interface CreateShoutInput {
  /** The content of the shout */
  message?: string;
}

export interface CreateSongInput {
  /** The title of the song */
  title: string;
  /** The artist of the song */
  artist: string;
  /** The album artist of the song, if different from the main artist */
  albumArtist: string;
  /** The album of the song, if applicable */
  album: string;
  /** The duration of the song in milliseconds */
  duration?: number;
  /** The MusicBrainz ID of the song, if available */
  mbId?: string;
  /** The International Standard Recording Code (ISRC) of the song, if available */
  isrc?: string;
  /** The URL of the album art for the song */
  albumArt?: Uri;
  /** The track number of the song in the album, if applicable */
  trackNumber?: number;
  /** The release date of the song, formatted as YYYY-MM-DD */
  releaseDate?: string;
  /** The year the song was released */
  year?: number;
  /** The disc number of the song in the album, if applicable */
  discNumber?: number;
  /** The lyrics of the song, if available */
  lyrics?: string;
}

export interface DescribeFeedGeneratorOutput {
  /** The DID of the feed generator. */
  did?: AtIdentifier;
  /** List of feed URIs generated by this feed generator. */
  feeds?: FeedUriView[];
}

export interface DescribeFeedGeneratorParams {

}

export interface DislikeShoutInput {
  /** The unique identifier of the shout to dislike */
  uri?: AtUri;
}

export interface DislikeSongInput {
  /** The unique identifier of the song to dislike */
  uri?: AtUri;
}

export interface DownloadFileParams {
  /** The unique identifier of the file to download */
  fileId: string;
}

export interface DropboxFileListView {
  /** A list of files in the Dropbox. */
  files?: DropboxFileView[];
}

export interface DropboxFileView {
  /** The unique identifier of the file. */
  id?: string;
  /** The name of the file. */
  name?: string;
  /** The lowercased path of the file. */
  pathLower?: string;
  /** The display path of the file. */
  pathDisplay?: string;
  /** The last modified date and time of the file on the client. */
  clientModified?: DateTime;
  /** The last modified date and time of the file on the server. */
  serverModified?: DateTime;
}

export interface DropboxTemporaryLinkView {
  /** The temporary link to access the file. */
  link?: Uri;
}

export interface FeedGeneratorsView {
  feeds?: FeedGeneratorView[];
}

export interface FeedGeneratorView {
  id?: string;
  name?: string;
  description?: string;
  uri?: AtUri;
  avatar?: Uri;
  creator?: ActorProfileViewBasic;
}

export interface FeedItemView {
  scrobble?: ScrobbleViewBasic;
}

export interface FeedRecommendationsView {
  recommendations?: FeedRecommendationView[];
  cursor?: string;
}

export interface FeedRecommendationView {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: Uri;
  trackUri?: AtUri;
  artistUri?: AtUri;
  albumUri?: AtUri;
  genres?: string[];
  recommendationScore?: number;
  /** neighbour | social | serendipity */
  source?: string;
  likesCount?: number;
}

export interface FeedRecommendedAlbumsView {
  albums?: FeedRecommendedAlbumView[];
  cursor?: string;
}

export interface FeedRecommendedAlbumView {
  id?: string;
  uri?: AtUri;
  title?: string;
  artist?: string;
  artistUri?: AtUri;
  year?: number;
  albumArt?: Uri;
  recommendationScore?: number;
  /** known-artist | new-artist | serendipity */
  source?: string;
}

export interface FeedRecommendedArtistsView {
  artists?: FeedRecommendedArtistView[];
  cursor?: string;
}

export interface FeedRecommendedArtistView {
  id?: string;
  uri?: AtUri;
  name?: string;
  picture?: Uri;
  genres?: string[];
  recommendationScore?: number;
  /** neighbour | social | serendipity */
  source?: string;
}

export interface FeedSearchResultsView {
  hits?: SongViewBasic | AlbumViewBasic | ArtistViewBasic | PlaylistViewBasic | ActorProfileViewBasic[];
  processingTimeMs?: number;
  limit?: number;
  offset?: number;
  estimatedTotalHits?: number;
}

export interface FeedStoriesView {
  stories?: FeedStoryView[];
}

export interface FeedStoryView {
  album?: string;
  albumArt?: Uri;
  albumArtist?: string;
  albumUri?: AtUri;
  artist?: string;
  artistUri?: AtUri;
  avatar?: Uri;
  createdAt?: string;
  did?: AtIdentifier;
  handle?: string;
  id?: string;
  title?: string;
  trackId?: string;
  trackUri?: AtUri;
  uri?: AtUri;
}

export interface FeedUriView {
  /** The feed URI. */
  uri?: AtUri;
}

export interface FeedView {
  feed?: FeedItemView[];
  /** The pagination cursor for the next set of results. */
  cursor?: string;
}

export interface FollowAccountOutput {
  subject: ActorProfileViewBasic;
  followers: ActorProfileViewBasic[];
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string;
}

export interface FollowAccountParams {
  account: AtIdentifier;
}

export interface FollowRecord {
  createdAt: DateTime;
  subject: Did;
  via?: StrongRef;
}

export interface GeneratorRecord {
  did: Did;
  avatar?: BlobRef;
  displayName: string;
  description?: string;
  createdAt: DateTime;
}

export interface GetActorAlbumsOutput {
  albums?: AlbumViewBasic[];
}

export interface GetActorAlbumsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to filter albums from (ISO 8601 format) */
  startDate?: DateTime;
  /** The end date to filter albums to (ISO 8601 format) */
  endDate?: DateTime;
}

export interface GetActorArtistsOutput {
  artists?: ArtistViewBasic[];
}

export interface GetActorArtistsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to filter albums from (ISO 8601 format) */
  startDate?: DateTime;
  /** The end date to filter albums to (ISO 8601 format) */
  endDate?: DateTime;
}

export interface GetActorCompatibilityOutput {
  compatibility?: ActorCompatibilityViewBasic;
}

export interface GetActorCompatibilityParams {
  /** DID or handle to get compatibility for */
  did: AtIdentifier;
}

export interface GetActorLovedSongsOutput {
  tracks?: SongViewBasic[];
}

export interface GetActorLovedSongsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
}

export interface GetActorNeighboursOutput {
  neighbours?: ActorNeighbourViewBasic[];
}

export interface GetActorNeighboursParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
}

export interface GetActorPlaylistsOutput {
  playlists?: PlaylistViewBasic[];
}

export interface GetActorPlaylistsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
}

export interface GetActorScrobblesOutput {
  scrobbles?: ScrobbleViewBasic[];
}

export interface GetActorScrobblesParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
}

export interface GetActorSongsOutput {
  songs?: SongViewBasic[];
}

export interface GetActorSongsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to filter albums from (ISO 8601 format) */
  startDate?: DateTime;
  /** The end date to filter albums to (ISO 8601 format) */
  endDate?: DateTime;
}

export interface GetAlbumParams {
  /** The URI of the album to retrieve. */
  uri: AtUri;
}

export interface GetAlbumRecommendationsParams {
  /** DID or handle of the user to recommend for. */
  did: string;
  limit?: number;
}

export interface GetAlbumShoutsOutput {
  shouts?: unknown[];
}

export interface GetAlbumShoutsParams {
  /** The unique identifier of the album to retrieve shouts for */
  uri: AtUri;
  /** The maximum number of shouts to return */
  limit?: number;
  /** The number of shouts to skip before starting to collect the result set */
  offset?: number;
}

export interface GetAlbumsOutput {
  albums?: AlbumViewBasic[];
}

export interface GetAlbumsParams {
  /** The maximum number of albums to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The genre to filter artists by */
  genre?: string;
}

export interface GetAlbumTracksOutput {
  tracks?: SongViewBasic[];
}

export interface GetAlbumTracksParams {
  /** The URI of the album to retrieve tracks from */
  uri: AtUri;
}

export interface GetApikeysOutput {
  apiKeys?: unknown[];
}

export interface GetApikeysParams {
  /** The number of API keys to skip before starting to collect the result set. */
  offset?: number;
  /** The number of API keys to return per page. */
  limit?: number;
}

export interface GetArtistAlbumsOutput {
  albums?: AlbumViewBasic[];
}

export interface GetArtistAlbumsParams {
  /** The URI of the artist to retrieve albums from */
  uri: AtUri;
}

export interface GetArtistListenersOutput {
  listeners?: ArtistListenerViewBasic[];
}

export interface GetArtistListenersParams {
  /** The URI of the artist to retrieve listeners from */
  uri: AtUri;
  /** Number of items to skip before returning results */
  offset?: number;
  /** Maximum number of results to return */
  limit?: number;
}

export interface GetArtistParams {
  /** The URI of the artist to retrieve details from */
  uri: AtUri;
}

export interface GetArtistRecentListenersOutput {
  listeners?: ArtistRecentListenerView[];
}

export interface GetArtistRecentListenersParams {
  /** The URI of the artist to retrieve recent listeners from */
  uri: AtUri;
  /** Number of items to skip before returning results */
  offset?: number;
  /** Maximum number of results to return */
  limit?: number;
}

export interface GetArtistRecommendationsParams {
  /** DID or handle of the user to recommend for. */
  did: string;
  limit?: number;
}

export interface GetArtistShoutsOutput {
  shouts?: unknown[];
}

export interface GetArtistShoutsParams {
  /** The URI of the artist to retrieve shouts for */
  uri: AtUri;
  /** The maximum number of shouts to return */
  limit?: number;
  /** The number of shouts to skip before starting to collect the result set */
  offset?: number;
}

export interface GetArtistsOutput {
  artists?: ArtistViewBasic[];
}

export interface GetArtistsParams {
  /** The maximum number of artists to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The names of the artists to return */
  names?: string;
  /** The genre to filter artists by */
  genre?: string;
}

export interface GetArtistTracksOutput {
  tracks?: SongViewBasic[];
}

export interface GetArtistTracksParams {
  /** The URI of the artist to retrieve albums from */
  uri?: AtUri;
  /** The maximum number of tracks to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
}

export interface GetAudioSettingsParams {
  /** DID or handle of the user whose settings to fetch. Required for unauthenticated requests. */
  did?: AtIdentifier;
}

export interface GetCurrentlyPlayingParams {
  playerId?: string;
  /** Handle or DID of the actor to retrieve the currently playing track for. If not provided, defaults to the current user. */
  actor?: AtIdentifier;
}

export interface GetFeedGeneratorOutput {
  view?: FeedGeneratorView;
}

export interface GetFeedGeneratorParams {
  /** AT-URI of the feed generator record. */
  feed: AtUri;
}

export interface GetFeedGeneratorsParams {
  /** The maximum number of feed generators to return. */
  size?: number;
}

export interface GetFeedParams {
  /** The feed URI. */
  feed: AtUri;
  /** The maximum number of scrobbles to return */
  limit?: number;
  /** The cursor for pagination */
  cursor?: string;
}

export interface GetFeedSkeletonOutput {
  scrobbles?: ScrobbleViewBasic[];
  /** The pagination cursor for the next set of results. */
  cursor?: string;
}

export interface GetFeedSkeletonParams {
  /** The feed URI. */
  feed: AtUri;
  /** The maximum number of scrobbles to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The pagination cursor. */
  cursor?: string;
}

export interface GetFileParams {
  /** The unique identifier of the file to retrieve */
  fileId: string;
}

export interface GetFilesParams {
  /** Path to the Dropbox folder or root directory */
  at?: string;
}

export interface GetFollowersOutput {
  subject: ActorProfileViewBasic;
  followers: ActorProfileViewBasic[];
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string;
  /** The total number of followers. */
  count?: number;
}

export interface GetFollowersParams {
  actor: AtIdentifier;
  limit?: number;
  /** If provided, filters the followers to only include those with DIDs in this list. */
  dids?: Did[];
  cursor?: string;
}

export interface GetFollowsOutput {
  subject: ActorProfileViewBasic;
  follows: ActorProfileViewBasic[];
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string;
  /** The total number of follows. */
  count?: number;
}

export interface GetFollowsParams {
  actor: AtIdentifier;
  limit?: number;
  /** If provided, filters the follows to only include those with DIDs in this list. */
  dids?: Did[];
  cursor?: string;
}

export interface GetGlobalStatsParams {

}

export interface GetKnownFollowersOutput {
  subject: ActorProfileViewBasic;
  followers: ActorProfileViewBasic[];
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string;
}

export interface GetKnownFollowersParams {
  actor: AtIdentifier;
  limit?: number;
  cursor?: string;
}

export interface GetMetadataParams {
  /** Path to the file or folder in Dropbox */
  path: string;
}

export interface GetMirrorSourcesOutput {
  sources: MirrorSourceView[];
}

export interface GetMirrorSourcesParams {

}

export interface GetPlaybackQueueParams {
  playerId?: string;
}

export interface GetPlaylistParams {
  /** The URI of the playlist to retrieve. */
  uri: AtUri;
}

export interface GetPlaylistsOutput {
  playlists?: PlaylistViewBasic[];
}

export interface GetPlaylistsParams {
  /** The maximum number of playlists to return. */
  limit?: number;
  /** The offset for pagination, used to skip a number of playlists. */
  offset?: number;
}

export interface GetProfileParams {
  /** The DID or handle of the actor */
  did?: AtIdentifier;
}

export interface GetProfileShoutsOutput {
  shouts?: unknown[];
}

export interface GetProfileShoutsParams {
  /** The DID or handle of the actor */
  did: AtIdentifier;
  /** The offset for pagination */
  offset?: number;
  /** The maximum number of shouts to return */
  limit?: number;
}

export interface GetRecommendationsParams {
  /** DID or handle of the user to recommend for. */
  did: string;
  limit?: number;
}

export interface GetScrobbleParams {
  /** The unique identifier of the scrobble */
  uri: AtUri;
}

export interface GetScrobblesChartParams {
  /** The DID or handle of the actor */
  did?: AtIdentifier;
  /** The URI of the artist to filter by */
  artisturi?: AtUri;
  /** The URI of the album to filter by */
  albumuri?: AtUri;
  /** The URI of the track to filter by */
  songuri?: AtUri;
  /** The genre to filter by */
  genre?: string;
  /** Start date (ISO 8601). Defaults to 6 months ago. */
  from?: string;
  /** End date (ISO 8601). Defaults to today. */
  to?: string;
}

export interface GetScrobblesOutput {
  scrobbles?: ScrobbleViewBasic[];
}

export interface GetScrobblesParams {
  /** The DID or handle of the actor */
  did?: AtIdentifier;
  /** If true, only return scrobbles from actors the viewer is following. */
  following?: boolean;
  /** The maximum number of scrobbles to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
}

export interface GetShoutRepliesOutput {
  shouts?: unknown[];
}

export interface GetShoutRepliesParams {
  /** The URI of the shout to retrieve replies for */
  uri: AtUri;
  /** The maximum number of shouts to return */
  limit?: number;
  /** The number of shouts to skip before starting to collect the result set */
  offset?: number;
}

export interface GetSongParams {
  /** The AT-URI of the song to retrieve */
  uri?: AtUri;
  /** The MusicBrainz ID of the song to retrieve */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song to retrieve */
  isrc?: string;
  /** The Spotify track ID of the song to retrieve (resolved internally to the Spotify track URL) */
  spotifyId?: string;
}

export interface GetSongRecentListenersOutput {
  listeners?: SongRecentListenerView[];
}

export interface GetSongRecentListenersParams {
  /** The URI of the song to retrieve recent listeners from */
  uri: AtUri;
  /** Number of items to skip before returning results */
  offset?: number;
  /** Maximum number of results to return */
  limit?: number;
}

export interface GetSongsOutput {
  songs?: SongViewBasic[];
}

export interface GetSongsParams {
  /** The maximum number of songs to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The genre to filter artists by */
  genre?: string;
  /** Filter songs by MusicBrainz ID */
  mbid?: string;
  /** Filter songs by International Standard Recording Code (ISRC) */
  isrc?: string;
  /** Filter songs by Spotify track ID (resolved internally to the Spotify track URL) */
  spotifyId?: string;
}

export interface GetStatsParams {
  /** The DID or handle of the user to get stats for. */
  did: AtIdentifier;
}

export interface GetStoriesParams {
  /** The maximum number of stories to return. */
  size?: number;
  /** The feed URI to filter stories by. */
  feed?: AtUri;
  /** If true, only return stories from users the viewer follows. Requires authentication. */
  following?: boolean;
}

export interface GetTemporaryLinkParams {
  /** Path to the file in Dropbox */
  path: string;
}

export interface GetTopArtistsOutput {
  artists?: ArtistViewBasic[];
}

export interface GetTopArtistsParams {
  /** The maximum number of artists to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to filter artists from (ISO 8601 format) */
  startDate?: DateTime;
  /** The end date to filter artists to (ISO 8601 format) */
  endDate?: DateTime;
}

export interface GetTopTracksOutput {
  tracks?: SongViewBasic[];
}

export interface GetTopTracksParams {
  /** The maximum number of tracks to return */
  limit?: number;
  /** The offset for pagination */
  offset?: number;
  /** The start date to filter tracks from (ISO 8601 format) */
  startDate?: DateTime;
  /** The end date to filter tracks to (ISO 8601 format) */
  endDate?: DateTime;
}

export interface GetTrackShoutsOutput {
  shouts?: unknown[];
}

export interface GetTrackShoutsParams {
  /** The URI of the track to retrieve shouts for */
  uri: AtUri;
}

export interface GetWrappedParams {
  /** The DID or handle of the user */
  did: AtIdentifier;
  /** The year to get wrapped stats for (defaults to current year) */
  year?: number;
}

export interface GoogledriveFileListView {
  files?: GoogledriveFileView[];
}

export interface GoogledriveFileView {
  /** The unique identifier of the file. */
  id?: string;
}

/** indicates that a handle or DID could not be resolved */
export interface GraphNotFoundActor {
  actor: AtIdentifier;
  notFound: boolean;
}

export interface GraphRelationship {
  did: Did;
  /** if the actor follows this DID, this is the AT-URI of the follow record */
  following?: AtUri;
  /** if the actor is followed by this DID, contains the AT-URI of the follow record */
  followedBy?: AtUri;
}

export interface InsertDirectoryParams {
  /** The URI of the playlist to start */
  uri: AtUri;
  /** The directory (id) to insert into the playlist */
  directory: string;
  /** The position in the playlist to insert the directory at, if not specified, the directory will be appended */
  position?: number;
}

export interface InsertFilesParams {
  /** The URI of the playlist to start */
  uri: AtUri;
  files: string[];
  /** The position in the playlist to insert the files at, if not specified, files will be appended */
  position?: number;
}

export interface LikeRecord {
  /** The date when the like was created. */
  createdAt: DateTime;
  subject: StrongRef;
}

export interface LikeShoutInput {
  /** The unique identifier of the shout to like */
  uri?: AtUri;
}

export interface LikeSongInput {
  /** The unique identifier of the song to like */
  uri?: AtUri;
}

export interface MatchSongParams {
  /** The title of the song to retrieve */
  title: string;
  /** The artist of the song to retrieve */
  artist: string;
  /** Optional MusicBrainz recording ID to anchor the match */
  mbId?: string;
  /** Optional International Standard Recording Code (ISRC) to anchor the match */
  isrc?: string;
}

export interface MirrorSourceView {
  /** One of: lastfm, listenbrainz, tealfm */
  provider: string;
  /** Whether scrobbles from this source are being mirrored into Rocksky. */
  enabled: boolean;
  /** Username on the external service (Last.fm / ListenBrainz). Null for Teal.fm. */
  externalUsername?: string;
  /** True when an API key is stored. Last.fm/ListenBrainz only; always false for Teal.fm. */
  hasCredentials: boolean;
  /** The last time the mirror process successfully polled this source. */
  lastPolledAt?: DateTime;
  /** Watermark — scrobbles from the external service older than this are skipped. */
  lastScrobbleSeenAt?: DateTime;
}

export interface NextParams {
  playerId?: string;
}

export interface PauseParams {
  playerId?: string;
}

export interface PlayDirectoryParams {
  playerId?: string;
  directoryId: string;
  shuffle?: boolean;
  recurse?: boolean;
  position?: number;
}

export interface PlayerCurrentlyPlayingViewDetailed {
  /** The title of the currently playing track */
  title?: string;
}

export interface PlayerPlaybackQueueViewDetailed {
  tracks?: SongViewBasic[];
}

export interface PlayFileParams {
  playerId?: string;
  fileId: string;
}

export interface PlaylistItemRecord {
  subject: StrongRef;
  /** The date the playlist was created. */
  createdAt: DateTime;
  track: SongViewBasic;
  /** The order of the item in the playlist. */
  order: number;
}

export interface PlaylistRecord {
  /** The name of the playlist. */
  name: string;
  /** The playlist description. */
  description?: string;
  /** The picture of the playlist. */
  picture?: BlobRef;
  /** The URL of the picture of the artist. */
  pictureUrl?: Uri;
  /** The date the playlist was created. */
  createdAt: DateTime;
  /** The Spotify link of the playlist. */
  spotifyLink?: string;
  /** The Tidal link of the playlist. */
  tidalLink?: string;
  /** The YouTube link of the playlist. */
  youtubeLink?: string;
  /** The Apple Music link of the playlist. */
  appleMusicLink?: string;
}

/** Basic view of a playlist, including its metadata */
export interface PlaylistViewBasic {
  /** The unique identifier of the playlist. */
  id?: string;
  /** The title of the playlist. */
  title?: string;
  /** The URI of the playlist. */
  uri?: AtUri;
  /** The DID of the curator of the playlist. */
  curatorDid?: AtIdentifier;
  /** The handle of the curator of the playlist. */
  curatorHandle?: AtIdentifier;
  /** The name of the curator of the playlist. */
  curatorName?: string;
  /** The URL of the avatar image of the curator. */
  curatorAvatarUrl?: Uri;
  /** A description of the playlist. */
  description?: string;
  /** The URL of the cover image for the playlist. */
  coverImageUrl?: Uri;
  /** The date and time when the playlist was created. */
  createdAt?: DateTime;
  /** The number of tracks in the playlist. */
  trackCount?: number;
}

/** Detailed view of a playlist, including its tracks and metadata */
export interface PlaylistViewDetailed {
  /** The unique identifier of the playlist. */
  id?: string;
  /** The title of the playlist. */
  title?: string;
  /** The URI of the playlist. */
  uri?: AtUri;
  /** The DID of the curator of the playlist. */
  curatorDid?: AtIdentifier;
  /** The handle of the curator of the playlist. */
  curatorHandle?: AtIdentifier;
  /** The name of the curator of the playlist. */
  curatorName?: string;
  /** The URL of the avatar image of the curator. */
  curatorAvatarUrl?: Uri;
  /** A description of the playlist. */
  description?: string;
  /** The URL of the cover image for the playlist. */
  coverImageUrl?: Uri;
  /** The date and time when the playlist was created. */
  createdAt?: DateTime;
  /** A list of tracks in the playlist. */
  tracks?: SongViewBasic[];
}

export interface PlayParams {
  playerId?: string;
}

export interface PreviousParams {
  playerId?: string;
}

export interface ProfileRecord {
  displayName?: string;
  /** Free-form profile description text. */
  description?: string;
  /** Small image to be displayed next to posts from account. AKA, 'profile picture' */
  avatar?: BlobRef;
  /** Larger horizontal image to display behind profile view. */
  banner?: BlobRef;
  /** Self-label values, specific to the Bluesky application, on the overall account. */
  labels?: unknown;
  joinedViaStarterPack?: StrongRef;
  createdAt?: DateTime;
}

export interface PutAudioSettingsInput {
  /** Crossfade settings to apply. */
  crossfade?: RockboxCrossfadeSettings;
  /** Equalizer settings to apply. */
  equalizer?: RockboxEqualizerSettings;
  /** Replay gain settings to apply. */
  replayGain?: RockboxReplayGainSettings;
  /** Tone control settings to apply. */
  tone?: RockboxToneSettings;
}

export interface PutMirrorSourceInput {
  /** One of: lastfm, listenbrainz, tealfm */
  provider: string;
  /** Enable or disable mirroring for this provider. */
  enabled?: boolean;
  /** External username (Last.fm / ListenBrainz). Required when enabling those providers. Ignored for Teal.fm. */
  externalUsername?: string;
  /** API key / token to be encrypted at rest. Omit to leave the existing key unchanged. Pass an empty string to clear it. */
  apiKey?: string;
}

export interface RadioRecord {
  /** The name of the radio station. */
  name: string;
  /** The URL of the radio station. */
  url: Uri;
  /** A description of the radio station. */
  description?: string;
  /** The genre of the radio station. */
  genre?: string;
  /** The logo of the radio station. */
  logo?: BlobRef;
  /** The website of the radio station. */
  website?: Uri;
  /** The date when the radio station was created. */
  createdAt: DateTime;
}

export interface RadioViewBasic {
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The date and time when the radio was created. */
  createdAt?: DateTime;
}

export interface RadioViewDetailed {
  /** The unique identifier of the radio. */
  id?: string;
  /** The name of the radio. */
  name?: string;
  /** A brief description of the radio. */
  description?: string;
  /** The website of the radio. */
  website?: Uri;
  /** The streaming URL of the radio. */
  url?: Uri;
  /** The genre of the radio. */
  genre?: string;
  /** The logo of the radio station. */
  logo?: string;
  /** The date and time when the radio was created. */
  createdAt?: DateTime;
}

export interface RemoveApikeyParams {
  /** The ID of the API key to remove. */
  id: string;
}

export interface RemovePlaylistParams {
  /** The URI of the playlist to remove */
  uri: AtUri;
}

export interface RemoveShoutParams {
  /** The ID of the shout to be removed */
  id: string;
}

export interface RemoveTrackParams {
  /** The URI of the playlist to remove the track from */
  uri: AtUri;
  /** The position of the track to remove in the playlist */
  position: number;
}

export interface ReplyShoutInput {
  /** The unique identifier of the shout to reply to */
  shoutId: string;
  /** The content of the reply */
  message: string;
}

export interface ReportShoutInput {
  /** The unique identifier of the shout to report */
  shoutId: string;
  /** The reason for reporting the shout */
  reason?: string;
}

export interface RockboxCrossfadeSettings {
  /** Crossfade mode: disabled | enabled | shuffle | albumChange | trackChange */
  mode?: string;
  /** Fade-in delay in ms */
  fadeInDelay?: number;
  /** Fade-in duration in ms */
  fadeInDuration?: number;
  /** Fade-out delay in ms */
  fadeOutDelay?: number;
  /** Fade-out duration in ms */
  fadeOutDuration?: number;
  /** Fade-out mix mode: crossfade | mix */
  fadeOutMixMode?: string;
}

export interface RockboxEqualizerBand {
  /** Center frequency in Hz */
  frequency: number;
  /** Band gain in tenths of dB (e.g. 30 = +3.0 dB) */
  gain: number;
  /** Q factor × 10 (e.g. 7 = Q 0.7) */
  q: number;
}

export interface RockboxEqualizerSettings {
  /** Whether the equalizer is enabled */
  enabled?: boolean;
  /** Pre-amplification cut in tenths of dB applied before EQ bands (e.g. -60 = -6.0 dB) */
  precut?: number;
  /** Up to 10 EQ bands */
  bands?: RockboxEqualizerBand[];
}

export interface RockboxReplayGainSettings {
  /** Replay gain mode: disabled | track | album | trackIfShuffling */
  mode?: string;
  /** Pre-amplification in tenths of dB (e.g. 15 = +1.5 dB) */
  preamp?: number;
  /** Whether to prevent clipping by reducing volume */
  preventClipping?: boolean;
}

export interface RockboxSettingsView {
  /** Crossfade settings */
  crossfade?: RockboxCrossfadeSettings;
  /** Equalizer settings */
  equalizer?: RockboxEqualizerSettings;
  /** Replay gain settings */
  replayGain?: RockboxReplayGainSettings;
  /** Tone control settings (bass, treble, balance, channels) */
  tone?: RockboxToneSettings;
  /** When this settings record was first created. */
  createdAt: DateTime;
  /** When this settings record was last updated. */
  updatedAt?: DateTime;
}

export interface RockboxToneSettings {
  /** Bass level in dB */
  bass?: number;
  /** Treble level in dB */
  treble?: number;
  /** Left/right balance. Negative = left, positive = right */
  balance?: number;
  /** Channel configuration: stereo | mono | monoLeft | monoRight | karaoke | wide */
  channels?: string;
}

export interface ScrobbleFirstScrobbleView {
  /** The handle of the user who first scrobbled this song. */
  handle?: string;
  /** The avatar URL of the user who first scrobbled this song. */
  avatar?: Uri;
  /** The timestamp of the first scrobble. */
  timestamp?: DateTime;
}

export interface ScrobbleRecord {
  /** The title of the song. */
  title: string;
  /** The artist of the song. */
  artist: string;
  /** The artists of the song with MusicBrainz IDs. */
  artists?: ArtistMbid[];
  /** The album artist of the song. */
  albumArtist: string;
  /** The album of the song. */
  album: string;
  /** The duration of the song in milliseconds. */
  duration: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The release date of the song. */
  releaseDate?: DateTime;
  /** The year the song was released. */
  year?: number;
  /** The genre of the song. */
  genre?: string;
  /** The tags of the song. */
  tags?: string[];
  /** The composer of the song. */
  composer?: string;
  /** The lyrics of the song. */
  lyrics?: string;
  /** The copyright message of the song. */
  copyrightMessage?: string;
  /** Informations about the song */
  wiki?: string;
  /** The album art of the song. */
  albumArt?: BlobRef;
  /** The URL of the album art of the song. */
  albumArtUrl?: Uri;
  /** The YouTube link of the song. */
  youtubeLink?: Uri;
  /** The Spotify link of the song. */
  spotifyLink?: Uri;
  /** The Tidal link of the song. */
  tidalLink?: Uri;
  /** The Apple Music link of the song. */
  appleMusicLink?: Uri;
  /** The date when the song was created. */
  createdAt: DateTime;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The label of the song. */
  label?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
}

export interface ScrobbleViewBasic {
  /** The unique identifier of the scrobble. */
  id?: string;
  /** The unique identifier of the track this scrobble is of. */
  trackId?: string;
  /** The title of the scrobble. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The URI of the artist. */
  artistUri?: AtUri;
  /** The album artist of the song. */
  albumArtist?: string;
  /** The album of the song. */
  album?: string;
  /** The URI of the album. */
  albumUri?: AtUri;
  /** The album art URL of the song. */
  albumArt?: Uri;
  /** The URI of the track (song) this scrobble is of. */
  trackUri?: AtUri;
  /** The handle of the user who created the scrobble. */
  handle?: string;
  /** The DID of the user who created the scrobble. */
  did?: AtIdentifier;
  /** The avatar URL of the user who created the scrobble. */
  avatar?: Uri;
  /** The timestamp when the scrobble was created. */
  createdAt?: DateTime;
  /** The URI of the scrobble. */
  uri?: Uri;
  /** The SHA256 hash of the scrobble data. */
  sha256?: string;
  liked?: boolean;
  likesCount?: number;
}

export interface ScrobbleViewDetailed {
  /** The unique identifier of the scrobble. */
  id?: string;
  /** The handle of the user who created the scrobble. */
  user?: string;
  /** The title of the scrobble. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The URI of the artist. */
  artistUri?: AtUri;
  /** The album of the song. */
  album?: string;
  /** The URI of the album. */
  albumUri?: AtUri;
  /** The album art URL of the song. */
  cover?: Uri;
  /** The timestamp when the scrobble was created. */
  date?: DateTime;
  /** The URI of the scrobble. */
  uri?: Uri;
  /** The SHA256 hash of the scrobble data. */
  sha256?: string;
  liked?: boolean;
  likesCount?: number;
  /** The number of listeners */
  listeners?: number;
  /** The number of scrobbles for this song */
  scrobbles?: number;
  artists?: ArtistViewBasic[];
  /** The first scrobble of this song on Rocksky. */
  firstScrobble?: ScrobbleFirstScrobbleView;
}

export interface SearchParams {
  /** The search query string */
  query: string;
}

export interface SeekParams {
  playerId?: string;
  /** The position in seconds to seek to */
  position: number;
}

export interface SettingsRecord {
  /** Crossfade settings */
  crossfade?: RockboxCrossfadeSettings;
  /** Equalizer settings */
  equalizer?: RockboxEqualizerSettings;
  /** Replay gain settings */
  replayGain?: RockboxReplayGainSettings;
  /** Tone control settings (bass, treble, balance, channels) */
  tone?: RockboxToneSettings;
  /** When this settings record was first created. */
  createdAt: DateTime;
  /** When this settings record was last updated. */
  updatedAt?: DateTime;
}

export interface ShoutAuthor {
  /** The unique identifier of the author. */
  id?: string;
  /** The decentralized identifier (DID) of the author. */
  did?: AtIdentifier;
  /** The handle of the author. */
  handle?: AtIdentifier;
  /** The display name of the author. */
  displayName?: string;
  /** The URL of the author's avatar image. */
  avatar?: Uri;
}

export interface ShoutRecord {
  /** The message of the shout. */
  message: string;
  /** The date when the shout was created. */
  createdAt: DateTime;
  parent?: StrongRef;
  subject: StrongRef;
}

export interface ShoutView {
  /** The unique identifier of the shout. */
  id?: string;
  /** The content of the shout. */
  message?: string;
  /** The ID of the parent shout if this is a reply, otherwise null. */
  parent?: string;
  /** The date and time when the shout was created. */
  createdAt?: DateTime;
  /** The author of the shout. */
  author?: ShoutAuthor;
}

export interface SongFirstScrobbleView {
  /** The handle of the user who first scrobbled this song. */
  handle?: string;
  /** The avatar URL of the user who first scrobbled this song. */
  avatar?: Uri;
  /** The timestamp of the first scrobble. */
  timestamp?: DateTime;
}

export interface SongRecentListenerView {
  /** The unique identifier of the listener. */
  id?: string;
  /** The DID of the listener. */
  did?: string;
  /** The handle of the listener. */
  handle?: string;
  /** The display name of the listener. */
  displayName?: string;
  /** The URL of the listener's avatar image. */
  avatar?: Uri;
  /** The timestamp of the listener's most recent scrobble of this song. */
  timestamp?: DateTime;
  /** The URI of the listener's most recent scrobble of this song. */
  scrobbleUri?: AtUri;
}

export interface SongRecord {
  /** The title of the song. */
  title: string;
  /** The artist of the song. */
  artist: string;
  /** The artists of the song with MusicBrainz IDs. */
  artists?: ArtistMbid[];
  /** The album artist of the song. */
  albumArtist: string;
  /** The album of the song. */
  album: string;
  /** The duration of the song in milliseconds. */
  duration: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The release date of the song. */
  releaseDate?: DateTime;
  /** The year the song was released. */
  year?: number;
  /** The genre of the song. */
  genre?: string;
  /** The tags of the song. */
  tags?: string[];
  /** The composer of the song. */
  composer?: string;
  /** The lyrics of the song. */
  lyrics?: string;
  /** The copyright message of the song. */
  copyrightMessage?: string;
  /** Informations about the song */
  wiki?: string;
  /** The album art of the song. */
  albumArt?: BlobRef;
  /** The URL of the album art of the song. */
  albumArtUrl?: Uri;
  /** The YouTube link of the song. */
  youtubeLink?: Uri;
  /** The Spotify link of the song. */
  spotifyLink?: Uri;
  /** The Tidal link of the song. */
  tidalLink?: Uri;
  /** The Apple Music link of the song. */
  appleMusicLink?: Uri;
  /** The date when the song was created. */
  createdAt: DateTime;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The label of the song. */
  label?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
}

export interface SongViewBasic {
  /** The unique identifier of the song. */
  id?: string;
  /** The title of the song. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The artist of the album the song belongs to. */
  albumArtist?: string;
  /** The URL of the album art image. */
  albumArt?: Uri;
  /** The URI of the song. */
  uri?: AtUri;
  /** The album of the song. */
  album?: string;
  /** The duration of the song in milliseconds. */
  duration?: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The number of times the song has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the song. */
  uniqueListeners?: number;
  /** The URI of the album the song belongs to. */
  albumUri?: AtUri;
  /** The URI of the artist of the song. */
  artistUri?: AtUri;
  /** The SHA256 hash of the song. */
  sha256?: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
  tags?: string[];
  /** The timestamp when the song was created. */
  createdAt?: DateTime;
}

export interface SongViewDetailed {
  /** The unique identifier of the song. */
  id?: string;
  /** The title of the song. */
  title?: string;
  /** The artist of the song. */
  artist?: string;
  /** The artist of the album the song belongs to. */
  albumArtist?: string;
  /** The URL of the album art image. */
  albumArt?: Uri;
  /** The URI of the song. */
  uri?: AtUri;
  /** The album of the song. */
  album?: string;
  /** The duration of the song in milliseconds. */
  duration?: number;
  /** The track number of the song in the album. */
  trackNumber?: number;
  /** The disc number of the song in the album. */
  discNumber?: number;
  /** The number of times the song has been played. */
  playCount?: number;
  /** The number of unique listeners who have played the song. */
  uniqueListeners?: number;
  /** The URI of the album the song belongs to. */
  albumUri?: AtUri;
  /** The URI of the artist of the song. */
  artistUri?: AtUri;
  /** The SHA256 hash of the song. */
  sha256?: string;
  /** The MusicBrainz ID of the song. */
  mbid?: string;
  /** The International Standard Recording Code (ISRC) of the song. */
  isrc?: string;
  tags?: string[];
  /** The timestamp when the song was created. */
  createdAt?: DateTime;
  artists?: ArtistViewBasic[];
  /** The first scrobble of this song on Rocksky. */
  firstScrobble?: SongFirstScrobbleView;
}

export interface SpotifyTrackView {
  /** The unique identifier of the Spotify track. */
  id?: string;
  /** The name of the track. */
  name?: string;
  /** The name of the artist. */
  artist?: string;
  /** The name of the album. */
  album?: string;
  /** The duration of the track in milliseconds. */
  duration?: number;
  /** A URL to a preview of the track. */
  previewUrl?: string;
}

export interface StartPlaylistParams {
  /** The URI of the playlist to start */
  uri: AtUri;
  /** Whether to shuffle the playlist when starting it */
  shuffle?: boolean;
  /** The position in the playlist to start from, if not specified, starts from the beginning */
  position?: number;
}

export interface StatsGlobalStatsView {
  /** Total scrobbles across all users on Rocksky. */
  scrobbles?: number;
  /** Total number of users on Rocksky. */
  users?: number;
  /** Total number of artists known to Rocksky. */
  artists?: number;
  /** Total number of albums known to Rocksky. */
  albums?: number;
  /** Total number of tracks known to Rocksky. */
  tracks?: number;
}

export interface StatsView {
  /** The total number of scrobbles. */
  scrobbles?: number;
  /** The total number of unique artists scrobbled. */
  artists?: number;
  /** The total number of tracks marked as loved. */
  lovedTracks?: number;
  /** The total number of unique albums scrobbled. */
  albums?: number;
  /** The total number of unique tracks scrobbled. */
  tracks?: number;
}

export interface StatsWrappedAlbum {
  /** The unique identifier of the album. */
  id?: string;
  /** The title of the album. */
  title?: string;
  /** The artist of the album. */
  artist?: string;
  /** The album art URL. */
  albumArt?: string;
  /** The AT-URI of the album. */
  uri?: AtUri;
  /** Number of plays in the wrapped period. */
  playCount?: number;
}

export interface StatsWrappedArtist {
  /** The unique identifier of the artist. */
  id?: string;
  /** The name of the artist. */
  name?: string;
  /** The picture URL of the artist. */
  picture?: string;
  /** The AT-URI of the artist. */
  uri?: AtUri;
  /** Number of plays in the wrapped period. */
  playCount?: number;
}

export interface StatsWrappedDayCount {
  /** The date (YYYY-MM-DD). */
  date?: string;
  /** Number of scrobbles on this day. */
  count?: number;
}

export interface StatsWrappedGenreCount {
  /** The genre name. */
  genre?: string;
  /** Number of scrobbles for this genre. */
  count?: number;
}

export interface StatsWrappedMilestone {
  /** The title of the track. */
  trackTitle?: string;
  /** The name of the artist. */
  artistName?: string;
  /** The timestamp of the scrobble. */
  timestamp?: DateTime;
  /** AT-URI of the track record, used to build a clickable link to the song page. */
  trackUri?: AtUri;
}

export interface StatsWrappedMonthCount {
  /** Month number (1-12). */
  month?: number;
  /** Number of scrobbles in this month. */
  count?: number;
}

export interface StatsWrappedTrack {
  /** The unique identifier of the track. */
  id?: string;
  /** The title of the track. */
  title?: string;
  /** The artist of the track. */
  artist?: string;
  /** The album art URL. */
  albumArt?: string;
  /** The AT-URI of the track. */
  uri?: AtUri;
  /** The AT-URI of the artist. */
  artistUri?: AtUri;
  /** The AT-URI of the album. */
  albumUri?: AtUri;
  /** Number of plays in the wrapped period. */
  playCount?: number;
}

export interface StatsWrappedView {
  /** The year of the wrapped stats. */
  year?: number;
  /** Total scrobbles in the year. */
  totalScrobbles?: number;
  /** Total listening time in minutes. */
  totalListeningTimeMinutes?: number;
  /** Top 5 artists by play count. */
  topArtists?: StatsWrappedArtist[];
  /** Top 5 tracks by play count. */
  topTracks?: StatsWrappedTrack[];
  /** Top 5 albums by play count. */
  topAlbums?: StatsWrappedAlbum[];
  /** Top genres by play count. */
  topGenres?: StatsWrappedGenreCount[];
  /** Scrobble counts per month. */
  scrobblesPerMonth?: StatsWrappedMonthCount[];
  /** The most active day of the year. */
  mostActiveDay?: StatsWrappedDayCount;
  /** The most active hour of the day (0-23). */
  mostActiveHour?: number;
  /** Number of artists heard for the first time this year. */
  newArtistsCount?: number;
  /** Longest consecutive days streak. */
  longestStreak?: number;
  /** The first scrobble of the year. */
  firstScrobble?: StatsWrappedMilestone;
  /** The last scrobble of the year. */
  lastScrobble?: StatsWrappedMilestone;
}

export interface StatusRecord {
  /** The track currently being played. */
  track: ActorTrackView;
  /** When the track started playing. */
  startedAt: DateTime;
  /** When the status expires. Defaults to startedAt plus track duration plus idle time. */
  expiresAt?: DateTime;
}

export interface StrongRef {
  uri: AtUri;
  cid: Cid;
}

export interface UnfollowAccountOutput {
  subject: ActorProfileViewBasic;
  followers: ActorProfileViewBasic[];
  /** A cursor value to pass to subsequent calls to get the next page of results. */
  cursor?: string;
}

export interface UnfollowAccountParams {
  account: AtIdentifier;
}

export interface UpdateApikeyInput {
  /** The ID of the API key to update. */
  id: string;
  /** The new name of the API key. */
  name: string;
  /** A new description for the API key. */
  description?: string;
}

/**
 * Map of every XRPC method (NSID) to the type of its response body.
 * Endpoints with no output map to `void`. Used by the SDK to type method
 * return values automatically — callers should not need to reference this
 * directly.
 */
export interface Endpoints {
  "app.rocksky.actor.getActorAlbums": GetActorAlbumsOutput;
  "app.rocksky.actor.getActorArtists": GetActorArtistsOutput;
  "app.rocksky.actor.getActorCompatibility": GetActorCompatibilityOutput;
  "app.rocksky.actor.getActorLovedSongs": GetActorLovedSongsOutput;
  "app.rocksky.actor.getActorNeighbours": GetActorNeighboursOutput;
  "app.rocksky.actor.getActorPlaylists": GetActorPlaylistsOutput;
  "app.rocksky.actor.getActorScrobbles": GetActorScrobblesOutput;
  "app.rocksky.actor.getActorSongs": GetActorSongsOutput;
  "app.rocksky.actor.getProfile": ActorProfileViewDetailed;
  "app.rocksky.album.getAlbum": AlbumViewDetailed;
  "app.rocksky.album.getAlbums": GetAlbumsOutput;
  "app.rocksky.album.getAlbumTracks": GetAlbumTracksOutput;
  "app.rocksky.apikey.createApikey": unknown;
  "app.rocksky.apikey.getApikeys": GetApikeysOutput;
  "app.rocksky.apikey.removeApikey": unknown;
  "app.rocksky.apikey.updateApikey": unknown;
  "app.rocksky.artist.getArtist": ArtistViewDetailed;
  "app.rocksky.artist.getArtistAlbums": GetArtistAlbumsOutput;
  "app.rocksky.artist.getArtistListeners": GetArtistListenersOutput;
  "app.rocksky.artist.getArtistRecentListeners": GetArtistRecentListenersOutput;
  "app.rocksky.artist.getArtists": GetArtistsOutput;
  "app.rocksky.artist.getArtistTracks": GetArtistTracksOutput;
  "app.rocksky.charts.getScrobblesChart": ChartsView;
  "app.rocksky.charts.getTopArtists": GetTopArtistsOutput;
  "app.rocksky.charts.getTopTracks": GetTopTracksOutput;
  "app.rocksky.dropbox.downloadFile": void;
  "app.rocksky.dropbox.getFiles": DropboxFileListView;
  "app.rocksky.dropbox.getMetadata": DropboxFileView;
  "app.rocksky.dropbox.getTemporaryLink": DropboxTemporaryLinkView;
  "app.rocksky.feed.describeFeedGenerator": DescribeFeedGeneratorOutput;
  "app.rocksky.feed.getAlbumRecommendations": FeedRecommendedAlbumsView;
  "app.rocksky.feed.getArtistRecommendations": FeedRecommendedArtistsView;
  "app.rocksky.feed.getFeed": FeedView;
  "app.rocksky.feed.getFeedGenerator": GetFeedGeneratorOutput;
  "app.rocksky.feed.getFeedGenerators": FeedGeneratorsView;
  "app.rocksky.feed.getFeedSkeleton": GetFeedSkeletonOutput;
  "app.rocksky.feed.getRecommendations": FeedRecommendationsView;
  "app.rocksky.feed.getStories": FeedStoriesView;
  "app.rocksky.feed.search": FeedSearchResultsView;
  "app.rocksky.googledrive.downloadFile": void;
  "app.rocksky.googledrive.getFile": GoogledriveFileView;
  "app.rocksky.googledrive.getFiles": GoogledriveFileListView;
  "app.rocksky.graph.followAccount": FollowAccountOutput;
  "app.rocksky.graph.getFollowers": GetFollowersOutput;
  "app.rocksky.graph.getFollows": GetFollowsOutput;
  "app.rocksky.graph.getKnownFollowers": GetKnownFollowersOutput;
  "app.rocksky.graph.unfollowAccount": UnfollowAccountOutput;
  "app.rocksky.like.dislikeShout": ShoutView;
  "app.rocksky.like.dislikeSong": SongViewDetailed;
  "app.rocksky.like.likeShout": ShoutView;
  "app.rocksky.like.likeSong": SongViewDetailed;
  "app.rocksky.mirror.getMirrorSources": GetMirrorSourcesOutput;
  "app.rocksky.mirror.putMirrorSource": MirrorSourceView;
  "app.rocksky.player.addDirectoryToQueue": void;
  "app.rocksky.player.addItemsToQueue": void;
  "app.rocksky.player.getCurrentlyPlaying": PlayerCurrentlyPlayingViewDetailed;
  "app.rocksky.player.getPlaybackQueue": PlayerPlaybackQueueViewDetailed;
  "app.rocksky.player.next": void;
  "app.rocksky.player.pause": void;
  "app.rocksky.player.play": void;
  "app.rocksky.player.playDirectory": void;
  "app.rocksky.player.playFile": void;
  "app.rocksky.player.previous": void;
  "app.rocksky.player.seek": void;
  "app.rocksky.playlist.createPlaylist": void;
  "app.rocksky.playlist.getPlaylist": PlaylistViewDetailed;
  "app.rocksky.playlist.getPlaylists": GetPlaylistsOutput;
  "app.rocksky.playlist.insertDirectory": void;
  "app.rocksky.playlist.insertFiles": void;
  "app.rocksky.playlist.removePlaylist": void;
  "app.rocksky.playlist.removeTrack": void;
  "app.rocksky.playlist.startPlaylist": void;
  "app.rocksky.rockbox.getAudioSettings": RockboxSettingsView;
  "app.rocksky.rockbox.putAudioSettings": RockboxSettingsView;
  "app.rocksky.scrobble.createScrobble": ScrobbleViewBasic;
  "app.rocksky.scrobble.getScrobble": ScrobbleViewDetailed;
  "app.rocksky.scrobble.getScrobbles": GetScrobblesOutput;
  "app.rocksky.shout.createShout": ShoutView;
  "app.rocksky.shout.getAlbumShouts": GetAlbumShoutsOutput;
  "app.rocksky.shout.getArtistShouts": GetArtistShoutsOutput;
  "app.rocksky.shout.getProfileShouts": GetProfileShoutsOutput;
  "app.rocksky.shout.getShoutReplies": GetShoutRepliesOutput;
  "app.rocksky.shout.getTrackShouts": GetTrackShoutsOutput;
  "app.rocksky.shout.removeShout": ShoutView;
  "app.rocksky.shout.replyShout": ShoutView;
  "app.rocksky.shout.reportShout": ShoutView;
  "app.rocksky.song.createSong": SongViewDetailed;
  "app.rocksky.song.getSong": SongViewDetailed;
  "app.rocksky.song.getSongRecentListeners": GetSongRecentListenersOutput;
  "app.rocksky.song.getSongs": GetSongsOutput;
  "app.rocksky.song.matchSong": SongViewDetailed;
  "app.rocksky.spotify.getCurrentlyPlaying": PlayerCurrentlyPlayingViewDetailed;
  "app.rocksky.spotify.next": void;
  "app.rocksky.spotify.pause": void;
  "app.rocksky.spotify.play": void;
  "app.rocksky.spotify.previous": void;
  "app.rocksky.spotify.seek": void;
  "app.rocksky.stats.getGlobalStats": StatsGlobalStatsView;
  "app.rocksky.stats.getStats": StatsView;
  "app.rocksky.stats.getWrapped": StatsWrappedView;
}
