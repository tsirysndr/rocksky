// AUTO-GENERATED from apps/api/lexicons. Do not edit.
// Regenerate: bun tools/lexgen/generate.ts --gleam

import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import rocksky/models
import rocksky/xrpc

/// app.rocksky.actor.getActorAlbums
pub fn actor_get_actor_albums(client: xrpc.Client, params: models.GetActorAlbumsParams) -> Result(models.GetActorAlbumsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorAlbums", models.encode_get_actor_albums_params(params), None, models.get_actor_albums_output_decoder())
}

/// app.rocksky.actor.getActorArtists
pub fn actor_get_actor_artists(client: xrpc.Client, params: models.GetActorArtistsParams) -> Result(models.GetActorArtistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorArtists", models.encode_get_actor_artists_params(params), None, models.get_actor_artists_output_decoder())
}

/// app.rocksky.actor.getActorCompatibility
pub fn actor_get_actor_compatibility(client: xrpc.Client, params: models.GetActorCompatibilityParams) -> Result(models.GetActorCompatibilityOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorCompatibility", models.encode_get_actor_compatibility_params(params), None, models.get_actor_compatibility_output_decoder())
}

/// app.rocksky.actor.getActorLovedSongs
pub fn actor_get_actor_loved_songs(client: xrpc.Client, params: models.GetActorLovedSongsParams) -> Result(models.GetActorLovedSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorLovedSongs", models.encode_get_actor_loved_songs_params(params), None, models.get_actor_loved_songs_output_decoder())
}

/// app.rocksky.actor.getActorNeighbours
pub fn actor_get_actor_neighbours(client: xrpc.Client, params: models.GetActorNeighboursParams) -> Result(models.GetActorNeighboursOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorNeighbours", models.encode_get_actor_neighbours_params(params), None, models.get_actor_neighbours_output_decoder())
}

/// app.rocksky.actor.getActorPlaylists
pub fn actor_get_actor_playlists(client: xrpc.Client, params: models.GetActorPlaylistsParams) -> Result(models.GetActorPlaylistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorPlaylists", models.encode_get_actor_playlists_params(params), None, models.get_actor_playlists_output_decoder())
}

/// app.rocksky.actor.getActorScrobbles
pub fn actor_get_actor_scrobbles(client: xrpc.Client, params: models.GetActorScrobblesParams) -> Result(models.GetActorScrobblesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorScrobbles", models.encode_get_actor_scrobbles_params(params), None, models.get_actor_scrobbles_output_decoder())
}

/// app.rocksky.actor.getActorSongs
pub fn actor_get_actor_songs(client: xrpc.Client, params: models.GetActorSongsParams) -> Result(models.GetActorSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getActorSongs", models.encode_get_actor_songs_params(params), None, models.get_actor_songs_output_decoder())
}

/// app.rocksky.actor.getProfile
pub fn actor_get_profile(client: xrpc.Client, params: models.GetProfileParams) -> Result(models.ActorProfileViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.actor.getProfile", models.encode_get_profile_params(params), None, models.actor_profile_view_detailed_decoder())
}

/// app.rocksky.album.getAlbum
pub fn album_get_album(client: xrpc.Client, params: models.AlbumGetAlbumParams) -> Result(models.AlbumViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.album.getAlbum", models.encode_album_get_album_params(params), None, models.album_view_detailed_decoder())
}

/// app.rocksky.album.getAlbums
pub fn album_get_albums(client: xrpc.Client, params: models.GetAlbumsParams) -> Result(models.GetAlbumsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.album.getAlbums", models.encode_get_albums_params(params), None, models.get_albums_output_decoder())
}

/// app.rocksky.album.getAlbumTracks
pub fn album_get_album_tracks(client: xrpc.Client, params: models.GetAlbumTracksParams) -> Result(models.GetAlbumTracksOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.album.getAlbumTracks", models.encode_get_album_tracks_params(params), None, models.get_album_tracks_output_decoder())
}

/// app.rocksky.apikey.createApikey
pub fn apikey_create_apikey(client: xrpc.Client, input: models.CreateApikeyInput) -> Result(models.ApiKeyView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.apikey.createApikey", json.object([]), Some(models.encode_create_apikey_input(input)), models.api_key_view_decoder())
}

/// app.rocksky.apikey.getApikeys
pub fn apikey_get_apikeys(client: xrpc.Client, params: models.GetApikeysParams) -> Result(models.GetApikeysOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.apikey.getApikeys", models.encode_get_apikeys_params(params), None, models.get_apikeys_output_decoder())
}

/// app.rocksky.apikey.removeApikey
pub fn apikey_remove_apikey(client: xrpc.Client, params: models.RemoveApikeyParams) -> Result(models.ApiKeyView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.apikey.removeApikey", models.encode_remove_apikey_params(params), None, models.api_key_view_decoder())
}

/// app.rocksky.apikey.updateApikey
pub fn apikey_update_apikey(client: xrpc.Client, input: models.UpdateApikeyInput) -> Result(models.ApiKeyView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.apikey.updateApikey", json.object([]), Some(models.encode_update_apikey_input(input)), models.api_key_view_decoder())
}

/// app.rocksky.artist.getArtist
pub fn artist_get_artist(client: xrpc.Client, params: models.ArtistGetArtistParams) -> Result(models.ArtistViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtist", models.encode_artist_get_artist_params(params), None, models.artist_view_detailed_decoder())
}

