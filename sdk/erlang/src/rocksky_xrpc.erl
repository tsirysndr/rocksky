%% Generated endpoint functions; raw/5 is the escape hatch.
-module(rocksky_xrpc).
-export([new/0, with_endpoint/2, with_token/2, with_timeout/2, raw/5, actor_get_actor_albums/2, actor_get_actor_artists/2, actor_get_actor_compatibility/2, actor_get_actor_loved_songs/2, actor_get_actor_neighbours/2, actor_get_actor_playlists/2, actor_get_actor_scrobbles/2, actor_get_actor_songs/2, actor_get_profile/2, album_get_album/2, album_get_albums/2, album_get_album_tracks/2, apikey_create_apikey/2, apikey_get_apikeys/2, apikey_remove_apikey/2, apikey_update_apikey/2, artist_get_artist/2, artist_get_artist_albums/2, artist_get_artist_listeners/2, artist_get_artist_recent_listeners/2, artist_get_artists/2, artist_get_artist_tracks/2, charts_get_decades/2, charts_get_scrobbles_chart/2, charts_get_top_artists/2, charts_get_top_scrobblers/2, charts_get_top_tracks/2, dropbox_download_file/2, dropbox_get_files/2, dropbox_get_metadata/2, dropbox_get_temporary_link/2, equalizer_delete_preset/2, equalizer_list_presets/2, equalizer_put_preset/2, feed_describe_feed_generator/1, feed_get_album_recommendations/2, feed_get_artist_recommendations/2, feed_get_feed/2, feed_get_feed_generator/2, feed_get_feed_generators/2, feed_get_feed_skeleton/2, feed_get_recommendations/2, feed_get_stories/2, feed_search/2, googledrive_download_file/2, googledrive_get_file/2, googledrive_get_files/2, graph_follow_account/2, graph_get_followers/2, graph_get_follows/2, graph_get_known_followers/2, graph_unfollow_account/2, library_create_playlist/2, library_delete_album/2, library_delete_playlist/2, library_delete_song/2, library_get_album/2, library_get_album_info/2, library_get_album_list/2, library_get_artist/2, library_get_artist_info/2, library_get_artists/2, library_get_cover_art_url/2, library_get_download_url/2, library_get_genres/2, library_get_indexes/2, library_get_internet_radio_stations/2, library_get_license/2, library_get_lyrics/2, library_get_music_directory/2, library_get_music_folders/2, library_get_now_playing/2, library_get_playlist/2, library_get_playlists/2, library_get_play_queue/2, library_get_random_songs/2, library_get_scan_status/2, library_get_similar_songs/2, library_get_song/2, library_get_songs_by_genre/2, library_get_starred/2, library_get_stream_url/2, library_get_top_songs/2, library_get_user/2, library_ping/2, library_save_play_queue/2, library_scrobble/2, library_search/2, library_star/2, library_start_scan/2, library_unstar/2, library_update_now_playing/2, library_update_playlist/2, like_dislike_shout/2, like_dislike_song/2, like_like_shout/2, like_like_song/2, mirror_get_mirror_sources/2, mirror_put_mirror_source/2, notification_get_unread_count/1, notification_list_notifications/2, notification_update_seen/2, player_add_directory_to_queue/2, player_add_items_to_queue/2, player_get_currently_playing/2, player_get_playback_queue/2, player_next/2, player_pause/2, player_play/2, player_play_directory/2, player_play_file/2, player_previous/2, player_seek/2, playlist_add_songs/2, playlist_create_playlist/2, playlist_get_playlist/2, playlist_get_playlists/2, playlist_insert_directory/2, playlist_insert_files/2, playlist_remove_playlist/2, playlist_remove_track/2, playlist_start_playlist/2, playlist_update_playlist/2, rockbox_get_audio_settings/2, rockbox_put_audio_settings/2, scrobble_create_scrobble/2, scrobble_get_scrobble/2, scrobble_get_scrobbles/2, shout_create_shout/2, shout_get_album_shouts/2, shout_get_artist_shouts/2, shout_get_profile_shouts/2, shout_get_shout_replies/2, shout_get_track_shouts/2, shout_remove_shout/2, shout_reply_shout/2, shout_report_shout/2, song_create_song/2, song_get_song/2, song_get_song_recent_listeners/2, song_get_songs/2, song_match_song/2, spotify_get_currently_playing/2, spotify_next/1, spotify_pause/1, spotify_play/1, spotify_previous/1, spotify_seek/2, stats_get_global_stats/2, stats_get_stats/2, stats_get_wrapped/2]).
-export_type([client/0, error/0]).
-opaque client() :: #{endpoint := binary(), token := binary(), timeout := pos_integer()}.
-type error() :: {transport, binary()} | {http, integer(), binary()} | {decode, term()}.
-spec new() -> client().
new() -> #{endpoint => <<"https://api.rocksky.app">>, token => <<>>, timeout => 30000}.
-spec with_endpoint(client(), binary()) -> client().
with_endpoint(Client, Endpoint) -> Client#{endpoint => Endpoint}.
-spec with_token(client(), binary()) -> client().
with_token(Client, Token) -> Client#{token => Token}.
-spec with_timeout(client(), pos_integer()) -> client().
with_timeout(Client, Timeout) -> Client#{timeout => Timeout}.
-spec raw(client(), get | post, binary(), map(), rocksky_models:json_value() | undefined) -> {ok, {integer(), binary()}} | {error, error()}.
raw(Client, Method, Nsid, Params, Body) ->
  BodyJson = case Body of undefined -> <<>>; _ -> iolist_to_binary(json:encode(Body)) end,
  case rocksky_xrpc_http:request(Method, maps:get(endpoint, Client), Nsid, iolist_to_binary(json:encode(Params)), BodyJson, maps:get(token, Client), maps:get(timeout, Client)) of
    {ok, Response} -> {ok, Response};
    {error, Reason} -> {error, {transport, Reason}}
  end.
call(Client, Method, Nsid, Params, Body, Output) ->
  case raw(Client, Method, Nsid, Params, Body) of
    {ok, {Status, Bytes}} when Status >= 200, Status < 300 ->
      try case Output of
        binary -> {ok, Bytes};
        none -> {ok, nil};
        _ -> rocksky_typed_codec:decode_value(Output, json:decode(Bytes))
      end catch _:Reason -> {error, {decode, Reason}} end;
    {ok, {Status, Bytes}} -> {error, {http, Status, Bytes}};
    Error -> Error
  end.
