# Generated from lexicons. Regenerate: bun tools/lexgen/generate.ts --python
from __future__ import annotations

from pydantic import TypeAdapter

from . import models
from .xrpc import XrpcTransport


class XrpcClient(XrpcTransport):
    """Typed XRPC endpoints. Use raw() for status, headers and response bytes."""
    def actor_get_actor_albums(self, params: models.GetActorAlbumsParams) -> models.GetActorAlbumsOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorAlbums", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorAlbumsOutput).validate_json(response.body)

    def actor_get_actor_artists(self, params: models.GetActorArtistsParams) -> models.GetActorArtistsOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorArtists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorArtistsOutput).validate_json(response.body)

    def actor_get_actor_compatibility(self, params: models.GetActorCompatibilityParams) -> models.GetActorCompatibilityOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorCompatibility", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorCompatibilityOutput).validate_json(response.body)

    def actor_get_actor_loved_songs(self, params: models.GetActorLovedSongsParams) -> models.GetActorLovedSongsOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorLovedSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorLovedSongsOutput).validate_json(response.body)

    def actor_get_actor_neighbours(self, params: models.GetActorNeighboursParams) -> models.GetActorNeighboursOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorNeighbours", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorNeighboursOutput).validate_json(response.body)

    def actor_get_actor_playlists(self, params: models.GetActorPlaylistsParams) -> models.GetActorPlaylistsOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorPlaylists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorPlaylistsOutput).validate_json(response.body)

    def actor_get_actor_scrobbles(self, params: models.GetActorScrobblesParams) -> models.GetActorScrobblesOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorScrobbles", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorScrobblesOutput).validate_json(response.body)

    def actor_get_actor_songs(self, params: models.GetActorSongsParams) -> models.GetActorSongsOutput:
        response = self.raw("GET", "app.rocksky.actor.getActorSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetActorSongsOutput).validate_json(response.body)

    def actor_get_profile(self, params: models.GetProfileParams) -> models.ActorProfileViewDetailed:
        response = self.raw("GET", "app.rocksky.actor.getProfile", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ActorProfileViewDetailed).validate_json(response.body)

    def album_get_album(self, params: models.AlbumGetAlbumParams) -> models.AlbumViewDetailed:
        response = self.raw("GET", "app.rocksky.album.getAlbum", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.AlbumViewDetailed).validate_json(response.body)

    def album_get_albums(self, params: models.GetAlbumsParams) -> models.GetAlbumsOutput:
        response = self.raw("GET", "app.rocksky.album.getAlbums", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetAlbumsOutput).validate_json(response.body)

    def album_get_album_tracks(self, params: models.GetAlbumTracksParams) -> models.GetAlbumTracksOutput:
        response = self.raw("GET", "app.rocksky.album.getAlbumTracks", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetAlbumTracksOutput).validate_json(response.body)

    def apikey_create_apikey(self, body: models.CreateApikeyInput) -> models.ApiKeyView:
        response = self.raw("POST", "app.rocksky.apikey.createApikey", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ApiKeyView).validate_json(response.body)

    def apikey_get_apikeys(self, params: models.GetApikeysParams) -> models.GetApikeysOutput:
        response = self.raw("GET", "app.rocksky.apikey.getApikeys", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetApikeysOutput).validate_json(response.body)

    def apikey_remove_apikey(self, params: models.RemoveApikeyParams) -> models.ApiKeyView:
        response = self.raw("POST", "app.rocksky.apikey.removeApikey", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ApiKeyView).validate_json(response.body)

    def apikey_update_apikey(self, body: models.UpdateApikeyInput) -> models.ApiKeyView:
        response = self.raw("POST", "app.rocksky.apikey.updateApikey", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ApiKeyView).validate_json(response.body)

    def artist_get_artist(self, params: models.ArtistGetArtistParams) -> models.ArtistViewDetailed:
        response = self.raw("GET", "app.rocksky.artist.getArtist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ArtistViewDetailed).validate_json(response.body)

    def artist_get_artist_albums(self, params: models.GetArtistAlbumsParams) -> models.GetArtistAlbumsOutput:
        response = self.raw("GET", "app.rocksky.artist.getArtistAlbums", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistAlbumsOutput).validate_json(response.body)

    def artist_get_artist_listeners(self, params: models.GetArtistListenersParams) -> models.GetArtistListenersOutput:
        response = self.raw("GET", "app.rocksky.artist.getArtistListeners", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistListenersOutput).validate_json(response.body)

    def artist_get_artist_recent_listeners(self, params: models.GetArtistRecentListenersParams) -> models.GetArtistRecentListenersOutput:
        response = self.raw("GET", "app.rocksky.artist.getArtistRecentListeners", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistRecentListenersOutput).validate_json(response.body)

    def artist_get_artists(self, params: models.ArtistGetArtistsParams) -> models.ArtistGetArtistsOutput:
        response = self.raw("GET", "app.rocksky.artist.getArtists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ArtistGetArtistsOutput).validate_json(response.body)

    def artist_get_artist_tracks(self, params: models.GetArtistTracksParams) -> models.GetArtistTracksOutput:
        response = self.raw("GET", "app.rocksky.artist.getArtistTracks", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistTracksOutput).validate_json(response.body)

    def charts_get_decades(self, params: models.GetDecadesParams) -> models.GetDecadesOutput:
        response = self.raw("GET", "app.rocksky.charts.getDecades", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetDecadesOutput).validate_json(response.body)

    def charts_get_scrobbles_chart(self, params: models.GetScrobblesChartParams) -> models.ChartsView:
        response = self.raw("GET", "app.rocksky.charts.getScrobblesChart", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ChartsView).validate_json(response.body)

    def charts_get_top_artists(self, params: models.GetTopArtistsParams) -> models.GetTopArtistsOutput:
        response = self.raw("GET", "app.rocksky.charts.getTopArtists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetTopArtistsOutput).validate_json(response.body)

    def charts_get_top_scrobblers(self, params: models.GetTopScrobblersParams) -> models.GetTopScrobblersOutput:
        response = self.raw("GET", "app.rocksky.charts.getTopScrobblers", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetTopScrobblersOutput).validate_json(response.body)

    def charts_get_top_tracks(self, params: models.GetTopTracksParams) -> models.GetTopTracksOutput:
        response = self.raw("GET", "app.rocksky.charts.getTopTracks", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetTopTracksOutput).validate_json(response.body)

    def dropbox_download_file(self, params: models.DropboxDownloadFileParams) -> bytes:
        response = self.raw("GET", "app.rocksky.dropbox.downloadFile", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return response.body

    def dropbox_get_files(self, params: models.DropboxGetFilesParams) -> models.DropboxFileListView:
        response = self.raw("GET", "app.rocksky.dropbox.getFiles", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.DropboxFileListView).validate_json(response.body)

    def dropbox_get_metadata(self, params: models.GetMetadataParams) -> models.GetMetadataOutput:
        response = self.raw("GET", "app.rocksky.dropbox.getMetadata", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetMetadataOutput).validate_json(response.body)

    def dropbox_get_temporary_link(self, params: models.GetTemporaryLinkParams) -> models.DropboxTemporaryLinkView:
        response = self.raw("GET", "app.rocksky.dropbox.getTemporaryLink", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.DropboxTemporaryLinkView).validate_json(response.body)

    def equalizer_delete_preset(self, params: models.DeletePresetParams) -> None:
        response = self.raw("POST", "app.rocksky.equalizer.deletePreset", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def equalizer_list_presets(self, params: models.ListPresetsParams) -> models.ListPresetsOutput:
        response = self.raw("GET", "app.rocksky.equalizer.listPresets", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ListPresetsOutput).validate_json(response.body)

    def equalizer_put_preset(self, body: models.PutPresetInput) -> models.EqualizerPresetView:
        response = self.raw("POST", "app.rocksky.equalizer.putPreset", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.EqualizerPresetView).validate_json(response.body)

    def feed_describe_feed_generator(self) -> models.DescribeFeedGeneratorOutput:
        response = self.raw("GET", "app.rocksky.feed.describeFeedGenerator", params=None, body=None)
        response.raise_for_status()
        return TypeAdapter(models.DescribeFeedGeneratorOutput).validate_json(response.body)

    def feed_get_album_recommendations(self, params: models.GetAlbumRecommendationsParams) -> models.FeedRecommendedAlbumsView:
        response = self.raw("GET", "app.rocksky.feed.getAlbumRecommendations", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedRecommendedAlbumsView).validate_json(response.body)

    def feed_get_artist_recommendations(self, params: models.GetArtistRecommendationsParams) -> models.FeedRecommendedArtistsView:
        response = self.raw("GET", "app.rocksky.feed.getArtistRecommendations", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedRecommendedArtistsView).validate_json(response.body)

    def feed_get_feed(self, params: models.GetFeedParams) -> models.FeedView:
        response = self.raw("GET", "app.rocksky.feed.getFeed", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedView).validate_json(response.body)

    def feed_get_feed_generator(self, params: models.GetFeedGeneratorParams) -> models.GetFeedGeneratorOutput:
        response = self.raw("GET", "app.rocksky.feed.getFeedGenerator", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetFeedGeneratorOutput).validate_json(response.body)

    def feed_get_feed_generators(self, params: models.GetFeedGeneratorsParams) -> models.FeedGeneratorsView:
        response = self.raw("GET", "app.rocksky.feed.getFeedGenerators", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedGeneratorsView).validate_json(response.body)

    def feed_get_feed_skeleton(self, params: models.GetFeedSkeletonParams) -> models.GetFeedSkeletonOutput:
        response = self.raw("GET", "app.rocksky.feed.getFeedSkeleton", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetFeedSkeletonOutput).validate_json(response.body)

    def feed_get_recommendations(self, params: models.GetRecommendationsParams) -> models.FeedRecommendationsView:
        response = self.raw("GET", "app.rocksky.feed.getRecommendations", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedRecommendationsView).validate_json(response.body)

    def feed_get_stories(self, params: models.GetStoriesParams) -> models.FeedStoriesView:
        response = self.raw("GET", "app.rocksky.feed.getStories", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedStoriesView).validate_json(response.body)

    def feed_search(self, params: models.FeedSearchParams) -> models.FeedSearchResultsView:
        response = self.raw("GET", "app.rocksky.feed.search", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FeedSearchResultsView).validate_json(response.body)

    def googledrive_download_file(self, params: models.GoogledriveDownloadFileParams) -> bytes:
        response = self.raw("GET", "app.rocksky.googledrive.downloadFile", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return response.body

    def googledrive_get_file(self, params: models.GetFileParams) -> models.GoogledriveFileView:
        response = self.raw("GET", "app.rocksky.googledrive.getFile", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GoogledriveFileView).validate_json(response.body)

    def googledrive_get_files(self, params: models.GoogledriveGetFilesParams) -> models.GoogledriveFileListView:
        response = self.raw("GET", "app.rocksky.googledrive.getFiles", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GoogledriveFileListView).validate_json(response.body)

    def graph_follow_account(self, params: models.FollowAccountParams) -> models.FollowAccountOutput:
        response = self.raw("POST", "app.rocksky.graph.followAccount", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.FollowAccountOutput).validate_json(response.body)

    def graph_get_followers(self, params: models.GetFollowersParams) -> models.GetFollowersOutput:
        response = self.raw("GET", "app.rocksky.graph.getFollowers", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetFollowersOutput).validate_json(response.body)

    def graph_get_follows(self, params: models.GetFollowsParams) -> models.GetFollowsOutput:
        response = self.raw("GET", "app.rocksky.graph.getFollows", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetFollowsOutput).validate_json(response.body)

    def graph_get_known_followers(self, params: models.GetKnownFollowersParams) -> models.GetKnownFollowersOutput:
        response = self.raw("GET", "app.rocksky.graph.getKnownFollowers", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetKnownFollowersOutput).validate_json(response.body)

    def graph_unfollow_account(self, params: models.UnfollowAccountParams) -> models.UnfollowAccountOutput:
        response = self.raw("POST", "app.rocksky.graph.unfollowAccount", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.UnfollowAccountOutput).validate_json(response.body)

    def library_create_playlist(self, body: models.LibraryCreatePlaylistInput) -> models.LibraryCreatePlaylistOutput:
        response = self.raw("POST", "app.rocksky.library.createPlaylist", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.LibraryCreatePlaylistOutput).validate_json(response.body)

    def library_delete_album(self, body: models.DeleteAlbumInput) -> models.DeleteAlbumOutput:
        response = self.raw("POST", "app.rocksky.library.deleteAlbum", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.DeleteAlbumOutput).validate_json(response.body)

    def library_delete_playlist(self, body: models.DeletePlaylistInput) -> models.DeletePlaylistOutput:
        response = self.raw("POST", "app.rocksky.library.deletePlaylist", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.DeletePlaylistOutput).validate_json(response.body)

    def library_delete_song(self, body: models.DeleteSongInput) -> models.DeleteSongOutput:
        response = self.raw("POST", "app.rocksky.library.deleteSong", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.DeleteSongOutput).validate_json(response.body)

    def library_get_album(self, params: models.LibraryGetAlbumParams) -> models.LibraryGetAlbumOutput:
        response = self.raw("GET", "app.rocksky.library.getAlbum", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetAlbumOutput).validate_json(response.body)

    def library_get_album_info(self, params: models.GetAlbumInfoParams) -> models.GetAlbumInfoOutput:
        response = self.raw("GET", "app.rocksky.library.getAlbumInfo", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetAlbumInfoOutput).validate_json(response.body)

    def library_get_album_list(self, params: models.GetAlbumListParams) -> models.GetAlbumListOutput:
        response = self.raw("GET", "app.rocksky.library.getAlbumList", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetAlbumListOutput).validate_json(response.body)

    def library_get_artist(self, params: models.LibraryGetArtistParams) -> models.LibraryGetArtistOutput:
        response = self.raw("GET", "app.rocksky.library.getArtist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetArtistOutput).validate_json(response.body)

    def library_get_artist_info(self, params: models.GetArtistInfoParams) -> models.GetArtistInfoOutput:
        response = self.raw("GET", "app.rocksky.library.getArtistInfo", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistInfoOutput).validate_json(response.body)

    def library_get_artists(self, params: models.LibraryGetArtistsParams) -> models.LibraryGetArtistsOutput:
        response = self.raw("GET", "app.rocksky.library.getArtists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetArtistsOutput).validate_json(response.body)

    def library_get_cover_art_url(self, params: models.GetCoverArtUrlParams) -> models.GetCoverArtUrlOutput:
        response = self.raw("GET", "app.rocksky.library.getCoverArtUrl", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetCoverArtUrlOutput).validate_json(response.body)

    def library_get_download_url(self, params: models.GetDownloadUrlParams) -> models.GetDownloadUrlOutput:
        response = self.raw("GET", "app.rocksky.library.getDownloadUrl", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetDownloadUrlOutput).validate_json(response.body)

    def library_get_genres(self, params: models.GetGenresParams) -> models.GetGenresOutput:
        response = self.raw("GET", "app.rocksky.library.getGenres", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetGenresOutput).validate_json(response.body)

    def library_get_indexes(self, params: models.GetIndexesParams) -> models.GetIndexesOutput:
        response = self.raw("GET", "app.rocksky.library.getIndexes", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetIndexesOutput).validate_json(response.body)

    def library_get_internet_radio_stations(self, params: models.GetInternetRadioStationsParams) -> models.GetInternetRadioStationsOutput:
        response = self.raw("GET", "app.rocksky.library.getInternetRadioStations", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetInternetRadioStationsOutput).validate_json(response.body)

    def library_get_license(self, params: models.GetLicenseParams) -> models.GetLicenseOutput:
        response = self.raw("GET", "app.rocksky.library.getLicense", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetLicenseOutput).validate_json(response.body)

    def library_get_lyrics(self, params: models.GetLyricsParams) -> models.GetLyricsOutput:
        response = self.raw("GET", "app.rocksky.library.getLyrics", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetLyricsOutput).validate_json(response.body)

    def library_get_music_directory(self, params: models.GetMusicDirectoryParams) -> models.GetMusicDirectoryOutput:
        response = self.raw("GET", "app.rocksky.library.getMusicDirectory", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetMusicDirectoryOutput).validate_json(response.body)

    def library_get_music_folders(self, params: models.GetMusicFoldersParams) -> models.GetMusicFoldersOutput:
        response = self.raw("GET", "app.rocksky.library.getMusicFolders", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetMusicFoldersOutput).validate_json(response.body)

    def library_get_now_playing(self, params: models.GetNowPlayingParams) -> models.GetNowPlayingOutput:
        response = self.raw("GET", "app.rocksky.library.getNowPlaying", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetNowPlayingOutput).validate_json(response.body)

    def library_get_playlist(self, params: models.LibraryGetPlaylistParams) -> models.LibraryGetPlaylistOutput:
        response = self.raw("GET", "app.rocksky.library.getPlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetPlaylistOutput).validate_json(response.body)

    def library_get_playlists(self, params: models.LibraryGetPlaylistsParams) -> models.LibraryGetPlaylistsOutput:
        response = self.raw("GET", "app.rocksky.library.getPlaylists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetPlaylistsOutput).validate_json(response.body)

    def library_get_play_queue(self, params: models.GetPlayQueueParams) -> models.GetPlayQueueOutput:
        response = self.raw("GET", "app.rocksky.library.getPlayQueue", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetPlayQueueOutput).validate_json(response.body)

    def library_get_random_songs(self, params: models.GetRandomSongsParams) -> models.GetRandomSongsOutput:
        response = self.raw("GET", "app.rocksky.library.getRandomSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetRandomSongsOutput).validate_json(response.body)

    def library_get_scan_status(self, params: models.GetScanStatusParams) -> models.GetScanStatusOutput:
        response = self.raw("GET", "app.rocksky.library.getScanStatus", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetScanStatusOutput).validate_json(response.body)

    def library_get_similar_songs(self, params: models.GetSimilarSongsParams) -> models.GetSimilarSongsOutput:
        response = self.raw("GET", "app.rocksky.library.getSimilarSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetSimilarSongsOutput).validate_json(response.body)

    def library_get_song(self, params: models.LibraryGetSongParams) -> models.LibraryGetSongOutput:
        response = self.raw("GET", "app.rocksky.library.getSong", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibraryGetSongOutput).validate_json(response.body)

    def library_get_songs_by_genre(self, params: models.GetSongsByGenreParams) -> models.GetSongsByGenreOutput:
        response = self.raw("GET", "app.rocksky.library.getSongsByGenre", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetSongsByGenreOutput).validate_json(response.body)

    def library_get_starred(self, params: models.GetStarredParams) -> models.GetStarredOutput:
        response = self.raw("GET", "app.rocksky.library.getStarred", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetStarredOutput).validate_json(response.body)

    def library_get_stream_url(self, params: models.GetStreamUrlParams) -> models.GetStreamUrlOutput:
        response = self.raw("GET", "app.rocksky.library.getStreamUrl", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetStreamUrlOutput).validate_json(response.body)

    def library_get_top_songs(self, params: models.GetTopSongsParams) -> models.GetTopSongsOutput:
        response = self.raw("GET", "app.rocksky.library.getTopSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetTopSongsOutput).validate_json(response.body)

    def library_get_user(self, params: models.GetUserParams) -> models.GetUserOutput:
        response = self.raw("GET", "app.rocksky.library.getUser", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetUserOutput).validate_json(response.body)

    def library_ping(self, params: models.PingParams) -> models.PingOutput:
        response = self.raw("GET", "app.rocksky.library.ping", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PingOutput).validate_json(response.body)

    def library_save_play_queue(self, body: models.SavePlayQueueInput) -> models.SavePlayQueueOutput:
        response = self.raw("POST", "app.rocksky.library.savePlayQueue", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.SavePlayQueueOutput).validate_json(response.body)

    def library_scrobble(self, body: models.ScrobbleInput) -> models.ScrobbleOutput:
        response = self.raw("POST", "app.rocksky.library.scrobble", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ScrobbleOutput).validate_json(response.body)

    def library_search(self, params: models.LibrarySearchParams) -> models.LibrarySearchOutput:
        response = self.raw("GET", "app.rocksky.library.search", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.LibrarySearchOutput).validate_json(response.body)

    def library_star(self, body: models.StarInput) -> models.StarOutput:
        response = self.raw("POST", "app.rocksky.library.star", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.StarOutput).validate_json(response.body)

    def library_start_scan(self, params: models.StartScanParams) -> models.StartScanOutput:
        response = self.raw("GET", "app.rocksky.library.startScan", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.StartScanOutput).validate_json(response.body)

    def library_unstar(self, body: models.UnstarInput) -> models.UnstarOutput:
        response = self.raw("POST", "app.rocksky.library.unstar", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.UnstarOutput).validate_json(response.body)

    def library_update_now_playing(self, body: models.UpdateNowPlayingInput) -> models.UpdateNowPlayingOutput:
        response = self.raw("POST", "app.rocksky.library.updateNowPlaying", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.UpdateNowPlayingOutput).validate_json(response.body)

    def library_update_playlist(self, body: models.LibraryUpdatePlaylistInput) -> models.LibraryUpdatePlaylistOutput:
        response = self.raw("POST", "app.rocksky.library.updatePlaylist", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.LibraryUpdatePlaylistOutput).validate_json(response.body)

    def like_dislike_shout(self, body: models.DislikeShoutInput) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.like.dislikeShout", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def like_dislike_song(self, body: models.DislikeSongInput) -> models.SongViewDetailed:
        response = self.raw("POST", "app.rocksky.like.dislikeSong", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.SongViewDetailed).validate_json(response.body)

    def like_like_shout(self, body: models.LikeShoutInput) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.like.likeShout", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def like_like_song(self, body: models.LikeSongInput) -> models.SongViewDetailed:
        response = self.raw("POST", "app.rocksky.like.likeSong", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.SongViewDetailed).validate_json(response.body)

    def mirror_get_mirror_sources(self, params: models.GetMirrorSourcesParams) -> models.GetMirrorSourcesOutput:
        response = self.raw("GET", "app.rocksky.mirror.getMirrorSources", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetMirrorSourcesOutput).validate_json(response.body)

    def mirror_put_mirror_source(self, body: models.PutMirrorSourceInput) -> models.MirrorSourceView:
        response = self.raw("POST", "app.rocksky.mirror.putMirrorSource", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.MirrorSourceView).validate_json(response.body)

    def notification_get_unread_count(self) -> models.GetUnreadCountOutput:
        response = self.raw("GET", "app.rocksky.notification.getUnreadCount", params=None, body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetUnreadCountOutput).validate_json(response.body)

    def notification_list_notifications(self, params: models.ListNotificationsParams) -> models.ListNotificationsOutput:
        response = self.raw("GET", "app.rocksky.notification.listNotifications", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ListNotificationsOutput).validate_json(response.body)

    def notification_update_seen(self, body: models.UpdateSeenInput) -> models.UpdateSeenOutput:
        response = self.raw("POST", "app.rocksky.notification.updateSeen", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.UpdateSeenOutput).validate_json(response.body)

    def player_add_directory_to_queue(self, params: models.AddDirectoryToQueueParams) -> None:
        response = self.raw("POST", "app.rocksky.player.addDirectoryToQueue", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_add_items_to_queue(self, params: models.AddItemsToQueueParams) -> None:
        response = self.raw("POST", "app.rocksky.player.addItemsToQueue", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_get_currently_playing(self, params: models.PlayerGetCurrentlyPlayingParams) -> models.PlayerCurrentlyPlayingViewDetailed:
        response = self.raw("GET", "app.rocksky.player.getCurrentlyPlaying", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlayerCurrentlyPlayingViewDetailed).validate_json(response.body)

    def player_get_playback_queue(self, params: models.GetPlaybackQueueParams) -> models.PlayerPlaybackQueueViewDetailed:
        response = self.raw("GET", "app.rocksky.player.getPlaybackQueue", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlayerPlaybackQueueViewDetailed).validate_json(response.body)

    def player_next(self, params: models.PlayerNextParams) -> None:
        response = self.raw("POST", "app.rocksky.player.next", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_pause(self, params: models.PlayerPauseParams) -> None:
        response = self.raw("POST", "app.rocksky.player.pause", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_play(self, params: models.PlayerPlayParams) -> None:
        response = self.raw("POST", "app.rocksky.player.play", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_play_directory(self, params: models.PlayDirectoryParams) -> None:
        response = self.raw("POST", "app.rocksky.player.playDirectory", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_play_file(self, params: models.PlayFileParams) -> None:
        response = self.raw("POST", "app.rocksky.player.playFile", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_previous(self, params: models.PlayerPreviousParams) -> None:
        response = self.raw("POST", "app.rocksky.player.previous", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def player_seek(self, params: models.PlayerSeekParams) -> None:
        response = self.raw("POST", "app.rocksky.player.seek", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_add_songs(self, params: models.AddSongsParams) -> models.AddSongsOutput:
        response = self.raw("POST", "app.rocksky.playlist.addSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.AddSongsOutput).validate_json(response.body)

    def playlist_create_playlist(self, params: models.PlaylistCreatePlaylistParams) -> models.PlaylistCreatePlaylistOutput:
        response = self.raw("POST", "app.rocksky.playlist.createPlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlaylistCreatePlaylistOutput).validate_json(response.body)

    def playlist_get_playlist(self, params: models.PlaylistGetPlaylistParams) -> models.PlaylistViewDetailed:
        response = self.raw("GET", "app.rocksky.playlist.getPlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlaylistViewDetailed).validate_json(response.body)

    def playlist_get_playlists(self, params: models.PlaylistGetPlaylistsParams) -> models.PlaylistGetPlaylistsOutput:
        response = self.raw("GET", "app.rocksky.playlist.getPlaylists", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlaylistGetPlaylistsOutput).validate_json(response.body)

    def playlist_insert_directory(self, params: models.InsertDirectoryParams) -> None:
        response = self.raw("POST", "app.rocksky.playlist.insertDirectory", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_insert_files(self, params: models.InsertFilesParams) -> None:
        response = self.raw("POST", "app.rocksky.playlist.insertFiles", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_remove_playlist(self, params: models.RemovePlaylistParams) -> None:
        response = self.raw("POST", "app.rocksky.playlist.removePlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_remove_track(self, params: models.RemoveTrackParams) -> None:
        response = self.raw("POST", "app.rocksky.playlist.removeTrack", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_start_playlist(self, params: models.StartPlaylistParams) -> None:
        response = self.raw("POST", "app.rocksky.playlist.startPlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def playlist_update_playlist(self, params: models.PlaylistUpdatePlaylistParams) -> models.PlaylistUpdatePlaylistOutput:
        response = self.raw("POST", "app.rocksky.playlist.updatePlaylist", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlaylistUpdatePlaylistOutput).validate_json(response.body)

    def rockbox_get_audio_settings(self, params: models.GetAudioSettingsParams) -> models.RockboxSettingsView:
        response = self.raw("GET", "app.rocksky.rockbox.getAudioSettings", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.RockboxSettingsView).validate_json(response.body)

    def rockbox_put_audio_settings(self, body: models.PutAudioSettingsInput) -> models.RockboxSettingsView:
        response = self.raw("POST", "app.rocksky.rockbox.putAudioSettings", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.RockboxSettingsView).validate_json(response.body)

    def scrobble_create_scrobble(self, body: models.CreateScrobbleInput) -> models.ScrobbleViewBasic:
        response = self.raw("POST", "app.rocksky.scrobble.createScrobble", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ScrobbleViewBasic).validate_json(response.body)

    def scrobble_get_scrobble(self, params: models.GetScrobbleParams) -> models.ScrobbleViewDetailed:
        response = self.raw("GET", "app.rocksky.scrobble.getScrobble", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ScrobbleViewDetailed).validate_json(response.body)

    def scrobble_get_scrobbles(self, params: models.GetScrobblesParams) -> models.GetScrobblesOutput:
        response = self.raw("GET", "app.rocksky.scrobble.getScrobbles", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetScrobblesOutput).validate_json(response.body)

    def shout_create_shout(self, body: models.CreateShoutInput) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.shout.createShout", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def shout_get_album_shouts(self, params: models.GetAlbumShoutsParams) -> models.GetAlbumShoutsOutput:
        response = self.raw("GET", "app.rocksky.shout.getAlbumShouts", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetAlbumShoutsOutput).validate_json(response.body)

    def shout_get_artist_shouts(self, params: models.GetArtistShoutsParams) -> models.GetArtistShoutsOutput:
        response = self.raw("GET", "app.rocksky.shout.getArtistShouts", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetArtistShoutsOutput).validate_json(response.body)

    def shout_get_profile_shouts(self, params: models.GetProfileShoutsParams) -> models.GetProfileShoutsOutput:
        response = self.raw("GET", "app.rocksky.shout.getProfileShouts", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetProfileShoutsOutput).validate_json(response.body)

    def shout_get_shout_replies(self, params: models.GetShoutRepliesParams) -> models.GetShoutRepliesOutput:
        response = self.raw("GET", "app.rocksky.shout.getShoutReplies", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetShoutRepliesOutput).validate_json(response.body)

    def shout_get_track_shouts(self, params: models.GetTrackShoutsParams) -> models.GetTrackShoutsOutput:
        response = self.raw("GET", "app.rocksky.shout.getTrackShouts", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetTrackShoutsOutput).validate_json(response.body)

    def shout_remove_shout(self, params: models.RemoveShoutParams) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.shout.removeShout", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def shout_reply_shout(self, body: models.ReplyShoutInput) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.shout.replyShout", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def shout_report_shout(self, body: models.ReportShoutInput) -> models.ShoutView:
        response = self.raw("POST", "app.rocksky.shout.reportShout", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.ShoutView).validate_json(response.body)

    def song_create_song(self, body: models.CreateSongInput) -> models.SongViewDetailed:
        response = self.raw("POST", "app.rocksky.song.createSong", params=None, body=body.model_dump(by_alias=True, exclude_unset=True))
        response.raise_for_status()
        return TypeAdapter(models.SongViewDetailed).validate_json(response.body)

    def song_get_song(self, params: models.SongGetSongParams) -> models.SongViewDetailed:
        response = self.raw("GET", "app.rocksky.song.getSong", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.SongViewDetailed).validate_json(response.body)

    def song_get_song_recent_listeners(self, params: models.GetSongRecentListenersParams) -> models.GetSongRecentListenersOutput:
        response = self.raw("GET", "app.rocksky.song.getSongRecentListeners", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetSongRecentListenersOutput).validate_json(response.body)

    def song_get_songs(self, params: models.GetSongsParams) -> models.GetSongsOutput:
        response = self.raw("GET", "app.rocksky.song.getSongs", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.GetSongsOutput).validate_json(response.body)

    def song_match_song(self, params: models.MatchSongParams) -> models.SongViewDetailed:
        response = self.raw("GET", "app.rocksky.song.matchSong", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.SongViewDetailed).validate_json(response.body)

    def spotify_get_currently_playing(self, params: models.SpotifyGetCurrentlyPlayingParams) -> models.PlayerCurrentlyPlayingViewDetailed:
        response = self.raw("GET", "app.rocksky.spotify.getCurrentlyPlaying", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.PlayerCurrentlyPlayingViewDetailed).validate_json(response.body)

    def spotify_next(self) -> None:
        response = self.raw("POST", "app.rocksky.spotify.next", params=None, body=None)
        response.raise_for_status()
        return None

    def spotify_pause(self) -> None:
        response = self.raw("POST", "app.rocksky.spotify.pause", params=None, body=None)
        response.raise_for_status()
        return None

    def spotify_play(self) -> None:
        response = self.raw("POST", "app.rocksky.spotify.play", params=None, body=None)
        response.raise_for_status()
        return None

    def spotify_previous(self) -> None:
        response = self.raw("POST", "app.rocksky.spotify.previous", params=None, body=None)
        response.raise_for_status()
        return None

    def spotify_seek(self, params: models.SpotifySeekParams) -> None:
        response = self.raw("POST", "app.rocksky.spotify.seek", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return None

    def stats_get_global_stats(self, params: models.GetGlobalStatsParams) -> models.StatsGlobalStatsView:
        response = self.raw("GET", "app.rocksky.stats.getGlobalStats", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.StatsGlobalStatsView).validate_json(response.body)

    def stats_get_stats(self, params: models.GetStatsParams) -> models.StatsView:
        response = self.raw("GET", "app.rocksky.stats.getStats", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.StatsView).validate_json(response.body)

    def stats_get_wrapped(self, params: models.GetWrappedParams) -> models.StatsWrappedView:
        response = self.raw("GET", "app.rocksky.stats.getWrapped", params=params.model_dump(by_alias=True, exclude_unset=True), body=None)
        response.raise_for_status()
        return TypeAdapter(models.StatsWrappedView).validate_json(response.body)