/// app.rocksky.artist.getArtistAlbums
pub fn artist_get_artist_albums(client: xrpc.Client, params: models.GetArtistAlbumsParams) -> Result(models.GetArtistAlbumsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtistAlbums", models.encode_get_artist_albums_params(params), None, models.get_artist_albums_output_decoder())
}

/// app.rocksky.artist.getArtistListeners
pub fn artist_get_artist_listeners(client: xrpc.Client, params: models.GetArtistListenersParams) -> Result(models.GetArtistListenersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtistListeners", models.encode_get_artist_listeners_params(params), None, models.get_artist_listeners_output_decoder())
}

/// app.rocksky.artist.getArtistRecentListeners
pub fn artist_get_artist_recent_listeners(client: xrpc.Client, params: models.GetArtistRecentListenersParams) -> Result(models.GetArtistRecentListenersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtistRecentListeners", models.encode_get_artist_recent_listeners_params(params), None, models.get_artist_recent_listeners_output_decoder())
}

/// app.rocksky.artist.getArtists
pub fn artist_get_artists(client: xrpc.Client, params: models.ArtistGetArtistsParams) -> Result(models.ArtistGetArtistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtists", models.encode_artist_get_artists_params(params), None, models.artist_get_artists_output_decoder())
}

/// app.rocksky.artist.getArtistTracks
pub fn artist_get_artist_tracks(client: xrpc.Client, params: models.GetArtistTracksParams) -> Result(models.GetArtistTracksOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.artist.getArtistTracks", models.encode_get_artist_tracks_params(params), None, models.get_artist_tracks_output_decoder())
}

/// app.rocksky.charts.getDecades
pub fn charts_get_decades(client: xrpc.Client, params: models.GetDecadesParams) -> Result(models.GetDecadesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.charts.getDecades", models.encode_get_decades_params(params), None, models.get_decades_output_decoder())
}

/// app.rocksky.charts.getScrobblesChart
pub fn charts_get_scrobbles_chart(client: xrpc.Client, params: models.GetScrobblesChartParams) -> Result(models.ChartsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.charts.getScrobblesChart", models.encode_get_scrobbles_chart_params(params), None, models.charts_view_decoder())
}

/// app.rocksky.charts.getTopArtists
pub fn charts_get_top_artists(client: xrpc.Client, params: models.GetTopArtistsParams) -> Result(models.GetTopArtistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.charts.getTopArtists", models.encode_get_top_artists_params(params), None, models.get_top_artists_output_decoder())
}

/// app.rocksky.charts.getTopScrobblers
pub fn charts_get_top_scrobblers(client: xrpc.Client, params: models.GetTopScrobblersParams) -> Result(models.GetTopScrobblersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.charts.getTopScrobblers", models.encode_get_top_scrobblers_params(params), None, models.get_top_scrobblers_output_decoder())
}

/// app.rocksky.charts.getTopTracks
pub fn charts_get_top_tracks(client: xrpc.Client, params: models.GetTopTracksParams) -> Result(models.GetTopTracksOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.charts.getTopTracks", models.encode_get_top_tracks_params(params), None, models.get_top_tracks_output_decoder())
}

/// app.rocksky.dropbox.downloadFile
pub fn dropbox_download_file(client: xrpc.Client, params: models.DropboxDownloadFileParams) -> Result(BitArray, xrpc.Error) {
  xrpc.request_bytes(client, xrpc.Get, "app.rocksky.dropbox.downloadFile", models.encode_dropbox_download_file_params(params), None)
}

/// app.rocksky.dropbox.getFiles
pub fn dropbox_get_files(client: xrpc.Client, params: models.DropboxGetFilesParams) -> Result(models.DropboxFileListView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.dropbox.getFiles", models.encode_dropbox_get_files_params(params), None, models.dropbox_file_list_view_decoder())
}

/// app.rocksky.dropbox.getMetadata
pub fn dropbox_get_metadata(client: xrpc.Client, params: models.GetMetadataParams) -> Result(models.GetMetadataOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.dropbox.getMetadata", models.encode_get_metadata_params(params), None, models.get_metadata_output_decoder())
}

/// app.rocksky.dropbox.getTemporaryLink
pub fn dropbox_get_temporary_link(client: xrpc.Client, params: models.GetTemporaryLinkParams) -> Result(models.DropboxTemporaryLinkView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.dropbox.getTemporaryLink", models.encode_get_temporary_link_params(params), None, models.dropbox_temporary_link_view_decoder())
}

/// app.rocksky.equalizer.deletePreset
pub fn equalizer_delete_preset(client: xrpc.Client, params: models.DeletePresetParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.equalizer.deletePreset", models.encode_delete_preset_params(params), None, decode.success(Nil))
}

/// app.rocksky.equalizer.listPresets
pub fn equalizer_list_presets(client: xrpc.Client, params: models.ListPresetsParams) -> Result(models.ListPresetsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.equalizer.listPresets", models.encode_list_presets_params(params), None, models.list_presets_output_decoder())
}

/// app.rocksky.equalizer.putPreset
pub fn equalizer_put_preset(client: xrpc.Client, input: models.PutPresetInput) -> Result(models.EqualizerPresetView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.equalizer.putPreset", json.object([]), Some(models.encode_put_preset_input(input)), models.equalizer_preset_view_decoder())
}

