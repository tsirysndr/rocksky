// AUTO-GENERATED FILE -- DO NOT EDIT.
// Source: apps/api/lexicons/**/*.json
// Regenerate via: bun run lexgen:types

import gleam/dynamic.{type Dynamic}
import gleam/option.{type Option}

pub type BlobRef {
  BlobRef(
    type_: Option(String),
    ref: Option(BlobCidRef),
    mime_type: Option(String),
    size: Option(Int),
  )
}

pub type BlobCidRef {
  BlobCidRef(link: Option(String))
}


pub type ActorArtistViewBasic {
  ActorArtistViewBasic(
    id: Option(String),
    name: Option(String),
    picture: Option(String),
    uri: Option(String),
    user1_rank: Option(Int),
    user2_rank: Option(Int),
    weight: Option(Int),
  )
}

pub type ActorCompatibilityViewBasic {
  ActorCompatibilityViewBasic(
    compatibility_level: Option(Int),
    compatibility_percentage: Option(Int),
    shared_artists: Option(Int),
    top_shared_artist_names: List(String),
    top_shared_detailed_artists: List(ActorArtistViewBasic),
    user1_artist_count: Option(Int),
    user2_artist_count: Option(Int),
  )
}

pub type ActorNeighbourViewBasic {
  ActorNeighbourViewBasic(
    user_id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    shared_artists_count: Option(Int),
    similarity_score: Option(Int),
    top_shared_artist_names: List(String),
    top_shared_artists_details: List(ArtistViewBasic),
  )
}

pub type ActorProfileViewBasic {
  ActorProfileViewBasic(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    created_at: Option(String),
    updated_at: Option(String),
  )
}

pub type ActorProfileViewDetailed {
  ActorProfileViewDetailed(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    created_at: Option(String),
    updated_at: Option(String),
  )
}

pub type ActorTrackView {
  ActorTrackView(
    name: String,
    artist: String,
    album: Option(String),
    album_cover_url: Option(String),
    duration_ms: Option(Int),
    source: Option(String),
    recording_mb_id: Option(String),
  )
}

pub type AddDirectoryToQueueParams {
  AddDirectoryToQueueParams(
    player_id: Option(String),
    directory: String,
    position: Option(Int),
    shuffle: Option(Bool),
  )
}

pub type AddItemsToQueueParams {
  AddItemsToQueueParams(
    player_id: Option(String),
    items: List(String),
    position: Option(Int),
    shuffle: Option(Bool),
  )
}

pub type AlbumRecord {
  AlbumRecord(
    title: String,
    artist: String,
    duration: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    genre: Option(String),
    album_art: Option(BlobRef),
    album_art_url: Option(String),
    tags: List(String),
    youtube_link: Option(String),
    spotify_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    created_at: String,
  )
}

pub type AlbumViewBasic {
  AlbumViewBasic(
    id: Option(String),
    uri: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    year: Option(Int),
    album_art: Option(String),
    release_date: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
  )
}

pub type AlbumViewDetailed {
  AlbumViewDetailed(
    id: Option(String),
    uri: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    year: Option(Int),
    album_art: Option(String),
    release_date: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    tags: List(String),
    tracks: List(SongViewBasic),
  )
}

pub type ApiKeyView {
  ApiKeyView(
    id: Option(String),
    name: Option(String),
    description: Option(String),
    created_at: Option(String),
  )
}

pub type ArtistListenerViewBasic {
  ArtistListenerViewBasic(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    most_listened_song: Option(ArtistSongViewBasic),
    total_plays: Option(Int),
    rank: Option(Int),
  )
}

pub type ArtistMbid {
  ArtistMbid(
    mbid: Option(String),
    name: Option(String),
  )
}

pub type ArtistRecentListenerView {
  ArtistRecentListenerView(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    timestamp: Option(String),
    scrobble_uri: Option(String),
  )
}

pub type ArtistRecord {
  ArtistRecord(
    name: String,
    bio: Option(String),
    picture: Option(BlobRef),
    picture_url: Option(String),
    tags: List(String),
    born: Option(String),
    died: Option(String),
    born_in: Option(String),
    created_at: String,
  )
}

pub type ArtistSongViewBasic {
  ArtistSongViewBasic(
    uri: Option(String),
    title: Option(String),
    play_count: Option(Int),
  )
}

pub type ArtistViewBasic {
  ArtistViewBasic(
    id: Option(String),
    uri: Option(String),
    name: Option(String),
    picture: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    tags: List(String),
  )
}

pub type ArtistViewDetailed {
  ArtistViewDetailed(
    id: Option(String),
    uri: Option(String),
    name: Option(String),
    picture: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    tags: List(String),
  )
}