-spec actor_get_actor_albums(client(), rocksky_models:get_actor_albums_params()) -> {ok, rocksky_models:get_actor_albums_output()} | {error, error()}.
actor_get_actor_albums(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorAlbums">>, rocksky_models:encode_get_actor_albums_params(Params), undefined, {record, 'get_actor_albums_output'}).

-spec actor_get_actor_artists(client(), rocksky_models:get_actor_artists_params()) -> {ok, rocksky_models:get_actor_artists_output()} | {error, error()}.
actor_get_actor_artists(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorArtists">>, rocksky_models:encode_get_actor_artists_params(Params), undefined, {record, 'get_actor_artists_output'}).

-spec actor_get_actor_compatibility(client(), rocksky_models:get_actor_compatibility_params()) -> {ok, rocksky_models:get_actor_compatibility_output()} | {error, error()}.
actor_get_actor_compatibility(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorCompatibility">>, rocksky_models:encode_get_actor_compatibility_params(Params), undefined, {record, 'get_actor_compatibility_output'}).

-spec actor_get_actor_loved_songs(client(), rocksky_models:get_actor_loved_songs_params()) -> {ok, rocksky_models:get_actor_loved_songs_output()} | {error, error()}.
actor_get_actor_loved_songs(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorLovedSongs">>, rocksky_models:encode_get_actor_loved_songs_params(Params), undefined, {record, 'get_actor_loved_songs_output'}).

-spec actor_get_actor_neighbours(client(), rocksky_models:get_actor_neighbours_params()) -> {ok, rocksky_models:get_actor_neighbours_output()} | {error, error()}.
actor_get_actor_neighbours(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorNeighbours">>, rocksky_models:encode_get_actor_neighbours_params(Params), undefined, {record, 'get_actor_neighbours_output'}).

-spec actor_get_actor_playlists(client(), rocksky_models:get_actor_playlists_params()) -> {ok, rocksky_models:get_actor_playlists_output()} | {error, error()}.
actor_get_actor_playlists(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorPlaylists">>, rocksky_models:encode_get_actor_playlists_params(Params), undefined, {record, 'get_actor_playlists_output'}).

-spec actor_get_actor_scrobbles(client(), rocksky_models:get_actor_scrobbles_params()) -> {ok, rocksky_models:get_actor_scrobbles_output()} | {error, error()}.
actor_get_actor_scrobbles(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorScrobbles">>, rocksky_models:encode_get_actor_scrobbles_params(Params), undefined, {record, 'get_actor_scrobbles_output'}).

-spec actor_get_actor_songs(client(), rocksky_models:get_actor_songs_params()) -> {ok, rocksky_models:get_actor_songs_output()} | {error, error()}.
actor_get_actor_songs(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getActorSongs">>, rocksky_models:encode_get_actor_songs_params(Params), undefined, {record, 'get_actor_songs_output'}).

-spec actor_get_profile(client(), rocksky_models:get_profile_params()) -> {ok, rocksky_models:actor_profile_view_detailed()} | {error, error()}.
actor_get_profile(Client, Params) -> call(Client, get, <<"app.rocksky.actor.getProfile">>, rocksky_models:encode_get_profile_params(Params), undefined, {record, 'actor_profile_view_detailed'}).

-spec album_get_album(client(), rocksky_models:album_get_album_params()) -> {ok, rocksky_models:album_view_detailed()} | {error, error()}.
album_get_album(Client, Params) -> call(Client, get, <<"app.rocksky.album.getAlbum">>, rocksky_models:encode_album_get_album_params(Params), undefined, {record, 'album_view_detailed'}).

-spec album_get_albums(client(), rocksky_models:get_albums_params()) -> {ok, rocksky_models:get_albums_output()} | {error, error()}.
album_get_albums(Client, Params) -> call(Client, get, <<"app.rocksky.album.getAlbums">>, rocksky_models:encode_get_albums_params(Params), undefined, {record, 'get_albums_output'}).

-spec album_get_album_tracks(client(), rocksky_models:get_album_tracks_params()) -> {ok, rocksky_models:get_album_tracks_output()} | {error, error()}.
album_get_album_tracks(Client, Params) -> call(Client, get, <<"app.rocksky.album.getAlbumTracks">>, rocksky_models:encode_get_album_tracks_params(Params), undefined, {record, 'get_album_tracks_output'}).

-spec apikey_create_apikey(client(), rocksky_models:create_apikey_input()) -> {ok, rocksky_models:api_key_view()} | {error, error()}.
apikey_create_apikey(Client, Input) -> call(Client, post, <<"app.rocksky.apikey.createApikey">>, #{}, rocksky_models:encode_create_apikey_input(Input), {record, 'api_key_view'}).

-spec apikey_get_apikeys(client(), rocksky_models:get_apikeys_params()) -> {ok, rocksky_models:get_apikeys_output()} | {error, error()}.
apikey_get_apikeys(Client, Params) -> call(Client, get, <<"app.rocksky.apikey.getApikeys">>, rocksky_models:encode_get_apikeys_params(Params), undefined, {record, 'get_apikeys_output'}).

-spec apikey_remove_apikey(client(), rocksky_models:remove_apikey_params()) -> {ok, rocksky_models:api_key_view()} | {error, error()}.
apikey_remove_apikey(Client, Params) -> call(Client, post, <<"app.rocksky.apikey.removeApikey">>, rocksky_models:encode_remove_apikey_params(Params), undefined, {record, 'api_key_view'}).

-spec apikey_update_apikey(client(), rocksky_models:update_apikey_input()) -> {ok, rocksky_models:api_key_view()} | {error, error()}.
apikey_update_apikey(Client, Input) -> call(Client, post, <<"app.rocksky.apikey.updateApikey">>, #{}, rocksky_models:encode_update_apikey_input(Input), {record, 'api_key_view'}).

-spec artist_get_artist(client(), rocksky_models:artist_get_artist_params()) -> {ok, rocksky_models:artist_view_detailed()} | {error, error()}.
artist_get_artist(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtist">>, rocksky_models:encode_artist_get_artist_params(Params), undefined, {record, 'artist_view_detailed'}).

-spec artist_get_artist_albums(client(), rocksky_models:get_artist_albums_params()) -> {ok, rocksky_models:get_artist_albums_output()} | {error, error()}.
artist_get_artist_albums(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtistAlbums">>, rocksky_models:encode_get_artist_albums_params(Params), undefined, {record, 'get_artist_albums_output'}).

-spec artist_get_artist_listeners(client(), rocksky_models:get_artist_listeners_params()) -> {ok, rocksky_models:get_artist_listeners_output()} | {error, error()}.
artist_get_artist_listeners(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtistListeners">>, rocksky_models:encode_get_artist_listeners_params(Params), undefined, {record, 'get_artist_listeners_output'}).

-spec artist_get_artist_recent_listeners(client(), rocksky_models:get_artist_recent_listeners_params()) -> {ok, rocksky_models:get_artist_recent_listeners_output()} | {error, error()}.
artist_get_artist_recent_listeners(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtistRecentListeners">>, rocksky_models:encode_get_artist_recent_listeners_params(Params), undefined, {record, 'get_artist_recent_listeners_output'}).

-spec artist_get_artists(client(), rocksky_models:artist_get_artists_params()) -> {ok, rocksky_models:artist_get_artists_output()} | {error, error()}.
artist_get_artists(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtists">>, rocksky_models:encode_artist_get_artists_params(Params), undefined, {record, 'artist_get_artists_output'}).

-spec artist_get_artist_tracks(client(), rocksky_models:get_artist_tracks_params()) -> {ok, rocksky_models:get_artist_tracks_output()} | {error, error()}.
artist_get_artist_tracks(Client, Params) -> call(Client, get, <<"app.rocksky.artist.getArtistTracks">>, rocksky_models:encode_get_artist_tracks_params(Params), undefined, {record, 'get_artist_tracks_output'}).

-spec charts_get_decades(client(), rocksky_models:get_decades_params()) -> {ok, rocksky_models:get_decades_output()} | {error, error()}.
charts_get_decades(Client, Params) -> call(Client, get, <<"app.rocksky.charts.getDecades">>, rocksky_models:encode_get_decades_params(Params), undefined, {record, 'get_decades_output'}).

-spec charts_get_scrobbles_chart(client(), rocksky_models:get_scrobbles_chart_params()) -> {ok, rocksky_models:charts_view()} | {error, error()}.
charts_get_scrobbles_chart(Client, Params) -> call(Client, get, <<"app.rocksky.charts.getScrobblesChart">>, rocksky_models:encode_get_scrobbles_chart_params(Params), undefined, {record, 'charts_view'}).

-spec charts_get_top_artists(client(), rocksky_models:get_top_artists_params()) -> {ok, rocksky_models:get_top_artists_output()} | {error, error()}.
charts_get_top_artists(Client, Params) -> call(Client, get, <<"app.rocksky.charts.getTopArtists">>, rocksky_models:encode_get_top_artists_params(Params), undefined, {record, 'get_top_artists_output'}).

-spec charts_get_top_scrobblers(client(), rocksky_models:get_top_scrobblers_params()) -> {ok, rocksky_models:get_top_scrobblers_output()} | {error, error()}.
charts_get_top_scrobblers(Client, Params) -> call(Client, get, <<"app.rocksky.charts.getTopScrobblers">>, rocksky_models:encode_get_top_scrobblers_params(Params), undefined, {record, 'get_top_scrobblers_output'}).

-spec charts_get_top_tracks(client(), rocksky_models:get_top_tracks_params()) -> {ok, rocksky_models:get_top_tracks_output()} | {error, error()}.
charts_get_top_tracks(Client, Params) -> call(Client, get, <<"app.rocksky.charts.getTopTracks">>, rocksky_models:encode_get_top_tracks_params(Params), undefined, {record, 'get_top_tracks_output'}).

-spec dropbox_download_file(client(), rocksky_models:dropbox_download_file_params()) -> {ok, binary()} | {error, error()}.
dropbox_download_file(Client, Params) -> call(Client, get, <<"app.rocksky.dropbox.downloadFile">>, rocksky_models:encode_dropbox_download_file_params(Params), undefined, binary).

-spec dropbox_get_files(client(), rocksky_models:dropbox_get_files_params()) -> {ok, rocksky_models:dropbox_file_list_view()} | {error, error()}.
dropbox_get_files(Client, Params) -> call(Client, get, <<"app.rocksky.dropbox.getFiles">>, rocksky_models:encode_dropbox_get_files_params(Params), undefined, {record, 'dropbox_file_list_view'}).

-spec dropbox_get_metadata(client(), rocksky_models:get_metadata_params()) -> {ok, rocksky_models:get_metadata_output()} | {error, error()}.
dropbox_get_metadata(Client, Params) -> call(Client, get, <<"app.rocksky.dropbox.getMetadata">>, rocksky_models:encode_get_metadata_params(Params), undefined, {record, 'get_metadata_output'}).

-spec dropbox_get_temporary_link(client(), rocksky_models:get_temporary_link_params()) -> {ok, rocksky_models:dropbox_temporary_link_view()} | {error, error()}.
dropbox_get_temporary_link(Client, Params) -> call(Client, get, <<"app.rocksky.dropbox.getTemporaryLink">>, rocksky_models:encode_get_temporary_link_params(Params), undefined, {record, 'dropbox_temporary_link_view'}).

-spec equalizer_delete_preset(client(), rocksky_models:delete_preset_params()) -> {ok, nil} | {error, error()}.
equalizer_delete_preset(Client, Params) -> call(Client, post, <<"app.rocksky.equalizer.deletePreset">>, rocksky_models:encode_delete_preset_params(Params), undefined, none).

-spec equalizer_list_presets(client(), rocksky_models:list_presets_params()) -> {ok, rocksky_models:list_presets_output()} | {error, error()}.
equalizer_list_presets(Client, Params) -> call(Client, get, <<"app.rocksky.equalizer.listPresets">>, rocksky_models:encode_list_presets_params(Params), undefined, {record, 'list_presets_output'}).

-spec equalizer_put_preset(client(), rocksky_models:put_preset_input()) -> {ok, rocksky_models:equalizer_preset_view()} | {error, error()}.
equalizer_put_preset(Client, Input) -> call(Client, post, <<"app.rocksky.equalizer.putPreset">>, #{}, rocksky_models:encode_put_preset_input(Input), {record, 'equalizer_preset_view'}).

-spec feed_describe_feed_generator(client()) -> {ok, rocksky_models:describe_feed_generator_output()} | {error, error()}.
feed_describe_feed_generator(Client) -> call(Client, get, <<"app.rocksky.feed.describeFeedGenerator">>, #{}, undefined, {record, 'describe_feed_generator_output'}).

-spec feed_get_album_recommendations(client(), rocksky_models:get_album_recommendations_params()) -> {ok, rocksky_models:feed_recommended_albums_view()} | {error, error()}.
feed_get_album_recommendations(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getAlbumRecommendations">>, rocksky_models:encode_get_album_recommendations_params(Params), undefined, {record, 'feed_recommended_albums_view'}).

-spec feed_get_artist_recommendations(client(), rocksky_models:get_artist_recommendations_params()) -> {ok, rocksky_models:feed_recommended_artists_view()} | {error, error()}.
feed_get_artist_recommendations(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getArtistRecommendations">>, rocksky_models:encode_get_artist_recommendations_params(Params), undefined, {record, 'feed_recommended_artists_view'}).

-spec feed_get_feed(client(), rocksky_models:get_feed_params()) -> {ok, rocksky_models:feed_view()} | {error, error()}.
feed_get_feed(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getFeed">>, rocksky_models:encode_get_feed_params(Params), undefined, {record, 'feed_view'}).

-spec feed_get_feed_generator(client(), rocksky_models:get_feed_generator_params()) -> {ok, rocksky_models:get_feed_generator_output()} | {error, error()}.
feed_get_feed_generator(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getFeedGenerator">>, rocksky_models:encode_get_feed_generator_params(Params), undefined, {record, 'get_feed_generator_output'}).

-spec feed_get_feed_generators(client(), rocksky_models:get_feed_generators_params()) -> {ok, rocksky_models:feed_generators_view()} | {error, error()}.
feed_get_feed_generators(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getFeedGenerators">>, rocksky_models:encode_get_feed_generators_params(Params), undefined, {record, 'feed_generators_view'}).

-spec feed_get_feed_skeleton(client(), rocksky_models:get_feed_skeleton_params()) -> {ok, rocksky_models:get_feed_skeleton_output()} | {error, error()}.
feed_get_feed_skeleton(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getFeedSkeleton">>, rocksky_models:encode_get_feed_skeleton_params(Params), undefined, {record, 'get_feed_skeleton_output'}).

-spec feed_get_recommendations(client(), rocksky_models:get_recommendations_params()) -> {ok, rocksky_models:feed_recommendations_view()} | {error, error()}.
feed_get_recommendations(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getRecommendations">>, rocksky_models:encode_get_recommendations_params(Params), undefined, {record, 'feed_recommendations_view'}).

-spec feed_get_stories(client(), rocksky_models:get_stories_params()) -> {ok, rocksky_models:feed_stories_view()} | {error, error()}.
feed_get_stories(Client, Params) -> call(Client, get, <<"app.rocksky.feed.getStories">>, rocksky_models:encode_get_stories_params(Params), undefined, {record, 'feed_stories_view'}).

-spec feed_search(client(), rocksky_models:feed_search_params()) -> {ok, rocksky_models:feed_search_results_view()} | {error, error()}.
feed_search(Client, Params) -> call(Client, get, <<"app.rocksky.feed.search">>, rocksky_models:encode_feed_search_params(Params), undefined, {record, 'feed_search_results_view'}).

-spec googledrive_download_file(client(), rocksky_models:googledrive_download_file_params()) -> {ok, binary()} | {error, error()}.
googledrive_download_file(Client, Params) -> call(Client, get, <<"app.rocksky.googledrive.downloadFile">>, rocksky_models:encode_googledrive_download_file_params(Params), undefined, binary).

-spec googledrive_get_file(client(), rocksky_models:get_file_params()) -> {ok, rocksky_models:googledrive_file_view()} | {error, error()}.
googledrive_get_file(Client, Params) -> call(Client, get, <<"app.rocksky.googledrive.getFile">>, rocksky_models:encode_get_file_params(Params), undefined, {record, 'googledrive_file_view'}).

-spec googledrive_get_files(client(), rocksky_models:googledrive_get_files_params()) -> {ok, rocksky_models:googledrive_file_list_view()} | {error, error()}.
googledrive_get_files(Client, Params) -> call(Client, get, <<"app.rocksky.googledrive.getFiles">>, rocksky_models:encode_googledrive_get_files_params(Params), undefined, {record, 'googledrive_file_list_view'}).

-spec graph_follow_account(client(), rocksky_models:follow_account_params()) -> {ok, rocksky_models:follow_account_output()} | {error, error()}.
graph_follow_account(Client, Params) -> call(Client, post, <<"app.rocksky.graph.followAccount">>, rocksky_models:encode_follow_account_params(Params), undefined, {record, 'follow_account_output'}).

-spec graph_get_followers(client(), rocksky_models:get_followers_params()) -> {ok, rocksky_models:get_followers_output()} | {error, error()}.
graph_get_followers(Client, Params) -> call(Client, get, <<"app.rocksky.graph.getFollowers">>, rocksky_models:encode_get_followers_params(Params), undefined, {record, 'get_followers_output'}).

-spec graph_get_follows(client(), rocksky_models:get_follows_params()) -> {ok, rocksky_models:get_follows_output()} | {error, error()}.
graph_get_follows(Client, Params) -> call(Client, get, <<"app.rocksky.graph.getFollows">>, rocksky_models:encode_get_follows_params(Params), undefined, {record, 'get_follows_output'}).

-spec graph_get_known_followers(client(), rocksky_models:get_known_followers_params()) -> {ok, rocksky_models:get_known_followers_output()} | {error, error()}.
graph_get_known_followers(Client, Params) -> call(Client, get, <<"app.rocksky.graph.getKnownFollowers">>, rocksky_models:encode_get_known_followers_params(Params), undefined, {record, 'get_known_followers_output'}).

-spec graph_unfollow_account(client(), rocksky_models:unfollow_account_params()) -> {ok, rocksky_models:unfollow_account_output()} | {error, error()}.
graph_unfollow_account(Client, Params) -> call(Client, post, <<"app.rocksky.graph.unfollowAccount">>, rocksky_models:encode_unfollow_account_params(Params), undefined, {record, 'unfollow_account_output'}).

-spec library_create_playlist(client(), rocksky_models:library_create_playlist_input()) -> {ok, rocksky_models:library_create_playlist_output()} | {error, error()}.
library_create_playlist(Client, Input) -> call(Client, post, <<"app.rocksky.library.createPlaylist">>, #{}, rocksky_models:encode_library_create_playlist_input(Input), {record, 'library_create_playlist_output'}).

-spec library_delete_album(client(), rocksky_models:delete_album_input()) -> {ok, rocksky_models:delete_album_output()} | {error, error()}.
library_delete_album(Client, Input) -> call(Client, post, <<"app.rocksky.library.deleteAlbum">>, #{}, rocksky_models:encode_delete_album_input(Input), {record, 'delete_album_output'}).

-spec library_delete_playlist(client(), rocksky_models:delete_playlist_input()) -> {ok, rocksky_models:delete_playlist_output()} | {error, error()}.
library_delete_playlist(Client, Input) -> call(Client, post, <<"app.rocksky.library.deletePlaylist">>, #{}, rocksky_models:encode_delete_playlist_input(Input), {record, 'delete_playlist_output'}).

-spec library_delete_song(client(), rocksky_models:delete_song_input()) -> {ok, rocksky_models:delete_song_output()} | {error, error()}.
library_delete_song(Client, Input) -> call(Client, post, <<"app.rocksky.library.deleteSong">>, #{}, rocksky_models:encode_delete_song_input(Input), {record, 'delete_song_output'}).

-spec library_get_album(client(), rocksky_models:library_get_album_params()) -> {ok, rocksky_models:library_get_album_output()} | {error, error()}.
library_get_album(Client, Params) -> call(Client, get, <<"app.rocksky.library.getAlbum">>, rocksky_models:encode_library_get_album_params(Params), undefined, {record, 'library_get_album_output'}).

-spec library_get_album_info(client(), rocksky_models:get_album_info_params()) -> {ok, rocksky_models:get_album_info_output()} | {error, error()}.
library_get_album_info(Client, Params) -> call(Client, get, <<"app.rocksky.library.getAlbumInfo">>, rocksky_models:encode_get_album_info_params(Params), undefined, {record, 'get_album_info_output'}).

-spec library_get_album_list(client(), rocksky_models:get_album_list_params()) -> {ok, rocksky_models:get_album_list_output()} | {error, error()}.
library_get_album_list(Client, Params) -> call(Client, get, <<"app.rocksky.library.getAlbumList">>, rocksky_models:encode_get_album_list_params(Params), undefined, {record, 'get_album_list_output'}).

-spec library_get_artist(client(), rocksky_models:library_get_artist_params()) -> {ok, rocksky_models:library_get_artist_output()} | {error, error()}.
library_get_artist(Client, Params) -> call(Client, get, <<"app.rocksky.library.getArtist">>, rocksky_models:encode_library_get_artist_params(Params), undefined, {record, 'library_get_artist_output'}).

-spec library_get_artist_info(client(), rocksky_models:get_artist_info_params()) -> {ok, rocksky_models:get_artist_info_output()} | {error, error()}.
library_get_artist_info(Client, Params) -> call(Client, get, <<"app.rocksky.library.getArtistInfo">>, rocksky_models:encode_get_artist_info_params(Params), undefined, {record, 'get_artist_info_output'}).

-spec library_get_artists(client(), rocksky_models:library_get_artists_params()) -> {ok, rocksky_models:library_get_artists_output()} | {error, error()}.
library_get_artists(Client, Params) -> call(Client, get, <<"app.rocksky.library.getArtists">>, rocksky_models:encode_library_get_artists_params(Params), undefined, {record, 'library_get_artists_output'}).

-spec library_get_cover_art_url(client(), rocksky_models:get_cover_art_url_params()) -> {ok, rocksky_models:get_cover_art_url_output()} | {error, error()}.
library_get_cover_art_url(Client, Params) -> call(Client, get, <<"app.rocksky.library.getCoverArtUrl">>, rocksky_models:encode_get_cover_art_url_params(Params), undefined, {record, 'get_cover_art_url_output'}).

-spec library_get_download_url(client(), rocksky_models:get_download_url_params()) -> {ok, rocksky_models:get_download_url_output()} | {error, error()}.
library_get_download_url(Client, Params) -> call(Client, get, <<"app.rocksky.library.getDownloadUrl">>, rocksky_models:encode_get_download_url_params(Params), undefined, {record, 'get_download_url_output'}).

-spec library_get_genres(client(), rocksky_models:get_genres_params()) -> {ok, rocksky_models:get_genres_output()} | {error, error()}.
library_get_genres(Client, Params) -> call(Client, get, <<"app.rocksky.library.getGenres">>, rocksky_models:encode_get_genres_params(Params), undefined, {record, 'get_genres_output'}).

-spec library_get_indexes(client(), rocksky_models:get_indexes_params()) -> {ok, rocksky_models:get_indexes_output()} | {error, error()}.
library_get_indexes(Client, Params) -> call(Client, get, <<"app.rocksky.library.getIndexes">>, rocksky_models:encode_get_indexes_params(Params), undefined, {record, 'get_indexes_output'}).

-spec library_get_internet_radio_stations(client(), rocksky_models:get_internet_radio_stations_params()) -> {ok, rocksky_models:get_internet_radio_stations_output()} | {error, error()}.
library_get_internet_radio_stations(Client, Params) -> call(Client, get, <<"app.rocksky.library.getInternetRadioStations">>, rocksky_models:encode_get_internet_radio_stations_params(Params), undefined, {record, 'get_internet_radio_stations_output'}).

-spec library_get_license(client(), rocksky_models:get_license_params()) -> {ok, rocksky_models:get_license_output()} | {error, error()}.
library_get_license(Client, Params) -> call(Client, get, <<"app.rocksky.library.getLicense">>, rocksky_models:encode_get_license_params(Params), undefined, {record, 'get_license_output'}).

-spec library_get_lyrics(client(), rocksky_models:get_lyrics_params()) -> {ok, rocksky_models:get_lyrics_output()} | {error, error()}.
library_get_lyrics(Client, Params) -> call(Client, get, <<"app.rocksky.library.getLyrics">>, rocksky_models:encode_get_lyrics_params(Params), undefined, {record, 'get_lyrics_output'}).

-spec library_get_music_directory(client(), rocksky_models:get_music_directory_params()) -> {ok, rocksky_models:get_music_directory_output()} | {error, error()}.
library_get_music_directory(Client, Params) -> call(Client, get, <<"app.rocksky.library.getMusicDirectory">>, rocksky_models:encode_get_music_directory_params(Params), undefined, {record, 'get_music_directory_output'}).

-spec library_get_music_folders(client(), rocksky_models:get_music_folders_params()) -> {ok, rocksky_models:get_music_folders_output()} | {error, error()}.
library_get_music_folders(Client, Params) -> call(Client, get, <<"app.rocksky.library.getMusicFolders">>, rocksky_models:encode_get_music_folders_params(Params), undefined, {record, 'get_music_folders_output'}).

-spec library_get_now_playing(client(), rocksky_models:get_now_playing_params()) -> {ok, rocksky_models:get_now_playing_output()} | {error, error()}.
library_get_now_playing(Client, Params) -> call(Client, get, <<"app.rocksky.library.getNowPlaying">>, rocksky_models:encode_get_now_playing_params(Params), undefined, {record, 'get_now_playing_output'}).

-spec library_get_playlist(client(), rocksky_models:library_get_playlist_params()) -> {ok, rocksky_models:library_get_playlist_output()} | {error, error()}.
library_get_playlist(Client, Params) -> call(Client, get, <<"app.rocksky.library.getPlaylist">>, rocksky_models:encode_library_get_playlist_params(Params), undefined, {record, 'library_get_playlist_output'}).

-spec library_get_playlists(client(), rocksky_models:library_get_playlists_params()) -> {ok, rocksky_models:library_get_playlists_output()} | {error, error()}.
library_get_playlists(Client, Params) -> call(Client, get, <<"app.rocksky.library.getPlaylists">>, rocksky_models:encode_library_get_playlists_params(Params), undefined, {record, 'library_get_playlists_output'}).

-spec library_get_play_queue(client(), rocksky_models:get_play_queue_params()) -> {ok, rocksky_models:get_play_queue_output()} | {error, error()}.
library_get_play_queue(Client, Params) -> call(Client, get, <<"app.rocksky.library.getPlayQueue">>, rocksky_models:encode_get_play_queue_params(Params), undefined, {record, 'get_play_queue_output'}).

-spec library_get_random_songs(client(), rocksky_models:get_random_songs_params()) -> {ok, rocksky_models:get_random_songs_output()} | {error, error()}.
library_get_random_songs(Client, Params) -> call(Client, get, <<"app.rocksky.library.getRandomSongs">>, rocksky_models:encode_get_random_songs_params(Params), undefined, {record, 'get_random_songs_output'}).

-spec library_get_scan_status(client(), rocksky_models:get_scan_status_params()) -> {ok, rocksky_models:get_scan_status_output()} | {error, error()}.
library_get_scan_status(Client, Params) -> call(Client, get, <<"app.rocksky.library.getScanStatus">>, rocksky_models:encode_get_scan_status_params(Params), undefined, {record, 'get_scan_status_output'}).

-spec library_get_similar_songs(client(), rocksky_models:get_similar_songs_params()) -> {ok, rocksky_models:get_similar_songs_output()} | {error, error()}.
library_get_similar_songs(Client, Params) -> call(Client, get, <<"app.rocksky.library.getSimilarSongs">>, rocksky_models:encode_get_similar_songs_params(Params), undefined, {record, 'get_similar_songs_output'}).

-spec library_get_song(client(), rocksky_models:library_get_song_params()) -> {ok, rocksky_models:library_get_song_output()} | {error, error()}.
library_get_song(Client, Params) -> call(Client, get, <<"app.rocksky.library.getSong">>, rocksky_models:encode_library_get_song_params(Params), undefined, {record, 'library_get_song_output'}).

-spec library_get_songs_by_genre(client(), rocksky_models:get_songs_by_genre_params()) -> {ok, rocksky_models:get_songs_by_genre_output()} | {error, error()}.
library_get_songs_by_genre(Client, Params) -> call(Client, get, <<"app.rocksky.library.getSongsByGenre">>, rocksky_models:encode_get_songs_by_genre_params(Params), undefined, {record, 'get_songs_by_genre_output'}).

-spec library_get_starred(client(), rocksky_models:get_starred_params()) -> {ok, rocksky_models:get_starred_output()} | {error, error()}.
library_get_starred(Client, Params) -> call(Client, get, <<"app.rocksky.library.getStarred">>, rocksky_models:encode_get_starred_params(Params), undefined, {record, 'get_starred_output'}).

-spec library_get_stream_url(client(), rocksky_models:get_stream_url_params()) -> {ok, rocksky_models:get_stream_url_output()} | {error, error()}.
library_get_stream_url(Client, Params) -> call(Client, get, <<"app.rocksky.library.getStreamUrl">>, rocksky_models:encode_get_stream_url_params(Params), undefined, {record, 'get_stream_url_output'}).

-spec library_get_top_songs(client(), rocksky_models:get_top_songs_params()) -> {ok, rocksky_models:get_top_songs_output()} | {error, error()}.
library_get_top_songs(Client, Params) -> call(Client, get, <<"app.rocksky.library.getTopSongs">>, rocksky_models:encode_get_top_songs_params(Params), undefined, {record, 'get_top_songs_output'}).

-spec library_get_user(client(), rocksky_models:get_user_params()) -> {ok, rocksky_models:get_user_output()} | {error, error()}.
library_get_user(Client, Params) -> call(Client, get, <<"app.rocksky.library.getUser">>, rocksky_models:encode_get_user_params(Params), undefined, {record, 'get_user_output'}).

-spec library_ping(client(), rocksky_models:ping_params()) -> {ok, rocksky_models:ping_output()} | {error, error()}.
library_ping(Client, Params) -> call(Client, get, <<"app.rocksky.library.ping">>, rocksky_models:encode_ping_params(Params), undefined, {record, 'ping_output'}).

-spec library_save_play_queue(client(), rocksky_models:save_play_queue_input()) -> {ok, rocksky_models:save_play_queue_output()} | {error, error()}.
library_save_play_queue(Client, Input) -> call(Client, post, <<"app.rocksky.library.savePlayQueue">>, #{}, rocksky_models:encode_save_play_queue_input(Input), {record, 'save_play_queue_output'}).

-spec library_scrobble(client(), rocksky_models:scrobble_input()) -> {ok, rocksky_models:scrobble_output()} | {error, error()}.
library_scrobble(Client, Input) -> call(Client, post, <<"app.rocksky.library.scrobble">>, #{}, rocksky_models:encode_scrobble_input(Input), {record, 'scrobble_output'}).

-spec library_search(client(), rocksky_models:library_search_params()) -> {ok, rocksky_models:library_search_output()} | {error, error()}.
library_search(Client, Params) -> call(Client, get, <<"app.rocksky.library.search">>, rocksky_models:encode_library_search_params(Params), undefined, {record, 'library_search_output'}).

-spec library_star(client(), rocksky_models:star_input()) -> {ok, rocksky_models:star_output()} | {error, error()}.
library_star(Client, Input) -> call(Client, post, <<"app.rocksky.library.star">>, #{}, rocksky_models:encode_star_input(Input), {record, 'star_output'}).

-spec library_start_scan(client(), rocksky_models:start_scan_params()) -> {ok, rocksky_models:start_scan_output()} | {error, error()}.
library_start_scan(Client, Params) -> call(Client, get, <<"app.rocksky.library.startScan">>, rocksky_models:encode_start_scan_params(Params), undefined, {record, 'start_scan_output'}).

-spec library_unstar(client(), rocksky_models:unstar_input()) -> {ok, rocksky_models:unstar_output()} | {error, error()}.
library_unstar(Client, Input) -> call(Client, post, <<"app.rocksky.library.unstar">>, #{}, rocksky_models:encode_unstar_input(Input), {record, 'unstar_output'}).

-spec library_update_now_playing(client(), rocksky_models:update_now_playing_input()) -> {ok, rocksky_models:update_now_playing_output()} | {error, error()}.
library_update_now_playing(Client, Input) -> call(Client, post, <<"app.rocksky.library.updateNowPlaying">>, #{}, rocksky_models:encode_update_now_playing_input(Input), {record, 'update_now_playing_output'}).

-spec library_update_playlist(client(), rocksky_models:library_update_playlist_input()) -> {ok, rocksky_models:library_update_playlist_output()} | {error, error()}.
library_update_playlist(Client, Input) -> call(Client, post, <<"app.rocksky.library.updatePlaylist">>, #{}, rocksky_models:encode_library_update_playlist_input(Input), {record, 'library_update_playlist_output'}).

-spec like_dislike_shout(client(), rocksky_models:dislike_shout_input()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
like_dislike_shout(Client, Input) -> call(Client, post, <<"app.rocksky.like.dislikeShout">>, #{}, rocksky_models:encode_dislike_shout_input(Input), {record, 'shout_view'}).

-spec like_dislike_song(client(), rocksky_models:dislike_song_input()) -> {ok, rocksky_models:song_view_detailed()} | {error, error()}.
like_dislike_song(Client, Input) -> call(Client, post, <<"app.rocksky.like.dislikeSong">>, #{}, rocksky_models:encode_dislike_song_input(Input), {record, 'song_view_detailed'}).

-spec like_like_shout(client(), rocksky_models:like_shout_input()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
like_like_shout(Client, Input) -> call(Client, post, <<"app.rocksky.like.likeShout">>, #{}, rocksky_models:encode_like_shout_input(Input), {record, 'shout_view'}).

-spec like_like_song(client(), rocksky_models:like_song_input()) -> {ok, rocksky_models:song_view_detailed()} | {error, error()}.
like_like_song(Client, Input) -> call(Client, post, <<"app.rocksky.like.likeSong">>, #{}, rocksky_models:encode_like_song_input(Input), {record, 'song_view_detailed'}).

-spec mirror_get_mirror_sources(client(), rocksky_models:get_mirror_sources_params()) -> {ok, rocksky_models:get_mirror_sources_output()} | {error, error()}.
mirror_get_mirror_sources(Client, Params) -> call(Client, get, <<"app.rocksky.mirror.getMirrorSources">>, rocksky_models:encode_get_mirror_sources_params(Params), undefined, {record, 'get_mirror_sources_output'}).

-spec mirror_put_mirror_source(client(), rocksky_models:put_mirror_source_input()) -> {ok, rocksky_models:mirror_source_view()} | {error, error()}.
mirror_put_mirror_source(Client, Input) -> call(Client, post, <<"app.rocksky.mirror.putMirrorSource">>, #{}, rocksky_models:encode_put_mirror_source_input(Input), {record, 'mirror_source_view'}).

-spec notification_get_unread_count(client()) -> {ok, rocksky_models:get_unread_count_output()} | {error, error()}.
notification_get_unread_count(Client) -> call(Client, get, <<"app.rocksky.notification.getUnreadCount">>, #{}, undefined, {record, 'get_unread_count_output'}).

-spec notification_list_notifications(client(), rocksky_models:list_notifications_params()) -> {ok, rocksky_models:list_notifications_output()} | {error, error()}.
notification_list_notifications(Client, Params) -> call(Client, get, <<"app.rocksky.notification.listNotifications">>, rocksky_models:encode_list_notifications_params(Params), undefined, {record, 'list_notifications_output'}).

-spec notification_update_seen(client(), rocksky_models:update_seen_input()) -> {ok, rocksky_models:update_seen_output()} | {error, error()}.
notification_update_seen(Client, Input) -> call(Client, post, <<"app.rocksky.notification.updateSeen">>, #{}, rocksky_models:encode_update_seen_input(Input), {record, 'update_seen_output'}).

-spec player_add_directory_to_queue(client(), rocksky_models:add_directory_to_queue_params()) -> {ok, nil} | {error, error()}.
player_add_directory_to_queue(Client, Params) -> call(Client, post, <<"app.rocksky.player.addDirectoryToQueue">>, rocksky_models:encode_add_directory_to_queue_params(Params), undefined, none).

-spec player_add_items_to_queue(client(), rocksky_models:add_items_to_queue_params()) -> {ok, nil} | {error, error()}.
player_add_items_to_queue(Client, Params) -> call(Client, post, <<"app.rocksky.player.addItemsToQueue">>, rocksky_models:encode_add_items_to_queue_params(Params), undefined, none).

-spec player_get_currently_playing(client(), rocksky_models:player_get_currently_playing_params()) -> {ok, rocksky_models:player_currently_playing_view_detailed()} | {error, error()}.
player_get_currently_playing(Client, Params) -> call(Client, get, <<"app.rocksky.player.getCurrentlyPlaying">>, rocksky_models:encode_player_get_currently_playing_params(Params), undefined, {record, 'player_currently_playing_view_detailed'}).

-spec player_get_playback_queue(client(), rocksky_models:get_playback_queue_params()) -> {ok, rocksky_models:player_playback_queue_view_detailed()} | {error, error()}.
player_get_playback_queue(Client, Params) -> call(Client, get, <<"app.rocksky.player.getPlaybackQueue">>, rocksky_models:encode_get_playback_queue_params(Params), undefined, {record, 'player_playback_queue_view_detailed'}).

-spec player_next(client(), rocksky_models:player_next_params()) -> {ok, nil} | {error, error()}.
player_next(Client, Params) -> call(Client, post, <<"app.rocksky.player.next">>, rocksky_models:encode_player_next_params(Params), undefined, none).

-spec player_pause(client(), rocksky_models:player_pause_params()) -> {ok, nil} | {error, error()}.
player_pause(Client, Params) -> call(Client, post, <<"app.rocksky.player.pause">>, rocksky_models:encode_player_pause_params(Params), undefined, none).

-spec player_play(client(), rocksky_models:player_play_params()) -> {ok, nil} | {error, error()}.
player_play(Client, Params) -> call(Client, post, <<"app.rocksky.player.play">>, rocksky_models:encode_player_play_params(Params), undefined, none).

-spec player_play_directory(client(), rocksky_models:play_directory_params()) -> {ok, nil} | {error, error()}.
player_play_directory(Client, Params) -> call(Client, post, <<"app.rocksky.player.playDirectory">>, rocksky_models:encode_play_directory_params(Params), undefined, none).

-spec player_play_file(client(), rocksky_models:play_file_params()) -> {ok, nil} | {error, error()}.
player_play_file(Client, Params) -> call(Client, post, <<"app.rocksky.player.playFile">>, rocksky_models:encode_play_file_params(Params), undefined, none).

-spec player_previous(client(), rocksky_models:player_previous_params()) -> {ok, nil} | {error, error()}.
player_previous(Client, Params) -> call(Client, post, <<"app.rocksky.player.previous">>, rocksky_models:encode_player_previous_params(Params), undefined, none).

-spec player_seek(client(), rocksky_models:player_seek_params()) -> {ok, nil} | {error, error()}.
player_seek(Client, Params) -> call(Client, post, <<"app.rocksky.player.seek">>, rocksky_models:encode_player_seek_params(Params), undefined, none).

-spec playlist_add_songs(client(), rocksky_models:add_songs_params()) -> {ok, rocksky_models:add_songs_output()} | {error, error()}.
playlist_add_songs(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.addSongs">>, rocksky_models:encode_add_songs_params(Params), undefined, {record, 'add_songs_output'}).

-spec playlist_create_playlist(client(), rocksky_models:playlist_create_playlist_params()) -> {ok, rocksky_models:playlist_create_playlist_output()} | {error, error()}.
playlist_create_playlist(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.createPlaylist">>, rocksky_models:encode_playlist_create_playlist_params(Params), undefined, {record, 'playlist_create_playlist_output'}).

-spec playlist_get_playlist(client(), rocksky_models:playlist_get_playlist_params()) -> {ok, rocksky_models:playlist_view_detailed()} | {error, error()}.
playlist_get_playlist(Client, Params) -> call(Client, get, <<"app.rocksky.playlist.getPlaylist">>, rocksky_models:encode_playlist_get_playlist_params(Params), undefined, {record, 'playlist_view_detailed'}).

-spec playlist_get_playlists(client(), rocksky_models:playlist_get_playlists_params()) -> {ok, rocksky_models:playlist_get_playlists_output()} | {error, error()}.
playlist_get_playlists(Client, Params) -> call(Client, get, <<"app.rocksky.playlist.getPlaylists">>, rocksky_models:encode_playlist_get_playlists_params(Params), undefined, {record, 'playlist_get_playlists_output'}).

-spec playlist_insert_directory(client(), rocksky_models:insert_directory_params()) -> {ok, nil} | {error, error()}.
playlist_insert_directory(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.insertDirectory">>, rocksky_models:encode_insert_directory_params(Params), undefined, none).

-spec playlist_insert_files(client(), rocksky_models:insert_files_params()) -> {ok, nil} | {error, error()}.
playlist_insert_files(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.insertFiles">>, rocksky_models:encode_insert_files_params(Params), undefined, none).

-spec playlist_remove_playlist(client(), rocksky_models:remove_playlist_params()) -> {ok, nil} | {error, error()}.
playlist_remove_playlist(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.removePlaylist">>, rocksky_models:encode_remove_playlist_params(Params), undefined, none).

-spec playlist_remove_track(client(), rocksky_models:remove_track_params()) -> {ok, nil} | {error, error()}.
playlist_remove_track(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.removeTrack">>, rocksky_models:encode_remove_track_params(Params), undefined, none).

-spec playlist_start_playlist(client(), rocksky_models:start_playlist_params()) -> {ok, nil} | {error, error()}.
playlist_start_playlist(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.startPlaylist">>, rocksky_models:encode_start_playlist_params(Params), undefined, none).

-spec playlist_update_playlist(client(), rocksky_models:playlist_update_playlist_params()) -> {ok, rocksky_models:playlist_update_playlist_output()} | {error, error()}.
playlist_update_playlist(Client, Params) -> call(Client, post, <<"app.rocksky.playlist.updatePlaylist">>, rocksky_models:encode_playlist_update_playlist_params(Params), undefined, {record, 'playlist_update_playlist_output'}).

-spec rockbox_get_audio_settings(client(), rocksky_models:get_audio_settings_params()) -> {ok, rocksky_models:rockbox_settings_view()} | {error, error()}.
rockbox_get_audio_settings(Client, Params) -> call(Client, get, <<"app.rocksky.rockbox.getAudioSettings">>, rocksky_models:encode_get_audio_settings_params(Params), undefined, {record, 'rockbox_settings_view'}).

-spec rockbox_put_audio_settings(client(), rocksky_models:put_audio_settings_input()) -> {ok, rocksky_models:rockbox_settings_view()} | {error, error()}.
rockbox_put_audio_settings(Client, Input) -> call(Client, post, <<"app.rocksky.rockbox.putAudioSettings">>, #{}, rocksky_models:encode_put_audio_settings_input(Input), {record, 'rockbox_settings_view'}).

-spec scrobble_create_scrobble(client(), rocksky_models:create_scrobble_input()) -> {ok, rocksky_models:scrobble_view_basic()} | {error, error()}.
scrobble_create_scrobble(Client, Input) -> call(Client, post, <<"app.rocksky.scrobble.createScrobble">>, #{}, rocksky_models:encode_create_scrobble_input(Input), {record, 'scrobble_view_basic'}).

-spec scrobble_get_scrobble(client(), rocksky_models:get_scrobble_params()) -> {ok, rocksky_models:scrobble_view_detailed()} | {error, error()}.
scrobble_get_scrobble(Client, Params) -> call(Client, get, <<"app.rocksky.scrobble.getScrobble">>, rocksky_models:encode_get_scrobble_params(Params), undefined, {record, 'scrobble_view_detailed'}).

-spec scrobble_get_scrobbles(client(), rocksky_models:get_scrobbles_params()) -> {ok, rocksky_models:get_scrobbles_output()} | {error, error()}.
scrobble_get_scrobbles(Client, Params) -> call(Client, get, <<"app.rocksky.scrobble.getScrobbles">>, rocksky_models:encode_get_scrobbles_params(Params), undefined, {record, 'get_scrobbles_output'}).

-spec shout_create_shout(client(), rocksky_models:create_shout_input()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
shout_create_shout(Client, Input) -> call(Client, post, <<"app.rocksky.shout.createShout">>, #{}, rocksky_models:encode_create_shout_input(Input), {record, 'shout_view'}).

-spec shout_get_album_shouts(client(), rocksky_models:get_album_shouts_params()) -> {ok, rocksky_models:get_album_shouts_output()} | {error, error()}.
shout_get_album_shouts(Client, Params) -> call(Client, get, <<"app.rocksky.shout.getAlbumShouts">>, rocksky_models:encode_get_album_shouts_params(Params), undefined, {record, 'get_album_shouts_output'}).

-spec shout_get_artist_shouts(client(), rocksky_models:get_artist_shouts_params()) -> {ok, rocksky_models:get_artist_shouts_output()} | {error, error()}.
shout_get_artist_shouts(Client, Params) -> call(Client, get, <<"app.rocksky.shout.getArtistShouts">>, rocksky_models:encode_get_artist_shouts_params(Params), undefined, {record, 'get_artist_shouts_output'}).

-spec shout_get_profile_shouts(client(), rocksky_models:get_profile_shouts_params()) -> {ok, rocksky_models:get_profile_shouts_output()} | {error, error()}.
shout_get_profile_shouts(Client, Params) -> call(Client, get, <<"app.rocksky.shout.getProfileShouts">>, rocksky_models:encode_get_profile_shouts_params(Params), undefined, {record, 'get_profile_shouts_output'}).

-spec shout_get_shout_replies(client(), rocksky_models:get_shout_replies_params()) -> {ok, rocksky_models:get_shout_replies_output()} | {error, error()}.
shout_get_shout_replies(Client, Params) -> call(Client, get, <<"app.rocksky.shout.getShoutReplies">>, rocksky_models:encode_get_shout_replies_params(Params), undefined, {record, 'get_shout_replies_output'}).

-spec shout_get_track_shouts(client(), rocksky_models:get_track_shouts_params()) -> {ok, rocksky_models:get_track_shouts_output()} | {error, error()}.
shout_get_track_shouts(Client, Params) -> call(Client, get, <<"app.rocksky.shout.getTrackShouts">>, rocksky_models:encode_get_track_shouts_params(Params), undefined, {record, 'get_track_shouts_output'}).

-spec shout_remove_shout(client(), rocksky_models:remove_shout_params()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
shout_remove_shout(Client, Params) -> call(Client, post, <<"app.rocksky.shout.removeShout">>, rocksky_models:encode_remove_shout_params(Params), undefined, {record, 'shout_view'}).

-spec shout_reply_shout(client(), rocksky_models:reply_shout_input()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
shout_reply_shout(Client, Input) -> call(Client, post, <<"app.rocksky.shout.replyShout">>, #{}, rocksky_models:encode_reply_shout_input(Input), {record, 'shout_view'}).

-spec shout_report_shout(client(), rocksky_models:report_shout_input()) -> {ok, rocksky_models:shout_view()} | {error, error()}.
shout_report_shout(Client, Input) -> call(Client, post, <<"app.rocksky.shout.reportShout">>, #{}, rocksky_models:encode_report_shout_input(Input), {record, 'shout_view'}).

-spec song_create_song(client(), rocksky_models:create_song_input()) -> {ok, rocksky_models:song_view_detailed()} | {error, error()}.
song_create_song(Client, Input) -> call(Client, post, <<"app.rocksky.song.createSong">>, #{}, rocksky_models:encode_create_song_input(Input), {record, 'song_view_detailed'}).

-spec song_get_song(client(), rocksky_models:song_get_song_params()) -> {ok, rocksky_models:song_view_detailed()} | {error, error()}.
song_get_song(Client, Params) -> call(Client, get, <<"app.rocksky.song.getSong">>, rocksky_models:encode_song_get_song_params(Params), undefined, {record, 'song_view_detailed'}).

-spec song_get_song_recent_listeners(client(), rocksky_models:get_song_recent_listeners_params()) -> {ok, rocksky_models:get_song_recent_listeners_output()} | {error, error()}.
song_get_song_recent_listeners(Client, Params) -> call(Client, get, <<"app.rocksky.song.getSongRecentListeners">>, rocksky_models:encode_get_song_recent_listeners_params(Params), undefined, {record, 'get_song_recent_listeners_output'}).

-spec song_get_songs(client(), rocksky_models:get_songs_params()) -> {ok, rocksky_models:get_songs_output()} | {error, error()}.
song_get_songs(Client, Params) -> call(Client, get, <<"app.rocksky.song.getSongs">>, rocksky_models:encode_get_songs_params(Params), undefined, {record, 'get_songs_output'}).

-spec song_match_song(client(), rocksky_models:match_song_params()) -> {ok, rocksky_models:song_view_detailed()} | {error, error()}.
song_match_song(Client, Params) -> call(Client, get, <<"app.rocksky.song.matchSong">>, rocksky_models:encode_match_song_params(Params), undefined, {record, 'song_view_detailed'}).

-spec spotify_get_currently_playing(client(), rocksky_models:spotify_get_currently_playing_params()) -> {ok, rocksky_models:player_currently_playing_view_detailed()} | {error, error()}.
spotify_get_currently_playing(Client, Params) -> call(Client, get, <<"app.rocksky.spotify.getCurrentlyPlaying">>, rocksky_models:encode_spotify_get_currently_playing_params(Params), undefined, {record, 'player_currently_playing_view_detailed'}).

-spec spotify_next(client()) -> {ok, nil} | {error, error()}.
spotify_next(Client) -> call(Client, post, <<"app.rocksky.spotify.next">>, #{}, undefined, none).

-spec spotify_pause(client()) -> {ok, nil} | {error, error()}.
spotify_pause(Client) -> call(Client, post, <<"app.rocksky.spotify.pause">>, #{}, undefined, none).

-spec spotify_play(client()) -> {ok, nil} | {error, error()}.
spotify_play(Client) -> call(Client, post, <<"app.rocksky.spotify.play">>, #{}, undefined, none).

-spec spotify_previous(client()) -> {ok, nil} | {error, error()}.
spotify_previous(Client) -> call(Client, post, <<"app.rocksky.spotify.previous">>, #{}, undefined, none).

-spec spotify_seek(client(), rocksky_models:spotify_seek_params()) -> {ok, nil} | {error, error()}.
spotify_seek(Client, Params) -> call(Client, post, <<"app.rocksky.spotify.seek">>, rocksky_models:encode_spotify_seek_params(Params), undefined, none).

-spec stats_get_global_stats(client(), rocksky_models:get_global_stats_params()) -> {ok, rocksky_models:stats_global_stats_view()} | {error, error()}.
stats_get_global_stats(Client, Params) -> call(Client, get, <<"app.rocksky.stats.getGlobalStats">>, rocksky_models:encode_get_global_stats_params(Params), undefined, {record, 'stats_global_stats_view'}).

-spec stats_get_stats(client(), rocksky_models:get_stats_params()) -> {ok, rocksky_models:stats_view()} | {error, error()}.
stats_get_stats(Client, Params) -> call(Client, get, <<"app.rocksky.stats.getStats">>, rocksky_models:encode_get_stats_params(Params), undefined, {record, 'stats_view'}).

-spec stats_get_wrapped(client(), rocksky_models:get_wrapped_params()) -> {ok, rocksky_models:stats_wrapped_view()} | {error, error()}.
stats_get_wrapped(Client, Params) -> call(Client, get, <<"app.rocksky.stats.getWrapped">>, rocksky_models:encode_get_wrapped_params(Params), undefined, {record, 'stats_wrapped_view'}).