/// app.rocksky.feed.describeFeedGenerator
pub fn feed_describe_feed_generator(client: xrpc.Client) -> Result(models.DescribeFeedGeneratorOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.describeFeedGenerator", json.object([]), None, models.describe_feed_generator_output_decoder())
}

/// app.rocksky.feed.getAlbumRecommendations
pub fn feed_get_album_recommendations(client: xrpc.Client, params: models.GetAlbumRecommendationsParams) -> Result(models.FeedRecommendedAlbumsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getAlbumRecommendations", models.encode_get_album_recommendations_params(params), None, models.feed_recommended_albums_view_decoder())
}

/// app.rocksky.feed.getArtistRecommendations
pub fn feed_get_artist_recommendations(client: xrpc.Client, params: models.GetArtistRecommendationsParams) -> Result(models.FeedRecommendedArtistsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getArtistRecommendations", models.encode_get_artist_recommendations_params(params), None, models.feed_recommended_artists_view_decoder())
}

/// app.rocksky.feed.getFeed
pub fn feed_get_feed(client: xrpc.Client, params: models.GetFeedParams) -> Result(models.FeedView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getFeed", models.encode_get_feed_params(params), None, models.feed_view_decoder())
}

/// app.rocksky.feed.getFeedGenerator
pub fn feed_get_feed_generator(client: xrpc.Client, params: models.GetFeedGeneratorParams) -> Result(models.GetFeedGeneratorOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getFeedGenerator", models.encode_get_feed_generator_params(params), None, models.get_feed_generator_output_decoder())
}

/// app.rocksky.feed.getFeedGenerators
pub fn feed_get_feed_generators(client: xrpc.Client, params: models.GetFeedGeneratorsParams) -> Result(models.FeedGeneratorsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getFeedGenerators", models.encode_get_feed_generators_params(params), None, models.feed_generators_view_decoder())
}

/// app.rocksky.feed.getFeedSkeleton
pub fn feed_get_feed_skeleton(client: xrpc.Client, params: models.GetFeedSkeletonParams) -> Result(models.GetFeedSkeletonOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getFeedSkeleton", models.encode_get_feed_skeleton_params(params), None, models.get_feed_skeleton_output_decoder())
}

/// app.rocksky.feed.getRecommendations
pub fn feed_get_recommendations(client: xrpc.Client, params: models.GetRecommendationsParams) -> Result(models.FeedRecommendationsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getRecommendations", models.encode_get_recommendations_params(params), None, models.feed_recommendations_view_decoder())
}

/// app.rocksky.feed.getStories
pub fn feed_get_stories(client: xrpc.Client, params: models.GetStoriesParams) -> Result(models.FeedStoriesView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.getStories", models.encode_get_stories_params(params), None, models.feed_stories_view_decoder())
}

/// app.rocksky.feed.search
pub fn feed_search(client: xrpc.Client, params: models.FeedSearchParams) -> Result(models.FeedSearchResultsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.feed.search", models.encode_feed_search_params(params), None, models.feed_search_results_view_decoder())
}

/// app.rocksky.googledrive.downloadFile
pub fn googledrive_download_file(client: xrpc.Client, params: models.GoogledriveDownloadFileParams) -> Result(BitArray, xrpc.Error) {
  xrpc.request_bytes(client, xrpc.Get, "app.rocksky.googledrive.downloadFile", models.encode_googledrive_download_file_params(params), None)
}

/// app.rocksky.googledrive.getFile
pub fn googledrive_get_file(client: xrpc.Client, params: models.GetFileParams) -> Result(models.GoogledriveFileView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.googledrive.getFile", models.encode_get_file_params(params), None, models.googledrive_file_view_decoder())
}

/// app.rocksky.googledrive.getFiles
pub fn googledrive_get_files(client: xrpc.Client, params: models.GoogledriveGetFilesParams) -> Result(models.GoogledriveFileListView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.googledrive.getFiles", models.encode_googledrive_get_files_params(params), None, models.googledrive_file_list_view_decoder())
}

/// app.rocksky.graph.followAccount
pub fn graph_follow_account(client: xrpc.Client, params: models.FollowAccountParams) -> Result(models.FollowAccountOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.graph.followAccount", models.encode_follow_account_params(params), None, models.follow_account_output_decoder())
}

/// app.rocksky.graph.getFollowers
pub fn graph_get_followers(client: xrpc.Client, params: models.GetFollowersParams) -> Result(models.GetFollowersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.graph.getFollowers", models.encode_get_followers_params(params), None, models.get_followers_output_decoder())
}

/// app.rocksky.graph.getFollows
pub fn graph_get_follows(client: xrpc.Client, params: models.GetFollowsParams) -> Result(models.GetFollowsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.graph.getFollows", models.encode_get_follows_params(params), None, models.get_follows_output_decoder())
}

/// app.rocksky.graph.getKnownFollowers
pub fn graph_get_known_followers(client: xrpc.Client, params: models.GetKnownFollowersParams) -> Result(models.GetKnownFollowersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.graph.getKnownFollowers", models.encode_get_known_followers_params(params), None, models.get_known_followers_output_decoder())
}

/// app.rocksky.graph.unfollowAccount
pub fn graph_unfollow_account(client: xrpc.Client, params: models.UnfollowAccountParams) -> Result(models.UnfollowAccountOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.graph.unfollowAccount", models.encode_unfollow_account_params(params), None, models.unfollow_account_output_decoder())
}