pub type AudioSettingsRecord {
  AudioSettingsRecord(
    crossfade: Option(RockboxCrossfadeSettings),
    equalizer: Option(RockboxEqualizerSettings),
    replay_gain: Option(RockboxReplayGainSettings),
    tone: Option(RockboxToneSettings),
    created_at: String,
    updated_at: Option(String),
  )
}

pub type ChartsScrobbleViewBasic {
  ChartsScrobbleViewBasic(
    date: Option(String),
    count: Option(Int),
  )
}

pub type ChartsView {
  ChartsView(
    scrobbles: List(ChartsScrobbleViewBasic),
  )
}

pub type CreateApikeyInput {
  CreateApikeyInput(
    name: String,
    description: Option(String),
  )
}

pub type CreatePlaylistParams {
  CreatePlaylistParams(
    name: String,
    description: Option(String),
  )
}

pub type CreateScrobbleInput {
  CreateScrobbleInput(
    title: String,
    artist: String,
    album: Option(String),
    duration: Option(Int),
    mb_id: Option(String),
    isrc: Option(String),
    album_art: Option(String),
    track_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    disc_number: Option(Int),
    lyrics: Option(String),
    composer: Option(String),
    copyright_message: Option(String),
    label: Option(String),
    artist_picture: Option(String),
    spotify_link: Option(String),
    lastfm_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    youtube_link: Option(String),
    deezer_link: Option(String),
    timestamp: Option(Int),
  )
}

pub type CreateShoutInput {
  CreateShoutInput(
    message: Option(String),
  )
}

pub type CreateSongInput {
  CreateSongInput(
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    duration: Option(Int),
    mb_id: Option(String),
    isrc: Option(String),
    album_art: Option(String),
    track_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    disc_number: Option(Int),
    lyrics: Option(String),
  )
}

pub type DescribeFeedGeneratorOutput {
  DescribeFeedGeneratorOutput(
    did: Option(String),
    feeds: List(FeedUriView),
  )
}

pub type DescribeFeedGeneratorParams {
  DescribeFeedGeneratorParams
}

pub type DislikeShoutInput {
  DislikeShoutInput(
    uri: Option(String),
  )
}

pub type DislikeSongInput {
  DislikeSongInput(
    uri: Option(String),
  )
}

pub type DownloadFileParams {
  DownloadFileParams(
    file_id: String,
  )
}

pub type DropboxFileListView {
  DropboxFileListView(
    files: List(DropboxFileView),
  )
}

pub type DropboxFileView {
  DropboxFileView(
    id: Option(String),
    name: Option(String),
    path_lower: Option(String),
    path_display: Option(String),
    client_modified: Option(String),
    server_modified: Option(String),
  )
}

pub type DropboxTemporaryLinkView {
  DropboxTemporaryLinkView(
    link: Option(String),
  )
}

pub type FeedGeneratorsView {
  FeedGeneratorsView(
    feeds: List(FeedGeneratorView),
  )
}

pub type FeedGeneratorView {
  FeedGeneratorView(
    id: Option(String),
    name: Option(String),
    description: Option(String),
    uri: Option(String),
    avatar: Option(String),
    creator: Option(ActorProfileViewBasic),
  )
}

pub type FeedItemView {
  FeedItemView(
    scrobble: Option(ScrobbleViewBasic),
  )
}

pub type FeedRecommendationsView {
  FeedRecommendationsView(
    recommendations: List(FeedRecommendationView),
    cursor: Option(String),
  )
}

pub type FeedRecommendationView {
  FeedRecommendationView(
    title: Option(String),
    artist: Option(String),
    album: Option(String),
    album_art: Option(String),
    track_uri: Option(String),
    artist_uri: Option(String),
    album_uri: Option(String),
    genres: List(String),
    recommendation_score: Option(Int),
    source: Option(String),
    likes_count: Option(Int),
  )
}

pub type FeedRecommendedAlbumsView {
  FeedRecommendedAlbumsView(
    albums: List(FeedRecommendedAlbumView),
    cursor: Option(String),
  )
}

pub type FeedRecommendedAlbumView {
  FeedRecommendedAlbumView(
    id: Option(String),
    uri: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    year: Option(Int),
    album_art: Option(String),
    recommendation_score: Option(Int),
    source: Option(String),
  )
}

pub type FeedRecommendedArtistsView {
  FeedRecommendedArtistsView(
    artists: List(FeedRecommendedArtistView),
    cursor: Option(String),
  )
}

pub type FeedRecommendedArtistView {
  FeedRecommendedArtistView(
    id: Option(String),
    uri: Option(String),
    name: Option(String),
    picture: Option(String),
    genres: List(String),
    recommendation_score: Option(Int),
    source: Option(String),
  )
}

pub type FeedSearchResultsView {
  FeedSearchResultsView(
    hits: List(Dynamic),
    processing_time_ms: Option(Int),
    limit: Option(Int),
    offset: Option(Int),
    estimated_total_hits: Option(Int),
  )
}

