"""AUTO-GENERATED FILE — DO NOT EDIT.

Source: apps/api/lexicons/**/*.json
Regenerate via: bun run lexgen:types
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Union


@dataclass
class BlobRef:
    """atproto blob reference shape."""

    type: Optional[str] = None
    ref: Optional[dict] = None
    mimeType: Optional[str] = None
    size: Optional[int] = None



@dataclass
class ActorArtistViewBasic:
    id: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    uri: Optional[str] = None
    user1Rank: Optional[int] = None
    user2Rank: Optional[int] = None
    weight: Optional[int] = None


@dataclass
class ActorCompatibilityViewBasic:
    compatibilityLevel: Optional[int] = None
    compatibilityPercentage: Optional[int] = None
    sharedArtists: Optional[int] = None
    topSharedArtistNames: Optional[List[str]] = None
    topSharedDetailedArtists: Optional[List["ActorArtistViewBasic"]] = None
    user1ArtistCount: Optional[int] = None
    user2ArtistCount: Optional[int] = None


@dataclass
class ActorNeighbourViewBasic:
    userId: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    sharedArtistsCount: Optional[int] = None
    similarityScore: Optional[int] = None
    topSharedArtistNames: Optional[List[str]] = None
    topSharedArtistsDetails: Optional[List["ArtistViewBasic"]] = None


@dataclass
class ActorProfileViewBasic:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


@dataclass
class ActorProfileViewDetailed:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


@dataclass
class ActorTrackView:
    name: str
    artist: str
    album: Optional[str] = None
    albumCoverUrl: Optional[str] = None
    durationMs: Optional[int] = None
    source: Optional[str] = None
    recordingMbId: Optional[str] = None


@dataclass
class AddDirectoryToQueueParams:
    directory: str
    playerId: Optional[str] = None
    position: Optional[int] = None
    shuffle: Optional[bool] = None


@dataclass
class AddItemsToQueueParams:
    items: List[str]
    playerId: Optional[str] = None
    position: Optional[int] = None
    shuffle: Optional[bool] = None


@dataclass
class AlbumRecord:
    title: str
    artist: str
    createdAt: str
    duration: Optional[int] = None
    releaseDate: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    albumArt: Optional[BlobRef] = None
    albumArtUrl: Optional[str] = None
    tags: Optional[List[str]] = None
    youtubeLink: Optional[str] = None
    spotifyLink: Optional[str] = None
    tidalLink: Optional[str] = None
    appleMusicLink: Optional[str] = None


@dataclass
class AlbumViewBasic:
    id: Optional[str] = None
    uri: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    year: Optional[int] = None
    albumArt: Optional[str] = None
    releaseDate: Optional[str] = None
    sha256: Optional[str] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None


@dataclass
class AlbumViewDetailed:
    id: Optional[str] = None
    uri: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    year: Optional[int] = None
    albumArt: Optional[str] = None
    releaseDate: Optional[str] = None
    sha256: Optional[str] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None
    tags: Optional[List[str]] = None
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class ApiKeyView:
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    createdAt: Optional[str] = None


@dataclass
class ArtistListenerViewBasic:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    mostListenedSong: Optional["ArtistSongViewBasic"] = None
    totalPlays: Optional[int] = None
    rank: Optional[int] = None


@dataclass
class ArtistMbid:
    mbid: Optional[str] = None
    name: Optional[str] = None


@dataclass
class ArtistRecentListenerView:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    timestamp: Optional[str] = None
    scrobbleUri: Optional[str] = None


@dataclass
class ArtistRecord:
    name: str
    createdAt: str
    bio: Optional[str] = None
    picture: Optional[BlobRef] = None
    pictureUrl: Optional[str] = None
    tags: Optional[List[str]] = None
    born: Optional[str] = None
    died: Optional[str] = None
    bornIn: Optional[str] = None


@dataclass
class ArtistSongViewBasic:
    uri: Optional[str] = None
    title: Optional[str] = None
    playCount: Optional[int] = None


@dataclass
class ArtistViewBasic:
    id: Optional[str] = None
    uri: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    sha256: Optional[str] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None
    tags: Optional[List[str]] = None


@dataclass
class ArtistViewDetailed:
    id: Optional[str] = None
    uri: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    sha256: Optional[str] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None
    tags: Optional[List[str]] = None


@dataclass
class ChartsScrobbleViewBasic:
    date: Optional[str] = None
    count: Optional[int] = None


@dataclass
class ChartsView:
    scrobbles: Optional[List["ChartsScrobbleViewBasic"]] = None


@dataclass
class CreateApikeyInput:
    name: str
    description: Optional[str] = None


@dataclass
class CreatePlaylistParams:
    name: str
    description: Optional[str] = None


@dataclass
class CreateScrobbleInput:
    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[int] = None
    mbId: Optional[str] = None
    isrc: Optional[str] = None
    albumArt: Optional[str] = None
    trackNumber: Optional[int] = None
    releaseDate: Optional[str] = None
    year: Optional[int] = None
    discNumber: Optional[int] = None
    lyrics: Optional[str] = None
    composer: Optional[str] = None
    copyrightMessage: Optional[str] = None
    label: Optional[str] = None
    artistPicture: Optional[str] = None
    spotifyLink: Optional[str] = None
    lastfmLink: Optional[str] = None
    tidalLink: Optional[str] = None
    appleMusicLink: Optional[str] = None
    youtubeLink: Optional[str] = None
    deezerLink: Optional[str] = None
    timestamp: Optional[int] = None


@dataclass
class CreateShoutInput:
    message: Optional[str] = None


@dataclass
class CreateSongInput:
    title: str
    artist: str
    albumArtist: str
    album: str
    duration: Optional[int] = None
    mbId: Optional[str] = None
    isrc: Optional[str] = None
    albumArt: Optional[str] = None
    trackNumber: Optional[int] = None
    releaseDate: Optional[str] = None
    year: Optional[int] = None
    discNumber: Optional[int] = None
    lyrics: Optional[str] = None


@dataclass
class DescribeFeedGeneratorOutput:
    did: Optional[str] = None
    feeds: Optional[List["FeedUriView"]] = None


@dataclass
class DescribeFeedGeneratorParams:
    pass


@dataclass
class DislikeShoutInput:
    uri: Optional[str] = None


@dataclass
class DislikeSongInput:
    uri: Optional[str] = None


@dataclass
class DownloadFileParams:
    fileId: str


@dataclass
class DropboxFileListView:
    files: Optional[List["DropboxFileView"]] = None


@dataclass
class DropboxFileView:
    id: Optional[str] = None
    name: Optional[str] = None
    pathLower: Optional[str] = None
    pathDisplay: Optional[str] = None
    clientModified: Optional[str] = None
    serverModified: Optional[str] = None


@dataclass
class DropboxTemporaryLinkView:
    link: Optional[str] = None


@dataclass
class FeedGeneratorsView:
    feeds: Optional[List["FeedGeneratorView"]] = None


@dataclass
class FeedGeneratorView:
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    uri: Optional[str] = None
    avatar: Optional[str] = None
    creator: Optional["ActorProfileViewBasic"] = None


@dataclass
class FeedItemView:
    scrobble: Optional["ScrobbleViewBasic"] = None


@dataclass
class FeedRecommendationsView:
    recommendations: Optional[List["FeedRecommendationView"]] = None
    cursor: Optional[str] = None


@dataclass
class FeedRecommendationView:
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    albumArt: Optional[str] = None
    trackUri: Optional[str] = None
    artistUri: Optional[str] = None
    albumUri: Optional[str] = None
    genres: Optional[List[str]] = None
    recommendationScore: Optional[int] = None
    source: Optional[str] = None
    likesCount: Optional[int] = None


@dataclass
class FeedRecommendedAlbumsView:
    albums: Optional[List["FeedRecommendedAlbumView"]] = None
    cursor: Optional[str] = None


@dataclass
class FeedRecommendedAlbumView:
    id: Optional[str] = None
    uri: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    year: Optional[int] = None
    albumArt: Optional[str] = None
    recommendationScore: Optional[int] = None
    source: Optional[str] = None


@dataclass
class FeedRecommendedArtistsView:
    artists: Optional[List["FeedRecommendedArtistView"]] = None
    cursor: Optional[str] = None


@dataclass
class FeedRecommendedArtistView:
    id: Optional[str] = None
    uri: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    genres: Optional[List[str]] = None
    recommendationScore: Optional[int] = None
    source: Optional[str] = None


@dataclass
class FeedSearchResultsView:
    hits: Optional[List[Union["SongViewBasic", "AlbumViewBasic", "ArtistViewBasic", "PlaylistViewBasic", "ActorProfileViewBasic"]]] = None
    processingTimeMs: Optional[int] = None
    limit: Optional[int] = None
    offset: Optional[int] = None
    estimatedTotalHits: Optional[int] = None


@dataclass
class FeedStoriesView:
    stories: Optional[List["FeedStoryView"]] = None


@dataclass
class FeedStoryView:
    album: Optional[str] = None
    albumArt: Optional[str] = None
    albumArtist: Optional[str] = None
    albumUri: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    avatar: Optional[str] = None
    createdAt: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    id: Optional[str] = None
    title: Optional[str] = None
    trackId: Optional[str] = None
    trackUri: Optional[str] = None
    uri: Optional[str] = None


@dataclass
class FeedUriView:
    uri: Optional[str] = None


@dataclass
class FeedView:
    feed: Optional[List["FeedItemView"]] = None
    cursor: Optional[str] = None


@dataclass
class FollowAccountOutput:
    subject: "ActorProfileViewBasic"
    followers: List["ActorProfileViewBasic"]
    cursor: Optional[str] = None


@dataclass
class FollowAccountParams:
    account: str


@dataclass
class FollowRecord:
    createdAt: str
    subject: str
    via: Optional["StrongRef"] = None


@dataclass
class GeneratorRecord:
    did: str
    displayName: str
    createdAt: str
    avatar: Optional[BlobRef] = None
    description: Optional[str] = None


@dataclass
class GetActorAlbumsOutput:
    albums: Optional[List["AlbumViewBasic"]] = None


@dataclass
class GetActorAlbumsParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@dataclass
class GetActorArtistsOutput:
    artists: Optional[List["ArtistViewBasic"]] = None


@dataclass
class GetActorArtistsParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@dataclass
class GetActorCompatibilityOutput:
    compatibility: Optional["ActorCompatibilityViewBasic"] = None


@dataclass
class GetActorCompatibilityParams:
    did: str


@dataclass
class GetActorLovedSongsOutput:
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class GetActorLovedSongsParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetActorNeighboursOutput:
    neighbours: Optional[List["ActorNeighbourViewBasic"]] = None


@dataclass
class GetActorNeighboursParams:
    did: str


@dataclass
class GetActorPlaylistsOutput:
    playlists: Optional[List["PlaylistViewBasic"]] = None


@dataclass
class GetActorPlaylistsParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetActorScrobblesOutput:
    scrobbles: Optional[List["ScrobbleViewBasic"]] = None


@dataclass
class GetActorScrobblesParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetActorSongsOutput:
    songs: Optional[List["SongViewBasic"]] = None


@dataclass
class GetActorSongsParams:
    did: str
    limit: Optional[int] = None
    offset: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@dataclass
class GetAlbumParams:
    uri: str


@dataclass
class GetAlbumRecommendationsParams:
    did: str
    limit: Optional[int] = None


@dataclass
class GetAlbumShoutsOutput:
    shouts: Optional[List[Any]] = None


@dataclass
class GetAlbumShoutsParams:
    uri: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetAlbumsOutput:
    albums: Optional[List["AlbumViewBasic"]] = None


@dataclass
class GetAlbumsParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    genre: Optional[str] = None


@dataclass
class GetAlbumTracksOutput:
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class GetAlbumTracksParams:
    uri: str


@dataclass
class GetApikeysOutput:
    apiKeys: Optional[List[Any]] = None


@dataclass
class GetApikeysParams:
    offset: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GetArtistAlbumsOutput:
    albums: Optional[List["AlbumViewBasic"]] = None


@dataclass
class GetArtistAlbumsParams:
    uri: str


@dataclass
class GetArtistListenersOutput:
    listeners: Optional[List["ArtistListenerViewBasic"]] = None


@dataclass
class GetArtistListenersParams:
    uri: str
    offset: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GetArtistParams:
    uri: str


@dataclass
class GetArtistRecentListenersOutput:
    listeners: Optional[List["ArtistRecentListenerView"]] = None


@dataclass
class GetArtistRecentListenersParams:
    uri: str
    offset: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GetArtistRecommendationsParams:
    did: str
    limit: Optional[int] = None


@dataclass
class GetArtistShoutsOutput:
    shouts: Optional[List[Any]] = None


@dataclass
class GetArtistShoutsParams:
    uri: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetArtistsOutput:
    artists: Optional[List["ArtistViewBasic"]] = None


@dataclass
class GetArtistsParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    names: Optional[str] = None
    genre: Optional[str] = None


@dataclass
class GetArtistTracksOutput:
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class GetArtistTracksParams:
    uri: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetCurrentlyPlayingParams:
    playerId: Optional[str] = None
    actor: Optional[str] = None


@dataclass
class GetFeedGeneratorOutput:
    view: Optional["FeedGeneratorView"] = None


@dataclass
class GetFeedGeneratorParams:
    feed: str


@dataclass
class GetFeedGeneratorsParams:
    size: Optional[int] = None


@dataclass
class GetFeedParams:
    feed: str
    limit: Optional[int] = None
    cursor: Optional[str] = None


@dataclass
class GetFeedSkeletonOutput:
    scrobbles: Optional[List["ScrobbleViewBasic"]] = None
    cursor: Optional[str] = None


@dataclass
class GetFeedSkeletonParams:
    feed: str
    limit: Optional[int] = None
    offset: Optional[int] = None
    cursor: Optional[str] = None


@dataclass
class GetFileParams:
    fileId: str


@dataclass
class GetFilesParams:
    at: Optional[str] = None


@dataclass
class GetFollowersOutput:
    subject: "ActorProfileViewBasic"
    followers: List["ActorProfileViewBasic"]
    cursor: Optional[str] = None
    count: Optional[int] = None


@dataclass
class GetFollowersParams:
    actor: str
    limit: Optional[int] = None
    dids: Optional[List[str]] = None
    cursor: Optional[str] = None


@dataclass
class GetFollowsOutput:
    subject: "ActorProfileViewBasic"
    follows: List["ActorProfileViewBasic"]
    cursor: Optional[str] = None
    count: Optional[int] = None


@dataclass
class GetFollowsParams:
    actor: str
    limit: Optional[int] = None
    dids: Optional[List[str]] = None
    cursor: Optional[str] = None


@dataclass
class GetGlobalStatsParams:
    pass


@dataclass
class GetKnownFollowersOutput:
    subject: "ActorProfileViewBasic"
    followers: List["ActorProfileViewBasic"]
    cursor: Optional[str] = None


@dataclass
class GetKnownFollowersParams:
    actor: str
    limit: Optional[int] = None
    cursor: Optional[str] = None


@dataclass
class GetMetadataParams:
    path: str


@dataclass
class GetMirrorSourcesOutput:
    sources: List["MirrorSourceView"]


@dataclass
class GetMirrorSourcesParams:
    pass


@dataclass
class GetPlaybackQueueParams:
    playerId: Optional[str] = None


@dataclass
class GetPlaylistParams:
    uri: str


@dataclass
class GetPlaylistsOutput:
    playlists: Optional[List["PlaylistViewBasic"]] = None


@dataclass
class GetPlaylistsParams:
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetProfileParams:
    did: Optional[str] = None


@dataclass
class GetProfileShoutsOutput:
    shouts: Optional[List[Any]] = None


@dataclass
class GetProfileShoutsParams:
    did: str
    offset: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GetRecommendationsParams:
    did: str
    limit: Optional[int] = None


@dataclass
class GetScrobbleParams:
    uri: str


@dataclass
class GetScrobblesChartParams:
    did: Optional[str] = None
    artisturi: Optional[str] = None
    albumuri: Optional[str] = None
    songuri: Optional[str] = None
    genre: Optional[str] = None
    from_: Optional[str] = None
    to: Optional[str] = None


@dataclass
class GetScrobblesOutput:
    scrobbles: Optional[List["ScrobbleViewBasic"]] = None


@dataclass
class GetScrobblesParams:
    did: Optional[str] = None
    following: Optional[bool] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetShoutRepliesOutput:
    shouts: Optional[List[Any]] = None


@dataclass
class GetShoutRepliesParams:
    uri: str
    limit: Optional[int] = None
    offset: Optional[int] = None


@dataclass
class GetSongParams:
    uri: Optional[str] = None
    mbid: Optional[str] = None
    isrc: Optional[str] = None
    spotifyId: Optional[str] = None


@dataclass
class GetSongRecentListenersOutput:
    listeners: Optional[List["SongRecentListenerView"]] = None


@dataclass
class GetSongRecentListenersParams:
    uri: str
    offset: Optional[int] = None
    limit: Optional[int] = None


@dataclass
class GetSongsOutput:
    songs: Optional[List["SongViewBasic"]] = None


@dataclass
class GetSongsParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    genre: Optional[str] = None
    mbid: Optional[str] = None
    isrc: Optional[str] = None
    spotifyId: Optional[str] = None


@dataclass
class GetStatsParams:
    did: str


@dataclass
class GetStoriesParams:
    size: Optional[int] = None


@dataclass
class GetTemporaryLinkParams:
    path: str


@dataclass
class GetTopArtistsOutput:
    artists: Optional[List["ArtistViewBasic"]] = None


@dataclass
class GetTopArtistsParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@dataclass
class GetTopTracksOutput:
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class GetTopTracksParams:
    limit: Optional[int] = None
    offset: Optional[int] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@dataclass
class GetTrackShoutsOutput:
    shouts: Optional[List[Any]] = None


@dataclass
class GetTrackShoutsParams:
    uri: str


@dataclass
class GetWrappedParams:
    did: str
    year: Optional[int] = None


@dataclass
class GoogledriveFileListView:
    files: Optional[List["GoogledriveFileView"]] = None


@dataclass
class GoogledriveFileView:
    id: Optional[str] = None


@dataclass
class GraphNotFoundActor:
    """indicates that a handle or DID could not be resolved"""
    actor: str
    notFound: bool


@dataclass
class GraphRelationship:
    did: str
    following: Optional[str] = None
    followedBy: Optional[str] = None


@dataclass
class InsertDirectoryParams:
    uri: str
    directory: str
    position: Optional[int] = None


@dataclass
class InsertFilesParams:
    uri: str
    files: List[str]
    position: Optional[int] = None


@dataclass
class LikeRecord:
    createdAt: str
    subject: "StrongRef"


@dataclass
class LikeShoutInput:
    uri: Optional[str] = None


@dataclass
class LikeSongInput:
    uri: Optional[str] = None


@dataclass
class MatchSongParams:
    title: str
    artist: str
    mbId: Optional[str] = None
    isrc: Optional[str] = None


@dataclass
class MirrorSourceView:
    provider: str
    enabled: bool
    hasCredentials: bool
    externalUsername: Optional[str] = None
    lastPolledAt: Optional[str] = None
    lastScrobbleSeenAt: Optional[str] = None


@dataclass
class NextParams:
    playerId: Optional[str] = None


@dataclass
class PauseParams:
    playerId: Optional[str] = None


@dataclass
class PlayDirectoryParams:
    directoryId: str
    playerId: Optional[str] = None
    shuffle: Optional[bool] = None
    recurse: Optional[bool] = None
    position: Optional[int] = None


@dataclass
class PlayerCurrentlyPlayingViewDetailed:
    title: Optional[str] = None


@dataclass
class PlayerPlaybackQueueViewDetailed:
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class PlayFileParams:
    fileId: str
    playerId: Optional[str] = None


@dataclass
class PlaylistItemRecord:
    subject: "StrongRef"
    createdAt: str
    track: "SongViewBasic"
    order: int


@dataclass
class PlaylistRecord:
    name: str
    createdAt: str
    description: Optional[str] = None
    picture: Optional[BlobRef] = None
    pictureUrl: Optional[str] = None
    spotifyLink: Optional[str] = None
    tidalLink: Optional[str] = None
    youtubeLink: Optional[str] = None
    appleMusicLink: Optional[str] = None


@dataclass
class PlaylistViewBasic:
    """Basic view of a playlist, including its metadata"""
    id: Optional[str] = None
    title: Optional[str] = None
    uri: Optional[str] = None
    curatorDid: Optional[str] = None
    curatorHandle: Optional[str] = None
    curatorName: Optional[str] = None
    curatorAvatarUrl: Optional[str] = None
    description: Optional[str] = None
    coverImageUrl: Optional[str] = None
    createdAt: Optional[str] = None
    trackCount: Optional[int] = None


@dataclass
class PlaylistViewDetailed:
    """Detailed view of a playlist, including its tracks and metadata"""
    id: Optional[str] = None
    title: Optional[str] = None
    uri: Optional[str] = None
    curatorDid: Optional[str] = None
    curatorHandle: Optional[str] = None
    curatorName: Optional[str] = None
    curatorAvatarUrl: Optional[str] = None
    description: Optional[str] = None
    coverImageUrl: Optional[str] = None
    createdAt: Optional[str] = None
    tracks: Optional[List["SongViewBasic"]] = None


@dataclass
class PlayParams:
    playerId: Optional[str] = None


@dataclass
class PreviousParams:
    playerId: Optional[str] = None


@dataclass
class ProfileRecord:
    displayName: Optional[str] = None
    description: Optional[str] = None
    avatar: Optional[BlobRef] = None
    banner: Optional[BlobRef] = None
    labels: Optional[Union[Any]] = None
    joinedViaStarterPack: Optional["StrongRef"] = None
    createdAt: Optional[str] = None


@dataclass
class PutMirrorSourceInput:
    provider: str
    enabled: Optional[bool] = None
    externalUsername: Optional[str] = None
    apiKey: Optional[str] = None


@dataclass
class RadioRecord:
    name: str
    url: str
    createdAt: str
    description: Optional[str] = None
    genre: Optional[str] = None
    logo: Optional[BlobRef] = None
    website: Optional[str] = None


@dataclass
class RadioViewBasic:
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    createdAt: Optional[str] = None


@dataclass
class RadioViewDetailed:
    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    url: Optional[str] = None
    genre: Optional[str] = None
    logo: Optional[str] = None
    createdAt: Optional[str] = None


@dataclass
class RemoveApikeyParams:
    id: str


@dataclass
class RemovePlaylistParams:
    uri: str


@dataclass
class RemoveShoutParams:
    id: str


@dataclass
class RemoveTrackParams:
    uri: str
    position: int


@dataclass
class ReplyShoutInput:
    shoutId: str
    message: str


@dataclass
class ReportShoutInput:
    shoutId: str
    reason: Optional[str] = None


@dataclass
class ScrobbleFirstScrobbleView:
    handle: Optional[str] = None
    avatar: Optional[str] = None
    timestamp: Optional[str] = None


@dataclass
class ScrobbleRecord:
    title: str
    artist: str
    albumArtist: str
    album: str
    duration: int
    createdAt: str
    artists: Optional[List["ArtistMbid"]] = None
    trackNumber: Optional[int] = None
    discNumber: Optional[int] = None
    releaseDate: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    tags: Optional[List[str]] = None
    composer: Optional[str] = None
    lyrics: Optional[str] = None
    copyrightMessage: Optional[str] = None
    wiki: Optional[str] = None
    albumArt: Optional[BlobRef] = None
    albumArtUrl: Optional[str] = None
    youtubeLink: Optional[str] = None
    spotifyLink: Optional[str] = None
    tidalLink: Optional[str] = None
    appleMusicLink: Optional[str] = None
    mbid: Optional[str] = None
    label: Optional[str] = None
    isrc: Optional[str] = None


@dataclass
class ScrobbleViewBasic:
    id: Optional[str] = None
    user: Optional[str] = None
    userDisplayName: Optional[str] = None
    userAvatar: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    album: Optional[str] = None
    albumUri: Optional[str] = None
    cover: Optional[str] = None
    date: Optional[str] = None
    uri: Optional[str] = None
    sha256: Optional[str] = None
    liked: Optional[bool] = None
    likesCount: Optional[int] = None


@dataclass
class ScrobbleViewDetailed:
    id: Optional[str] = None
    user: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    artistUri: Optional[str] = None
    album: Optional[str] = None
    albumUri: Optional[str] = None
    cover: Optional[str] = None
    date: Optional[str] = None
    uri: Optional[str] = None
    sha256: Optional[str] = None
    liked: Optional[bool] = None
    likesCount: Optional[int] = None
    listeners: Optional[int] = None
    scrobbles: Optional[int] = None
    artists: Optional[List["ArtistViewBasic"]] = None
    firstScrobble: Optional["ScrobbleFirstScrobbleView"] = None


@dataclass
class SearchParams:
    query: str


@dataclass
class SeekParams:
    position: int
    playerId: Optional[str] = None


@dataclass
class ShoutAuthor:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None


@dataclass
class ShoutRecord:
    message: str
    createdAt: str
    subject: "StrongRef"
    parent: Optional["StrongRef"] = None


@dataclass
class ShoutView:
    id: Optional[str] = None
    message: Optional[str] = None
    parent: Optional[str] = None
    createdAt: Optional[str] = None
    author: Optional["ShoutAuthor"] = None


@dataclass
class SongFirstScrobbleView:
    handle: Optional[str] = None
    avatar: Optional[str] = None
    timestamp: Optional[str] = None


@dataclass
class SongRecentListenerView:
    id: Optional[str] = None
    did: Optional[str] = None
    handle: Optional[str] = None
    displayName: Optional[str] = None
    avatar: Optional[str] = None
    timestamp: Optional[str] = None
    scrobbleUri: Optional[str] = None


@dataclass
class SongRecord:
    title: str
    artist: str
    albumArtist: str
    album: str
    duration: int
    createdAt: str
    artists: Optional[List["ArtistMbid"]] = None
    trackNumber: Optional[int] = None
    discNumber: Optional[int] = None
    releaseDate: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    tags: Optional[List[str]] = None
    composer: Optional[str] = None
    lyrics: Optional[str] = None
    copyrightMessage: Optional[str] = None
    wiki: Optional[str] = None
    albumArt: Optional[BlobRef] = None
    albumArtUrl: Optional[str] = None
    youtubeLink: Optional[str] = None
    spotifyLink: Optional[str] = None
    tidalLink: Optional[str] = None
    appleMusicLink: Optional[str] = None
    mbid: Optional[str] = None
    label: Optional[str] = None
    isrc: Optional[str] = None


@dataclass
class SongViewBasic:
    id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    albumArtist: Optional[str] = None
    albumArt: Optional[str] = None
    uri: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[int] = None
    trackNumber: Optional[int] = None
    discNumber: Optional[int] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None
    albumUri: Optional[str] = None
    artistUri: Optional[str] = None
    sha256: Optional[str] = None
    mbid: Optional[str] = None
    isrc: Optional[str] = None
    tags: Optional[List[str]] = None
    createdAt: Optional[str] = None


@dataclass
class SongViewDetailed:
    id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    albumArtist: Optional[str] = None
    albumArt: Optional[str] = None
    uri: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[int] = None
    trackNumber: Optional[int] = None
    discNumber: Optional[int] = None
    playCount: Optional[int] = None
    uniqueListeners: Optional[int] = None
    albumUri: Optional[str] = None
    artistUri: Optional[str] = None
    sha256: Optional[str] = None
    mbid: Optional[str] = None
    isrc: Optional[str] = None
    tags: Optional[List[str]] = None
    createdAt: Optional[str] = None
    artists: Optional[List["ArtistViewBasic"]] = None
    firstScrobble: Optional["SongFirstScrobbleView"] = None


@dataclass
class SpotifyTrackView:
    id: Optional[str] = None
    name: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[int] = None
    previewUrl: Optional[str] = None


@dataclass
class StartPlaylistParams:
    uri: str
    shuffle: Optional[bool] = None
    position: Optional[int] = None


@dataclass
class StatsGlobalStatsView:
    scrobbles: Optional[int] = None
    users: Optional[int] = None
    artists: Optional[int] = None
    albums: Optional[int] = None
    tracks: Optional[int] = None


@dataclass
class StatsView:
    scrobbles: Optional[int] = None
    artists: Optional[int] = None
    lovedTracks: Optional[int] = None
    albums: Optional[int] = None
    tracks: Optional[int] = None


@dataclass
class StatsWrappedAlbum:
    id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    albumArt: Optional[str] = None
    uri: Optional[str] = None
    playCount: Optional[int] = None


@dataclass
class StatsWrappedArtist:
    id: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    uri: Optional[str] = None
    playCount: Optional[int] = None


@dataclass
class StatsWrappedDayCount:
    date: Optional[str] = None
    count: Optional[int] = None


@dataclass
class StatsWrappedGenreCount:
    genre: Optional[str] = None
    count: Optional[int] = None


@dataclass
class StatsWrappedMilestone:
    trackTitle: Optional[str] = None
    artistName: Optional[str] = None
    timestamp: Optional[str] = None
    trackUri: Optional[str] = None


@dataclass
class StatsWrappedMonthCount:
    month: Optional[int] = None
    count: Optional[int] = None


@dataclass
class StatsWrappedTrack:
    id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    albumArt: Optional[str] = None
    uri: Optional[str] = None
    artistUri: Optional[str] = None
    albumUri: Optional[str] = None
    playCount: Optional[int] = None


@dataclass
class StatsWrappedView:
    year: Optional[int] = None
    totalScrobbles: Optional[int] = None
    totalListeningTimeMinutes: Optional[int] = None
    topArtists: Optional[List["StatsWrappedArtist"]] = None
    topTracks: Optional[List["StatsWrappedTrack"]] = None
    topAlbums: Optional[List["StatsWrappedAlbum"]] = None
    topGenres: Optional[List["StatsWrappedGenreCount"]] = None
    scrobblesPerMonth: Optional[List["StatsWrappedMonthCount"]] = None
    mostActiveDay: Optional["StatsWrappedDayCount"] = None
    mostActiveHour: Optional[int] = None
    newArtistsCount: Optional[int] = None
    longestStreak: Optional[int] = None
    firstScrobble: Optional["StatsWrappedMilestone"] = None
    lastScrobble: Optional["StatsWrappedMilestone"] = None


@dataclass
class StatusRecord:
    track: "ActorTrackView"
    startedAt: str
    expiresAt: Optional[str] = None


@dataclass
class StrongRef:
    uri: str
    cid: str


@dataclass
class UnfollowAccountOutput:
    subject: "ActorProfileViewBasic"
    followers: List["ActorProfileViewBasic"]
    cursor: Optional[str] = None


@dataclass
class UnfollowAccountParams:
    account: str


@dataclass
class UpdateApikeyInput:
    id: str
    name: str
    description: Optional[str] = None