/// app.rocksky.library.createPlaylist
pub fn library_create_playlist(client: xrpc.Client, input: models.LibraryCreatePlaylistInput) -> Result(models.LibraryCreatePlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.createPlaylist", json.object([]), Some(models.encode_library_create_playlist_input(input)), models.library_create_playlist_output_decoder())
}

/// app.rocksky.library.deleteAlbum
pub fn library_delete_album(client: xrpc.Client, input: models.DeleteAlbumInput) -> Result(models.DeleteAlbumOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.deleteAlbum", json.object([]), Some(models.encode_delete_album_input(input)), models.delete_album_output_decoder())
}

/// app.rocksky.library.deletePlaylist
pub fn library_delete_playlist(client: xrpc.Client, input: models.DeletePlaylistInput) -> Result(models.DeletePlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.deletePlaylist", json.object([]), Some(models.encode_delete_playlist_input(input)), models.delete_playlist_output_decoder())
}

/// app.rocksky.library.deleteSong
pub fn library_delete_song(client: xrpc.Client, input: models.DeleteSongInput) -> Result(models.DeleteSongOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.deleteSong", json.object([]), Some(models.encode_delete_song_input(input)), models.delete_song_output_decoder())
}

/// app.rocksky.library.getAlbum
pub fn library_get_album(client: xrpc.Client, params: models.LibraryGetAlbumParams) -> Result(models.LibraryGetAlbumOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getAlbum", models.encode_library_get_album_params(params), None, models.library_get_album_output_decoder())
}

/// app.rocksky.library.getAlbumInfo
pub fn library_get_album_info(client: xrpc.Client, params: models.GetAlbumInfoParams) -> Result(models.GetAlbumInfoOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getAlbumInfo", models.encode_get_album_info_params(params), None, models.get_album_info_output_decoder())
}

/// app.rocksky.library.getAlbumList
pub fn library_get_album_list(client: xrpc.Client, params: models.GetAlbumListParams) -> Result(models.GetAlbumListOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getAlbumList", models.encode_get_album_list_params(params), None, models.get_album_list_output_decoder())
}

/// app.rocksky.library.getArtist
pub fn library_get_artist(client: xrpc.Client, params: models.LibraryGetArtistParams) -> Result(models.LibraryGetArtistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getArtist", models.encode_library_get_artist_params(params), None, models.library_get_artist_output_decoder())
}

/// app.rocksky.library.getArtistInfo
pub fn library_get_artist_info(client: xrpc.Client, params: models.GetArtistInfoParams) -> Result(models.GetArtistInfoOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getArtistInfo", models.encode_get_artist_info_params(params), None, models.get_artist_info_output_decoder())
}

/// app.rocksky.library.getArtists
pub fn library_get_artists(client: xrpc.Client, params: models.LibraryGetArtistsParams) -> Result(models.LibraryGetArtistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getArtists", models.encode_library_get_artists_params(params), None, models.library_get_artists_output_decoder())
}

/// app.rocksky.library.getCoverArtUrl
pub fn library_get_cover_art_url(client: xrpc.Client, params: models.GetCoverArtUrlParams) -> Result(models.GetCoverArtUrlOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getCoverArtUrl", models.encode_get_cover_art_url_params(params), None, models.get_cover_art_url_output_decoder())
}

/// app.rocksky.library.getDownloadUrl
pub fn library_get_download_url(client: xrpc.Client, params: models.GetDownloadUrlParams) -> Result(models.GetDownloadUrlOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getDownloadUrl", models.encode_get_download_url_params(params), None, models.get_download_url_output_decoder())
}

/// app.rocksky.library.getGenres
pub fn library_get_genres(client: xrpc.Client, params: models.GetGenresParams) -> Result(models.GetGenresOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getGenres", models.encode_get_genres_params(params), None, models.get_genres_output_decoder())
}

/// app.rocksky.library.getIndexes
pub fn library_get_indexes(client: xrpc.Client, params: models.GetIndexesParams) -> Result(models.GetIndexesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getIndexes", models.encode_get_indexes_params(params), None, models.get_indexes_output_decoder())
}

/// app.rocksky.library.getInternetRadioStations
pub fn library_get_internet_radio_stations(client: xrpc.Client, params: models.GetInternetRadioStationsParams) -> Result(models.GetInternetRadioStationsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getInternetRadioStations", models.encode_get_internet_radio_stations_params(params), None, models.get_internet_radio_stations_output_decoder())
}

/// app.rocksky.library.getLicense
pub fn library_get_license(client: xrpc.Client, params: models.GetLicenseParams) -> Result(models.GetLicenseOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getLicense", models.encode_get_license_params(params), None, models.get_license_output_decoder())
}

/// app.rocksky.library.getLyrics
pub fn library_get_lyrics(client: xrpc.Client, params: models.GetLyricsParams) -> Result(models.GetLyricsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getLyrics", models.encode_get_lyrics_params(params), None, models.get_lyrics_output_decoder())
}

/// app.rocksky.library.getMusicDirectory
pub fn library_get_music_directory(client: xrpc.Client, params: models.GetMusicDirectoryParams) -> Result(models.GetMusicDirectoryOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getMusicDirectory", models.encode_get_music_directory_params(params), None, models.get_music_directory_output_decoder())
}

/// app.rocksky.library.getMusicFolders
pub fn library_get_music_folders(client: xrpc.Client, params: models.GetMusicFoldersParams) -> Result(models.GetMusicFoldersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getMusicFolders", models.encode_get_music_folders_params(params), None, models.get_music_folders_output_decoder())
}