pub type FeedStoriesView {
  FeedStoriesView(
    stories: List(FeedStoryView),
  )
}

pub type FeedStoryView {
  FeedStoryView(
    album: Option(String),
    album_art: Option(String),
    album_artist: Option(String),
    album_uri: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    avatar: Option(String),
    created_at: Option(String),
    did: Option(String),
    handle: Option(String),
    id: Option(String),
    title: Option(String),
    track_id: Option(String),
    track_uri: Option(String),
    uri: Option(String),
  )
}

pub type FeedUriView {
  FeedUriView(
    uri: Option(String),
  )
}

pub type FeedView {
  FeedView(
    feed: List(FeedItemView),
    cursor: Option(String),
  )
}

pub type FollowAccountOutput {
  FollowAccountOutput(
    subject: ActorProfileViewBasic,
    followers: List(ActorProfileViewBasic),
    cursor: Option(String),
  )
}

pub type FollowAccountParams {
  FollowAccountParams(
    account: String,
  )
}

pub type FollowRecord {
  FollowRecord(
    created_at: String,
    subject: String,
    via: Option(StrongRef),
  )
}

pub type GeneratorRecord {
  GeneratorRecord(
    did: String,
    avatar: Option(BlobRef),
    display_name: String,
    description: Option(String),
    created_at: String,
  )
}

pub type GetActorAlbumsOutput {
  GetActorAlbumsOutput(
    albums: List(AlbumViewBasic),
  )
}

pub type GetActorAlbumsParams {
  GetActorAlbumsParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
    start_date: Option(String),
    end_date: Option(String),
  )
}

pub type GetActorArtistsOutput {
  GetActorArtistsOutput(
    artists: List(ArtistViewBasic),
  )
}

pub type GetActorArtistsParams {
  GetActorArtistsParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
    start_date: Option(String),
    end_date: Option(String),
  )
}

pub type GetActorCompatibilityOutput {
  GetActorCompatibilityOutput(
    compatibility: Option(ActorCompatibilityViewBasic),
  )
}

pub type GetActorCompatibilityParams {
  GetActorCompatibilityParams(
    did: String,
  )
}

pub type GetActorLovedSongsOutput {
  GetActorLovedSongsOutput(
    tracks: List(SongViewBasic),
  )
}

