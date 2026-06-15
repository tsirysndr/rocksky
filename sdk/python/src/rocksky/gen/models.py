"""AUTO-GENERATED FILE -- DO NOT EDIT.

Source: apps/api/lexicons/**/*.json
Regenerate via: bun run lexgen:types
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


class RockskyModel(BaseModel):
    """Base model used by every generated SDK type.

    Accepts both camelCase (alias) and snake_case (field name) input, preserves
    unknown fields ("extra=allow"), and never crashes on a missing key.
    """

    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="allow",
        str_strip_whitespace=True,
    )


class BlobRef(RockskyModel):
    """atproto blob reference shape."""

    type: str | None = Field(default=None, alias="$type")
    ref: dict[str, Any] | None = None
    mime_type: str | None = None
    size: int | None = None



class ActorArtistViewBasic(RockskyModel):
    id: str | None = None
    name: str | None = None
    picture: str | None = None
    uri: str | None = None
    user1_rank: int | None = Field(default=None, alias="user1Rank")
    user2_rank: int | None = Field(default=None, alias="user2Rank")
    weight: int | None = None


class ActorCompatibilityViewBasic(RockskyModel):
    compatibility_level: int | None = Field(default=None, alias="compatibilityLevel")
    compatibility_percentage: int | None = Field(default=None, alias="compatibilityPercentage")
    shared_artists: int | None = Field(default=None, alias="sharedArtists")
    top_shared_artist_names: list[str] | None = Field(default=None, alias="topSharedArtistNames")
    top_shared_detailed_artists: list[ActorArtistViewBasic] | None = Field(default=None, alias="topSharedDetailedArtists")
    user1_artist_count: int | None = Field(default=None, alias="user1ArtistCount")
    user2_artist_count: int | None = Field(default=None, alias="user2ArtistCount")


class ActorNeighbourViewBasic(RockskyModel):
    user_id: str | None = Field(default=None, alias="userId")
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    shared_artists_count: int | None = Field(default=None, alias="sharedArtistsCount")
    similarity_score: int | None = Field(default=None, alias="similarityScore")
    top_shared_artist_names: list[str] | None = Field(default=None, alias="topSharedArtistNames")
    top_shared_artists_details: list[ArtistViewBasic] | None = Field(default=None, alias="topSharedArtistsDetails")


class ActorProfileViewBasic(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class ActorProfileViewDetailed(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class ActorTrackView(RockskyModel):
    name: str | None = None
    artist: str | None = None
    album: str | None = None
    album_cover_url: str | None = Field(default=None, alias="albumCoverUrl")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    source: str | None = None
    recording_mb_id: str | None = Field(default=None, alias="recordingMbId")


class AddDirectoryToQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    directory: str | None = None
    position: int | None = None
    shuffle: bool | None = None


class AddItemsToQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    items: list[str] | None = None
    position: int | None = None
    shuffle: bool | None = None


class AlbumRecord(RockskyModel):
    title: str | None = None
    artist: str | None = None
    duration: int | None = None
    release_date: datetime | None = Field(default=None, alias="releaseDate")
    year: int | None = None
    genre: str | None = None
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    tags: list[str] | None = None
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class AlbumViewBasic(RockskyModel):
    id: str | None = None
    uri: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    release_date: str | None = Field(default=None, alias="releaseDate")
    sha256: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")


class AlbumViewDetailed(RockskyModel):
    id: str | None = None
    uri: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    release_date: str | None = Field(default=None, alias="releaseDate")
    sha256: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = None
    tracks: list[SongViewBasic] | None = None


class ApiKeyView(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class ArtistListenerViewBasic(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    most_listened_song: ArtistSongViewBasic | None = Field(default=None, alias="mostListenedSong")
    total_plays: int | None = Field(default=None, alias="totalPlays")
    rank: int | None = None


class ArtistMbid(RockskyModel):
    mbid: str | None = None
    name: str | None = None


class ArtistRecentListenerView(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    timestamp: datetime | None = None
    scrobble_uri: str | None = Field(default=None, alias="scrobbleUri")


class ArtistRecord(RockskyModel):
    name: str | None = None
    bio: str | None = None
    picture: BlobRef | None = None
    picture_url: str | None = Field(default=None, alias="pictureUrl")
    tags: list[str] | None = None
    born: datetime | None = None
    died: datetime | None = None
    born_in: str | None = Field(default=None, alias="bornIn")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class ArtistSongViewBasic(RockskyModel):
    uri: str | None = None
    title: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")


class ArtistViewBasic(RockskyModel):
    id: str | None = None
    uri: str | None = None
    name: str | None = None
    picture: str | None = None
    sha256: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = None


class ArtistViewDetailed(RockskyModel):
    id: str | None = None
    uri: str | None = None
    name: str | None = None
    picture: str | None = None
    sha256: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    tags: list[str] | None = None


class AudioSettingsRecord(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = None
    equalizer: RockboxEqualizerSettings | None = None
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class ChartsScrobbleViewBasic(RockskyModel):
    date: datetime | None = None
    count: int | None = None


class ChartsView(RockskyModel):
    scrobbles: list[ChartsScrobbleViewBasic] | None = None


class CreateApikeyInput(RockskyModel):
    name: str | None = None
    description: str | None = None


class CreatePlaylistParams(RockskyModel):
    name: str | None = None
    description: str | None = None


class CreateScrobbleInput(RockskyModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    duration: int | None = None
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    track_number: int | None = Field(default=None, alias="trackNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = None
    disc_number: int | None = Field(default=None, alias="discNumber")
    lyrics: str | None = None
    composer: str | None = None
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    label: str | None = None
    artist_picture: str | None = Field(default=None, alias="artistPicture")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    lastfm_link: str | None = Field(default=None, alias="lastfmLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    deezer_link: str | None = Field(default=None, alias="deezerLink")
    timestamp: int | None = None


class CreateShoutInput(RockskyModel):
    message: str | None = None


class CreateSongInput(RockskyModel):
    title: str | None = None
    artist: str | None = None
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album: str | None = None
    duration: int | None = None
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    track_number: int | None = Field(default=None, alias="trackNumber")
    release_date: str | None = Field(default=None, alias="releaseDate")
    year: int | None = None
    disc_number: int | None = Field(default=None, alias="discNumber")
    lyrics: str | None = None


class DescribeFeedGeneratorOutput(RockskyModel):
    did: str | None = None
    feeds: list[FeedUriView] | None = None


class DescribeFeedGeneratorParams(RockskyModel):
    pass


class DislikeShoutInput(RockskyModel):
    uri: str | None = None


class DislikeSongInput(RockskyModel):
    uri: str | None = None


class DownloadFileParams(RockskyModel):
    file_id: str | None = Field(default=None, alias="fileId")


class DropboxFileListView(RockskyModel):
    files: list[DropboxFileView] | None = None


class DropboxFileView(RockskyModel):
    id: str | None = None
    name: str | None = None
    path_lower: str | None = Field(default=None, alias="pathLower")
    path_display: str | None = Field(default=None, alias="pathDisplay")
    client_modified: datetime | None = Field(default=None, alias="clientModified")
    server_modified: datetime | None = Field(default=None, alias="serverModified")


class DropboxTemporaryLinkView(RockskyModel):
    link: str | None = None


class FeedGeneratorsView(RockskyModel):
    feeds: list[FeedGeneratorView] | None = None


class FeedGeneratorView(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    uri: str | None = None
    avatar: str | None = None
    creator: ActorProfileViewBasic | None = None


class FeedItemView(RockskyModel):
    scrobble: ScrobbleViewBasic | None = None


class FeedRecommendationsView(RockskyModel):
    recommendations: list[FeedRecommendationView] | None = None
    cursor: str | None = None


class FeedRecommendationView(RockskyModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    track_uri: str | None = Field(default=None, alias="trackUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album_uri: str | None = Field(default=None, alias="albumUri")
    genres: list[str] | None = None
    recommendation_score: int | None = Field(default=None, alias="recommendationScore")
    source: str | None = None
    likes_count: int | None = Field(default=None, alias="likesCount")


class FeedRecommendedAlbumsView(RockskyModel):
    albums: list[FeedRecommendedAlbumView] | None = None
    cursor: str | None = None


class FeedRecommendedAlbumView(RockskyModel):
    id: str | None = None
    uri: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    year: int | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    recommendation_score: int | None = Field(default=None, alias="recommendationScore")
    source: str | None = None


class FeedRecommendedArtistsView(RockskyModel):
    artists: list[FeedRecommendedArtistView] | None = None
    cursor: str | None = None


class FeedRecommendedArtistView(RockskyModel):
    id: str | None = None
    uri: str | None = None
    name: str | None = None
    picture: str | None = None
    genres: list[str] | None = None
    recommendation_score: int | None = Field(default=None, alias="recommendationScore")
    source: str | None = None


class FeedSearchResultsView(RockskyModel):
    hits: list[SongViewBasic | AlbumViewBasic | ArtistViewBasic | PlaylistViewBasic | ActorProfileViewBasic] | None = None
    processing_time_ms: int | None = Field(default=None, alias="processingTimeMs")
    limit: int | None = None
    offset: int | None = None
    estimated_total_hits: int | None = Field(default=None, alias="estimatedTotalHits")


class FeedStoriesView(RockskyModel):
    stories: list[FeedStoryView] | None = None


class FeedStoryView(RockskyModel):
    album: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    avatar: str | None = None
    created_at: str | None = Field(default=None, alias="createdAt")
    did: str | None = None
    handle: str | None = None
    id: str | None = None
    title: str | None = None
    track_id: str | None = Field(default=None, alias="trackId")
    track_uri: str | None = Field(default=None, alias="trackUri")
    uri: str | None = None


class FeedUriView(RockskyModel):
    uri: str | None = None


class FeedView(RockskyModel):
    feed: list[FeedItemView] | None = None
    cursor: str | None = None


class FollowAccountOutput(RockskyModel):
    subject: ActorProfileViewBasic | None = None
    followers: list[ActorProfileViewBasic] | None = None
    cursor: str | None = None


class FollowAccountParams(RockskyModel):
    account: str | None = None


class FollowRecord(RockskyModel):
    created_at: datetime | None = Field(default=None, alias="createdAt")
    subject: str | None = None
    via: StrongRef | None = None


class GeneratorRecord(RockskyModel):
    did: str | None = None
    avatar: BlobRef | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class GetActorAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = None


class GetActorAlbumsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")


class GetActorArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = None


class GetActorArtistsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")


class GetActorCompatibilityOutput(RockskyModel):
    compatibility: ActorCompatibilityViewBasic | None = None


class GetActorCompatibilityParams(RockskyModel):
    did: str | None = None


class GetActorLovedSongsOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = None


class GetActorLovedSongsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetActorNeighboursOutput(RockskyModel):
    neighbours: list[ActorNeighbourViewBasic] | None = None


class GetActorNeighboursParams(RockskyModel):
    did: str | None = None


class GetActorPlaylistsOutput(RockskyModel):
    playlists: list[PlaylistViewBasic] | None = None


class GetActorPlaylistsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetActorScrobblesOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = None


class GetActorScrobblesParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetActorSongsOutput(RockskyModel):
    songs: list[SongViewBasic] | None = None


class GetActorSongsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None
    offset: int | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")


class GetAlbumParams(RockskyModel):
    uri: str | None = None


class GetAlbumRecommendationsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None


class GetAlbumShoutsOutput(RockskyModel):
    shouts: list[Any] | None = None


class GetAlbumShoutsParams(RockskyModel):
    uri: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = None


class GetAlbumsParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None
    genre: str | None = None


class GetAlbumTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = None


class GetAlbumTracksParams(RockskyModel):
    uri: str | None = None


class GetApikeysOutput(RockskyModel):
    api_keys: list[Any] | None = Field(default=None, alias="apiKeys")


class GetApikeysParams(RockskyModel):
    offset: int | None = None
    limit: int | None = None


class GetArtistAlbumsOutput(RockskyModel):
    albums: list[AlbumViewBasic] | None = None


class GetArtistAlbumsParams(RockskyModel):
    uri: str | None = None


class GetArtistListenersOutput(RockskyModel):
    listeners: list[ArtistListenerViewBasic] | None = None


class GetArtistListenersParams(RockskyModel):
    uri: str | None = None
    offset: int | None = None
    limit: int | None = None


class GetArtistParams(RockskyModel):
    uri: str | None = None


class GetArtistRecentListenersOutput(RockskyModel):
    listeners: list[ArtistRecentListenerView] | None = None


class GetArtistRecentListenersParams(RockskyModel):
    uri: str | None = None
    offset: int | None = None
    limit: int | None = None


class GetArtistRecommendationsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None


class GetArtistShoutsOutput(RockskyModel):
    shouts: list[Any] | None = None


class GetArtistShoutsParams(RockskyModel):
    uri: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = None


class GetArtistsParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None
    names: str | None = None
    genre: str | None = None


class GetArtistTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = None


class GetArtistTracksParams(RockskyModel):
    uri: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetAudioSettingsParams(RockskyModel):
    pass


class GetCurrentlyPlayingParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    actor: str | None = None


class GetFeedGeneratorOutput(RockskyModel):
    view: FeedGeneratorView | None = None


class GetFeedGeneratorParams(RockskyModel):
    feed: str | None = None


class GetFeedGeneratorsParams(RockskyModel):
    size: int | None = None


class GetFeedParams(RockskyModel):
    feed: str | None = None
    limit: int | None = None
    cursor: str | None = None


class GetFeedSkeletonOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = None
    cursor: str | None = None


class GetFeedSkeletonParams(RockskyModel):
    feed: str | None = None
    limit: int | None = None
    offset: int | None = None
    cursor: str | None = None


class GetFileParams(RockskyModel):
    file_id: str | None = Field(default=None, alias="fileId")


class GetFilesParams(RockskyModel):
    at: str | None = None


class GetFollowersOutput(RockskyModel):
    subject: ActorProfileViewBasic | None = None
    followers: list[ActorProfileViewBasic] | None = None
    cursor: str | None = None
    count: int | None = None


class GetFollowersParams(RockskyModel):
    actor: str | None = None
    limit: int | None = None
    dids: list[str] | None = None
    cursor: str | None = None


class GetFollowsOutput(RockskyModel):
    subject: ActorProfileViewBasic | None = None
    follows: list[ActorProfileViewBasic] | None = None
    cursor: str | None = None
    count: int | None = None


class GetFollowsParams(RockskyModel):
    actor: str | None = None
    limit: int | None = None
    dids: list[str] | None = None
    cursor: str | None = None


class GetGlobalStatsParams(RockskyModel):
    pass


class GetKnownFollowersOutput(RockskyModel):
    subject: ActorProfileViewBasic | None = None
    followers: list[ActorProfileViewBasic] | None = None
    cursor: str | None = None


class GetKnownFollowersParams(RockskyModel):
    actor: str | None = None
    limit: int | None = None
    cursor: str | None = None


class GetMetadataParams(RockskyModel):
    path: str | None = None


class GetMirrorSourcesOutput(RockskyModel):
    sources: list[MirrorSourceView] | None = None


class GetMirrorSourcesParams(RockskyModel):
    pass


class GetPlaybackQueueParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")


class GetPlaylistParams(RockskyModel):
    uri: str | None = None


class GetPlaylistsOutput(RockskyModel):
    playlists: list[PlaylistViewBasic] | None = None


class GetPlaylistsParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None


class GetProfileParams(RockskyModel):
    did: str | None = None


class GetProfileShoutsOutput(RockskyModel):
    shouts: list[Any] | None = None


class GetProfileShoutsParams(RockskyModel):
    did: str | None = None
    offset: int | None = None
    limit: int | None = None


class GetRecommendationsParams(RockskyModel):
    did: str | None = None
    limit: int | None = None


class GetScrobbleParams(RockskyModel):
    uri: str | None = None


class GetScrobblesChartParams(RockskyModel):
    did: str | None = None
    artisturi: str | None = None
    albumuri: str | None = None
    songuri: str | None = None
    genre: str | None = None
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None


class GetScrobblesOutput(RockskyModel):
    scrobbles: list[ScrobbleViewBasic] | None = None


class GetScrobblesParams(RockskyModel):
    did: str | None = None
    following: bool | None = None
    limit: int | None = None
    offset: int | None = None


class GetShoutRepliesOutput(RockskyModel):
    shouts: list[Any] | None = None


class GetShoutRepliesParams(RockskyModel):
    uri: str | None = None
    limit: int | None = None
    offset: int | None = None


class GetSongParams(RockskyModel):
    uri: str | None = None
    mbid: str | None = None
    isrc: str | None = None
    spotify_id: str | None = Field(default=None, alias="spotifyId")


class GetSongRecentListenersOutput(RockskyModel):
    listeners: list[SongRecentListenerView] | None = None


class GetSongRecentListenersParams(RockskyModel):
    uri: str | None = None
    offset: int | None = None
    limit: int | None = None


class GetSongsOutput(RockskyModel):
    songs: list[SongViewBasic] | None = None


class GetSongsParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None
    genre: str | None = None
    mbid: str | None = None
    isrc: str | None = None
    spotify_id: str | None = Field(default=None, alias="spotifyId")


class GetStatsParams(RockskyModel):
    did: str | None = None


class GetStoriesParams(RockskyModel):
    size: int | None = None
    feed: str | None = None
    following: bool | None = None


class GetTemporaryLinkParams(RockskyModel):
    path: str | None = None


class GetTopArtistsOutput(RockskyModel):
    artists: list[ArtistViewBasic] | None = None


class GetTopArtistsParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")


class GetTopTracksOutput(RockskyModel):
    tracks: list[SongViewBasic] | None = None


class GetTopTracksParams(RockskyModel):
    limit: int | None = None
    offset: int | None = None
    start_date: datetime | None = Field(default=None, alias="startDate")
    end_date: datetime | None = Field(default=None, alias="endDate")


class GetTrackShoutsOutput(RockskyModel):
    shouts: list[Any] | None = None


class GetTrackShoutsParams(RockskyModel):
    uri: str | None = None


class GetWrappedParams(RockskyModel):
    did: str | None = None
    year: int | None = None


class GoogledriveFileListView(RockskyModel):
    files: list[GoogledriveFileView] | None = None


class GoogledriveFileView(RockskyModel):
    id: str | None = None


class GraphNotFoundActor(RockskyModel):
    """indicates that a handle or DID could not be resolved"""

    actor: str | None = None
    not_found: bool | None = Field(default=None, alias="notFound")


class GraphRelationship(RockskyModel):
    did: str | None = None
    following: str | None = None
    followed_by: str | None = Field(default=None, alias="followedBy")


class InsertDirectoryParams(RockskyModel):
    uri: str | None = None
    directory: str | None = None
    position: int | None = None


class InsertFilesParams(RockskyModel):
    uri: str | None = None
    files: list[str] | None = None
    position: int | None = None


class LikeRecord(RockskyModel):
    created_at: datetime | None = Field(default=None, alias="createdAt")
    subject: StrongRef | None = None


class LikeShoutInput(RockskyModel):
    uri: str | None = None


class LikeSongInput(RockskyModel):
    uri: str | None = None


class MatchSongParams(RockskyModel):
    title: str | None = None
    artist: str | None = None
    mb_id: str | None = Field(default=None, alias="mbId")
    isrc: str | None = None


class MirrorSourceView(RockskyModel):
    provider: str | None = None
    enabled: bool | None = None
    external_username: str | None = Field(default=None, alias="externalUsername")
    has_credentials: bool | None = Field(default=None, alias="hasCredentials")
    last_polled_at: datetime | None = Field(default=None, alias="lastPolledAt")
    last_scrobble_seen_at: datetime | None = Field(default=None, alias="lastScrobbleSeenAt")


class NextParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")


class PauseParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")


class PlayDirectoryParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    directory_id: str | None = Field(default=None, alias="directoryId")
    shuffle: bool | None = None
    recurse: bool | None = None
    position: int | None = None


class PlayerCurrentlyPlayingViewDetailed(RockskyModel):
    title: str | None = None


class PlayerPlaybackQueueViewDetailed(RockskyModel):
    tracks: list[SongViewBasic] | None = None


class PlayFileParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    file_id: str | None = Field(default=None, alias="fileId")


class PlaylistItemRecord(RockskyModel):
    subject: StrongRef | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    track: SongViewBasic | None = None
    order: int | None = None


class PlaylistRecord(RockskyModel):
    name: str | None = None
    description: str | None = None
    picture: BlobRef | None = None
    picture_url: str | None = Field(default=None, alias="pictureUrl")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")


class PlaylistViewBasic(RockskyModel):
    """Basic view of a playlist, including its metadata"""

    id: str | None = None
    title: str | None = None
    uri: str | None = None
    curator_did: str | None = Field(default=None, alias="curatorDid")
    curator_handle: str | None = Field(default=None, alias="curatorHandle")
    curator_name: str | None = Field(default=None, alias="curatorName")
    curator_avatar_url: str | None = Field(default=None, alias="curatorAvatarUrl")
    description: str | None = None
    cover_image_url: str | None = Field(default=None, alias="coverImageUrl")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    track_count: int | None = Field(default=None, alias="trackCount")


class PlaylistViewDetailed(RockskyModel):
    """Detailed view of a playlist, including its tracks and metadata"""

    id: str | None = None
    title: str | None = None
    uri: str | None = None
    curator_did: str | None = Field(default=None, alias="curatorDid")
    curator_handle: str | None = Field(default=None, alias="curatorHandle")
    curator_name: str | None = Field(default=None, alias="curatorName")
    curator_avatar_url: str | None = Field(default=None, alias="curatorAvatarUrl")
    description: str | None = None
    cover_image_url: str | None = Field(default=None, alias="coverImageUrl")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    tracks: list[SongViewBasic] | None = None


class PlayParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")


class PreviousParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")


class ProfileRecord(RockskyModel):
    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = None
    avatar: BlobRef | None = None
    banner: BlobRef | None = None
    labels: Any | None = None
    joined_via_starter_pack: StrongRef | None = Field(default=None, alias="joinedViaStarterPack")
    created_at: datetime | None = Field(default=None, alias="createdAt")


class PutAudioSettingsInput(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = None
    equalizer: RockboxEqualizerSettings | None = None
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = None


class PutMirrorSourceInput(RockskyModel):
    provider: str | None = None
    enabled: bool | None = None
    external_username: str | None = Field(default=None, alias="externalUsername")
    api_key: str | None = Field(default=None, alias="apiKey")


class RadioRecord(RockskyModel):
    name: str | None = None
    url: str | None = None
    description: str | None = None
    genre: str | None = None
    logo: BlobRef | None = None
    website: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class RadioViewBasic(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class RadioViewDetailed(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    website: str | None = None
    url: str | None = None
    genre: str | None = None
    logo: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class RemoveApikeyParams(RockskyModel):
    id: str | None = None


class RemovePlaylistParams(RockskyModel):
    uri: str | None = None


class RemoveShoutParams(RockskyModel):
    id: str | None = None


class RemoveTrackParams(RockskyModel):
    uri: str | None = None
    position: int | None = None


class ReplyShoutInput(RockskyModel):
    shout_id: str | None = Field(default=None, alias="shoutId")
    message: str | None = None


class ReportShoutInput(RockskyModel):
    shout_id: str | None = Field(default=None, alias="shoutId")
    reason: str | None = None


class RockboxCrossfadeSettings(RockskyModel):
    mode: str | None = None
    fade_in_delay: int | None = Field(default=None, alias="fadeInDelay")
    fade_in_duration: int | None = Field(default=None, alias="fadeInDuration")
    fade_out_delay: int | None = Field(default=None, alias="fadeOutDelay")
    fade_out_duration: int | None = Field(default=None, alias="fadeOutDuration")
    fade_out_mix_mode: str | None = Field(default=None, alias="fadeOutMixMode")


class RockboxEqualizerBand(RockskyModel):
    frequency: int | None = None
    gain: int | None = None
    q: int | None = None


class RockboxEqualizerSettings(RockskyModel):
    enabled: bool | None = None
    precut: int | None = None
    bands: list[RockboxEqualizerBand] | None = None


class RockboxReplayGainSettings(RockskyModel):
    mode: str | None = None
    preamp: int | None = None
    prevent_clipping: bool | None = Field(default=None, alias="preventClipping")


class RockboxSettingsView(RockskyModel):
    crossfade: RockboxCrossfadeSettings | None = None
    equalizer: RockboxEqualizerSettings | None = None
    replay_gain: RockboxReplayGainSettings | None = Field(default=None, alias="replayGain")
    tone: RockboxToneSettings | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class RockboxToneSettings(RockskyModel):
    bass: int | None = None
    treble: int | None = None
    balance: int | None = None
    channels: str | None = None


class ScrobbleFirstScrobbleView(RockskyModel):
    handle: str | None = None
    avatar: str | None = None
    timestamp: datetime | None = None


class ScrobbleRecord(RockskyModel):
    title: str | None = None
    artist: str | None = None
    artists: list[ArtistMbid] | None = None
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album: str | None = None
    duration: int | None = None
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    release_date: datetime | None = Field(default=None, alias="releaseDate")
    year: int | None = None
    genre: str | None = None
    tags: list[str] | None = None
    composer: str | None = None
    lyrics: str | None = None
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    wiki: str | None = None
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    mbid: str | None = None
    label: str | None = None
    isrc: str | None = None


class ScrobbleViewBasic(RockskyModel):
    id: str | None = None
    user: str | None = None
    user_display_name: str | None = Field(default=None, alias="userDisplayName")
    user_avatar: str | None = Field(default=None, alias="userAvatar")
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album: str | None = None
    album_uri: str | None = Field(default=None, alias="albumUri")
    cover: str | None = None
    date: datetime | None = None
    uri: str | None = None
    sha256: str | None = None
    liked: bool | None = None
    likes_count: int | None = Field(default=None, alias="likesCount")


class ScrobbleViewDetailed(RockskyModel):
    id: str | None = None
    user: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album: str | None = None
    album_uri: str | None = Field(default=None, alias="albumUri")
    cover: str | None = None
    date: datetime | None = None
    uri: str | None = None
    sha256: str | None = None
    liked: bool | None = None
    likes_count: int | None = Field(default=None, alias="likesCount")
    listeners: int | None = None
    scrobbles: int | None = None
    artists: list[ArtistViewBasic] | None = None
    first_scrobble: ScrobbleFirstScrobbleView | None = Field(default=None, alias="firstScrobble")


class SearchParams(RockskyModel):
    query: str | None = None


class SeekParams(RockskyModel):
    player_id: str | None = Field(default=None, alias="playerId")
    position: int | None = None


class ShoutAuthor(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None


class ShoutRecord(RockskyModel):
    message: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    parent: StrongRef | None = None
    subject: StrongRef | None = None


class ShoutView(RockskyModel):
    id: str | None = None
    message: str | None = None
    parent: str | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    author: ShoutAuthor | None = None


class SongFirstScrobbleView(RockskyModel):
    handle: str | None = None
    avatar: str | None = None
    timestamp: datetime | None = None


class SongRecentListenerView(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = Field(default=None, alias="displayName")
    avatar: str | None = None
    timestamp: datetime | None = None
    scrobble_uri: str | None = Field(default=None, alias="scrobbleUri")


class SongRecord(RockskyModel):
    title: str | None = None
    artist: str | None = None
    artists: list[ArtistMbid] | None = None
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album: str | None = None
    duration: int | None = None
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    release_date: datetime | None = Field(default=None, alias="releaseDate")
    year: int | None = None
    genre: str | None = None
    tags: list[str] | None = None
    composer: str | None = None
    lyrics: str | None = None
    copyright_message: str | None = Field(default=None, alias="copyrightMessage")
    wiki: str | None = None
    album_art: BlobRef | None = Field(default=None, alias="albumArt")
    album_art_url: str | None = Field(default=None, alias="albumArtUrl")
    youtube_link: str | None = Field(default=None, alias="youtubeLink")
    spotify_link: str | None = Field(default=None, alias="spotifyLink")
    tidal_link: str | None = Field(default=None, alias="tidalLink")
    apple_music_link: str | None = Field(default=None, alias="appleMusicLink")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    mbid: str | None = None
    label: str | None = None
    isrc: str | None = None


class SongViewBasic(RockskyModel):
    id: str | None = None
    title: str | None = None
    artist: str | None = None
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = None
    album: str | None = None
    duration: int | None = None
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    sha256: str | None = None
    mbid: str | None = None
    isrc: str | None = None
    tags: list[str] | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")


class SongViewDetailed(RockskyModel):
    id: str | None = None
    title: str | None = None
    artist: str | None = None
    album_artist: str | None = Field(default=None, alias="albumArtist")
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = None
    album: str | None = None
    duration: int | None = None
    track_number: int | None = Field(default=None, alias="trackNumber")
    disc_number: int | None = Field(default=None, alias="discNumber")
    play_count: int | None = Field(default=None, alias="playCount")
    unique_listeners: int | None = Field(default=None, alias="uniqueListeners")
    album_uri: str | None = Field(default=None, alias="albumUri")
    artist_uri: str | None = Field(default=None, alias="artistUri")
    sha256: str | None = None
    mbid: str | None = None
    isrc: str | None = None
    tags: list[str] | None = None
    created_at: datetime | None = Field(default=None, alias="createdAt")
    artists: list[ArtistViewBasic] | None = None
    first_scrobble: SongFirstScrobbleView | None = Field(default=None, alias="firstScrobble")


class SpotifyTrackView(RockskyModel):
    id: str | None = None
    name: str | None = None
    artist: str | None = None
    album: str | None = None
    duration: int | None = None
    preview_url: str | None = Field(default=None, alias="previewUrl")


class StartPlaylistParams(RockskyModel):
    uri: str | None = None
    shuffle: bool | None = None
    position: int | None = None


class StatsGlobalStatsView(RockskyModel):
    scrobbles: int | None = None
    users: int | None = None
    artists: int | None = None
    albums: int | None = None
    tracks: int | None = None


class StatsView(RockskyModel):
    scrobbles: int | None = None
    artists: int | None = None
    loved_tracks: int | None = Field(default=None, alias="lovedTracks")
    albums: int | None = None
    tracks: int | None = None


class StatsWrappedAlbum(RockskyModel):
    id: str | None = None
    title: str | None = None
    artist: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")


class StatsWrappedArtist(RockskyModel):
    id: str | None = None
    name: str | None = None
    picture: str | None = None
    uri: str | None = None
    play_count: int | None = Field(default=None, alias="playCount")


class StatsWrappedDayCount(RockskyModel):
    date: str | None = None
    count: int | None = None


class StatsWrappedGenreCount(RockskyModel):
    genre: str | None = None
    count: int | None = None


class StatsWrappedMilestone(RockskyModel):
    track_title: str | None = Field(default=None, alias="trackTitle")
    artist_name: str | None = Field(default=None, alias="artistName")
    timestamp: datetime | None = None
    track_uri: str | None = Field(default=None, alias="trackUri")


class StatsWrappedMonthCount(RockskyModel):
    month: int | None = None
    count: int | None = None


class StatsWrappedTrack(RockskyModel):
    id: str | None = None
    title: str | None = None
    artist: str | None = None
    album_art: str | None = Field(default=None, alias="albumArt")
    uri: str | None = None
    artist_uri: str | None = Field(default=None, alias="artistUri")
    album_uri: str | None = Field(default=None, alias="albumUri")
    play_count: int | None = Field(default=None, alias="playCount")


class StatsWrappedView(RockskyModel):
    year: int | None = None
    total_scrobbles: int | None = Field(default=None, alias="totalScrobbles")
    total_listening_time_minutes: int | None = Field(default=None, alias="totalListeningTimeMinutes")
    top_artists: list[StatsWrappedArtist] | None = Field(default=None, alias="topArtists")
    top_tracks: list[StatsWrappedTrack] | None = Field(default=None, alias="topTracks")
    top_albums: list[StatsWrappedAlbum] | None = Field(default=None, alias="topAlbums")
    top_genres: list[StatsWrappedGenreCount] | None = Field(default=None, alias="topGenres")
    scrobbles_per_month: list[StatsWrappedMonthCount] | None = Field(default=None, alias="scrobblesPerMonth")
    most_active_day: StatsWrappedDayCount | None = Field(default=None, alias="mostActiveDay")
    most_active_hour: int | None = Field(default=None, alias="mostActiveHour")
    new_artists_count: int | None = Field(default=None, alias="newArtistsCount")
    longest_streak: int | None = Field(default=None, alias="longestStreak")
    first_scrobble: StatsWrappedMilestone | None = Field(default=None, alias="firstScrobble")
    last_scrobble: StatsWrappedMilestone | None = Field(default=None, alias="lastScrobble")


class StatusRecord(RockskyModel):
    track: ActorTrackView | None = None
    started_at: datetime | None = Field(default=None, alias="startedAt")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")


class StrongRef(RockskyModel):
    uri: str | None = None
    cid: str | None = None


class UnfollowAccountOutput(RockskyModel):
    subject: ActorProfileViewBasic | None = None
    followers: list[ActorProfileViewBasic] | None = None
    cursor: str | None = None


class UnfollowAccountParams(RockskyModel):
    account: str | None = None


class UpdateApikeyInput(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None


ActorArtistViewBasic.model_rebuild()
ActorCompatibilityViewBasic.model_rebuild()
ActorNeighbourViewBasic.model_rebuild()
ActorProfileViewBasic.model_rebuild()
ActorProfileViewDetailed.model_rebuild()
ActorTrackView.model_rebuild()
AddDirectoryToQueueParams.model_rebuild()
AddItemsToQueueParams.model_rebuild()
AlbumRecord.model_rebuild()
AlbumViewBasic.model_rebuild()
AlbumViewDetailed.model_rebuild()
ApiKeyView.model_rebuild()
ArtistListenerViewBasic.model_rebuild()
ArtistMbid.model_rebuild()
ArtistRecentListenerView.model_rebuild()
ArtistRecord.model_rebuild()
ArtistSongViewBasic.model_rebuild()
ArtistViewBasic.model_rebuild()
ArtistViewDetailed.model_rebuild()
AudioSettingsRecord.model_rebuild()
ChartsScrobbleViewBasic.model_rebuild()
ChartsView.model_rebuild()
CreateApikeyInput.model_rebuild()
CreatePlaylistParams.model_rebuild()
CreateScrobbleInput.model_rebuild()
CreateShoutInput.model_rebuild()
CreateSongInput.model_rebuild()
DescribeFeedGeneratorOutput.model_rebuild()
DescribeFeedGeneratorParams.model_rebuild()
DislikeShoutInput.model_rebuild()
DislikeSongInput.model_rebuild()
DownloadFileParams.model_rebuild()
DropboxFileListView.model_rebuild()
DropboxFileView.model_rebuild()
DropboxTemporaryLinkView.model_rebuild()
FeedGeneratorsView.model_rebuild()
FeedGeneratorView.model_rebuild()
FeedItemView.model_rebuild()
FeedRecommendationsView.model_rebuild()
FeedRecommendationView.model_rebuild()
FeedRecommendedAlbumsView.model_rebuild()
FeedRecommendedAlbumView.model_rebuild()
FeedRecommendedArtistsView.model_rebuild()
FeedRecommendedArtistView.model_rebuild()
FeedSearchResultsView.model_rebuild()
FeedStoriesView.model_rebuild()
FeedStoryView.model_rebuild()
FeedUriView.model_rebuild()
FeedView.model_rebuild()
FollowAccountOutput.model_rebuild()
FollowAccountParams.model_rebuild()
FollowRecord.model_rebuild()
GeneratorRecord.model_rebuild()
GetActorAlbumsOutput.model_rebuild()
GetActorAlbumsParams.model_rebuild()
GetActorArtistsOutput.model_rebuild()
GetActorArtistsParams.model_rebuild()
GetActorCompatibilityOutput.model_rebuild()
GetActorCompatibilityParams.model_rebuild()
GetActorLovedSongsOutput.model_rebuild()
GetActorLovedSongsParams.model_rebuild()
GetActorNeighboursOutput.model_rebuild()
GetActorNeighboursParams.model_rebuild()
GetActorPlaylistsOutput.model_rebuild()
GetActorPlaylistsParams.model_rebuild()
GetActorScrobblesOutput.model_rebuild()
GetActorScrobblesParams.model_rebuild()
GetActorSongsOutput.model_rebuild()
GetActorSongsParams.model_rebuild()
GetAlbumParams.model_rebuild()
GetAlbumRecommendationsParams.model_rebuild()
GetAlbumShoutsOutput.model_rebuild()
GetAlbumShoutsParams.model_rebuild()
GetAlbumsOutput.model_rebuild()
GetAlbumsParams.model_rebuild()
GetAlbumTracksOutput.model_rebuild()
GetAlbumTracksParams.model_rebuild()
GetApikeysOutput.model_rebuild()
GetApikeysParams.model_rebuild()
GetArtistAlbumsOutput.model_rebuild()
GetArtistAlbumsParams.model_rebuild()
GetArtistListenersOutput.model_rebuild()
GetArtistListenersParams.model_rebuild()
GetArtistParams.model_rebuild()
GetArtistRecentListenersOutput.model_rebuild()
GetArtistRecentListenersParams.model_rebuild()
GetArtistRecommendationsParams.model_rebuild()
GetArtistShoutsOutput.model_rebuild()
GetArtistShoutsParams.model_rebuild()
GetArtistsOutput.model_rebuild()
GetArtistsParams.model_rebuild()
GetArtistTracksOutput.model_rebuild()
GetArtistTracksParams.model_rebuild()
GetAudioSettingsParams.model_rebuild()
GetCurrentlyPlayingParams.model_rebuild()
GetFeedGeneratorOutput.model_rebuild()
GetFeedGeneratorParams.model_rebuild()
GetFeedGeneratorsParams.model_rebuild()
GetFeedParams.model_rebuild()
GetFeedSkeletonOutput.model_rebuild()
GetFeedSkeletonParams.model_rebuild()
GetFileParams.model_rebuild()
GetFilesParams.model_rebuild()
GetFollowersOutput.model_rebuild()
GetFollowersParams.model_rebuild()
GetFollowsOutput.model_rebuild()
GetFollowsParams.model_rebuild()
GetGlobalStatsParams.model_rebuild()
GetKnownFollowersOutput.model_rebuild()
GetKnownFollowersParams.model_rebuild()
GetMetadataParams.model_rebuild()
GetMirrorSourcesOutput.model_rebuild()
GetMirrorSourcesParams.model_rebuild()
GetPlaybackQueueParams.model_rebuild()
GetPlaylistParams.model_rebuild()
GetPlaylistsOutput.model_rebuild()
GetPlaylistsParams.model_rebuild()
GetProfileParams.model_rebuild()
GetProfileShoutsOutput.model_rebuild()
GetProfileShoutsParams.model_rebuild()
GetRecommendationsParams.model_rebuild()
GetScrobbleParams.model_rebuild()
GetScrobblesChartParams.model_rebuild()
GetScrobblesOutput.model_rebuild()
GetScrobblesParams.model_rebuild()
GetShoutRepliesOutput.model_rebuild()
GetShoutRepliesParams.model_rebuild()
GetSongParams.model_rebuild()
GetSongRecentListenersOutput.model_rebuild()
GetSongRecentListenersParams.model_rebuild()
GetSongsOutput.model_rebuild()
GetSongsParams.model_rebuild()
GetStatsParams.model_rebuild()
GetStoriesParams.model_rebuild()
GetTemporaryLinkParams.model_rebuild()
GetTopArtistsOutput.model_rebuild()
GetTopArtistsParams.model_rebuild()
GetTopTracksOutput.model_rebuild()
GetTopTracksParams.model_rebuild()
GetTrackShoutsOutput.model_rebuild()
GetTrackShoutsParams.model_rebuild()
GetWrappedParams.model_rebuild()
GoogledriveFileListView.model_rebuild()
GoogledriveFileView.model_rebuild()
GraphNotFoundActor.model_rebuild()
GraphRelationship.model_rebuild()
InsertDirectoryParams.model_rebuild()
InsertFilesParams.model_rebuild()
LikeRecord.model_rebuild()
LikeShoutInput.model_rebuild()
LikeSongInput.model_rebuild()
MatchSongParams.model_rebuild()
MirrorSourceView.model_rebuild()
NextParams.model_rebuild()
PauseParams.model_rebuild()
PlayDirectoryParams.model_rebuild()
PlayerCurrentlyPlayingViewDetailed.model_rebuild()
PlayerPlaybackQueueViewDetailed.model_rebuild()
PlayFileParams.model_rebuild()
PlaylistItemRecord.model_rebuild()
PlaylistRecord.model_rebuild()
PlaylistViewBasic.model_rebuild()
PlaylistViewDetailed.model_rebuild()
PlayParams.model_rebuild()
PreviousParams.model_rebuild()
ProfileRecord.model_rebuild()
PutAudioSettingsInput.model_rebuild()
PutMirrorSourceInput.model_rebuild()
RadioRecord.model_rebuild()
RadioViewBasic.model_rebuild()
RadioViewDetailed.model_rebuild()
RemoveApikeyParams.model_rebuild()
RemovePlaylistParams.model_rebuild()
RemoveShoutParams.model_rebuild()
RemoveTrackParams.model_rebuild()
ReplyShoutInput.model_rebuild()
ReportShoutInput.model_rebuild()
RockboxCrossfadeSettings.model_rebuild()
RockboxEqualizerBand.model_rebuild()
RockboxEqualizerSettings.model_rebuild()
RockboxReplayGainSettings.model_rebuild()
RockboxSettingsView.model_rebuild()
RockboxToneSettings.model_rebuild()
ScrobbleFirstScrobbleView.model_rebuild()
ScrobbleRecord.model_rebuild()
ScrobbleViewBasic.model_rebuild()
ScrobbleViewDetailed.model_rebuild()
SearchParams.model_rebuild()
SeekParams.model_rebuild()
ShoutAuthor.model_rebuild()
ShoutRecord.model_rebuild()
ShoutView.model_rebuild()
SongFirstScrobbleView.model_rebuild()
SongRecentListenerView.model_rebuild()
SongRecord.model_rebuild()
SongViewBasic.model_rebuild()
SongViewDetailed.model_rebuild()
SpotifyTrackView.model_rebuild()
StartPlaylistParams.model_rebuild()
StatsGlobalStatsView.model_rebuild()
StatsView.model_rebuild()
StatsWrappedAlbum.model_rebuild()
StatsWrappedArtist.model_rebuild()
StatsWrappedDayCount.model_rebuild()
StatsWrappedGenreCount.model_rebuild()
StatsWrappedMilestone.model_rebuild()
StatsWrappedMonthCount.model_rebuild()
StatsWrappedTrack.model_rebuild()
StatsWrappedView.model_rebuild()
StatusRecord.model_rebuild()
StrongRef.model_rebuild()
UnfollowAccountOutput.model_rebuild()
UnfollowAccountParams.model_rebuild()
UpdateApikeyInput.model_rebuild()