/// app.rocksky.library.getNowPlaying
pub fn library_get_now_playing(client: xrpc.Client, params: models.GetNowPlayingParams) -> Result(models.GetNowPlayingOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getNowPlaying", models.encode_get_now_playing_params(params), None, models.get_now_playing_output_decoder())
}

/// app.rocksky.library.getPlaylist
pub fn library_get_playlist(client: xrpc.Client, params: models.LibraryGetPlaylistParams) -> Result(models.LibraryGetPlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getPlaylist", models.encode_library_get_playlist_params(params), None, models.library_get_playlist_output_decoder())
}

/// app.rocksky.library.getPlaylists
pub fn library_get_playlists(client: xrpc.Client, params: models.LibraryGetPlaylistsParams) -> Result(models.LibraryGetPlaylistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getPlaylists", models.encode_library_get_playlists_params(params), None, models.library_get_playlists_output_decoder())
}

/// app.rocksky.library.getPlayQueue
pub fn library_get_play_queue(client: xrpc.Client, params: models.GetPlayQueueParams) -> Result(models.GetPlayQueueOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getPlayQueue", models.encode_get_play_queue_params(params), None, models.get_play_queue_output_decoder())
}

/// app.rocksky.library.getRandomSongs
pub fn library_get_random_songs(client: xrpc.Client, params: models.GetRandomSongsParams) -> Result(models.GetRandomSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getRandomSongs", models.encode_get_random_songs_params(params), None, models.get_random_songs_output_decoder())
}

/// app.rocksky.library.getScanStatus
pub fn library_get_scan_status(client: xrpc.Client, params: models.GetScanStatusParams) -> Result(models.GetScanStatusOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getScanStatus", models.encode_get_scan_status_params(params), None, models.get_scan_status_output_decoder())
}

/// app.rocksky.library.getSimilarSongs
pub fn library_get_similar_songs(client: xrpc.Client, params: models.GetSimilarSongsParams) -> Result(models.GetSimilarSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getSimilarSongs", models.encode_get_similar_songs_params(params), None, models.get_similar_songs_output_decoder())
}

/// app.rocksky.library.getSong
pub fn library_get_song(client: xrpc.Client, params: models.LibraryGetSongParams) -> Result(models.LibraryGetSongOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getSong", models.encode_library_get_song_params(params), None, models.library_get_song_output_decoder())
}

/// app.rocksky.library.getSongsByGenre
pub fn library_get_songs_by_genre(client: xrpc.Client, params: models.GetSongsByGenreParams) -> Result(models.GetSongsByGenreOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getSongsByGenre", models.encode_get_songs_by_genre_params(params), None, models.get_songs_by_genre_output_decoder())
}

/// app.rocksky.library.getStarred
pub fn library_get_starred(client: xrpc.Client, params: models.GetStarredParams) -> Result(models.GetStarredOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getStarred", models.encode_get_starred_params(params), None, models.get_starred_output_decoder())
}

/// app.rocksky.library.getStreamUrl
pub fn library_get_stream_url(client: xrpc.Client, params: models.GetStreamUrlParams) -> Result(models.GetStreamUrlOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getStreamUrl", models.encode_get_stream_url_params(params), None, models.get_stream_url_output_decoder())
}

/// app.rocksky.library.getTopSongs
pub fn library_get_top_songs(client: xrpc.Client, params: models.GetTopSongsParams) -> Result(models.GetTopSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getTopSongs", models.encode_get_top_songs_params(params), None, models.get_top_songs_output_decoder())
}

/// app.rocksky.library.getUser
pub fn library_get_user(client: xrpc.Client, params: models.GetUserParams) -> Result(models.GetUserOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.getUser", models.encode_get_user_params(params), None, models.get_user_output_decoder())
}

/// app.rocksky.library.ping
pub fn library_ping(client: xrpc.Client, params: models.PingParams) -> Result(models.PingOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.ping", models.encode_ping_params(params), None, models.ping_output_decoder())
}

/// app.rocksky.library.savePlayQueue
pub fn library_save_play_queue(client: xrpc.Client, input: models.SavePlayQueueInput) -> Result(models.SavePlayQueueOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.savePlayQueue", json.object([]), Some(models.encode_save_play_queue_input(input)), models.save_play_queue_output_decoder())
}

/// app.rocksky.library.scrobble
pub fn library_scrobble(client: xrpc.Client, input: models.ScrobbleInput) -> Result(models.ScrobbleOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.scrobble", json.object([]), Some(models.encode_scrobble_input(input)), models.scrobble_output_decoder())
}

/// app.rocksky.library.search
pub fn library_search(client: xrpc.Client, params: models.LibrarySearchParams) -> Result(models.LibrarySearchOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.search", models.encode_library_search_params(params), None, models.library_search_output_decoder())
}

/// app.rocksky.library.star
pub fn library_star(client: xrpc.Client, input: models.StarInput) -> Result(models.StarOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.star", json.object([]), Some(models.encode_star_input(input)), models.star_output_decoder())
}

/// app.rocksky.library.startScan
pub fn library_start_scan(client: xrpc.Client, params: models.StartScanParams) -> Result(models.StartScanOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.library.startScan", models.encode_start_scan_params(params), None, models.start_scan_output_decoder())
}