pub type GetActorLovedSongsParams {
  GetActorLovedSongsParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetActorNeighboursOutput {
  GetActorNeighboursOutput(
    neighbours: List(ActorNeighbourViewBasic),
  )
}

pub type GetActorNeighboursParams {
  GetActorNeighboursParams(
    did: String,
  )
}

pub type GetActorPlaylistsOutput {
  GetActorPlaylistsOutput(
    playlists: List(PlaylistViewBasic),
  )
}

pub type GetActorPlaylistsParams {
  GetActorPlaylistsParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetActorScrobblesOutput {
  GetActorScrobblesOutput(
    scrobbles: List(ScrobbleViewBasic),
  )
}

pub type GetActorScrobblesParams {
  GetActorScrobblesParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetActorSongsOutput {
  GetActorSongsOutput(
    songs: List(SongViewBasic),
  )
}

pub type GetActorSongsParams {
  GetActorSongsParams(
    did: String,
    limit: Option(Int),
    offset: Option(Int),
    start_date: Option(String),
    end_date: Option(String),
  )
}

pub type GetAlbumParams {
  GetAlbumParams(
    uri: String,
  )
}

pub type GetAlbumRecommendationsParams {
  GetAlbumRecommendationsParams(
    did: String,
    limit: Option(Int),
  )
}

pub type GetAlbumShoutsOutput {
  GetAlbumShoutsOutput(
    shouts: List(Dynamic),
  )
}

pub type GetAlbumShoutsParams {
  GetAlbumShoutsParams(
    uri: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetAlbumsOutput {
  GetAlbumsOutput(
    albums: List(AlbumViewBasic),
  )
}

pub type GetAlbumsParams {
  GetAlbumsParams(
    limit: Option(Int),
    offset: Option(Int),
    genre: Option(String),
  )
}

pub type GetAlbumTracksOutput {
  GetAlbumTracksOutput(
    tracks: List(SongViewBasic),
  )
}

pub type GetAlbumTracksParams {
  GetAlbumTracksParams(
    uri: String,
  )
}

pub type GetApikeysOutput {
  GetApikeysOutput(
    api_keys: List(Dynamic),
  )
}

pub type GetApikeysParams {
  GetApikeysParams(
    offset: Option(Int),
    limit: Option(Int),
  )
}

pub type GetArtistAlbumsOutput {
  GetArtistAlbumsOutput(
    albums: List(AlbumViewBasic),
  )
}

pub type GetArtistAlbumsParams {
  GetArtistAlbumsParams(
    uri: String,
  )
}

pub type GetArtistListenersOutput {
  GetArtistListenersOutput(
    listeners: List(ArtistListenerViewBasic),
  )
}

pub type GetArtistListenersParams {
  GetArtistListenersParams(
    uri: String,
    offset: Option(Int),
    limit: Option(Int),
  )
}

pub type GetArtistParams {
  GetArtistParams(
    uri: String,
  )
}

pub type GetArtistRecentListenersOutput {
  GetArtistRecentListenersOutput(
    listeners: List(ArtistRecentListenerView),
  )
}

pub type GetArtistRecentListenersParams {
  GetArtistRecentListenersParams(
    uri: String,
    offset: Option(Int),
    limit: Option(Int),
  )
}

pub type GetArtistRecommendationsParams {
  GetArtistRecommendationsParams(
    did: String,
    limit: Option(Int),
  )
}

pub type GetArtistShoutsOutput {
  GetArtistShoutsOutput(
    shouts: List(Dynamic),
  )
}

pub type GetArtistShoutsParams {
  GetArtistShoutsParams(
    uri: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetArtistsOutput {
  GetArtistsOutput(
    artists: List(ArtistViewBasic),
  )
}

pub type GetArtistsParams {
  GetArtistsParams(
    limit: Option(Int),
    offset: Option(Int),
    names: Option(String),
    genre: Option(String),
  )
}

pub type GetArtistTracksOutput {
  GetArtistTracksOutput(
    tracks: List(SongViewBasic),
  )
}

pub type GetArtistTracksParams {
  GetArtistTracksParams(
    uri: Option(String),
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetAudioSettingsParams {
  GetAudioSettingsParams(
    did: Option(String),
  )
}

pub type GetCurrentlyPlayingParams {
  GetCurrentlyPlayingParams(
    player_id: Option(String),
    actor: Option(String),
  )
}

pub type GetFeedGeneratorOutput {
  GetFeedGeneratorOutput(
    view: Option(FeedGeneratorView),
  )
}

pub type GetFeedGeneratorParams {
  GetFeedGeneratorParams(
    feed: String,
  )
}

pub type GetFeedGeneratorsParams {
  GetFeedGeneratorsParams(
    size: Option(Int),
  )
}

pub type GetFeedParams {
  GetFeedParams(
    feed: String,
    limit: Option(Int),
    cursor: Option(String),
  )
}

pub type GetFeedSkeletonOutput {
  GetFeedSkeletonOutput(
    scrobbles: List(ScrobbleViewBasic),
    cursor: Option(String),
  )
}

pub type GetFeedSkeletonParams {
  GetFeedSkeletonParams(
    feed: String,
    limit: Option(Int),
    offset: Option(Int),
    cursor: Option(String),
  )
}

pub type GetFileParams {
  GetFileParams(
    file_id: String,
  )
}

pub type GetFilesParams {
  GetFilesParams(
    at: Option(String),
  )
}

pub type GetFollowersOutput {
  GetFollowersOutput(
    subject: ActorProfileViewBasic,
    followers: List(ActorProfileViewBasic),
    cursor: Option(String),
    count: Option(Int),
  )
}

pub type GetFollowersParams {
  GetFollowersParams(
    actor: String,
    limit: Option(Int),
    dids: List(String),
    cursor: Option(String),
  )
}

pub type GetFollowsOutput {
  GetFollowsOutput(
    subject: ActorProfileViewBasic,
    follows: List(ActorProfileViewBasic),
    cursor: Option(String),
    count: Option(Int),
  )
}

pub type GetFollowsParams {
  GetFollowsParams(
    actor: String,
    limit: Option(Int),
    dids: List(String),
    cursor: Option(String),
  )
}

pub type GetGlobalStatsParams {
  GetGlobalStatsParams
}

pub type GetKnownFollowersOutput {
  GetKnownFollowersOutput(
    subject: ActorProfileViewBasic,
    followers: List(ActorProfileViewBasic),
    cursor: Option(String),
  )
}

pub type GetKnownFollowersParams {
  GetKnownFollowersParams(
    actor: String,
    limit: Option(Int),
    cursor: Option(String),
  )
}

pub type GetMetadataParams {
  GetMetadataParams(
    path: String,
  )
}

pub type GetMirrorSourcesOutput {
  GetMirrorSourcesOutput(
    sources: List(MirrorSourceView),
  )
}

pub type GetMirrorSourcesParams {
  GetMirrorSourcesParams
}

pub type GetPlaybackQueueParams {
  GetPlaybackQueueParams(
    player_id: Option(String),
  )
}

pub type GetPlaylistParams {
  GetPlaylistParams(
    uri: String,
  )
}

pub type GetPlaylistsOutput {
  GetPlaylistsOutput(
    playlists: List(PlaylistViewBasic),
  )
}

pub type GetPlaylistsParams {
  GetPlaylistsParams(
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetProfileParams {
  GetProfileParams(
    did: Option(String),
  )
}

pub type GetProfileShoutsOutput {
  GetProfileShoutsOutput(
    shouts: List(Dynamic),
  )
}

pub type GetProfileShoutsParams {
  GetProfileShoutsParams(
    did: String,
    offset: Option(Int),
    limit: Option(Int),
  )
}

pub type GetRecommendationsParams {
  GetRecommendationsParams(
    did: String,
    limit: Option(Int),
  )
}

pub type GetScrobbleParams {
  GetScrobbleParams(
    uri: String,
  )
}

pub type GetScrobblesChartParams {
  GetScrobblesChartParams(
    did: Option(String),
    artisturi: Option(String),
    albumuri: Option(String),
    songuri: Option(String),
    genre: Option(String),
    from: Option(String),
    to: Option(String),
  )
}

pub type GetScrobblesOutput {
  GetScrobblesOutput(
    scrobbles: List(ScrobbleViewBasic),
  )
}

pub type GetScrobblesParams {
  GetScrobblesParams(
    did: Option(String),
    following: Option(Bool),
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetShoutRepliesOutput {
  GetShoutRepliesOutput(
    shouts: List(Dynamic),
  )
}

pub type GetShoutRepliesParams {
  GetShoutRepliesParams(
    uri: String,
    limit: Option(Int),
    offset: Option(Int),
  )
}

pub type GetSongParams {
  GetSongParams(
    uri: Option(String),
    mbid: Option(String),
    isrc: Option(String),
    spotify_id: Option(String),
  )
}

pub type GetSongRecentListenersOutput {
  GetSongRecentListenersOutput(
    listeners: List(SongRecentListenerView),
  )
}

pub type GetSongRecentListenersParams {
  GetSongRecentListenersParams(
    uri: String,
    offset: Option(Int),
    limit: Option(Int),
  )
}

pub type GetSongsOutput {
  GetSongsOutput(
    songs: List(SongViewBasic),
  )
}

pub type GetSongsParams {
  GetSongsParams(
    limit: Option(Int),
    offset: Option(Int),
    genre: Option(String),
    mbid: Option(String),
    isrc: Option(String),
    spotify_id: Option(String),
  )
}

pub type GetStatsParams {
  GetStatsParams(
    did: String,
  )
}

pub type GetStoriesParams {
  GetStoriesParams(
    size: Option(Int),
    feed: Option(String),
    following: Option(Bool),
  )
}

pub type GetTemporaryLinkParams {
  GetTemporaryLinkParams(
    path: String,
  )
}

pub type GetTopArtistsOutput {
  GetTopArtistsOutput(
    artists: List(ArtistViewBasic),
  )
}

pub type GetTopArtistsParams {
  GetTopArtistsParams(
    limit: Option(Int),
    offset: Option(Int),
    start_date: Option(String),
    end_date: Option(String),
  )
}

pub type GetTopTracksOutput {
  GetTopTracksOutput(
    tracks: List(SongViewBasic),
  )
}

pub type GetTopTracksParams {
  GetTopTracksParams(
    limit: Option(Int),
    offset: Option(Int),
    start_date: Option(String),
    end_date: Option(String),
  )
}

pub type GetTrackShoutsOutput {
  GetTrackShoutsOutput(
    shouts: List(Dynamic),
  )
}

pub type GetTrackShoutsParams {
  GetTrackShoutsParams(
    uri: String,
  )
}

pub type GetWrappedParams {
  GetWrappedParams(
    did: String,
    year: Option(Int),
  )
}

pub type GoogledriveFileListView {
  GoogledriveFileListView(
    files: List(GoogledriveFileView),
  )
}

pub type GoogledriveFileView {
  GoogledriveFileView(
    id: Option(String),
  )
}

/// indicates that a handle or DID could not be resolved
pub type GraphNotFoundActor {
  GraphNotFoundActor(
    actor: String,
    not_found: Bool,
  )
}

pub type GraphRelationship {
  GraphRelationship(
    did: String,
    following: Option(String),
    followed_by: Option(String),
  )
}

pub type InsertDirectoryParams {
  InsertDirectoryParams(
    uri: String,
    directory: String,
    position: Option(Int),
  )
}

pub type InsertFilesParams {
  InsertFilesParams(
    uri: String,
    files: List(String),
    position: Option(Int),
  )
}

pub type LikeRecord {
  LikeRecord(
    created_at: String,
    subject: StrongRef,
  )
}

pub type LikeShoutInput {
  LikeShoutInput(
    uri: Option(String),
  )
}

pub type LikeSongInput {
  LikeSongInput(
    uri: Option(String),
  )
}

pub type MatchSongParams {
  MatchSongParams(
    title: String,
    artist: String,
    mb_id: Option(String),
    isrc: Option(String),
  )
}

pub type MirrorSourceView {
  MirrorSourceView(
    provider: String,
    enabled: Bool,
    external_username: Option(String),
    has_credentials: Bool,
    last_polled_at: Option(String),
    last_scrobble_seen_at: Option(String),
  )
}

pub type NextParams {
  NextParams(
    player_id: Option(String),
  )
}

pub type PauseParams {
  PauseParams(
    player_id: Option(String),
  )
}

pub type PlayDirectoryParams {
  PlayDirectoryParams(
    player_id: Option(String),
    directory_id: String,
    shuffle: Option(Bool),
    recurse: Option(Bool),
    position: Option(Int),
  )
}

pub type PlayerCurrentlyPlayingViewDetailed {
  PlayerCurrentlyPlayingViewDetailed(
    title: Option(String),
  )
}

pub type PlayerPlaybackQueueViewDetailed {
  PlayerPlaybackQueueViewDetailed(
    tracks: List(SongViewBasic),
  )
}

pub type PlayFileParams {
  PlayFileParams(
    player_id: Option(String),
    file_id: String,
  )
}

pub type PlaylistItemRecord {
  PlaylistItemRecord(
    subject: StrongRef,
    created_at: String,
    track: SongViewBasic,
    order: Int,
  )
}

pub type PlaylistRecord {
  PlaylistRecord(
    name: String,
    description: Option(String),
    picture: Option(BlobRef),
    picture_url: Option(String),
    created_at: String,
    spotify_link: Option(String),
    tidal_link: Option(String),
    youtube_link: Option(String),
    apple_music_link: Option(String),
  )
}

/// Basic view of a playlist, including its metadata
pub type PlaylistViewBasic {
  PlaylistViewBasic(
    id: Option(String),
    title: Option(String),
    uri: Option(String),
    curator_did: Option(String),
    curator_handle: Option(String),
    curator_name: Option(String),
    curator_avatar_url: Option(String),
    description: Option(String),
    cover_image_url: Option(String),
    created_at: Option(String),
    track_count: Option(Int),
  )
}

/// Detailed view of a playlist, including its tracks and metadata
pub type PlaylistViewDetailed {
  PlaylistViewDetailed(
    id: Option(String),
    title: Option(String),
    uri: Option(String),
    curator_did: Option(String),
    curator_handle: Option(String),
    curator_name: Option(String),
    curator_avatar_url: Option(String),
    description: Option(String),
    cover_image_url: Option(String),
    created_at: Option(String),
    tracks: List(SongViewBasic),
  )
}

pub type PlayParams {
  PlayParams(
    player_id: Option(String),
  )
}

pub type PreviousParams {
  PreviousParams(
    player_id: Option(String),
  )
}

pub type ProfileRecord {
  ProfileRecord(
    display_name: Option(String),
    description: Option(String),
    avatar: Option(BlobRef),
    banner: Option(BlobRef),
    labels: Option(Dynamic),
    joined_via_starter_pack: Option(StrongRef),
    created_at: Option(String),
  )
}

pub type PutAudioSettingsInput {
  PutAudioSettingsInput(
    crossfade: Option(RockboxCrossfadeSettings),
    equalizer: Option(RockboxEqualizerSettings),
    replay_gain: Option(RockboxReplayGainSettings),
    tone: Option(RockboxToneSettings),
  )
}

pub type PutMirrorSourceInput {
  PutMirrorSourceInput(
    provider: String,
    enabled: Option(Bool),
    external_username: Option(String),
    api_key: Option(String),
  )
}

pub type RadioRecord {
  RadioRecord(
    name: String,
    url: String,
    description: Option(String),
    genre: Option(String),
    logo: Option(BlobRef),
    website: Option(String),
    created_at: String,
  )
}

pub type RadioViewBasic {
  RadioViewBasic(
    id: Option(String),
    name: Option(String),
    description: Option(String),
    created_at: Option(String),
  )
}

pub type RadioViewDetailed {
  RadioViewDetailed(
    id: Option(String),
    name: Option(String),
    description: Option(String),
    website: Option(String),
    url: Option(String),
    genre: Option(String),
    logo: Option(String),
    created_at: Option(String),
  )
}

pub type RemoveApikeyParams {
  RemoveApikeyParams(
    id: String,
  )
}

pub type RemovePlaylistParams {
  RemovePlaylistParams(
    uri: String,
  )
}

pub type RemoveShoutParams {
  RemoveShoutParams(
    id: String,
  )
}

pub type RemoveTrackParams {
  RemoveTrackParams(
    uri: String,
    position: Int,
  )
}

pub type ReplyShoutInput {
  ReplyShoutInput(
    shout_id: String,
    message: String,
  )
}

pub type ReportShoutInput {
  ReportShoutInput(
    shout_id: String,
    reason: Option(String),
  )
}

pub type RockboxCrossfadeSettings {
  RockboxCrossfadeSettings(
    mode: Option(String),
    fade_in_delay: Option(Int),
    fade_in_duration: Option(Int),
    fade_out_delay: Option(Int),
    fade_out_duration: Option(Int),
    fade_out_mix_mode: Option(String),
  )
}

pub type RockboxEqualizerBand {
  RockboxEqualizerBand(
    frequency: Int,
    gain: Int,
    q: Int,
  )
}

pub type RockboxEqualizerSettings {
  RockboxEqualizerSettings(
    enabled: Option(Bool),
    precut: Option(Int),
    bands: List(RockboxEqualizerBand),
  )
}

pub type RockboxReplayGainSettings {
  RockboxReplayGainSettings(
    mode: Option(String),
    preamp: Option(Int),
    prevent_clipping: Option(Bool),
  )
}

pub type RockboxSettingsView {
  RockboxSettingsView(
    crossfade: Option(RockboxCrossfadeSettings),
    equalizer: Option(RockboxEqualizerSettings),
    replay_gain: Option(RockboxReplayGainSettings),
    tone: Option(RockboxToneSettings),
    created_at: String,
    updated_at: Option(String),
  )
}

pub type RockboxToneSettings {
  RockboxToneSettings(
    bass: Option(Int),
    treble: Option(Int),
    balance: Option(Int),
    channels: Option(String),
  )
}

pub type ScrobbleFirstScrobbleView {
  ScrobbleFirstScrobbleView(
    handle: Option(String),
    avatar: Option(String),
    timestamp: Option(String),
  )
}

pub type ScrobbleRecord {
  ScrobbleRecord(
    title: String,
    artist: String,
    artists: List(ArtistMbid),
    album_artist: String,
    album: String,
    duration: Int,
    track_number: Option(Int),
    disc_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    genre: Option(String),
    tags: List(String),
    composer: Option(String),
    lyrics: Option(String),
    copyright_message: Option(String),
    wiki: Option(String),
    album_art: Option(BlobRef),
    album_art_url: Option(String),
    youtube_link: Option(String),
    spotify_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    created_at: String,
    mbid: Option(String),
    label: Option(String),
    isrc: Option(String),
  )
}

pub type ScrobbleViewBasic {
  ScrobbleViewBasic(
    id: Option(String),
    user: Option(String),
    user_display_name: Option(String),
    user_avatar: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    album: Option(String),
    album_uri: Option(String),
    cover: Option(String),
    date: Option(String),
    uri: Option(String),
    sha256: Option(String),
    liked: Option(Bool),
    likes_count: Option(Int),
  )
}

pub type ScrobbleViewDetailed {
  ScrobbleViewDetailed(
    id: Option(String),
    user: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    album: Option(String),
    album_uri: Option(String),
    cover: Option(String),
    date: Option(String),
    uri: Option(String),
    sha256: Option(String),
    liked: Option(Bool),
    likes_count: Option(Int),
    listeners: Option(Int),
    scrobbles: Option(Int),
    artists: List(ArtistViewBasic),
    first_scrobble: Option(ScrobbleFirstScrobbleView),
  )
}

pub type SearchParams {
  SearchParams(
    query: String,
  )
}

pub type SeekParams {
  SeekParams(
    player_id: Option(String),
    position: Int,
  )
}

pub type ShoutAuthor {
  ShoutAuthor(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
  )
}

pub type ShoutRecord {
  ShoutRecord(
    message: String,
    created_at: String,
    parent: Option(StrongRef),
    subject: StrongRef,
  )
}

pub type ShoutView {
  ShoutView(
    id: Option(String),
    message: Option(String),
    parent: Option(String),
    created_at: Option(String),
    author: Option(ShoutAuthor),
  )
}

pub type SongFirstScrobbleView {
  SongFirstScrobbleView(
    handle: Option(String),
    avatar: Option(String),
    timestamp: Option(String),
  )
}

pub type SongRecentListenerView {
  SongRecentListenerView(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    timestamp: Option(String),
    scrobble_uri: Option(String),
  )
}

pub type SongRecord {
  SongRecord(
    title: String,
    artist: String,
    artists: List(ArtistMbid),
    album_artist: String,
    album: String,
    duration: Int,
    track_number: Option(Int),
    disc_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    genre: Option(String),
    tags: List(String),
    composer: Option(String),
    lyrics: Option(String),
    copyright_message: Option(String),
    wiki: Option(String),
    album_art: Option(BlobRef),
    album_art_url: Option(String),
    youtube_link: Option(String),
    spotify_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    created_at: String,
    mbid: Option(String),
    label: Option(String),
    isrc: Option(String),
  )
}

pub type SongViewBasic {
  SongViewBasic(
    id: Option(String),
    title: Option(String),
    artist: Option(String),
    album_artist: Option(String),
    album_art: Option(String),
    uri: Option(String),
    album: Option(String),
    duration: Option(Int),
    track_number: Option(Int),
    disc_number: Option(Int),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    album_uri: Option(String),
    artist_uri: Option(String),
    sha256: Option(String),
    mbid: Option(String),
    isrc: Option(String),
    tags: List(String),
    created_at: Option(String),
  )
}

pub type SongViewDetailed {
  SongViewDetailed(
    id: Option(String),
    title: Option(String),
    artist: Option(String),
    album_artist: Option(String),
    album_art: Option(String),
    uri: Option(String),
    album: Option(String),
    duration: Option(Int),
    track_number: Option(Int),
    disc_number: Option(Int),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    album_uri: Option(String),
    artist_uri: Option(String),
    sha256: Option(String),
    mbid: Option(String),
    isrc: Option(String),
    tags: List(String),
    created_at: Option(String),
    artists: List(ArtistViewBasic),
    first_scrobble: Option(SongFirstScrobbleView),
  )
}

pub type SpotifyTrackView {
  SpotifyTrackView(
    id: Option(String),
    name: Option(String),
    artist: Option(String),
    album: Option(String),
    duration: Option(Int),
    preview_url: Option(String),
  )
}

pub type StartPlaylistParams {
  StartPlaylistParams(
    uri: String,
    shuffle: Option(Bool),
    position: Option(Int),
  )
}

pub type StatsGlobalStatsView {
  StatsGlobalStatsView(
    scrobbles: Option(Int),
    users: Option(Int),
    artists: Option(Int),
    albums: Option(Int),
    tracks: Option(Int),
  )
}

pub type StatsView {
  StatsView(
    scrobbles: Option(Int),
    artists: Option(Int),
    loved_tracks: Option(Int),
    albums: Option(Int),
    tracks: Option(Int),
  )
}

pub type StatsWrappedAlbum {
  StatsWrappedAlbum(
    id: Option(String),
    title: Option(String),
    artist: Option(String),
    album_art: Option(String),
    uri: Option(String),
    play_count: Option(Int),
  )
}

pub type StatsWrappedArtist {
  StatsWrappedArtist(
    id: Option(String),
    name: Option(String),
    picture: Option(String),
    uri: Option(String),
    play_count: Option(Int),
  )
}

pub type StatsWrappedDayCount {
  StatsWrappedDayCount(
    date: Option(String),
    count: Option(Int),
  )
}

pub type StatsWrappedGenreCount {
  StatsWrappedGenreCount(
    genre: Option(String),
    count: Option(Int),
  )
}

pub type StatsWrappedMilestone {
  StatsWrappedMilestone(
    track_title: Option(String),
    artist_name: Option(String),
    timestamp: Option(String),
    track_uri: Option(String),
  )
}

pub type StatsWrappedMonthCount {
  StatsWrappedMonthCount(
    month: Option(Int),
    count: Option(Int),
  )
}

pub type StatsWrappedTrack {
  StatsWrappedTrack(
    id: Option(String),
    title: Option(String),
    artist: Option(String),
    album_art: Option(String),
    uri: Option(String),
    artist_uri: Option(String),
    album_uri: Option(String),
    play_count: Option(Int),
  )
}

pub type StatsWrappedView {
  StatsWrappedView(
    year: Option(Int),
    total_scrobbles: Option(Int),
    total_listening_time_minutes: Option(Int),
    top_artists: List(StatsWrappedArtist),
    top_tracks: List(StatsWrappedTrack),
    top_albums: List(StatsWrappedAlbum),
    top_genres: List(StatsWrappedGenreCount),
    scrobbles_per_month: List(StatsWrappedMonthCount),
    most_active_day: Option(StatsWrappedDayCount),
    most_active_hour: Option(Int),
    new_artists_count: Option(Int),
    longest_streak: Option(Int),
    first_scrobble: Option(StatsWrappedMilestone),
    last_scrobble: Option(StatsWrappedMilestone),
  )
}

pub type StatusRecord {
  StatusRecord(
    track: ActorTrackView,
    started_at: String,
    expires_at: Option(String),
  )
}

pub type StrongRef {
  StrongRef(
    uri: String,
    cid: String,
  )
}

pub type UnfollowAccountOutput {
  UnfollowAccountOutput(
    subject: ActorProfileViewBasic,
    followers: List(ActorProfileViewBasic),
    cursor: Option(String),
  )
}

pub type UnfollowAccountParams {
  UnfollowAccountParams(
    account: String,
  )
}

pub type UpdateApikeyInput {
  UpdateApikeyInput(
    id: String,
    name: String,
    description: Option(String),
  )
}
