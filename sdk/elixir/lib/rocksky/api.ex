# Generated from lexicons. Raw transport: Rocksky.Xrpc.raw/5.
defmodule Rocksky.Api do
  @spec actor_get_actor_albums(Rocksky.Xrpc.t(), Rocksky.Models.GetActorAlbumsParams.t()) :: {:ok, Rocksky.Models.GetActorAlbumsOutput.t()} | {:error, term()}
  def actor_get_actor_albums(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorAlbums", Rocksky.Models.GetActorAlbumsParams.encode(params), nil, {:record, Rocksky.Models.GetActorAlbumsOutput})
  end

  @spec actor_get_actor_artists(Rocksky.Xrpc.t(), Rocksky.Models.GetActorArtistsParams.t()) :: {:ok, Rocksky.Models.GetActorArtistsOutput.t()} | {:error, term()}
  def actor_get_actor_artists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorArtists", Rocksky.Models.GetActorArtistsParams.encode(params), nil, {:record, Rocksky.Models.GetActorArtistsOutput})
  end

  @spec actor_get_actor_compatibility(Rocksky.Xrpc.t(), Rocksky.Models.GetActorCompatibilityParams.t()) :: {:ok, Rocksky.Models.GetActorCompatibilityOutput.t()} | {:error, term()}
  def actor_get_actor_compatibility(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorCompatibility", Rocksky.Models.GetActorCompatibilityParams.encode(params), nil, {:record, Rocksky.Models.GetActorCompatibilityOutput})
  end

  @spec actor_get_actor_loved_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetActorLovedSongsParams.t()) :: {:ok, Rocksky.Models.GetActorLovedSongsOutput.t()} | {:error, term()}
  def actor_get_actor_loved_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorLovedSongs", Rocksky.Models.GetActorLovedSongsParams.encode(params), nil, {:record, Rocksky.Models.GetActorLovedSongsOutput})
  end

  @spec actor_get_actor_neighbours(Rocksky.Xrpc.t(), Rocksky.Models.GetActorNeighboursParams.t()) :: {:ok, Rocksky.Models.GetActorNeighboursOutput.t()} | {:error, term()}
  def actor_get_actor_neighbours(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorNeighbours", Rocksky.Models.GetActorNeighboursParams.encode(params), nil, {:record, Rocksky.Models.GetActorNeighboursOutput})
  end

  @spec actor_get_actor_playlists(Rocksky.Xrpc.t(), Rocksky.Models.GetActorPlaylistsParams.t()) :: {:ok, Rocksky.Models.GetActorPlaylistsOutput.t()} | {:error, term()}
  def actor_get_actor_playlists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorPlaylists", Rocksky.Models.GetActorPlaylistsParams.encode(params), nil, {:record, Rocksky.Models.GetActorPlaylistsOutput})
  end

  @spec actor_get_actor_scrobbles(Rocksky.Xrpc.t(), Rocksky.Models.GetActorScrobblesParams.t()) :: {:ok, Rocksky.Models.GetActorScrobblesOutput.t()} | {:error, term()}
  def actor_get_actor_scrobbles(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorScrobbles", Rocksky.Models.GetActorScrobblesParams.encode(params), nil, {:record, Rocksky.Models.GetActorScrobblesOutput})
  end

  @spec actor_get_actor_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetActorSongsParams.t()) :: {:ok, Rocksky.Models.GetActorSongsOutput.t()} | {:error, term()}
  def actor_get_actor_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getActorSongs", Rocksky.Models.GetActorSongsParams.encode(params), nil, {:record, Rocksky.Models.GetActorSongsOutput})
  end

  @spec actor_get_profile(Rocksky.Xrpc.t(), Rocksky.Models.GetProfileParams.t()) :: {:ok, Rocksky.Models.ActorProfileViewDetailed.t()} | {:error, term()}
  def actor_get_profile(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.actor.getProfile", Rocksky.Models.GetProfileParams.encode(params), nil, {:record, Rocksky.Models.ActorProfileViewDetailed})
  end

  @spec album_get_album(Rocksky.Xrpc.t(), Rocksky.Models.AlbumGetAlbumParams.t()) :: {:ok, Rocksky.Models.AlbumViewDetailed.t()} | {:error, term()}
  def album_get_album(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.album.getAlbum", Rocksky.Models.AlbumGetAlbumParams.encode(params), nil, {:record, Rocksky.Models.AlbumViewDetailed})
  end

  @spec album_get_albums(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumsParams.t()) :: {:ok, Rocksky.Models.GetAlbumsOutput.t()} | {:error, term()}
  def album_get_albums(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.album.getAlbums", Rocksky.Models.GetAlbumsParams.encode(params), nil, {:record, Rocksky.Models.GetAlbumsOutput})
  end

  @spec album_get_album_tracks(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumTracksParams.t()) :: {:ok, Rocksky.Models.GetAlbumTracksOutput.t()} | {:error, term()}
  def album_get_album_tracks(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.album.getAlbumTracks", Rocksky.Models.GetAlbumTracksParams.encode(params), nil, {:record, Rocksky.Models.GetAlbumTracksOutput})
  end

  @spec apikey_create_apikey(Rocksky.Xrpc.t(), Rocksky.Models.CreateApikeyInput.t()) :: {:ok, Rocksky.Models.ApiKeyView.t()} | {:error, term()}
  def apikey_create_apikey(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.apikey.createApikey", %{}, Rocksky.Models.CreateApikeyInput.encode(input), {:record, Rocksky.Models.ApiKeyView})
  end

  @spec apikey_get_apikeys(Rocksky.Xrpc.t(), Rocksky.Models.GetApikeysParams.t()) :: {:ok, Rocksky.Models.GetApikeysOutput.t()} | {:error, term()}
  def apikey_get_apikeys(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.apikey.getApikeys", Rocksky.Models.GetApikeysParams.encode(params), nil, {:record, Rocksky.Models.GetApikeysOutput})
  end

  @spec apikey_remove_apikey(Rocksky.Xrpc.t(), Rocksky.Models.RemoveApikeyParams.t()) :: {:ok, Rocksky.Models.ApiKeyView.t()} | {:error, term()}
  def apikey_remove_apikey(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.apikey.removeApikey", Rocksky.Models.RemoveApikeyParams.encode(params), nil, {:record, Rocksky.Models.ApiKeyView})
  end

  @spec apikey_update_apikey(Rocksky.Xrpc.t(), Rocksky.Models.UpdateApikeyInput.t()) :: {:ok, Rocksky.Models.ApiKeyView.t()} | {:error, term()}
  def apikey_update_apikey(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.apikey.updateApikey", %{}, Rocksky.Models.UpdateApikeyInput.encode(input), {:record, Rocksky.Models.ApiKeyView})
  end

  @spec artist_get_artist(Rocksky.Xrpc.t(), Rocksky.Models.ArtistGetArtistParams.t()) :: {:ok, Rocksky.Models.ArtistViewDetailed.t()} | {:error, term()}
  def artist_get_artist(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtist", Rocksky.Models.ArtistGetArtistParams.encode(params), nil, {:record, Rocksky.Models.ArtistViewDetailed})
  end

  @spec artist_get_artist_albums(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistAlbumsParams.t()) :: {:ok, Rocksky.Models.GetArtistAlbumsOutput.t()} | {:error, term()}
  def artist_get_artist_albums(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtistAlbums", Rocksky.Models.GetArtistAlbumsParams.encode(params), nil, {:record, Rocksky.Models.GetArtistAlbumsOutput})
  end

  @spec artist_get_artist_listeners(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistListenersParams.t()) :: {:ok, Rocksky.Models.GetArtistListenersOutput.t()} | {:error, term()}
  def artist_get_artist_listeners(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtistListeners", Rocksky.Models.GetArtistListenersParams.encode(params), nil, {:record, Rocksky.Models.GetArtistListenersOutput})
  end

  @spec artist_get_artist_recent_listeners(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistRecentListenersParams.t()) :: {:ok, Rocksky.Models.GetArtistRecentListenersOutput.t()} | {:error, term()}
  def artist_get_artist_recent_listeners(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtistRecentListeners", Rocksky.Models.GetArtistRecentListenersParams.encode(params), nil, {:record, Rocksky.Models.GetArtistRecentListenersOutput})
  end

  @spec artist_get_artists(Rocksky.Xrpc.t(), Rocksky.Models.ArtistGetArtistsParams.t()) :: {:ok, Rocksky.Models.ArtistGetArtistsOutput.t()} | {:error, term()}
  def artist_get_artists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtists", Rocksky.Models.ArtistGetArtistsParams.encode(params), nil, {:record, Rocksky.Models.ArtistGetArtistsOutput})
  end

  @spec artist_get_artist_tracks(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistTracksParams.t()) :: {:ok, Rocksky.Models.GetArtistTracksOutput.t()} | {:error, term()}
  def artist_get_artist_tracks(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.artist.getArtistTracks", Rocksky.Models.GetArtistTracksParams.encode(params), nil, {:record, Rocksky.Models.GetArtistTracksOutput})
  end

  @spec charts_get_decades(Rocksky.Xrpc.t(), Rocksky.Models.GetDecadesParams.t()) :: {:ok, Rocksky.Models.GetDecadesOutput.t()} | {:error, term()}
  def charts_get_decades(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.charts.getDecades", Rocksky.Models.GetDecadesParams.encode(params), nil, {:record, Rocksky.Models.GetDecadesOutput})
  end

  @spec charts_get_scrobbles_chart(Rocksky.Xrpc.t(), Rocksky.Models.GetScrobblesChartParams.t()) :: {:ok, Rocksky.Models.ChartsView.t()} | {:error, term()}
  def charts_get_scrobbles_chart(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.charts.getScrobblesChart", Rocksky.Models.GetScrobblesChartParams.encode(params), nil, {:record, Rocksky.Models.ChartsView})
  end

  @spec charts_get_top_artists(Rocksky.Xrpc.t(), Rocksky.Models.GetTopArtistsParams.t()) :: {:ok, Rocksky.Models.GetTopArtistsOutput.t()} | {:error, term()}
  def charts_get_top_artists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.charts.getTopArtists", Rocksky.Models.GetTopArtistsParams.encode(params), nil, {:record, Rocksky.Models.GetTopArtistsOutput})
  end

  @spec charts_get_top_scrobblers(Rocksky.Xrpc.t(), Rocksky.Models.GetTopScrobblersParams.t()) :: {:ok, Rocksky.Models.GetTopScrobblersOutput.t()} | {:error, term()}
  def charts_get_top_scrobblers(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.charts.getTopScrobblers", Rocksky.Models.GetTopScrobblersParams.encode(params), nil, {:record, Rocksky.Models.GetTopScrobblersOutput})
  end

  @spec charts_get_top_tracks(Rocksky.Xrpc.t(), Rocksky.Models.GetTopTracksParams.t()) :: {:ok, Rocksky.Models.GetTopTracksOutput.t()} | {:error, term()}
  def charts_get_top_tracks(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.charts.getTopTracks", Rocksky.Models.GetTopTracksParams.encode(params), nil, {:record, Rocksky.Models.GetTopTracksOutput})
  end

  @spec dropbox_download_file(Rocksky.Xrpc.t(), Rocksky.Models.DropboxDownloadFileParams.t()) :: {:ok, binary()} | {:error, term()}
  def dropbox_download_file(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.dropbox.downloadFile", Rocksky.Models.DropboxDownloadFileParams.encode(params), nil, :binary)
  end

  @spec dropbox_get_files(Rocksky.Xrpc.t(), Rocksky.Models.DropboxGetFilesParams.t()) :: {:ok, Rocksky.Models.DropboxFileListView.t()} | {:error, term()}
  def dropbox_get_files(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.dropbox.getFiles", Rocksky.Models.DropboxGetFilesParams.encode(params), nil, {:record, Rocksky.Models.DropboxFileListView})
  end

  @spec dropbox_get_metadata(Rocksky.Xrpc.t(), Rocksky.Models.GetMetadataParams.t()) :: {:ok, Rocksky.Models.GetMetadataOutput.t()} | {:error, term()}
  def dropbox_get_metadata(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.dropbox.getMetadata", Rocksky.Models.GetMetadataParams.encode(params), nil, {:record, Rocksky.Models.GetMetadataOutput})
  end

  @spec dropbox_get_temporary_link(Rocksky.Xrpc.t(), Rocksky.Models.GetTemporaryLinkParams.t()) :: {:ok, Rocksky.Models.DropboxTemporaryLinkView.t()} | {:error, term()}
  def dropbox_get_temporary_link(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.dropbox.getTemporaryLink", Rocksky.Models.GetTemporaryLinkParams.encode(params), nil, {:record, Rocksky.Models.DropboxTemporaryLinkView})
  end

  @spec equalizer_delete_preset(Rocksky.Xrpc.t(), Rocksky.Models.DeletePresetParams.t()) :: {:ok, nil} | {:error, term()}
  def equalizer_delete_preset(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.equalizer.deletePreset", Rocksky.Models.DeletePresetParams.encode(params), nil, :none)
  end

  @spec equalizer_list_presets(Rocksky.Xrpc.t(), Rocksky.Models.ListPresetsParams.t()) :: {:ok, Rocksky.Models.ListPresetsOutput.t()} | {:error, term()}
  def equalizer_list_presets(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.equalizer.listPresets", Rocksky.Models.ListPresetsParams.encode(params), nil, {:record, Rocksky.Models.ListPresetsOutput})
  end

  @spec equalizer_put_preset(Rocksky.Xrpc.t(), Rocksky.Models.PutPresetInput.t()) :: {:ok, Rocksky.Models.EqualizerPresetView.t()} | {:error, term()}
  def equalizer_put_preset(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.equalizer.putPreset", %{}, Rocksky.Models.PutPresetInput.encode(input), {:record, Rocksky.Models.EqualizerPresetView})
  end

  @spec feed_describe_feed_generator(Rocksky.Xrpc.t()) :: {:ok, Rocksky.Models.DescribeFeedGeneratorOutput.t()} | {:error, term()}
  def feed_describe_feed_generator(client) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.describeFeedGenerator", %{}, nil, {:record, Rocksky.Models.DescribeFeedGeneratorOutput})
  end

  @spec feed_get_album_recommendations(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumRecommendationsParams.t()) :: {:ok, Rocksky.Models.FeedRecommendedAlbumsView.t()} | {:error, term()}
  def feed_get_album_recommendations(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getAlbumRecommendations", Rocksky.Models.GetAlbumRecommendationsParams.encode(params), nil, {:record, Rocksky.Models.FeedRecommendedAlbumsView})
  end

  @spec feed_get_artist_recommendations(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistRecommendationsParams.t()) :: {:ok, Rocksky.Models.FeedRecommendedArtistsView.t()} | {:error, term()}
  def feed_get_artist_recommendations(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getArtistRecommendations", Rocksky.Models.GetArtistRecommendationsParams.encode(params), nil, {:record, Rocksky.Models.FeedRecommendedArtistsView})
  end

  @spec feed_get_feed(Rocksky.Xrpc.t(), Rocksky.Models.GetFeedParams.t()) :: {:ok, Rocksky.Models.FeedView.t()} | {:error, term()}
  def feed_get_feed(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getFeed", Rocksky.Models.GetFeedParams.encode(params), nil, {:record, Rocksky.Models.FeedView})
  end

  @spec feed_get_feed_generator(Rocksky.Xrpc.t(), Rocksky.Models.GetFeedGeneratorParams.t()) :: {:ok, Rocksky.Models.GetFeedGeneratorOutput.t()} | {:error, term()}
  def feed_get_feed_generator(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getFeedGenerator", Rocksky.Models.GetFeedGeneratorParams.encode(params), nil, {:record, Rocksky.Models.GetFeedGeneratorOutput})
  end

  @spec feed_get_feed_generators(Rocksky.Xrpc.t(), Rocksky.Models.GetFeedGeneratorsParams.t()) :: {:ok, Rocksky.Models.FeedGeneratorsView.t()} | {:error, term()}
  def feed_get_feed_generators(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getFeedGenerators", Rocksky.Models.GetFeedGeneratorsParams.encode(params), nil, {:record, Rocksky.Models.FeedGeneratorsView})
  end

  @spec feed_get_feed_skeleton(Rocksky.Xrpc.t(), Rocksky.Models.GetFeedSkeletonParams.t()) :: {:ok, Rocksky.Models.GetFeedSkeletonOutput.t()} | {:error, term()}
  def feed_get_feed_skeleton(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getFeedSkeleton", Rocksky.Models.GetFeedSkeletonParams.encode(params), nil, {:record, Rocksky.Models.GetFeedSkeletonOutput})
  end

  @spec feed_get_recommendations(Rocksky.Xrpc.t(), Rocksky.Models.GetRecommendationsParams.t()) :: {:ok, Rocksky.Models.FeedRecommendationsView.t()} | {:error, term()}
  def feed_get_recommendations(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getRecommendations", Rocksky.Models.GetRecommendationsParams.encode(params), nil, {:record, Rocksky.Models.FeedRecommendationsView})
  end

  @spec feed_get_stories(Rocksky.Xrpc.t(), Rocksky.Models.GetStoriesParams.t()) :: {:ok, Rocksky.Models.FeedStoriesView.t()} | {:error, term()}
  def feed_get_stories(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.getStories", Rocksky.Models.GetStoriesParams.encode(params), nil, {:record, Rocksky.Models.FeedStoriesView})
  end

  @spec feed_search(Rocksky.Xrpc.t(), Rocksky.Models.FeedSearchParams.t()) :: {:ok, Rocksky.Models.FeedSearchResultsView.t()} | {:error, term()}
  def feed_search(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.feed.search", Rocksky.Models.FeedSearchParams.encode(params), nil, {:record, Rocksky.Models.FeedSearchResultsView})
  end

  @spec googledrive_download_file(Rocksky.Xrpc.t(), Rocksky.Models.GoogledriveDownloadFileParams.t()) :: {:ok, binary()} | {:error, term()}
  def googledrive_download_file(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.googledrive.downloadFile", Rocksky.Models.GoogledriveDownloadFileParams.encode(params), nil, :binary)
  end

  @spec googledrive_get_file(Rocksky.Xrpc.t(), Rocksky.Models.GetFileParams.t()) :: {:ok, Rocksky.Models.GoogledriveFileView.t()} | {:error, term()}
  def googledrive_get_file(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.googledrive.getFile", Rocksky.Models.GetFileParams.encode(params), nil, {:record, Rocksky.Models.GoogledriveFileView})
  end

  @spec googledrive_get_files(Rocksky.Xrpc.t(), Rocksky.Models.GoogledriveGetFilesParams.t()) :: {:ok, Rocksky.Models.GoogledriveFileListView.t()} | {:error, term()}
  def googledrive_get_files(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.googledrive.getFiles", Rocksky.Models.GoogledriveGetFilesParams.encode(params), nil, {:record, Rocksky.Models.GoogledriveFileListView})
  end

  @spec graph_follow_account(Rocksky.Xrpc.t(), Rocksky.Models.FollowAccountParams.t()) :: {:ok, Rocksky.Models.FollowAccountOutput.t()} | {:error, term()}
  def graph_follow_account(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.graph.followAccount", Rocksky.Models.FollowAccountParams.encode(params), nil, {:record, Rocksky.Models.FollowAccountOutput})
  end

  @spec graph_get_followers(Rocksky.Xrpc.t(), Rocksky.Models.GetFollowersParams.t()) :: {:ok, Rocksky.Models.GetFollowersOutput.t()} | {:error, term()}
  def graph_get_followers(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.graph.getFollowers", Rocksky.Models.GetFollowersParams.encode(params), nil, {:record, Rocksky.Models.GetFollowersOutput})
  end

  @spec graph_get_follows(Rocksky.Xrpc.t(), Rocksky.Models.GetFollowsParams.t()) :: {:ok, Rocksky.Models.GetFollowsOutput.t()} | {:error, term()}
  def graph_get_follows(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.graph.getFollows", Rocksky.Models.GetFollowsParams.encode(params), nil, {:record, Rocksky.Models.GetFollowsOutput})
  end

  @spec graph_get_known_followers(Rocksky.Xrpc.t(), Rocksky.Models.GetKnownFollowersParams.t()) :: {:ok, Rocksky.Models.GetKnownFollowersOutput.t()} | {:error, term()}
  def graph_get_known_followers(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.graph.getKnownFollowers", Rocksky.Models.GetKnownFollowersParams.encode(params), nil, {:record, Rocksky.Models.GetKnownFollowersOutput})
  end

  @spec graph_unfollow_account(Rocksky.Xrpc.t(), Rocksky.Models.UnfollowAccountParams.t()) :: {:ok, Rocksky.Models.UnfollowAccountOutput.t()} | {:error, term()}
  def graph_unfollow_account(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.graph.unfollowAccount", Rocksky.Models.UnfollowAccountParams.encode(params), nil, {:record, Rocksky.Models.UnfollowAccountOutput})
  end

  @spec library_create_playlist(Rocksky.Xrpc.t(), Rocksky.Models.LibraryCreatePlaylistInput.t()) :: {:ok, Rocksky.Models.LibraryCreatePlaylistOutput.t()} | {:error, term()}
  def library_create_playlist(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.createPlaylist", %{}, Rocksky.Models.LibraryCreatePlaylistInput.encode(input), {:record, Rocksky.Models.LibraryCreatePlaylistOutput})
  end

  @spec library_delete_album(Rocksky.Xrpc.t(), Rocksky.Models.DeleteAlbumInput.t()) :: {:ok, Rocksky.Models.DeleteAlbumOutput.t()} | {:error, term()}
  def library_delete_album(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.deleteAlbum", %{}, Rocksky.Models.DeleteAlbumInput.encode(input), {:record, Rocksky.Models.DeleteAlbumOutput})
  end

  @spec library_delete_playlist(Rocksky.Xrpc.t(), Rocksky.Models.DeletePlaylistInput.t()) :: {:ok, Rocksky.Models.DeletePlaylistOutput.t()} | {:error, term()}
  def library_delete_playlist(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.deletePlaylist", %{}, Rocksky.Models.DeletePlaylistInput.encode(input), {:record, Rocksky.Models.DeletePlaylistOutput})
  end

  @spec library_delete_song(Rocksky.Xrpc.t(), Rocksky.Models.DeleteSongInput.t()) :: {:ok, Rocksky.Models.DeleteSongOutput.t()} | {:error, term()}
  def library_delete_song(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.deleteSong", %{}, Rocksky.Models.DeleteSongInput.encode(input), {:record, Rocksky.Models.DeleteSongOutput})
  end

  @spec library_get_album(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetAlbumParams.t()) :: {:ok, Rocksky.Models.LibraryGetAlbumOutput.t()} | {:error, term()}
  def library_get_album(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getAlbum", Rocksky.Models.LibraryGetAlbumParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetAlbumOutput})
  end

  @spec library_get_album_info(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumInfoParams.t()) :: {:ok, Rocksky.Models.GetAlbumInfoOutput.t()} | {:error, term()}
  def library_get_album_info(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getAlbumInfo", Rocksky.Models.GetAlbumInfoParams.encode(params), nil, {:record, Rocksky.Models.GetAlbumInfoOutput})
  end

  @spec library_get_album_list(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumListParams.t()) :: {:ok, Rocksky.Models.GetAlbumListOutput.t()} | {:error, term()}
  def library_get_album_list(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getAlbumList", Rocksky.Models.GetAlbumListParams.encode(params), nil, {:record, Rocksky.Models.GetAlbumListOutput})
  end

  @spec library_get_artist(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetArtistParams.t()) :: {:ok, Rocksky.Models.LibraryGetArtistOutput.t()} | {:error, term()}
  def library_get_artist(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getArtist", Rocksky.Models.LibraryGetArtistParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetArtistOutput})
  end

  @spec library_get_artist_info(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistInfoParams.t()) :: {:ok, Rocksky.Models.GetArtistInfoOutput.t()} | {:error, term()}
  def library_get_artist_info(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getArtistInfo", Rocksky.Models.GetArtistInfoParams.encode(params), nil, {:record, Rocksky.Models.GetArtistInfoOutput})
  end

  @spec library_get_artists(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetArtistsParams.t()) :: {:ok, Rocksky.Models.LibraryGetArtistsOutput.t()} | {:error, term()}
  def library_get_artists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getArtists", Rocksky.Models.LibraryGetArtistsParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetArtistsOutput})
  end

  @spec library_get_cover_art_url(Rocksky.Xrpc.t(), Rocksky.Models.GetCoverArtUrlParams.t()) :: {:ok, Rocksky.Models.GetCoverArtUrlOutput.t()} | {:error, term()}
  def library_get_cover_art_url(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getCoverArtUrl", Rocksky.Models.GetCoverArtUrlParams.encode(params), nil, {:record, Rocksky.Models.GetCoverArtUrlOutput})
  end

  @spec library_get_download_url(Rocksky.Xrpc.t(), Rocksky.Models.GetDownloadUrlParams.t()) :: {:ok, Rocksky.Models.GetDownloadUrlOutput.t()} | {:error, term()}
  def library_get_download_url(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getDownloadUrl", Rocksky.Models.GetDownloadUrlParams.encode(params), nil, {:record, Rocksky.Models.GetDownloadUrlOutput})
  end

  @spec library_get_genres(Rocksky.Xrpc.t(), Rocksky.Models.GetGenresParams.t()) :: {:ok, Rocksky.Models.GetGenresOutput.t()} | {:error, term()}
  def library_get_genres(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getGenres", Rocksky.Models.GetGenresParams.encode(params), nil, {:record, Rocksky.Models.GetGenresOutput})
  end

  @spec library_get_indexes(Rocksky.Xrpc.t(), Rocksky.Models.GetIndexesParams.t()) :: {:ok, Rocksky.Models.GetIndexesOutput.t()} | {:error, term()}
  def library_get_indexes(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getIndexes", Rocksky.Models.GetIndexesParams.encode(params), nil, {:record, Rocksky.Models.GetIndexesOutput})
  end

  @spec library_get_internet_radio_stations(Rocksky.Xrpc.t(), Rocksky.Models.GetInternetRadioStationsParams.t()) :: {:ok, Rocksky.Models.GetInternetRadioStationsOutput.t()} | {:error, term()}
  def library_get_internet_radio_stations(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getInternetRadioStations", Rocksky.Models.GetInternetRadioStationsParams.encode(params), nil, {:record, Rocksky.Models.GetInternetRadioStationsOutput})
  end

  @spec library_get_license(Rocksky.Xrpc.t(), Rocksky.Models.GetLicenseParams.t()) :: {:ok, Rocksky.Models.GetLicenseOutput.t()} | {:error, term()}
  def library_get_license(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getLicense", Rocksky.Models.GetLicenseParams.encode(params), nil, {:record, Rocksky.Models.GetLicenseOutput})
  end

  @spec library_get_lyrics(Rocksky.Xrpc.t(), Rocksky.Models.GetLyricsParams.t()) :: {:ok, Rocksky.Models.GetLyricsOutput.t()} | {:error, term()}
  def library_get_lyrics(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getLyrics", Rocksky.Models.GetLyricsParams.encode(params), nil, {:record, Rocksky.Models.GetLyricsOutput})
  end

  @spec library_get_music_directory(Rocksky.Xrpc.t(), Rocksky.Models.GetMusicDirectoryParams.t()) :: {:ok, Rocksky.Models.GetMusicDirectoryOutput.t()} | {:error, term()}
  def library_get_music_directory(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getMusicDirectory", Rocksky.Models.GetMusicDirectoryParams.encode(params), nil, {:record, Rocksky.Models.GetMusicDirectoryOutput})
  end

  @spec library_get_music_folders(Rocksky.Xrpc.t(), Rocksky.Models.GetMusicFoldersParams.t()) :: {:ok, Rocksky.Models.GetMusicFoldersOutput.t()} | {:error, term()}
  def library_get_music_folders(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getMusicFolders", Rocksky.Models.GetMusicFoldersParams.encode(params), nil, {:record, Rocksky.Models.GetMusicFoldersOutput})
  end

  @spec library_get_now_playing(Rocksky.Xrpc.t(), Rocksky.Models.GetNowPlayingParams.t()) :: {:ok, Rocksky.Models.GetNowPlayingOutput.t()} | {:error, term()}
  def library_get_now_playing(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getNowPlaying", Rocksky.Models.GetNowPlayingParams.encode(params), nil, {:record, Rocksky.Models.GetNowPlayingOutput})
  end

  @spec library_get_playlist(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetPlaylistParams.t()) :: {:ok, Rocksky.Models.LibraryGetPlaylistOutput.t()} | {:error, term()}
  def library_get_playlist(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getPlaylist", Rocksky.Models.LibraryGetPlaylistParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetPlaylistOutput})
  end

  @spec library_get_playlists(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetPlaylistsParams.t()) :: {:ok, Rocksky.Models.LibraryGetPlaylistsOutput.t()} | {:error, term()}
  def library_get_playlists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getPlaylists", Rocksky.Models.LibraryGetPlaylistsParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetPlaylistsOutput})
  end

  @spec library_get_play_queue(Rocksky.Xrpc.t(), Rocksky.Models.GetPlayQueueParams.t()) :: {:ok, Rocksky.Models.GetPlayQueueOutput.t()} | {:error, term()}
  def library_get_play_queue(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getPlayQueue", Rocksky.Models.GetPlayQueueParams.encode(params), nil, {:record, Rocksky.Models.GetPlayQueueOutput})
  end

  @spec library_get_random_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetRandomSongsParams.t()) :: {:ok, Rocksky.Models.GetRandomSongsOutput.t()} | {:error, term()}
  def library_get_random_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getRandomSongs", Rocksky.Models.GetRandomSongsParams.encode(params), nil, {:record, Rocksky.Models.GetRandomSongsOutput})
  end

  @spec library_get_scan_status(Rocksky.Xrpc.t(), Rocksky.Models.GetScanStatusParams.t()) :: {:ok, Rocksky.Models.GetScanStatusOutput.t()} | {:error, term()}
  def library_get_scan_status(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getScanStatus", Rocksky.Models.GetScanStatusParams.encode(params), nil, {:record, Rocksky.Models.GetScanStatusOutput})
  end

  @spec library_get_similar_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetSimilarSongsParams.t()) :: {:ok, Rocksky.Models.GetSimilarSongsOutput.t()} | {:error, term()}
  def library_get_similar_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getSimilarSongs", Rocksky.Models.GetSimilarSongsParams.encode(params), nil, {:record, Rocksky.Models.GetSimilarSongsOutput})
  end

  @spec library_get_song(Rocksky.Xrpc.t(), Rocksky.Models.LibraryGetSongParams.t()) :: {:ok, Rocksky.Models.LibraryGetSongOutput.t()} | {:error, term()}
  def library_get_song(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getSong", Rocksky.Models.LibraryGetSongParams.encode(params), nil, {:record, Rocksky.Models.LibraryGetSongOutput})
  end

  @spec library_get_songs_by_genre(Rocksky.Xrpc.t(), Rocksky.Models.GetSongsByGenreParams.t()) :: {:ok, Rocksky.Models.GetSongsByGenreOutput.t()} | {:error, term()}
  def library_get_songs_by_genre(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getSongsByGenre", Rocksky.Models.GetSongsByGenreParams.encode(params), nil, {:record, Rocksky.Models.GetSongsByGenreOutput})
  end

  @spec library_get_starred(Rocksky.Xrpc.t(), Rocksky.Models.GetStarredParams.t()) :: {:ok, Rocksky.Models.GetStarredOutput.t()} | {:error, term()}
  def library_get_starred(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getStarred", Rocksky.Models.GetStarredParams.encode(params), nil, {:record, Rocksky.Models.GetStarredOutput})
  end

  @spec library_get_stream_url(Rocksky.Xrpc.t(), Rocksky.Models.GetStreamUrlParams.t()) :: {:ok, Rocksky.Models.GetStreamUrlOutput.t()} | {:error, term()}
  def library_get_stream_url(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getStreamUrl", Rocksky.Models.GetStreamUrlParams.encode(params), nil, {:record, Rocksky.Models.GetStreamUrlOutput})
  end

  @spec library_get_top_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetTopSongsParams.t()) :: {:ok, Rocksky.Models.GetTopSongsOutput.t()} | {:error, term()}
  def library_get_top_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getTopSongs", Rocksky.Models.GetTopSongsParams.encode(params), nil, {:record, Rocksky.Models.GetTopSongsOutput})
  end

  @spec library_get_user(Rocksky.Xrpc.t(), Rocksky.Models.GetUserParams.t()) :: {:ok, Rocksky.Models.GetUserOutput.t()} | {:error, term()}
  def library_get_user(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.getUser", Rocksky.Models.GetUserParams.encode(params), nil, {:record, Rocksky.Models.GetUserOutput})
  end

  @spec library_ping(Rocksky.Xrpc.t(), Rocksky.Models.PingParams.t()) :: {:ok, Rocksky.Models.PingOutput.t()} | {:error, term()}
  def library_ping(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.ping", Rocksky.Models.PingParams.encode(params), nil, {:record, Rocksky.Models.PingOutput})
  end

  @spec library_save_play_queue(Rocksky.Xrpc.t(), Rocksky.Models.SavePlayQueueInput.t()) :: {:ok, Rocksky.Models.SavePlayQueueOutput.t()} | {:error, term()}
  def library_save_play_queue(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.savePlayQueue", %{}, Rocksky.Models.SavePlayQueueInput.encode(input), {:record, Rocksky.Models.SavePlayQueueOutput})
  end

  @spec library_scrobble(Rocksky.Xrpc.t(), Rocksky.Models.ScrobbleInput.t()) :: {:ok, Rocksky.Models.ScrobbleOutput.t()} | {:error, term()}
  def library_scrobble(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.scrobble", %{}, Rocksky.Models.ScrobbleInput.encode(input), {:record, Rocksky.Models.ScrobbleOutput})
  end

  @spec library_search(Rocksky.Xrpc.t(), Rocksky.Models.LibrarySearchParams.t()) :: {:ok, Rocksky.Models.LibrarySearchOutput.t()} | {:error, term()}
  def library_search(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.search", Rocksky.Models.LibrarySearchParams.encode(params), nil, {:record, Rocksky.Models.LibrarySearchOutput})
  end

  @spec library_star(Rocksky.Xrpc.t(), Rocksky.Models.StarInput.t()) :: {:ok, Rocksky.Models.StarOutput.t()} | {:error, term()}
  def library_star(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.star", %{}, Rocksky.Models.StarInput.encode(input), {:record, Rocksky.Models.StarOutput})
  end

  @spec library_start_scan(Rocksky.Xrpc.t(), Rocksky.Models.StartScanParams.t()) :: {:ok, Rocksky.Models.StartScanOutput.t()} | {:error, term()}
  def library_start_scan(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.library.startScan", Rocksky.Models.StartScanParams.encode(params), nil, {:record, Rocksky.Models.StartScanOutput})
  end

  @spec library_unstar(Rocksky.Xrpc.t(), Rocksky.Models.UnstarInput.t()) :: {:ok, Rocksky.Models.UnstarOutput.t()} | {:error, term()}
  def library_unstar(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.unstar", %{}, Rocksky.Models.UnstarInput.encode(input), {:record, Rocksky.Models.UnstarOutput})
  end

  @spec library_update_now_playing(Rocksky.Xrpc.t(), Rocksky.Models.UpdateNowPlayingInput.t()) :: {:ok, Rocksky.Models.UpdateNowPlayingOutput.t()} | {:error, term()}
  def library_update_now_playing(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.updateNowPlaying", %{}, Rocksky.Models.UpdateNowPlayingInput.encode(input), {:record, Rocksky.Models.UpdateNowPlayingOutput})
  end

  @spec library_update_playlist(Rocksky.Xrpc.t(), Rocksky.Models.LibraryUpdatePlaylistInput.t()) :: {:ok, Rocksky.Models.LibraryUpdatePlaylistOutput.t()} | {:error, term()}
  def library_update_playlist(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.library.updatePlaylist", %{}, Rocksky.Models.LibraryUpdatePlaylistInput.encode(input), {:record, Rocksky.Models.LibraryUpdatePlaylistOutput})
  end

  @spec like_dislike_shout(Rocksky.Xrpc.t(), Rocksky.Models.DislikeShoutInput.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def like_dislike_shout(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.like.dislikeShout", %{}, Rocksky.Models.DislikeShoutInput.encode(input), {:record, Rocksky.Models.ShoutView})
  end

  @spec like_dislike_song(Rocksky.Xrpc.t(), Rocksky.Models.DislikeSongInput.t()) :: {:ok, Rocksky.Models.SongViewDetailed.t()} | {:error, term()}
  def like_dislike_song(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.like.dislikeSong", %{}, Rocksky.Models.DislikeSongInput.encode(input), {:record, Rocksky.Models.SongViewDetailed})
  end

  @spec like_like_shout(Rocksky.Xrpc.t(), Rocksky.Models.LikeShoutInput.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def like_like_shout(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.like.likeShout", %{}, Rocksky.Models.LikeShoutInput.encode(input), {:record, Rocksky.Models.ShoutView})
  end

  @spec like_like_song(Rocksky.Xrpc.t(), Rocksky.Models.LikeSongInput.t()) :: {:ok, Rocksky.Models.SongViewDetailed.t()} | {:error, term()}
  def like_like_song(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.like.likeSong", %{}, Rocksky.Models.LikeSongInput.encode(input), {:record, Rocksky.Models.SongViewDetailed})
  end

  @spec mirror_get_mirror_sources(Rocksky.Xrpc.t(), Rocksky.Models.GetMirrorSourcesParams.t()) :: {:ok, Rocksky.Models.GetMirrorSourcesOutput.t()} | {:error, term()}
  def mirror_get_mirror_sources(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.mirror.getMirrorSources", Rocksky.Models.GetMirrorSourcesParams.encode(params), nil, {:record, Rocksky.Models.GetMirrorSourcesOutput})
  end

  @spec mirror_put_mirror_source(Rocksky.Xrpc.t(), Rocksky.Models.PutMirrorSourceInput.t()) :: {:ok, Rocksky.Models.MirrorSourceView.t()} | {:error, term()}
  def mirror_put_mirror_source(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.mirror.putMirrorSource", %{}, Rocksky.Models.PutMirrorSourceInput.encode(input), {:record, Rocksky.Models.MirrorSourceView})
  end

  @spec notification_get_unread_count(Rocksky.Xrpc.t()) :: {:ok, Rocksky.Models.GetUnreadCountOutput.t()} | {:error, term()}
  def notification_get_unread_count(client) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.notification.getUnreadCount", %{}, nil, {:record, Rocksky.Models.GetUnreadCountOutput})
  end

  @spec notification_list_notifications(Rocksky.Xrpc.t(), Rocksky.Models.ListNotificationsParams.t()) :: {:ok, Rocksky.Models.ListNotificationsOutput.t()} | {:error, term()}
  def notification_list_notifications(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.notification.listNotifications", Rocksky.Models.ListNotificationsParams.encode(params), nil, {:record, Rocksky.Models.ListNotificationsOutput})
  end

  @spec notification_update_seen(Rocksky.Xrpc.t(), Rocksky.Models.UpdateSeenInput.t()) :: {:ok, Rocksky.Models.UpdateSeenOutput.t()} | {:error, term()}
  def notification_update_seen(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.notification.updateSeen", %{}, Rocksky.Models.UpdateSeenInput.encode(input), {:record, Rocksky.Models.UpdateSeenOutput})
  end

  @spec player_add_directory_to_queue(Rocksky.Xrpc.t(), Rocksky.Models.AddDirectoryToQueueParams.t()) :: {:ok, nil} | {:error, term()}
  def player_add_directory_to_queue(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.addDirectoryToQueue", Rocksky.Models.AddDirectoryToQueueParams.encode(params), nil, :none)
  end

  @spec player_add_items_to_queue(Rocksky.Xrpc.t(), Rocksky.Models.AddItemsToQueueParams.t()) :: {:ok, nil} | {:error, term()}
  def player_add_items_to_queue(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.addItemsToQueue", Rocksky.Models.AddItemsToQueueParams.encode(params), nil, :none)
  end

  @spec player_get_currently_playing(Rocksky.Xrpc.t(), Rocksky.Models.PlayerGetCurrentlyPlayingParams.t()) :: {:ok, Rocksky.Models.PlayerCurrentlyPlayingViewDetailed.t()} | {:error, term()}
  def player_get_currently_playing(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.player.getCurrentlyPlaying", Rocksky.Models.PlayerGetCurrentlyPlayingParams.encode(params), nil, {:record, Rocksky.Models.PlayerCurrentlyPlayingViewDetailed})
  end

  @spec player_get_playback_queue(Rocksky.Xrpc.t(), Rocksky.Models.GetPlaybackQueueParams.t()) :: {:ok, Rocksky.Models.PlayerPlaybackQueueViewDetailed.t()} | {:error, term()}
  def player_get_playback_queue(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.player.getPlaybackQueue", Rocksky.Models.GetPlaybackQueueParams.encode(params), nil, {:record, Rocksky.Models.PlayerPlaybackQueueViewDetailed})
  end

  @spec player_next(Rocksky.Xrpc.t(), Rocksky.Models.PlayerNextParams.t()) :: {:ok, nil} | {:error, term()}
  def player_next(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.next", Rocksky.Models.PlayerNextParams.encode(params), nil, :none)
  end

  @spec player_pause(Rocksky.Xrpc.t(), Rocksky.Models.PlayerPauseParams.t()) :: {:ok, nil} | {:error, term()}
  def player_pause(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.pause", Rocksky.Models.PlayerPauseParams.encode(params), nil, :none)
  end

  @spec player_play(Rocksky.Xrpc.t(), Rocksky.Models.PlayerPlayParams.t()) :: {:ok, nil} | {:error, term()}
  def player_play(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.play", Rocksky.Models.PlayerPlayParams.encode(params), nil, :none)
  end

  @spec player_play_directory(Rocksky.Xrpc.t(), Rocksky.Models.PlayDirectoryParams.t()) :: {:ok, nil} | {:error, term()}
  def player_play_directory(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.playDirectory", Rocksky.Models.PlayDirectoryParams.encode(params), nil, :none)
  end

  @spec player_play_file(Rocksky.Xrpc.t(), Rocksky.Models.PlayFileParams.t()) :: {:ok, nil} | {:error, term()}
  def player_play_file(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.playFile", Rocksky.Models.PlayFileParams.encode(params), nil, :none)
  end

  @spec player_previous(Rocksky.Xrpc.t(), Rocksky.Models.PlayerPreviousParams.t()) :: {:ok, nil} | {:error, term()}
  def player_previous(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.previous", Rocksky.Models.PlayerPreviousParams.encode(params), nil, :none)
  end

  @spec player_seek(Rocksky.Xrpc.t(), Rocksky.Models.PlayerSeekParams.t()) :: {:ok, nil} | {:error, term()}
  def player_seek(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.player.seek", Rocksky.Models.PlayerSeekParams.encode(params), nil, :none)
  end

  @spec playlist_add_songs(Rocksky.Xrpc.t(), Rocksky.Models.AddSongsParams.t()) :: {:ok, Rocksky.Models.AddSongsOutput.t()} | {:error, term()}
  def playlist_add_songs(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.addSongs", Rocksky.Models.AddSongsParams.encode(params), nil, {:record, Rocksky.Models.AddSongsOutput})
  end

  @spec playlist_create_playlist(Rocksky.Xrpc.t(), Rocksky.Models.PlaylistCreatePlaylistParams.t()) :: {:ok, Rocksky.Models.PlaylistCreatePlaylistOutput.t()} | {:error, term()}
  def playlist_create_playlist(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.createPlaylist", Rocksky.Models.PlaylistCreatePlaylistParams.encode(params), nil, {:record, Rocksky.Models.PlaylistCreatePlaylistOutput})
  end

  @spec playlist_get_playlist(Rocksky.Xrpc.t(), Rocksky.Models.PlaylistGetPlaylistParams.t()) :: {:ok, Rocksky.Models.PlaylistViewDetailed.t()} | {:error, term()}
  def playlist_get_playlist(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.playlist.getPlaylist", Rocksky.Models.PlaylistGetPlaylistParams.encode(params), nil, {:record, Rocksky.Models.PlaylistViewDetailed})
  end

  @spec playlist_get_playlists(Rocksky.Xrpc.t(), Rocksky.Models.PlaylistGetPlaylistsParams.t()) :: {:ok, Rocksky.Models.PlaylistGetPlaylistsOutput.t()} | {:error, term()}
  def playlist_get_playlists(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.playlist.getPlaylists", Rocksky.Models.PlaylistGetPlaylistsParams.encode(params), nil, {:record, Rocksky.Models.PlaylistGetPlaylistsOutput})
  end

  @spec playlist_insert_directory(Rocksky.Xrpc.t(), Rocksky.Models.InsertDirectoryParams.t()) :: {:ok, nil} | {:error, term()}
  def playlist_insert_directory(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.insertDirectory", Rocksky.Models.InsertDirectoryParams.encode(params), nil, :none)
  end

  @spec playlist_insert_files(Rocksky.Xrpc.t(), Rocksky.Models.InsertFilesParams.t()) :: {:ok, nil} | {:error, term()}
  def playlist_insert_files(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.insertFiles", Rocksky.Models.InsertFilesParams.encode(params), nil, :none)
  end

  @spec playlist_remove_playlist(Rocksky.Xrpc.t(), Rocksky.Models.RemovePlaylistParams.t()) :: {:ok, nil} | {:error, term()}
  def playlist_remove_playlist(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.removePlaylist", Rocksky.Models.RemovePlaylistParams.encode(params), nil, :none)
  end

  @spec playlist_remove_track(Rocksky.Xrpc.t(), Rocksky.Models.RemoveTrackParams.t()) :: {:ok, nil} | {:error, term()}
  def playlist_remove_track(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.removeTrack", Rocksky.Models.RemoveTrackParams.encode(params), nil, :none)
  end

  @spec playlist_start_playlist(Rocksky.Xrpc.t(), Rocksky.Models.StartPlaylistParams.t()) :: {:ok, nil} | {:error, term()}
  def playlist_start_playlist(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.startPlaylist", Rocksky.Models.StartPlaylistParams.encode(params), nil, :none)
  end

  @spec playlist_update_playlist(Rocksky.Xrpc.t(), Rocksky.Models.PlaylistUpdatePlaylistParams.t()) :: {:ok, Rocksky.Models.PlaylistUpdatePlaylistOutput.t()} | {:error, term()}
  def playlist_update_playlist(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.playlist.updatePlaylist", Rocksky.Models.PlaylistUpdatePlaylistParams.encode(params), nil, {:record, Rocksky.Models.PlaylistUpdatePlaylistOutput})
  end

  @spec rockbox_get_audio_settings(Rocksky.Xrpc.t(), Rocksky.Models.GetAudioSettingsParams.t()) :: {:ok, Rocksky.Models.RockboxSettingsView.t()} | {:error, term()}
  def rockbox_get_audio_settings(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.rockbox.getAudioSettings", Rocksky.Models.GetAudioSettingsParams.encode(params), nil, {:record, Rocksky.Models.RockboxSettingsView})
  end

  @spec rockbox_put_audio_settings(Rocksky.Xrpc.t(), Rocksky.Models.PutAudioSettingsInput.t()) :: {:ok, Rocksky.Models.RockboxSettingsView.t()} | {:error, term()}
  def rockbox_put_audio_settings(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.rockbox.putAudioSettings", %{}, Rocksky.Models.PutAudioSettingsInput.encode(input), {:record, Rocksky.Models.RockboxSettingsView})
  end

  @spec scrobble_create_scrobble(Rocksky.Xrpc.t(), Rocksky.Models.CreateScrobbleInput.t()) :: {:ok, Rocksky.Models.ScrobbleViewBasic.t()} | {:error, term()}
  def scrobble_create_scrobble(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.scrobble.createScrobble", %{}, Rocksky.Models.CreateScrobbleInput.encode(input), {:record, Rocksky.Models.ScrobbleViewBasic})
  end

  @spec scrobble_get_scrobble(Rocksky.Xrpc.t(), Rocksky.Models.GetScrobbleParams.t()) :: {:ok, Rocksky.Models.ScrobbleViewDetailed.t()} | {:error, term()}
  def scrobble_get_scrobble(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.scrobble.getScrobble", Rocksky.Models.GetScrobbleParams.encode(params), nil, {:record, Rocksky.Models.ScrobbleViewDetailed})
  end

  @spec scrobble_get_scrobbles(Rocksky.Xrpc.t(), Rocksky.Models.GetScrobblesParams.t()) :: {:ok, Rocksky.Models.GetScrobblesOutput.t()} | {:error, term()}
  def scrobble_get_scrobbles(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.scrobble.getScrobbles", Rocksky.Models.GetScrobblesParams.encode(params), nil, {:record, Rocksky.Models.GetScrobblesOutput})
  end

  @spec shout_create_shout(Rocksky.Xrpc.t(), Rocksky.Models.CreateShoutInput.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def shout_create_shout(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.shout.createShout", %{}, Rocksky.Models.CreateShoutInput.encode(input), {:record, Rocksky.Models.ShoutView})
  end

  @spec shout_get_album_shouts(Rocksky.Xrpc.t(), Rocksky.Models.GetAlbumShoutsParams.t()) :: {:ok, Rocksky.Models.GetAlbumShoutsOutput.t()} | {:error, term()}
  def shout_get_album_shouts(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.shout.getAlbumShouts", Rocksky.Models.GetAlbumShoutsParams.encode(params), nil, {:record, Rocksky.Models.GetAlbumShoutsOutput})
  end

  @spec shout_get_artist_shouts(Rocksky.Xrpc.t(), Rocksky.Models.GetArtistShoutsParams.t()) :: {:ok, Rocksky.Models.GetArtistShoutsOutput.t()} | {:error, term()}
  def shout_get_artist_shouts(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.shout.getArtistShouts", Rocksky.Models.GetArtistShoutsParams.encode(params), nil, {:record, Rocksky.Models.GetArtistShoutsOutput})
  end

  @spec shout_get_profile_shouts(Rocksky.Xrpc.t(), Rocksky.Models.GetProfileShoutsParams.t()) :: {:ok, Rocksky.Models.GetProfileShoutsOutput.t()} | {:error, term()}
  def shout_get_profile_shouts(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.shout.getProfileShouts", Rocksky.Models.GetProfileShoutsParams.encode(params), nil, {:record, Rocksky.Models.GetProfileShoutsOutput})
  end

  @spec shout_get_shout_replies(Rocksky.Xrpc.t(), Rocksky.Models.GetShoutRepliesParams.t()) :: {:ok, Rocksky.Models.GetShoutRepliesOutput.t()} | {:error, term()}
  def shout_get_shout_replies(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.shout.getShoutReplies", Rocksky.Models.GetShoutRepliesParams.encode(params), nil, {:record, Rocksky.Models.GetShoutRepliesOutput})
  end

  @spec shout_get_track_shouts(Rocksky.Xrpc.t(), Rocksky.Models.GetTrackShoutsParams.t()) :: {:ok, Rocksky.Models.GetTrackShoutsOutput.t()} | {:error, term()}
  def shout_get_track_shouts(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.shout.getTrackShouts", Rocksky.Models.GetTrackShoutsParams.encode(params), nil, {:record, Rocksky.Models.GetTrackShoutsOutput})
  end

  @spec shout_remove_shout(Rocksky.Xrpc.t(), Rocksky.Models.RemoveShoutParams.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def shout_remove_shout(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.shout.removeShout", Rocksky.Models.RemoveShoutParams.encode(params), nil, {:record, Rocksky.Models.ShoutView})
  end

  @spec shout_reply_shout(Rocksky.Xrpc.t(), Rocksky.Models.ReplyShoutInput.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def shout_reply_shout(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.shout.replyShout", %{}, Rocksky.Models.ReplyShoutInput.encode(input), {:record, Rocksky.Models.ShoutView})
  end

  @spec shout_report_shout(Rocksky.Xrpc.t(), Rocksky.Models.ReportShoutInput.t()) :: {:ok, Rocksky.Models.ShoutView.t()} | {:error, term()}
  def shout_report_shout(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.shout.reportShout", %{}, Rocksky.Models.ReportShoutInput.encode(input), {:record, Rocksky.Models.ShoutView})
  end

  @spec song_create_song(Rocksky.Xrpc.t(), Rocksky.Models.CreateSongInput.t()) :: {:ok, Rocksky.Models.SongViewDetailed.t()} | {:error, term()}
  def song_create_song(client, input) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.song.createSong", %{}, Rocksky.Models.CreateSongInput.encode(input), {:record, Rocksky.Models.SongViewDetailed})
  end

  @spec song_get_song(Rocksky.Xrpc.t(), Rocksky.Models.SongGetSongParams.t()) :: {:ok, Rocksky.Models.SongViewDetailed.t()} | {:error, term()}
  def song_get_song(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.song.getSong", Rocksky.Models.SongGetSongParams.encode(params), nil, {:record, Rocksky.Models.SongViewDetailed})
  end

  @spec song_get_song_recent_listeners(Rocksky.Xrpc.t(), Rocksky.Models.GetSongRecentListenersParams.t()) :: {:ok, Rocksky.Models.GetSongRecentListenersOutput.t()} | {:error, term()}
  def song_get_song_recent_listeners(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.song.getSongRecentListeners", Rocksky.Models.GetSongRecentListenersParams.encode(params), nil, {:record, Rocksky.Models.GetSongRecentListenersOutput})
  end

  @spec song_get_songs(Rocksky.Xrpc.t(), Rocksky.Models.GetSongsParams.t()) :: {:ok, Rocksky.Models.GetSongsOutput.t()} | {:error, term()}
  def song_get_songs(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.song.getSongs", Rocksky.Models.GetSongsParams.encode(params), nil, {:record, Rocksky.Models.GetSongsOutput})
  end

  @spec song_match_song(Rocksky.Xrpc.t(), Rocksky.Models.MatchSongParams.t()) :: {:ok, Rocksky.Models.SongViewDetailed.t()} | {:error, term()}
  def song_match_song(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.song.matchSong", Rocksky.Models.MatchSongParams.encode(params), nil, {:record, Rocksky.Models.SongViewDetailed})
  end

  @spec spotify_get_currently_playing(Rocksky.Xrpc.t(), Rocksky.Models.SpotifyGetCurrentlyPlayingParams.t()) :: {:ok, Rocksky.Models.PlayerCurrentlyPlayingViewDetailed.t()} | {:error, term()}
  def spotify_get_currently_playing(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.spotify.getCurrentlyPlaying", Rocksky.Models.SpotifyGetCurrentlyPlayingParams.encode(params), nil, {:record, Rocksky.Models.PlayerCurrentlyPlayingViewDetailed})
  end

  @spec spotify_next(Rocksky.Xrpc.t()) :: {:ok, nil} | {:error, term()}
  def spotify_next(client) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.spotify.next", %{}, nil, :none)
  end

  @spec spotify_pause(Rocksky.Xrpc.t()) :: {:ok, nil} | {:error, term()}
  def spotify_pause(client) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.spotify.pause", %{}, nil, :none)
  end

  @spec spotify_play(Rocksky.Xrpc.t()) :: {:ok, nil} | {:error, term()}
  def spotify_play(client) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.spotify.play", %{}, nil, :none)
  end

  @spec spotify_previous(Rocksky.Xrpc.t()) :: {:ok, nil} | {:error, term()}
  def spotify_previous(client) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.spotify.previous", %{}, nil, :none)
  end

  @spec spotify_seek(Rocksky.Xrpc.t(), Rocksky.Models.SpotifySeekParams.t()) :: {:ok, nil} | {:error, term()}
  def spotify_seek(client, params) do
    Rocksky.Xrpc.request(client, :post, "app.rocksky.spotify.seek", Rocksky.Models.SpotifySeekParams.encode(params), nil, :none)
  end

  @spec stats_get_global_stats(Rocksky.Xrpc.t(), Rocksky.Models.GetGlobalStatsParams.t()) :: {:ok, Rocksky.Models.StatsGlobalStatsView.t()} | {:error, term()}
  def stats_get_global_stats(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.stats.getGlobalStats", Rocksky.Models.GetGlobalStatsParams.encode(params), nil, {:record, Rocksky.Models.StatsGlobalStatsView})
  end

  @spec stats_get_stats(Rocksky.Xrpc.t(), Rocksky.Models.GetStatsParams.t()) :: {:ok, Rocksky.Models.StatsView.t()} | {:error, term()}
  def stats_get_stats(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.stats.getStats", Rocksky.Models.GetStatsParams.encode(params), nil, {:record, Rocksky.Models.StatsView})
  end

  @spec stats_get_wrapped(Rocksky.Xrpc.t(), Rocksky.Models.GetWrappedParams.t()) :: {:ok, Rocksky.Models.StatsWrappedView.t()} | {:error, term()}
  def stats_get_wrapped(client, params) do
    Rocksky.Xrpc.request(client, :get, "app.rocksky.stats.getWrapped", Rocksky.Models.GetWrappedParams.encode(params), nil, {:record, Rocksky.Models.StatsWrappedView})
  end
end