/// app.rocksky.library.unstar
pub fn library_unstar(client: xrpc.Client, input: models.UnstarInput) -> Result(models.UnstarOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.unstar", json.object([]), Some(models.encode_unstar_input(input)), models.unstar_output_decoder())
}

/// app.rocksky.library.updateNowPlaying
pub fn library_update_now_playing(client: xrpc.Client, input: models.UpdateNowPlayingInput) -> Result(models.UpdateNowPlayingOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.updateNowPlaying", json.object([]), Some(models.encode_update_now_playing_input(input)), models.update_now_playing_output_decoder())
}

/// app.rocksky.library.updatePlaylist
pub fn library_update_playlist(client: xrpc.Client, input: models.LibraryUpdatePlaylistInput) -> Result(models.LibraryUpdatePlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.library.updatePlaylist", json.object([]), Some(models.encode_library_update_playlist_input(input)), models.library_update_playlist_output_decoder())
}

/// app.rocksky.like.dislikeShout
pub fn like_dislike_shout(client: xrpc.Client, input: models.DislikeShoutInput) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.like.dislikeShout", json.object([]), Some(models.encode_dislike_shout_input(input)), models.shout_view_decoder())
}

/// app.rocksky.like.dislikeSong
pub fn like_dislike_song(client: xrpc.Client, input: models.DislikeSongInput) -> Result(models.SongViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.like.dislikeSong", json.object([]), Some(models.encode_dislike_song_input(input)), models.song_view_detailed_decoder())
}

/// app.rocksky.like.likeShout
pub fn like_like_shout(client: xrpc.Client, input: models.LikeShoutInput) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.like.likeShout", json.object([]), Some(models.encode_like_shout_input(input)), models.shout_view_decoder())
}

/// app.rocksky.like.likeSong
pub fn like_like_song(client: xrpc.Client, input: models.LikeSongInput) -> Result(models.SongViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.like.likeSong", json.object([]), Some(models.encode_like_song_input(input)), models.song_view_detailed_decoder())
}

/// app.rocksky.mirror.getMirrorSources
pub fn mirror_get_mirror_sources(client: xrpc.Client, params: models.GetMirrorSourcesParams) -> Result(models.GetMirrorSourcesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.mirror.getMirrorSources", models.encode_get_mirror_sources_params(params), None, models.get_mirror_sources_output_decoder())
}

/// app.rocksky.mirror.putMirrorSource
pub fn mirror_put_mirror_source(client: xrpc.Client, input: models.PutMirrorSourceInput) -> Result(models.MirrorSourceView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.mirror.putMirrorSource", json.object([]), Some(models.encode_put_mirror_source_input(input)), models.mirror_source_view_decoder())
}

/// app.rocksky.notification.getUnreadCount
pub fn notification_get_unread_count(client: xrpc.Client) -> Result(models.GetUnreadCountOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.notification.getUnreadCount", json.object([]), None, models.get_unread_count_output_decoder())
}

/// app.rocksky.notification.listNotifications
pub fn notification_list_notifications(client: xrpc.Client, params: models.ListNotificationsParams) -> Result(models.ListNotificationsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.notification.listNotifications", models.encode_list_notifications_params(params), None, models.list_notifications_output_decoder())
}

/// app.rocksky.notification.updateSeen
pub fn notification_update_seen(client: xrpc.Client, input: models.UpdateSeenInput) -> Result(models.UpdateSeenOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.notification.updateSeen", json.object([]), Some(models.encode_update_seen_input(input)), models.update_seen_output_decoder())
}

/// app.rocksky.player.addDirectoryToQueue
pub fn player_add_directory_to_queue(client: xrpc.Client, params: models.AddDirectoryToQueueParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.addDirectoryToQueue", models.encode_add_directory_to_queue_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.addItemsToQueue
pub fn player_add_items_to_queue(client: xrpc.Client, params: models.AddItemsToQueueParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.addItemsToQueue", models.encode_add_items_to_queue_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.getCurrentlyPlaying
pub fn player_get_currently_playing(client: xrpc.Client, params: models.PlayerGetCurrentlyPlayingParams) -> Result(models.PlayerCurrentlyPlayingViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.player.getCurrentlyPlaying", models.encode_player_get_currently_playing_params(params), None, models.player_currently_playing_view_detailed_decoder())
}

/// app.rocksky.player.getPlaybackQueue
pub fn player_get_playback_queue(client: xrpc.Client, params: models.GetPlaybackQueueParams) -> Result(models.PlayerPlaybackQueueViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.player.getPlaybackQueue", models.encode_get_playback_queue_params(params), None, models.player_playback_queue_view_detailed_decoder())
}

/// app.rocksky.player.next
pub fn player_next(client: xrpc.Client, params: models.PlayerNextParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.next", models.encode_player_next_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.pause
pub fn player_pause(client: xrpc.Client, params: models.PlayerPauseParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.pause", models.encode_player_pause_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.play
pub fn player_play(client: xrpc.Client, params: models.PlayerPlayParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.play", models.encode_player_play_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.playDirectory
pub fn player_play_directory(client: xrpc.Client, params: models.PlayDirectoryParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.playDirectory", models.encode_play_directory_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.playFile
pub fn player_play_file(client: xrpc.Client, params: models.PlayFileParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.playFile", models.encode_play_file_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.previous
pub fn player_previous(client: xrpc.Client, params: models.PlayerPreviousParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.previous", models.encode_player_previous_params(params), None, decode.success(Nil))
}

/// app.rocksky.player.seek
pub fn player_seek(client: xrpc.Client, params: models.PlayerSeekParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.player.seek", models.encode_player_seek_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.addSongs
pub fn playlist_add_songs(client: xrpc.Client, params: models.AddSongsParams) -> Result(models.AddSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.addSongs", models.encode_add_songs_params(params), None, models.add_songs_output_decoder())
}

/// app.rocksky.playlist.createPlaylist
pub fn playlist_create_playlist(client: xrpc.Client, params: models.PlaylistCreatePlaylistParams) -> Result(models.PlaylistCreatePlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.createPlaylist", models.encode_playlist_create_playlist_params(params), None, models.playlist_create_playlist_output_decoder())
}

/// app.rocksky.playlist.getPlaylist
pub fn playlist_get_playlist(client: xrpc.Client, params: models.PlaylistGetPlaylistParams) -> Result(models.PlaylistViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.playlist.getPlaylist", models.encode_playlist_get_playlist_params(params), None, models.playlist_view_detailed_decoder())
}

/// app.rocksky.playlist.getPlaylists
pub fn playlist_get_playlists(client: xrpc.Client, params: models.PlaylistGetPlaylistsParams) -> Result(models.PlaylistGetPlaylistsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.playlist.getPlaylists", models.encode_playlist_get_playlists_params(params), None, models.playlist_get_playlists_output_decoder())
}

/// app.rocksky.playlist.insertDirectory
pub fn playlist_insert_directory(client: xrpc.Client, params: models.InsertDirectoryParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.insertDirectory", models.encode_insert_directory_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.insertFiles
pub fn playlist_insert_files(client: xrpc.Client, params: models.InsertFilesParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.insertFiles", models.encode_insert_files_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.removePlaylist
pub fn playlist_remove_playlist(client: xrpc.Client, params: models.RemovePlaylistParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.removePlaylist", models.encode_remove_playlist_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.removeTrack
pub fn playlist_remove_track(client: xrpc.Client, params: models.RemoveTrackParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.removeTrack", models.encode_remove_track_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.startPlaylist
pub fn playlist_start_playlist(client: xrpc.Client, params: models.StartPlaylistParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.startPlaylist", models.encode_start_playlist_params(params), None, decode.success(Nil))
}

/// app.rocksky.playlist.updatePlaylist
pub fn playlist_update_playlist(client: xrpc.Client, params: models.PlaylistUpdatePlaylistParams) -> Result(models.PlaylistUpdatePlaylistOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.playlist.updatePlaylist", models.encode_playlist_update_playlist_params(params), None, models.playlist_update_playlist_output_decoder())
}

/// app.rocksky.rockbox.getAudioSettings
pub fn rockbox_get_audio_settings(client: xrpc.Client, params: models.GetAudioSettingsParams) -> Result(models.RockboxSettingsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.rockbox.getAudioSettings", models.encode_get_audio_settings_params(params), None, models.rockbox_settings_view_decoder())
}

/// app.rocksky.rockbox.putAudioSettings
pub fn rockbox_put_audio_settings(client: xrpc.Client, input: models.PutAudioSettingsInput) -> Result(models.RockboxSettingsView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.rockbox.putAudioSettings", json.object([]), Some(models.encode_put_audio_settings_input(input)), models.rockbox_settings_view_decoder())
}

/// app.rocksky.scrobble.createScrobble
pub fn scrobble_create_scrobble(client: xrpc.Client, input: models.CreateScrobbleInput) -> Result(models.ScrobbleViewBasic, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.scrobble.createScrobble", json.object([]), Some(models.encode_create_scrobble_input(input)), models.scrobble_view_basic_decoder())
}

/// app.rocksky.scrobble.getScrobble
pub fn scrobble_get_scrobble(client: xrpc.Client, params: models.GetScrobbleParams) -> Result(models.ScrobbleViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.scrobble.getScrobble", models.encode_get_scrobble_params(params), None, models.scrobble_view_detailed_decoder())
}

/// app.rocksky.scrobble.getScrobbles
pub fn scrobble_get_scrobbles(client: xrpc.Client, params: models.GetScrobblesParams) -> Result(models.GetScrobblesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.scrobble.getScrobbles", models.encode_get_scrobbles_params(params), None, models.get_scrobbles_output_decoder())
}

/// app.rocksky.shout.createShout
pub fn shout_create_shout(client: xrpc.Client, input: models.CreateShoutInput) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.shout.createShout", json.object([]), Some(models.encode_create_shout_input(input)), models.shout_view_decoder())
}

/// app.rocksky.shout.getAlbumShouts
pub fn shout_get_album_shouts(client: xrpc.Client, params: models.GetAlbumShoutsParams) -> Result(models.GetAlbumShoutsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.shout.getAlbumShouts", models.encode_get_album_shouts_params(params), None, models.get_album_shouts_output_decoder())
}

/// app.rocksky.shout.getArtistShouts
pub fn shout_get_artist_shouts(client: xrpc.Client, params: models.GetArtistShoutsParams) -> Result(models.GetArtistShoutsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.shout.getArtistShouts", models.encode_get_artist_shouts_params(params), None, models.get_artist_shouts_output_decoder())
}

/// app.rocksky.shout.getProfileShouts
pub fn shout_get_profile_shouts(client: xrpc.Client, params: models.GetProfileShoutsParams) -> Result(models.GetProfileShoutsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.shout.getProfileShouts", models.encode_get_profile_shouts_params(params), None, models.get_profile_shouts_output_decoder())
}

/// app.rocksky.shout.getShoutReplies
pub fn shout_get_shout_replies(client: xrpc.Client, params: models.GetShoutRepliesParams) -> Result(models.GetShoutRepliesOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.shout.getShoutReplies", models.encode_get_shout_replies_params(params), None, models.get_shout_replies_output_decoder())
}

/// app.rocksky.shout.getTrackShouts
pub fn shout_get_track_shouts(client: xrpc.Client, params: models.GetTrackShoutsParams) -> Result(models.GetTrackShoutsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.shout.getTrackShouts", models.encode_get_track_shouts_params(params), None, models.get_track_shouts_output_decoder())
}

/// app.rocksky.shout.removeShout
pub fn shout_remove_shout(client: xrpc.Client, params: models.RemoveShoutParams) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.shout.removeShout", models.encode_remove_shout_params(params), None, models.shout_view_decoder())
}

/// app.rocksky.shout.replyShout
pub fn shout_reply_shout(client: xrpc.Client, input: models.ReplyShoutInput) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.shout.replyShout", json.object([]), Some(models.encode_reply_shout_input(input)), models.shout_view_decoder())
}

/// app.rocksky.shout.reportShout
pub fn shout_report_shout(client: xrpc.Client, input: models.ReportShoutInput) -> Result(models.ShoutView, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.shout.reportShout", json.object([]), Some(models.encode_report_shout_input(input)), models.shout_view_decoder())
}

/// app.rocksky.song.createSong
pub fn song_create_song(client: xrpc.Client, input: models.CreateSongInput) -> Result(models.SongViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.song.createSong", json.object([]), Some(models.encode_create_song_input(input)), models.song_view_detailed_decoder())
}

/// app.rocksky.song.getSong
pub fn song_get_song(client: xrpc.Client, params: models.SongGetSongParams) -> Result(models.SongViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.song.getSong", models.encode_song_get_song_params(params), None, models.song_view_detailed_decoder())
}

/// app.rocksky.song.getSongRecentListeners
pub fn song_get_song_recent_listeners(client: xrpc.Client, params: models.GetSongRecentListenersParams) -> Result(models.GetSongRecentListenersOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.song.getSongRecentListeners", models.encode_get_song_recent_listeners_params(params), None, models.get_song_recent_listeners_output_decoder())
}

/// app.rocksky.song.getSongs
pub fn song_get_songs(client: xrpc.Client, params: models.GetSongsParams) -> Result(models.GetSongsOutput, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.song.getSongs", models.encode_get_songs_params(params), None, models.get_songs_output_decoder())
}

/// app.rocksky.song.matchSong
pub fn song_match_song(client: xrpc.Client, params: models.MatchSongParams) -> Result(models.SongViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.song.matchSong", models.encode_match_song_params(params), None, models.song_view_detailed_decoder())
}

/// app.rocksky.spotify.getCurrentlyPlaying
pub fn spotify_get_currently_playing(client: xrpc.Client, params: models.SpotifyGetCurrentlyPlayingParams) -> Result(models.PlayerCurrentlyPlayingViewDetailed, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.spotify.getCurrentlyPlaying", models.encode_spotify_get_currently_playing_params(params), None, models.player_currently_playing_view_detailed_decoder())
}

/// app.rocksky.spotify.next
pub fn spotify_next(client: xrpc.Client) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.spotify.next", json.object([]), None, decode.success(Nil))
}

/// app.rocksky.spotify.pause
pub fn spotify_pause(client: xrpc.Client) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.spotify.pause", json.object([]), None, decode.success(Nil))
}

/// app.rocksky.spotify.play
pub fn spotify_play(client: xrpc.Client) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.spotify.play", json.object([]), None, decode.success(Nil))
}

/// app.rocksky.spotify.previous
pub fn spotify_previous(client: xrpc.Client) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.spotify.previous", json.object([]), None, decode.success(Nil))
}

/// app.rocksky.spotify.seek
pub fn spotify_seek(client: xrpc.Client, params: models.SpotifySeekParams) -> Result(Nil, xrpc.Error) {
  xrpc.request(client, xrpc.Post, "app.rocksky.spotify.seek", models.encode_spotify_seek_params(params), None, decode.success(Nil))
}

/// app.rocksky.stats.getGlobalStats
pub fn stats_get_global_stats(client: xrpc.Client, params: models.GetGlobalStatsParams) -> Result(models.StatsGlobalStatsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.stats.getGlobalStats", models.encode_get_global_stats_params(params), None, models.stats_global_stats_view_decoder())
}

/// app.rocksky.stats.getStats
pub fn stats_get_stats(client: xrpc.Client, params: models.GetStatsParams) -> Result(models.StatsView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.stats.getStats", models.encode_get_stats_params(params), None, models.stats_view_decoder())
}

/// app.rocksky.stats.getWrapped
pub fn stats_get_wrapped(client: xrpc.Client, params: models.GetWrappedParams) -> Result(models.StatsWrappedView, xrpc.Error) {
  xrpc.request(client, xrpc.Get, "app.rocksky.stats.getWrapped", models.encode_get_wrapped_params(params), None, models.stats_wrapped_view_decoder())
}
