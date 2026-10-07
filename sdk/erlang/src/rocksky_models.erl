%% Generated from lexicons.
-module(rocksky_models).
-include("rocksky_models.hrl").
-export([schema/1, decode_blob_cid_ref/1, encode_blob_cid_ref/1, decode_blob_ref/1, encode_blob_ref/1, decode_actor_artist_view_basic/1, encode_actor_artist_view_basic/1, decode_actor_compatibility_view_basic/1, encode_actor_compatibility_view_basic/1, decode_actor_neighbour_view_basic/1, encode_actor_neighbour_view_basic/1, decode_actor_profile_view_basic/1, encode_actor_profile_view_basic/1, decode_actor_profile_view_detailed/1, encode_actor_profile_view_detailed/1, decode_actor_response_dropbox_view/1, encode_actor_response_dropbox_view/1, decode_actor_response_googledrive_view/1, encode_actor_response_googledrive_view/1, decode_actor_response_spotify_user_view/1, encode_actor_response_spotify_user_view/1, decode_actor_track_view/1, encode_actor_track_view/1, decode_add_directory_to_queue_params/1, encode_add_directory_to_queue_params/1, decode_add_items_to_queue_params/1, encode_add_items_to_queue_params/1, decode_add_songs_output/1, encode_add_songs_output/1, decode_add_songs_params/1, encode_add_songs_params/1, decode_album_discogs_artist_view/1, encode_album_discogs_artist_view/1, decode_album_discogs_credit_view/1, encode_album_discogs_credit_view/1, decode_album_discogs_identifier_view/1, encode_album_discogs_identifier_view/1, decode_album_discogs_label_view/1, encode_album_discogs_label_view/1, decode_album_discogs_master_view/1, encode_album_discogs_master_view/1, decode_album_discogs_track_view/1, encode_album_discogs_track_view/1, decode_album_discogs_view/1, encode_album_discogs_view/1, decode_album_get_album_params/1, encode_album_get_album_params/1, decode_album_record/1, encode_album_record/1, decode_album_view_basic/1, encode_album_view_basic/1, decode_album_view_detailed/1, encode_album_view_detailed/1, decode_api_key_view/1, encode_api_key_view/1, decode_artist_get_artist_params/1, encode_artist_get_artist_params/1, decode_artist_get_artists_output/1, encode_artist_get_artists_output/1, decode_artist_get_artists_params/1, encode_artist_get_artists_params/1, decode_artist_listener_view_basic/1, encode_artist_listener_view_basic/1, decode_artist_mbid/1, encode_artist_mbid/1, decode_artist_recent_listener_view/1, encode_artist_recent_listener_view/1, decode_artist_record/1, encode_artist_record/1, decode_artist_song_view_basic/1, encode_artist_song_view_basic/1, decode_artist_view_basic/1, encode_artist_view_basic/1, decode_artist_view_detailed/1, encode_artist_view_detailed/1, decode_charts_decade_view_basic/1, encode_charts_decade_view_basic/1, decode_charts_scrobbler_view_basic/1, encode_charts_scrobbler_view_basic/1, decode_charts_scrobble_view_basic/1, encode_charts_scrobble_view_basic/1, decode_charts_view/1, encode_charts_view/1, decode_create_apikey_input/1, encode_create_apikey_input/1, decode_create_scrobble_input/1, encode_create_scrobble_input/1, decode_create_shout_input/1, encode_create_shout_input/1, decode_create_song_input/1, encode_create_song_input/1, decode_delete_album_input/1, encode_delete_album_input/1, decode_delete_album_output/1, encode_delete_album_output/1, decode_delete_playlist_input/1, encode_delete_playlist_input/1, decode_delete_playlist_output/1, encode_delete_playlist_output/1, decode_delete_preset_params/1, encode_delete_preset_params/1, decode_delete_song_input/1, encode_delete_song_input/1, decode_delete_song_output/1, encode_delete_song_output/1, decode_describe_feed_generator_output/1, encode_describe_feed_generator_output/1, decode_dislike_shout_input/1, encode_dislike_shout_input/1, decode_dislike_song_input/1, encode_dislike_song_input/1, decode_dropbox_download_file_params/1, encode_dropbox_download_file_params/1, decode_dropbox_file_list_view/1, encode_dropbox_file_list_view/1, decode_dropbox_file_view/1, encode_dropbox_file_view/1, decode_dropbox_get_files_params/1, encode_dropbox_get_files_params/1, decode_dropbox_response_directories_item_view/1, encode_dropbox_response_directories_item_view/1, decode_dropbox_response_directory_view/1, encode_dropbox_response_directory_view/1, decode_dropbox_response_parent_directory_view/1, encode_dropbox_response_parent_directory_view/1, decode_dropbox_temporary_link_view/1, encode_dropbox_temporary_link_view/1, decode_equalizer_preset_view/1, encode_equalizer_preset_view/1, decode_equalizer_record/1, encode_equalizer_record/1, decode_feed_generators_view/1, encode_feed_generators_view/1, decode_feed_generator_view/1, encode_feed_generator_view/1, decode_feed_item_view/1, encode_feed_item_view/1, decode_feed_recommendations_view/1, encode_feed_recommendations_view/1, decode_feed_recommendation_view/1, encode_feed_recommendation_view/1, decode_feed_recommended_albums_view/1, encode_feed_recommended_albums_view/1, decode_feed_recommended_album_view/1, encode_feed_recommended_album_view/1, decode_feed_recommended_artists_view/1, encode_feed_recommended_artists_view/1, decode_feed_recommended_artist_view/1, encode_feed_recommended_artist_view/1, decode_feed_search_federation/1, encode_feed_search_federation/1, decode_feed_search_hit/1, encode_feed_search_hit/1, decode_feed_search_params/1, encode_feed_search_params/1, decode_feed_search_results_view/1, encode_feed_search_results_view/1, decode_feed_stories_view/1, encode_feed_stories_view/1, decode_feed_story_view/1, encode_feed_story_view/1, decode_feed_uri_view/1, encode_feed_uri_view/1, decode_feed_view/1, encode_feed_view/1, decode_follow_account_output/1, encode_follow_account_output/1, decode_follow_account_params/1, encode_follow_account_params/1, decode_follow_record/1, encode_follow_record/1, decode_generator_record/1, encode_generator_record/1, decode_get_actor_albums_output/1, encode_get_actor_albums_output/1, decode_get_actor_albums_params/1, encode_get_actor_albums_params/1, decode_get_actor_artists_output/1, encode_get_actor_artists_output/1, decode_get_actor_artists_params/1, encode_get_actor_artists_params/1, decode_get_actor_compatibility_output/1, encode_get_actor_compatibility_output/1, decode_get_actor_compatibility_params/1, encode_get_actor_compatibility_params/1, decode_get_actor_loved_songs_output/1, encode_get_actor_loved_songs_output/1, decode_get_actor_loved_songs_params/1, encode_get_actor_loved_songs_params/1, decode_get_actor_neighbours_output/1, encode_get_actor_neighbours_output/1, decode_get_actor_neighbours_params/1, encode_get_actor_neighbours_params/1, decode_get_actor_playlists_output/1, encode_get_actor_playlists_output/1, decode_get_actor_playlists_params/1, encode_get_actor_playlists_params/1, decode_get_actor_scrobbles_output/1, encode_get_actor_scrobbles_output/1, decode_get_actor_scrobbles_params/1, encode_get_actor_scrobbles_params/1, decode_get_actor_songs_output/1, encode_get_actor_songs_output/1, decode_get_actor_songs_params/1, encode_get_actor_songs_params/1, decode_get_album_info_output/1, encode_get_album_info_output/1, decode_get_album_info_params/1, encode_get_album_info_params/1, decode_get_album_list_output/1, encode_get_album_list_output/1, decode_get_album_list_params/1, encode_get_album_list_params/1, decode_get_album_recommendations_params/1, encode_get_album_recommendations_params/1, decode_get_album_shouts_output/1, encode_get_album_shouts_output/1, decode_get_album_shouts_params/1, encode_get_album_shouts_params/1, decode_get_albums_output/1, encode_get_albums_output/1, decode_get_albums_params/1, encode_get_albums_params/1, decode_get_album_tracks_output/1, encode_get_album_tracks_output/1, decode_get_album_tracks_params/1, encode_get_album_tracks_params/1, decode_get_apikeys_output/1, encode_get_apikeys_output/1, decode_get_apikeys_params/1, encode_get_apikeys_params/1, decode_get_artist_albums_output/1, encode_get_artist_albums_output/1, decode_get_artist_albums_params/1, encode_get_artist_albums_params/1, decode_get_artist_info_output/1, encode_get_artist_info_output/1, decode_get_artist_info_params/1, encode_get_artist_info_params/1, decode_get_artist_listeners_output/1, encode_get_artist_listeners_output/1, decode_get_artist_listeners_params/1, encode_get_artist_listeners_params/1, decode_get_artist_recent_listeners_output/1, encode_get_artist_recent_listeners_output/1, decode_get_artist_recent_listeners_params/1, encode_get_artist_recent_listeners_params/1, decode_get_artist_recommendations_params/1, encode_get_artist_recommendations_params/1, decode_get_artist_shouts_output/1, encode_get_artist_shouts_output/1, decode_get_artist_shouts_params/1, encode_get_artist_shouts_params/1, decode_get_artist_tracks_output/1, encode_get_artist_tracks_output/1, decode_get_artist_tracks_params/1, encode_get_artist_tracks_params/1, decode_get_audio_settings_params/1, encode_get_audio_settings_params/1, decode_get_cover_art_url_output/1, encode_get_cover_art_url_output/1, decode_get_cover_art_url_params/1, encode_get_cover_art_url_params/1, decode_get_decades_output/1, encode_get_decades_output/1, decode_get_decades_params/1, encode_get_decades_params/1, decode_get_download_url_output/1, encode_get_download_url_output/1, decode_get_download_url_params/1, encode_get_download_url_params/1, decode_get_feed_generator_output/1, encode_get_feed_generator_output/1, decode_get_feed_generator_params/1, encode_get_feed_generator_params/1, decode_get_feed_generators_params/1, encode_get_feed_generators_params/1, decode_get_feed_params/1, encode_get_feed_params/1, decode_get_feed_skeleton_output/1, encode_get_feed_skeleton_output/1, decode_get_feed_skeleton_params/1, encode_get_feed_skeleton_params/1, decode_get_file_params/1, encode_get_file_params/1, decode_get_followers_output/1, encode_get_followers_output/1, decode_get_followers_params/1, encode_get_followers_params/1, decode_get_follows_output/1, encode_get_follows_output/1, decode_get_follows_params/1, encode_get_follows_params/1, decode_get_genres_output/1, encode_get_genres_output/1, decode_get_genres_params/1, encode_get_genres_params/1, decode_get_global_stats_params/1, encode_get_global_stats_params/1, decode_get_indexes_output/1, encode_get_indexes_output/1, decode_get_indexes_params/1, encode_get_indexes_params/1, decode_get_internet_radio_stations_output/1, encode_get_internet_radio_stations_output/1, decode_get_internet_radio_stations_params/1, encode_get_internet_radio_stations_params/1, decode_get_known_followers_output/1, encode_get_known_followers_output/1, decode_get_known_followers_params/1, encode_get_known_followers_params/1, decode_get_license_output/1, encode_get_license_output/1, decode_get_license_params/1, encode_get_license_params/1, decode_get_lyrics_output/1, encode_get_lyrics_output/1, decode_get_lyrics_params/1, encode_get_lyrics_params/1, decode_get_metadata_output/1, encode_get_metadata_output/1, decode_get_metadata_params/1, encode_get_metadata_params/1, decode_get_mirror_sources_output/1, encode_get_mirror_sources_output/1, decode_get_mirror_sources_params/1, encode_get_mirror_sources_params/1, decode_get_music_directory_output/1, encode_get_music_directory_output/1, decode_get_music_directory_params/1, encode_get_music_directory_params/1, decode_get_music_folders_output/1, encode_get_music_folders_output/1, decode_get_music_folders_params/1, encode_get_music_folders_params/1, decode_get_now_playing_output/1, encode_get_now_playing_output/1, decode_get_now_playing_params/1, encode_get_now_playing_params/1, decode_get_playback_queue_params/1, encode_get_playback_queue_params/1, decode_get_play_queue_output/1, encode_get_play_queue_output/1, decode_get_play_queue_params/1, encode_get_play_queue_params/1, decode_get_profile_params/1, encode_get_profile_params/1, decode_get_profile_shouts_output/1, encode_get_profile_shouts_output/1, decode_get_profile_shouts_params/1, encode_get_profile_shouts_params/1, decode_get_random_songs_output/1, encode_get_random_songs_output/1, decode_get_random_songs_params/1, encode_get_random_songs_params/1, decode_get_recommendations_params/1, encode_get_recommendations_params/1, decode_get_scan_status_output/1, encode_get_scan_status_output/1, decode_get_scan_status_params/1, encode_get_scan_status_params/1, decode_get_scrobble_params/1, encode_get_scrobble_params/1, decode_get_scrobbles_chart_params/1, encode_get_scrobbles_chart_params/1, decode_get_scrobbles_output/1, encode_get_scrobbles_output/1, decode_get_scrobbles_params/1, encode_get_scrobbles_params/1, decode_get_shout_replies_output/1, encode_get_shout_replies_output/1, decode_get_shout_replies_params/1, encode_get_shout_replies_params/1, decode_get_similar_songs_output/1, encode_get_similar_songs_output/1, decode_get_similar_songs_params/1, encode_get_similar_songs_params/1, decode_get_song_recent_listeners_output/1, encode_get_song_recent_listeners_output/1, decode_get_song_recent_listeners_params/1, encode_get_song_recent_listeners_params/1, decode_get_songs_by_genre_output/1, encode_get_songs_by_genre_output/1, decode_get_songs_by_genre_params/1, encode_get_songs_by_genre_params/1, decode_get_songs_output/1, encode_get_songs_output/1, decode_get_songs_params/1, encode_get_songs_params/1, decode_get_starred_output/1, encode_get_starred_output/1, decode_get_starred_params/1, encode_get_starred_params/1, decode_get_stats_params/1, encode_get_stats_params/1, decode_get_stories_params/1, encode_get_stories_params/1, decode_get_stream_url_output/1, encode_get_stream_url_output/1, decode_get_stream_url_params/1, encode_get_stream_url_params/1, decode_get_temporary_link_params/1, encode_get_temporary_link_params/1, decode_get_top_artists_output/1, encode_get_top_artists_output/1, decode_get_top_artists_params/1, encode_get_top_artists_params/1, decode_get_top_scrobblers_output/1, encode_get_top_scrobblers_output/1, decode_get_top_scrobblers_params/1, encode_get_top_scrobblers_params/1, decode_get_top_songs_output/1, encode_get_top_songs_output/1, decode_get_top_songs_params/1, encode_get_top_songs_params/1, decode_get_top_tracks_output/1, encode_get_top_tracks_output/1, decode_get_top_tracks_params/1, encode_get_top_tracks_params/1, decode_get_track_shouts_output/1, encode_get_track_shouts_output/1, decode_get_track_shouts_params/1, encode_get_track_shouts_params/1, decode_get_unread_count_output/1, encode_get_unread_count_output/1, decode_get_user_output/1, encode_get_user_output/1, decode_get_user_params/1, encode_get_user_params/1, decode_get_wrapped_params/1, encode_get_wrapped_params/1, decode_googledrive_download_file_params/1, encode_googledrive_download_file_params/1, decode_googledrive_file_list_view/1, encode_googledrive_file_list_view/1, decode_googledrive_file_view/1, encode_googledrive_file_view/1, decode_googledrive_get_files_params/1, encode_googledrive_get_files_params/1, decode_googledrive_response_directories_item_view/1, encode_googledrive_response_directories_item_view/1, decode_googledrive_response_directory_view/1, encode_googledrive_response_directory_view/1, decode_googledrive_response_parent_directory_view/1, encode_googledrive_response_parent_directory_view/1, decode_graph_not_found_actor/1, encode_graph_not_found_actor/1, decode_graph_relationship/1, encode_graph_relationship/1, decode_insert_directory_params/1, encode_insert_directory_params/1, decode_insert_files_params/1, encode_insert_files_params/1, decode_library_create_playlist_input/1, encode_library_create_playlist_input/1, decode_library_create_playlist_output/1, encode_library_create_playlist_output/1, decode_library_get_album_output/1, encode_library_get_album_output/1, decode_library_get_album_params/1, encode_library_get_album_params/1, decode_library_get_artist_output/1, encode_library_get_artist_output/1, decode_library_get_artist_params/1, encode_library_get_artist_params/1, decode_library_get_artists_output/1, encode_library_get_artists_output/1, decode_library_get_artists_params/1, encode_library_get_artists_params/1, decode_library_get_playlist_output/1, encode_library_get_playlist_output/1, decode_library_get_playlist_params/1, encode_library_get_playlist_params/1, decode_library_get_playlists_output/1, encode_library_get_playlists_output/1, decode_library_get_playlists_params/1, encode_library_get_playlists_params/1, decode_library_get_song_output/1, encode_library_get_song_output/1, decode_library_get_song_params/1, encode_library_get_song_params/1, decode_library_search_output/1, encode_library_search_output/1, decode_library_search_params/1, encode_library_search_params/1, decode_library_update_playlist_input/1, encode_library_update_playlist_input/1, decode_library_update_playlist_output/1, encode_library_update_playlist_output/1, decode_like_record/1, encode_like_record/1, decode_like_shout_input/1, encode_like_shout_input/1, decode_like_song_input/1, encode_like_song_input/1, decode_list_notifications_output/1, encode_list_notifications_output/1, decode_list_notifications_params/1, encode_list_notifications_params/1, decode_list_presets_output/1, encode_list_presets_output/1, decode_list_presets_params/1, encode_list_presets_params/1, decode_match_song_params/1, encode_match_song_params/1, decode_mirror_source_view/1, encode_mirror_source_view/1, decode_notification_actor/1, encode_notification_actor/1, decode_notification_subject_view/1, encode_notification_subject_view/1, decode_notification_view/1, encode_notification_view/1, decode_ping_output/1, encode_ping_output/1, decode_ping_params/1, encode_ping_params/1, decode_play_directory_params/1, encode_play_directory_params/1, decode_player_currently_playing_view_detailed/1, encode_player_currently_playing_view_detailed/1, decode_player_get_currently_playing_params/1, encode_player_get_currently_playing_params/1, decode_player_next_params/1, encode_player_next_params/1, decode_player_pause_params/1, encode_player_pause_params/1, decode_player_playback_queue_view_detailed/1, encode_player_playback_queue_view_detailed/1, decode_player_play_params/1, encode_player_play_params/1, decode_player_previous_params/1, encode_player_previous_params/1, decode_player_seek_params/1, encode_player_seek_params/1, decode_play_file_params/1, encode_play_file_params/1, decode_playlist_create_playlist_output/1, encode_playlist_create_playlist_output/1, decode_playlist_create_playlist_params/1, encode_playlist_create_playlist_params/1, decode_playlist_get_playlist_params/1, encode_playlist_get_playlist_params/1, decode_playlist_get_playlists_output/1, encode_playlist_get_playlists_output/1, decode_playlist_get_playlists_params/1, encode_playlist_get_playlists_params/1, decode_playlist_record/1, encode_playlist_record/1, decode_playlist_song_record/1, encode_playlist_song_record/1, decode_playlist_update_playlist_output/1, encode_playlist_update_playlist_output/1, decode_playlist_update_playlist_params/1, encode_playlist_update_playlist_params/1, decode_playlist_view_basic/1, encode_playlist_view_basic/1, decode_playlist_view_detailed/1, encode_playlist_view_detailed/1, decode_profile_record/1, encode_profile_record/1, decode_put_audio_settings_input/1, encode_put_audio_settings_input/1, decode_put_mirror_source_input/1, encode_put_mirror_source_input/1, decode_put_preset_input/1, encode_put_preset_input/1, decode_radio_record/1, encode_radio_record/1, decode_radio_view_basic/1, encode_radio_view_basic/1, decode_radio_view_detailed/1, encode_radio_view_detailed/1, decode_remove_apikey_params/1, encode_remove_apikey_params/1, decode_remove_playlist_params/1, encode_remove_playlist_params/1, decode_remove_shout_params/1, encode_remove_shout_params/1, decode_remove_track_params/1, encode_remove_track_params/1, decode_reply_shout_input/1, encode_reply_shout_input/1, decode_report_shout_input/1, encode_report_shout_input/1, decode_rockbox_crossfade_settings/1, encode_rockbox_crossfade_settings/1, decode_rockbox_equalizer_band/1, encode_rockbox_equalizer_band/1, decode_rockbox_equalizer_settings/1, encode_rockbox_equalizer_settings/1, decode_rockbox_replay_gain_settings/1, encode_rockbox_replay_gain_settings/1, decode_rockbox_settings_view/1, encode_rockbox_settings_view/1, decode_rockbox_tone_settings/1, encode_rockbox_tone_settings/1, decode_save_play_queue_input/1, encode_save_play_queue_input/1, decode_save_play_queue_output/1, encode_save_play_queue_output/1, decode_scrobble_first_scrobble_view/1, encode_scrobble_first_scrobble_view/1, decode_scrobble_input/1, encode_scrobble_input/1, decode_scrobble_output/1, encode_scrobble_output/1, decode_scrobble_record/1, encode_scrobble_record/1, decode_scrobble_view_basic/1, encode_scrobble_view_basic/1, decode_scrobble_view_detailed/1, encode_scrobble_view_detailed/1, decode_settings_record/1, encode_settings_record/1, decode_shout_author/1, encode_shout_author/1, decode_shout_gif/1, encode_shout_gif/1, decode_shout_mention/1, encode_shout_mention/1, decode_shout_record/1, encode_shout_record/1, decode_shout_view/1, encode_shout_view/1, decode_song_first_scrobble_view/1, encode_song_first_scrobble_view/1, decode_song_get_song_params/1, encode_song_get_song_params/1, decode_song_match_view/1, encode_song_match_view/1, decode_song_recent_listener_view/1, encode_song_recent_listener_view/1, decode_song_record/1, encode_song_record/1, decode_song_response_mb_artists_item_view/1, encode_song_response_mb_artists_item_view/1, decode_song_view_basic/1, encode_song_view_basic/1, decode_song_view_detailed/1, encode_song_view_detailed/1, decode_spotify_get_currently_playing_params/1, encode_spotify_get_currently_playing_params/1, decode_spotify_seek_params/1, encode_spotify_seek_params/1, decode_spotify_track_view/1, encode_spotify_track_view/1, decode_star_input/1, encode_star_input/1, decode_star_output/1, encode_star_output/1, decode_start_playlist_params/1, encode_start_playlist_params/1, decode_start_scan_output/1, encode_start_scan_output/1, decode_start_scan_params/1, encode_start_scan_params/1, decode_stats_global_stats_view/1, encode_stats_global_stats_view/1, decode_stats_view/1, encode_stats_view/1, decode_stats_wrapped_album/1, encode_stats_wrapped_album/1, decode_stats_wrapped_artist/1, encode_stats_wrapped_artist/1, decode_stats_wrapped_day_count/1, encode_stats_wrapped_day_count/1, decode_stats_wrapped_genre_count/1, encode_stats_wrapped_genre_count/1, decode_stats_wrapped_milestone/1, encode_stats_wrapped_milestone/1, decode_stats_wrapped_month_count/1, encode_stats_wrapped_month_count/1, decode_stats_wrapped_track/1, encode_stats_wrapped_track/1, decode_stats_wrapped_view/1, encode_stats_wrapped_view/1, decode_status_record/1, encode_status_record/1, decode_strong_ref/1, encode_strong_ref/1, decode_unfollow_account_output/1, encode_unfollow_account_output/1, decode_unfollow_account_params/1, encode_unfollow_account_params/1, decode_unstar_input/1, encode_unstar_input/1, decode_unstar_output/1, encode_unstar_output/1, decode_update_apikey_input/1, encode_update_apikey_input/1, decode_update_now_playing_input/1, encode_update_now_playing_input/1, decode_update_now_playing_output/1, encode_update_now_playing_output/1, decode_update_seen_input/1, encode_update_seen_input/1, decode_update_seen_output/1, encode_update_seen_output/1]).
-export_type([json_value/0, blob_cid_ref/0, blob_ref/0, actor_artist_view_basic/0, actor_compatibility_view_basic/0, actor_neighbour_view_basic/0, actor_profile_view_basic/0, actor_profile_view_detailed/0, actor_response_dropbox_view/0, actor_response_googledrive_view/0, actor_response_spotify_user_view/0, actor_track_view/0, add_directory_to_queue_params/0, add_items_to_queue_params/0, add_songs_output/0, add_songs_params/0, album_discogs_artist_view/0, album_discogs_credit_view/0, album_discogs_identifier_view/0, album_discogs_label_view/0, album_discogs_master_view/0, album_discogs_track_view/0, album_discogs_view/0, album_get_album_params/0, album_record/0, album_view_basic/0, album_view_detailed/0, api_key_view/0, artist_get_artist_params/0, artist_get_artists_output/0, artist_get_artists_params/0, artist_listener_view_basic/0, artist_mbid/0, artist_recent_listener_view/0, artist_record/0, artist_song_view_basic/0, artist_view_basic/0, artist_view_detailed/0, charts_decade_view_basic/0, charts_scrobbler_view_basic/0, charts_scrobble_view_basic/0, charts_view/0, create_apikey_input/0, create_scrobble_input/0, create_shout_input/0, create_song_input/0, delete_album_input/0, delete_album_output/0, delete_playlist_input/0, delete_playlist_output/0, delete_preset_params/0, delete_song_input/0, delete_song_output/0, describe_feed_generator_output/0, dislike_shout_input/0, dislike_song_input/0, dropbox_download_file_params/0, dropbox_file_list_view/0, dropbox_file_view/0, dropbox_get_files_params/0, dropbox_response_directories_item_view/0, dropbox_response_directory_view/0, dropbox_response_parent_directory_view/0, dropbox_temporary_link_view/0, equalizer_preset_view/0, equalizer_record/0, feed_generators_view/0, feed_generator_view/0, feed_item_view/0, feed_recommendations_view/0, feed_recommendation_view/0, feed_recommended_albums_view/0, feed_recommended_album_view/0, feed_recommended_artists_view/0, feed_recommended_artist_view/0, feed_search_federation/0, feed_search_hit/0, feed_search_params/0, feed_search_results_view/0, feed_stories_view/0, feed_story_view/0, feed_uri_view/0, feed_view/0, follow_account_output/0, follow_account_params/0, follow_record/0, generator_record/0, get_actor_albums_output/0, get_actor_albums_params/0, get_actor_artists_output/0, get_actor_artists_params/0, get_actor_compatibility_output/0, get_actor_compatibility_params/0, get_actor_loved_songs_output/0, get_actor_loved_songs_params/0, get_actor_neighbours_output/0, get_actor_neighbours_params/0, get_actor_playlists_output/0, get_actor_playlists_params/0, get_actor_scrobbles_output/0, get_actor_scrobbles_params/0, get_actor_songs_output/0, get_actor_songs_params/0, get_album_info_output/0, get_album_info_params/0, get_album_list_output/0, get_album_list_params/0, get_album_recommendations_params/0, get_album_shouts_output/0, get_album_shouts_params/0, get_albums_output/0, get_albums_params/0, get_album_tracks_output/0, get_album_tracks_params/0, get_apikeys_output/0, get_apikeys_params/0, get_artist_albums_output/0, get_artist_albums_params/0, get_artist_info_output/0, get_artist_info_params/0, get_artist_listeners_output/0, get_artist_listeners_params/0, get_artist_recent_listeners_output/0, get_artist_recent_listeners_params/0, get_artist_recommendations_params/0, get_artist_shouts_output/0, get_artist_shouts_params/0, get_artist_tracks_output/0, get_artist_tracks_params/0, get_audio_settings_params/0, get_cover_art_url_output/0, get_cover_art_url_params/0, get_decades_output/0, get_decades_params/0, get_download_url_output/0, get_download_url_params/0, get_feed_generator_output/0, get_feed_generator_params/0, get_feed_generators_params/0, get_feed_params/0, get_feed_skeleton_output/0, get_feed_skeleton_params/0, get_file_params/0, get_followers_output/0, get_followers_params/0, get_follows_output/0, get_follows_params/0, get_genres_output/0, get_genres_params/0, get_global_stats_params/0, get_indexes_output/0, get_indexes_params/0, get_internet_radio_stations_output/0, get_internet_radio_stations_params/0, get_known_followers_output/0, get_known_followers_params/0, get_license_output/0, get_license_params/0, get_lyrics_output/0, get_lyrics_params/0, get_metadata_output/0, get_metadata_params/0, get_mirror_sources_output/0, get_mirror_sources_params/0, get_music_directory_output/0, get_music_directory_params/0, get_music_folders_output/0, get_music_folders_params/0, get_now_playing_output/0, get_now_playing_params/0, get_playback_queue_params/0, get_play_queue_output/0, get_play_queue_params/0, get_profile_params/0, get_profile_shouts_output/0, get_profile_shouts_params/0, get_random_songs_output/0, get_random_songs_params/0, get_recommendations_params/0, get_scan_status_output/0, get_scan_status_params/0, get_scrobble_params/0, get_scrobbles_chart_params/0, get_scrobbles_output/0, get_scrobbles_params/0, get_shout_replies_output/0, get_shout_replies_params/0, get_similar_songs_output/0, get_similar_songs_params/0, get_song_recent_listeners_output/0, get_song_recent_listeners_params/0, get_songs_by_genre_output/0, get_songs_by_genre_params/0, get_songs_output/0, get_songs_params/0, get_starred_output/0, get_starred_params/0, get_stats_params/0, get_stories_params/0, get_stream_url_output/0, get_stream_url_params/0, get_temporary_link_params/0, get_top_artists_output/0, get_top_artists_params/0, get_top_scrobblers_output/0, get_top_scrobblers_params/0, get_top_songs_output/0, get_top_songs_params/0, get_top_tracks_output/0, get_top_tracks_params/0, get_track_shouts_output/0, get_track_shouts_params/0, get_unread_count_output/0, get_user_output/0, get_user_params/0, get_wrapped_params/0, googledrive_download_file_params/0, googledrive_file_list_view/0, googledrive_file_view/0, googledrive_get_files_params/0, googledrive_response_directories_item_view/0, googledrive_response_directory_view/0, googledrive_response_parent_directory_view/0, graph_not_found_actor/0, graph_relationship/0, insert_directory_params/0, insert_files_params/0, library_create_playlist_input/0, library_create_playlist_output/0, library_get_album_output/0, library_get_album_params/0, library_get_artist_output/0, library_get_artist_params/0, library_get_artists_output/0, library_get_artists_params/0, library_get_playlist_output/0, library_get_playlist_params/0, library_get_playlists_output/0, library_get_playlists_params/0, library_get_song_output/0, library_get_song_params/0, library_search_output/0, library_search_params/0, library_update_playlist_input/0, library_update_playlist_output/0, like_record/0, like_shout_input/0, like_song_input/0, list_notifications_output/0, list_notifications_params/0, list_presets_output/0, list_presets_params/0, match_song_params/0, mirror_source_view/0, notification_actor/0, notification_subject_view/0, notification_view/0, ping_output/0, ping_params/0, play_directory_params/0, player_currently_playing_view_detailed/0, player_get_currently_playing_params/0, player_next_params/0, player_pause_params/0, player_playback_queue_view_detailed/0, player_play_params/0, player_previous_params/0, player_seek_params/0, play_file_params/0, playlist_create_playlist_output/0, playlist_create_playlist_params/0, playlist_get_playlist_params/0, playlist_get_playlists_output/0, playlist_get_playlists_params/0, playlist_record/0, playlist_song_record/0, playlist_update_playlist_output/0, playlist_update_playlist_params/0, playlist_view_basic/0, playlist_view_detailed/0, profile_record/0, put_audio_settings_input/0, put_mirror_source_input/0, put_preset_input/0, radio_record/0, radio_view_basic/0, radio_view_detailed/0, remove_apikey_params/0, remove_playlist_params/0, remove_shout_params/0, remove_track_params/0, reply_shout_input/0, report_shout_input/0, rockbox_crossfade_settings/0, rockbox_equalizer_band/0, rockbox_equalizer_settings/0, rockbox_replay_gain_settings/0, rockbox_settings_view/0, rockbox_tone_settings/0, save_play_queue_input/0, save_play_queue_output/0, scrobble_first_scrobble_view/0, scrobble_input/0, scrobble_output/0, scrobble_record/0, scrobble_view_basic/0, scrobble_view_detailed/0, settings_record/0, shout_author/0, shout_gif/0, shout_mention/0, shout_record/0, shout_view/0, song_first_scrobble_view/0, song_get_song_params/0, song_match_view/0, song_recent_listener_view/0, song_record/0, song_response_mb_artists_item_view/0, song_view_basic/0, song_view_detailed/0, spotify_get_currently_playing_params/0, spotify_seek_params/0, spotify_track_view/0, star_input/0, star_output/0, start_playlist_params/0, start_scan_output/0, start_scan_params/0, stats_global_stats_view/0, stats_view/0, stats_wrapped_album/0, stats_wrapped_artist/0, stats_wrapped_day_count/0, stats_wrapped_genre_count/0, stats_wrapped_milestone/0, stats_wrapped_month_count/0, stats_wrapped_track/0, stats_wrapped_view/0, status_record/0, strong_ref/0, unfollow_account_output/0, unfollow_account_params/0, unstar_input/0, unstar_output/0, update_apikey_input/0, update_now_playing_input/0, update_now_playing_output/0, update_seen_input/0, update_seen_output/0]).
schema('blob_cid_ref') -> [{<<"$link">>, 'link', true, false, string}];
schema('blob_ref') -> [{<<"$type">>, 'type', true, false, string}, {<<"ref">>, 'ref', true, false, {record, 'blob_cid_ref'}}, {<<"mimeType">>, 'mime_type', true, false, string}, {<<"size">>, 'size', true, false, integer}];
schema('actor_artist_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"user1Rank">>, 'user1_rank', false, false, integer}, {<<"user2Rank">>, 'user2_rank', false, false, integer}, {<<"weight">>, 'weight', false, false, float}];
schema('actor_compatibility_view_basic') -> [{<<"compatibilityLevel">>, 'compatibility_level', false, false, integer}, {<<"sharedArtists">>, 'shared_artists', false, false, integer}, {<<"topSharedArtistNames">>, 'top_shared_artist_names', false, false, {list, string}}, {<<"topSharedDetailedArtists">>, 'top_shared_detailed_artists', false, false, {list, {record, 'actor_artist_view_basic'}}}, {<<"user1ArtistCount">>, 'user1_artist_count', false, false, integer}, {<<"user2ArtistCount">>, 'user2_artist_count', false, false, integer}, {<<"compatibilityPercentage">>, 'compatibility_percentage', false, false, float}];
schema('actor_neighbour_view_basic') -> [{<<"userId">>, 'user_id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"sharedArtistsCount">>, 'shared_artists_count', false, false, integer}, {<<"topSharedArtistNames">>, 'top_shared_artist_names', false, false, {list, string}}, {<<"topSharedArtistsDetails">>, 'top_shared_artists_details', false, false, {list, {record, 'artist_view_basic'}}}, {<<"similarityScore">>, 'similarity_score', false, false, float}];
schema('actor_profile_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, true, string}, {<<"avatar">>, 'avatar', false, true, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('actor_profile_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"spotifyUser">>, 'spotify_user', false, false, {record, 'actor_response_spotify_user_view'}}, {<<"spotifyConnected">>, 'spotify_connected', false, false, boolean}, {<<"googledrive">>, 'googledrive', false, false, {record, 'actor_response_googledrive_view'}}, {<<"dropbox">>, 'dropbox', false, false, {record, 'actor_response_dropbox_view'}}];
schema('actor_response_dropbox_view') -> [{<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"id">>, 'id', false, false, string}, {<<"email">>, 'email', false, false, string}, {<<"isBetaUser">>, 'is_beta_user', false, false, boolean}, {<<"userId">>, 'user_id', false, true, string}, {<<"xataVersion">>, 'xata_version', false, true, string}];
schema('actor_response_googledrive_view') -> [{<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('actor_response_spotify_user_view') -> [{<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"id">>, 'id', false, false, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}, {<<"userId">>, 'user_id', false, true, string}, {<<"isBetaUser">>, 'is_beta_user', false, false, boolean}, {<<"spotifyAppId">>, 'spotify_app_id', false, true, string}];
schema('actor_track_view') -> [{<<"name">>, 'name', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"album">>, 'album', false, false, string}, {<<"albumCoverUrl">>, 'album_cover_url', false, false, string}, {<<"durationMs">>, 'duration_ms', false, false, integer}, {<<"source">>, 'source', false, false, string}, {<<"recordingMbId">>, 'recording_mb_id', false, false, string}, {<<"trackNumber">>, 'track_number', false, false, integer}];
schema('add_directory_to_queue_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"directory">>, 'directory', true, false, string}, {<<"position">>, 'position', false, false, integer}, {<<"shuffle">>, 'shuffle', false, false, boolean}];
schema('add_items_to_queue_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"items">>, 'items', true, false, {list, string}}, {<<"position">>, 'position', false, false, integer}, {<<"shuffle">>, 'shuffle', false, false, boolean}];
schema('add_songs_output') -> [{<<"uris">>, 'uris', true, false, {list, string}}];
schema('add_songs_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"songs">>, 'songs', true, false, {list, string}}];
schema('album_discogs_artist_view') -> [{<<"artistId">>, 'artist_id', false, false, integer}, {<<"name">>, 'name', false, false, string}, {<<"anv">>, 'anv', false, false, string}, {<<"joinPhrase">>, 'join_phrase', false, false, string}, {<<"role">>, 'role', false, false, string}];
schema('album_discogs_credit_view') -> [{<<"artistId">>, 'artist_id', false, false, integer}, {<<"name">>, 'name', false, false, string}, {<<"role">>, 'role', false, false, string}, {<<"tracks">>, 'tracks', false, false, string}];
schema('album_discogs_identifier_view') -> [{<<"type">>, 'type', false, false, string}, {<<"value">>, 'value', false, false, string}, {<<"description">>, 'description', false, false, string}];
schema('album_discogs_label_view') -> [{<<"labelId">>, 'label_id', false, false, integer}, {<<"name">>, 'name', false, false, string}, {<<"catalogNumber">>, 'catalog_number', false, false, string}, {<<"kind">>, 'kind', false, false, string}, {<<"entityType">>, 'entity_type', false, false, string}];
schema('album_discogs_master_view') -> [{<<"masterId">>, 'master_id', false, false, integer}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"mainReleaseId">>, 'main_release_id', false, false, integer}, {<<"url">>, 'url', false, false, string}, {<<"genres">>, 'genres', false, false, {list, string}}, {<<"styles">>, 'styles', false, false, {list, string}}];
schema('album_discogs_track_view') -> [{<<"position">>, 'position', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"duration">>, 'duration', false, false, string}, {<<"durationMs">>, 'duration_ms', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"trackNumber">>, 'track_number', false, false, integer}];
schema('album_discogs_view') -> [{<<"releaseId">>, 'release_id', false, false, integer}, {<<"masterId">>, 'master_id', false, false, integer}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"originalYear">>, 'original_year', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"country">>, 'country', false, false, string}, {<<"label">>, 'label', false, false, string}, {<<"catalogNumber">>, 'catalog_number', false, false, string}, {<<"barcode">>, 'barcode', false, false, string}, {<<"formats">>, 'formats', false, false, {list, string}}, {<<"genres">>, 'genres', false, false, {list, string}}, {<<"styles">>, 'styles', false, false, {list, string}}, {<<"url">>, 'url', false, false, string}, {<<"score">>, 'score', false, false, integer}, {<<"credits">>, 'credits', false, false, {list, {record, 'album_discogs_credit_view'}}}, {<<"tracklist">>, 'tracklist', false, false, {list, {record, 'album_discogs_track_view'}}}, {<<"labels">>, 'labels', false, false, {list, {record, 'album_discogs_label_view'}}}, {<<"identifiers">>, 'identifiers', false, false, {list, {record, 'album_discogs_identifier_view'}}}, {<<"artists">>, 'artists', false, false, {list, {record, 'album_discogs_artist_view'}}}, {<<"master">>, 'master', false, false, {record, 'album_discogs_master_view'}}];
schema('album_get_album_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('album_record') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"albumArt">>, 'album_art', false, false, {record, blob_ref}}, {<<"albumArtUrl">>, 'album_art_url', false, false, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"youtubeLink">>, 'youtube_link', false, false, string}, {<<"spotifyLink">>, 'spotify_link', false, false, string}, {<<"tidalLink">>, 'tidal_link', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}];
schema('album_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"year">>, 'year', false, true, integer}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"releaseDate">>, 'release_date', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"discogsReleaseId">>, 'discogs_release_id', false, true, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}];
schema('album_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"year">>, 'year', false, true, integer}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"releaseDate">>, 'release_date', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}, {<<"discogs">>, 'discogs', false, false, {record, 'album_discogs_view'}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"discogsReleaseId">>, 'discogs_release_id', false, true, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}];
schema('api_key_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}];
schema('artist_get_artist_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('artist_get_artists_output') -> [{<<"artists">>, 'artists', false, false, {list, {record, 'artist_view_basic'}}}];
schema('artist_get_artists_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"names">>, 'names', false, false, string}, {<<"genre">>, 'genre', false, false, string}, {<<"filter">>, 'filter', false, false, string}];
schema('artist_listener_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"mostListenedSong">>, 'most_listened_song', false, false, {record, 'artist_song_view_basic'}}, {<<"totalPlays">>, 'total_plays', false, false, integer}, {<<"rank">>, 'rank', false, false, integer}];
schema('artist_mbid') -> [{<<"mbid">>, 'mbid', false, false, string}, {<<"name">>, 'name', false, false, string}];
schema('artist_recent_listener_view') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, string}, {<<"scrobbleUri">>, 'scrobble_uri', false, false, string}];
schema('artist_record') -> [{<<"name">>, 'name', true, false, string}, {<<"bio">>, 'bio', false, false, string}, {<<"picture">>, 'picture', false, false, {record, blob_ref}}, {<<"pictureUrl">>, 'picture_url', false, false, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"born">>, 'born', false, false, string}, {<<"died">>, 'died', false, false, string}, {<<"bornIn">>, 'born_in', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}];
schema('artist_song_view_basic') -> [{<<"uri">>, 'uri', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}];
schema('artist_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"biography">>, 'biography', false, true, string}, {<<"born">>, 'born', false, true, string}, {<<"bornIn">>, 'born_in', false, true, string}, {<<"died">>, 'died', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"genres">>, 'genres', false, true, {list, string}}, {<<"xataVersion">>, 'xata_version', false, true, integer}];
schema('artist_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"biography">>, 'biography', false, true, string}, {<<"born">>, 'born', false, true, string}, {<<"bornIn">>, 'born_in', false, true, string}, {<<"died">>, 'died', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"genres">>, 'genres', false, true, {list, string}}, {<<"xataVersion">>, 'xata_version', false, true, integer}];
schema('charts_decade_view_basic') -> [{<<"decade">>, 'decade', false, false, integer}, {<<"scrobbles">>, 'scrobbles', false, false, integer}, {<<"uniqueAlbums">>, 'unique_albums', false, false, integer}];
schema('charts_scrobbler_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"scrobbles">>, 'scrobbles', false, false, integer}, {<<"uniqueArtists">>, 'unique_artists', false, false, integer}, {<<"uniqueTracks">>, 'unique_tracks', false, false, integer}];
schema('charts_scrobble_view_basic') -> [{<<"date">>, 'date', false, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('charts_view') -> [{<<"scrobbles">>, 'scrobbles', false, false, {list, {record, 'charts_scrobble_view_basic'}}}];
schema('create_apikey_input') -> [{<<"name">>, 'name', true, false, string}, {<<"description">>, 'description', false, false, string}];
schema('create_scrobble_input') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"album">>, 'album', false, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"mbId">>, 'mb_id', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"trackNumber">>, 'track_number', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"lyrics">>, 'lyrics', false, false, string}, {<<"composer">>, 'composer', false, false, string}, {<<"copyrightMessage">>, 'copyright_message', false, false, string}, {<<"label">>, 'label', false, false, string}, {<<"artistPicture">>, 'artist_picture', false, false, string}, {<<"spotifyLink">>, 'spotify_link', false, false, string}, {<<"lastfmLink">>, 'lastfm_link', false, false, string}, {<<"tidalLink">>, 'tidal_link', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, false, string}, {<<"youtubeLink">>, 'youtube_link', false, false, string}, {<<"deezerLink">>, 'deezer_link', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, integer}];
schema('create_shout_input') -> [{<<"message">>, 'message', false, false, string}];
schema('create_song_input') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"albumArtist">>, 'album_artist', true, false, string}, {<<"album">>, 'album', true, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"mbId">>, 'mb_id', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"trackNumber">>, 'track_number', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"lyrics">>, 'lyrics', false, false, string}];
schema('delete_album_input') -> [{<<"id">>, 'id', true, false, string}];
schema('delete_album_output') -> [{<<"status">>, 'status', true, false, string}, {<<"deleted">>, 'deleted', true, false, integer}];
schema('delete_playlist_input') -> [{<<"id">>, 'id', true, false, string}];
schema('delete_playlist_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"atprotoError">>, 'atproto_error', false, false, string}];
schema('delete_preset_params') -> [{<<"rkey">>, 'rkey', true, false, string}];
schema('delete_song_input') -> [{<<"id">>, 'id', true, false, string}];
schema('delete_song_output') -> [{<<"status">>, 'status', true, false, string}, {<<"deleted">>, 'deleted', true, false, integer}];
schema('describe_feed_generator_output') -> [{<<"did">>, 'did', false, false, string}, {<<"feeds">>, 'feeds', false, false, {list, {record, 'feed_uri_view'}}}];
schema('dislike_shout_input') -> [{<<"uri">>, 'uri', false, false, string}];
schema('dislike_song_input') -> [{<<"uri">>, 'uri', false, false, string}];
schema('dropbox_download_file_params') -> [{<<"fileId">>, 'file_id', true, false, string}];
schema('dropbox_file_list_view') -> [{<<"files">>, 'files', false, false, {list, {record, 'dropbox_file_view'}}}, {<<"directory">>, 'directory', false, false, {record, 'dropbox_response_directory_view'}}, {<<"parentDirectory">>, 'parent_directory', false, false, {record, 'dropbox_response_parent_directory_view'}}, {<<"directories">>, 'directories', false, false, {list, {record, 'dropbox_response_directories_item_view'}}}];
schema('dropbox_file_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"pathLower">>, 'path_lower', false, false, string}, {<<"pathDisplay">>, 'path_display', false, false, string}, {<<"clientModified">>, 'client_modified', false, false, string}, {<<"serverModified">>, 'server_modified', false, false, string}, {<<"fileId">>, 'file_id', false, false, string}, {<<"directoryId">>, 'directory_id', false, false, string}, {<<"trackId">>, 'track_id', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('dropbox_get_files_params') -> [{<<"at">>, 'at', false, false, string}];
schema('dropbox_response_directories_item_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"fileId">>, 'file_id', false, false, string}, {<<"path">>, 'path', false, false, string}, {<<"parentId">>, 'parent_id', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('dropbox_response_directory_view') -> [];
schema('dropbox_response_parent_directory_view') -> [];
schema('dropbox_temporary_link_view') -> [{<<"link">>, 'link', false, false, string}];
schema('equalizer_preset_view') -> [{<<"uri">>, 'uri', true, false, string}, {<<"rkey">>, 'rkey', true, false, string}, {<<"name">>, 'name', true, false, string}, {<<"precut">>, 'precut', false, false, integer}, {<<"bands">>, 'bands', true, false, {list, {record, 'rockbox_equalizer_band'}}}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('equalizer_record') -> [{<<"name">>, 'name', true, false, string}, {<<"precut">>, 'precut', false, false, integer}, {<<"bands">>, 'bands', true, false, {list, {record, 'rockbox_equalizer_band'}}}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('feed_generators_view') -> [{<<"feeds">>, 'feeds', false, false, {list, {record, 'feed_generator_view'}}}];
schema('feed_generator_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"description">>, 'description', false, true, string}, {<<"uri">>, 'uri', false, false, string}, {<<"avatar">>, 'avatar', false, true, string}, {<<"creator">>, 'creator', false, false, {record, 'actor_profile_view_basic'}}, {<<"did">>, 'did', false, false, string}];
schema('feed_item_view') -> [{<<"scrobble">>, 'scrobble', false, false, {record, 'scrobble_view_basic'}}];
schema('feed_recommendations_view') -> [{<<"recommendations">>, 'recommendations', false, false, {list, {record, 'feed_recommendation_view'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('feed_recommendation_view') -> [{<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"album">>, 'album', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"trackUri">>, 'track_uri', false, false, string}, {<<"artistUri">>, 'artist_uri', false, false, string}, {<<"albumUri">>, 'album_uri', false, false, string}, {<<"genres">>, 'genres', false, false, {list, string}}, {<<"source">>, 'source', false, false, string}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"recommendationScore">>, 'recommendation_score', false, false, float}];
schema('feed_recommended_albums_view') -> [{<<"albums">>, 'albums', false, false, {list, {record, 'feed_recommended_album_view'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('feed_recommended_album_view') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"source">>, 'source', false, false, string}, {<<"recommendationScore">>, 'recommendation_score', false, false, float}];
schema('feed_recommended_artists_view') -> [{<<"artists">>, 'artists', false, false, {list, {record, 'feed_recommended_artist_view'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('feed_recommended_artist_view') -> [{<<"id">>, 'id', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, false, string}, {<<"genres">>, 'genres', false, false, {list, string}}, {<<"source">>, 'source', false, false, string}, {<<"recommendationScore">>, 'recommendation_score', false, false, float}];
schema('feed_search_federation') -> [{<<"indexUid">>, 'index_uid', false, false, string}];
schema('feed_search_hit') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArtist">>, 'album_artist', false, false, string}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"uri">>, 'uri', false, true, string}, {<<"album">>, 'album', false, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"trackNumber">>, 'track_number', false, true, integer}, {<<"discNumber">>, 'disc_number', false, true, integer}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"liked">>, 'liked', false, false, boolean}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"albumUri">>, 'album_uri', false, true, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"isrc">>, 'isrc', false, true, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"mbId">>, 'mb_id', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"lyrics">>, 'lyrics', false, true, string}, {<<"composer">>, 'composer', false, true, string}, {<<"genre">>, 'genre', false, true, string}, {<<"label">>, 'label', false, true, string}, {<<"copyrightMessage">>, 'copyright_message', false, true, string}, {<<"key">>, 'key', false, true, string}, {<<"acoustidFingerprint">>, 'acoustid_fingerprint', false, true, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}, {<<"year">>, 'year', false, true, integer}, {<<"releaseDate">>, 'release_date', false, true, string}, {<<"discogsReleaseId">>, 'discogs_release_id', false, true, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, true, string}, {<<"biography">>, 'biography', false, true, string}, {<<"born">>, 'born', false, true, string}, {<<"bornIn">>, 'born_in', false, true, string}, {<<"died">>, 'died', false, true, string}, {<<"genres">>, 'genres', false, true, {list, string}}, {<<"curatorDid">>, 'curator_did', false, false, string}, {<<"curatorHandle">>, 'curator_handle', false, false, string}, {<<"curatorName">>, 'curator_name', false, false, string}, {<<"curatorAvatarUrl">>, 'curator_avatar_url', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"coverImageUrl">>, 'cover_image_url', false, true, string}, {<<"trackCount">>, 'track_count', false, false, integer}, {<<"trackArts">>, 'track_arts', false, false, {list, string}}, {<<"curatorDId">>, 'curator_d_id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, true, string}, {<<"avatar">>, 'avatar', false, true, string}, {<<"_federation">>, 'federation', false, false, {record, 'feed_search_federation'}}, {<<"bpm">>, 'bpm', false, false, float}];
schema('feed_search_params') -> [{<<"query">>, 'query', true, false, string}];
schema('feed_search_results_view') -> [{<<"hits">>, 'hits', false, false, {list, {record, 'feed_search_hit'}}}, {<<"processingTimeMs">>, 'processing_time_ms', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"estimatedTotalHits">>, 'estimated_total_hits', false, false, integer}];
schema('feed_stories_view') -> [{<<"stories">>, 'stories', false, false, {list, {record, 'feed_story_view'}}}];
schema('feed_story_view') -> [{<<"album">>, 'album', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"albumArtist">>, 'album_artist', false, false, string}, {<<"albumUri">>, 'album_uri', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"trackId">>, 'track_id', false, false, string}, {<<"trackUri">>, 'track_uri', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"liked">>, 'liked', false, false, boolean}, {<<"likesCount">>, 'likes_count', false, false, integer}];
schema('feed_uri_view') -> [{<<"uri">>, 'uri', false, false, string}];
schema('feed_view') -> [{<<"feed">>, 'feed', false, false, {list, {record, 'feed_item_view'}}}, {<<"cursor">>, 'cursor', false, false, string}, {<<"scrobbles">>, 'scrobbles', false, false, {list, {record, 'scrobble_view_basic'}}}];
schema('follow_account_output') -> [{<<"subject">>, 'subject', true, false, {record, 'actor_profile_view_basic'}}, {<<"followers">>, 'followers', true, false, {list, {record, 'actor_profile_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('follow_account_params') -> [{<<"account">>, 'account', true, false, string}];
schema('follow_record') -> [{<<"createdAt">>, 'created_at', true, false, string}, {<<"subject">>, 'subject', true, false, string}, {<<"via">>, 'via', false, false, {record, 'strong_ref'}}];
schema('generator_record') -> [{<<"did">>, 'did', true, false, string}, {<<"avatar">>, 'avatar', false, false, {record, blob_ref}}, {<<"displayName">>, 'display_name', true, false, string}, {<<"description">>, 'description', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}];
schema('get_actor_albums_output') -> [{<<"albums">>, 'albums', false, false, {list, {record, 'album_view_basic'}}}];
schema('get_actor_albums_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_actor_artists_output') -> [{<<"artists">>, 'artists', false, false, {list, {record, 'artist_view_basic'}}}];
schema('get_actor_artists_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_actor_compatibility_output') -> [{<<"compatibility">>, 'compatibility', false, true, {record, 'actor_compatibility_view_basic'}}];
schema('get_actor_compatibility_params') -> [{<<"did">>, 'did', true, false, string}];
schema('get_actor_loved_songs_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_actor_loved_songs_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_actor_neighbours_output') -> [{<<"neighbours">>, 'neighbours', false, false, {list, {record, 'actor_neighbour_view_basic'}}}];
schema('get_actor_neighbours_params') -> [{<<"did">>, 'did', true, false, string}];
schema('get_actor_playlists_output') -> [{<<"playlists">>, 'playlists', false, false, {list, {record, 'playlist_view_basic'}}}];
schema('get_actor_playlists_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"filter">>, 'filter', false, false, string}];
schema('get_actor_scrobbles_output') -> [{<<"scrobbles">>, 'scrobbles', false, false, {list, {record, 'scrobble_view_basic'}}}];
schema('get_actor_scrobbles_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_actor_songs_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_actor_songs_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_album_info_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"albumInfo">>, 'album_info', false, false, json_value}];
schema('get_album_info_params') -> [{<<"id">>, 'id', true, false, string}];
schema('get_album_list_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"albumList2">>, 'album_list2', false, false, json_value}];
schema('get_album_list_params') -> [{<<"type">>, 'type', true, false, string}, {<<"size">>, 'size', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"fromYear">>, 'from_year', false, false, integer}, {<<"toYear">>, 'to_year', false, false, integer}, {<<"genre">>, 'genre', false, false, string}];
schema('get_album_recommendations_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_album_shouts_output') -> [{<<"shouts">>, 'shouts', false, false, {list, {record, 'shout_view'}}}];
schema('get_album_shouts_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_albums_output') -> [{<<"albums">>, 'albums', false, false, {list, {record, 'album_view_basic'}}}];
schema('get_albums_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"filter">>, 'filter', false, false, string}];
schema('get_album_tracks_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_album_tracks_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('get_apikeys_output') -> [{<<"apikeys">>, 'apikeys', false, false, {list, {record, 'api_key_view'}}}];
schema('get_apikeys_params') -> [{<<"offset">>, 'offset', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_artist_albums_output') -> [{<<"albums">>, 'albums', false, false, {list, {record, 'album_view_basic'}}}];
schema('get_artist_albums_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('get_artist_info_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"artistInfo2">>, 'artist_info2', false, false, json_value}];
schema('get_artist_info_params') -> [{<<"id">>, 'id', true, false, string}];
schema('get_artist_listeners_output') -> [{<<"listeners">>, 'listeners', false, false, {list, {record, 'artist_listener_view_basic'}}}];
schema('get_artist_listeners_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"offset">>, 'offset', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_artist_recent_listeners_output') -> [{<<"listeners">>, 'listeners', false, false, {list, {record, 'artist_recent_listener_view'}}}];
schema('get_artist_recent_listeners_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"offset">>, 'offset', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_artist_recommendations_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_artist_shouts_output') -> [{<<"shouts">>, 'shouts', false, false, {list, {record, 'shout_view'}}}];
schema('get_artist_shouts_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_artist_tracks_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_artist_tracks_params') -> [{<<"uri">>, 'uri', false, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_audio_settings_params') -> [{<<"did">>, 'did', false, false, string}];
schema('get_cover_art_url_output') -> [{<<"url">>, 'url', true, false, string}];
schema('get_cover_art_url_params') -> [{<<"id">>, 'id', true, false, string}, {<<"size">>, 'size', false, false, integer}];
schema('get_decades_output') -> [{<<"decades">>, 'decades', false, false, {list, {record, 'charts_decade_view_basic'}}}];
schema('get_decades_params') -> [{<<"did">>, 'did', false, false, string}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_download_url_output') -> [{<<"url">>, 'url', true, false, string}];
schema('get_download_url_params') -> [{<<"id">>, 'id', true, false, string}];
schema('get_feed_generator_output') -> [{<<"view">>, 'view', false, false, {record, 'feed_generator_view'}}];
schema('get_feed_generator_params') -> [{<<"feed">>, 'feed', true, false, string}];
schema('get_feed_generators_params') -> [{<<"size">>, 'size', false, false, integer}];
schema('get_feed_params') -> [{<<"feed">>, 'feed', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_feed_skeleton_output') -> [{<<"scrobbles">>, 'scrobbles', false, false, {list, {record, 'scrobble_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_feed_skeleton_params') -> [{<<"feed">>, 'feed', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_file_params') -> [{<<"fileId">>, 'file_id', true, false, string}];
schema('get_followers_output') -> [{<<"subject">>, 'subject', true, false, {record, 'actor_profile_view_basic'}}, {<<"followers">>, 'followers', true, false, {list, {record, 'actor_profile_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('get_followers_params') -> [{<<"actor">>, 'actor', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"dids">>, 'dids', false, false, {list, string}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_follows_output') -> [{<<"subject">>, 'subject', true, false, {record, 'actor_profile_view_basic'}}, {<<"follows">>, 'follows', true, false, {list, {record, 'actor_profile_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('get_follows_params') -> [{<<"actor">>, 'actor', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"dids">>, 'dids', false, false, {list, string}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_genres_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"genres">>, 'genres', false, false, json_value}];
schema('get_genres_params') -> [];
schema('get_global_stats_params') -> [];
schema('get_indexes_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"indexes">>, 'indexes', false, false, json_value}];
schema('get_indexes_params') -> [];
schema('get_internet_radio_stations_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"internetRadioStations">>, 'internet_radio_stations', false, false, json_value}];
schema('get_internet_radio_stations_params') -> [];
schema('get_known_followers_output') -> [{<<"subject">>, 'subject', true, false, {record, 'actor_profile_view_basic'}}, {<<"followers">>, 'followers', true, false, {list, {record, 'actor_profile_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_known_followers_params') -> [{<<"actor">>, 'actor', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"cursor">>, 'cursor', false, false, string}];
schema('get_license_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"license">>, 'license', false, false, json_value}];
schema('get_license_params') -> [];
schema('get_lyrics_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"lyrics">>, 'lyrics', false, false, json_value}];
schema('get_lyrics_params') -> [{<<"artist">>, 'artist', false, false, string}, {<<"title">>, 'title', false, false, string}];
schema('get_metadata_output') -> [{<<"metadata">>, 'metadata', false, false, json_value}];
schema('get_metadata_params') -> [{<<"path">>, 'path', true, false, string}];
schema('get_mirror_sources_output') -> [{<<"sources">>, 'sources', true, false, {list, {record, 'mirror_source_view'}}}];
schema('get_mirror_sources_params') -> [];
schema('get_music_directory_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"directory">>, 'directory', false, false, json_value}];
schema('get_music_directory_params') -> [{<<"id">>, 'id', true, false, string}];
schema('get_music_folders_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"musicFolders">>, 'music_folders', false, false, json_value}];
schema('get_music_folders_params') -> [];
schema('get_now_playing_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"nowPlaying">>, 'now_playing', false, false, json_value}];
schema('get_now_playing_params') -> [];
schema('get_playback_queue_params') -> [{<<"playerId">>, 'player_id', false, false, string}];
schema('get_play_queue_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"playQueue">>, 'play_queue', false, false, json_value}];
schema('get_play_queue_params') -> [];
schema('get_profile_params') -> [{<<"did">>, 'did', false, false, string}];
schema('get_profile_shouts_output') -> [{<<"shouts">>, 'shouts', false, false, {list, {record, 'shout_view'}}}];
schema('get_profile_shouts_params') -> [{<<"did">>, 'did', true, false, string}, {<<"offset">>, 'offset', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_random_songs_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"randomSongs">>, 'random_songs', false, false, json_value}];
schema('get_random_songs_params') -> [{<<"size">>, 'size', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"fromYear">>, 'from_year', false, false, integer}, {<<"toYear">>, 'to_year', false, false, integer}];
schema('get_recommendations_params') -> [{<<"did">>, 'did', true, false, string}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_scan_status_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"scanStatus">>, 'scan_status', false, false, json_value}];
schema('get_scan_status_params') -> [];
schema('get_scrobble_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('get_scrobbles_chart_params') -> [{<<"did">>, 'did', false, false, string}, {<<"artisturi">>, 'artisturi', false, false, string}, {<<"albumuri">>, 'albumuri', false, false, string}, {<<"songuri">>, 'songuri', false, false, string}, {<<"genre">>, 'genre', false, false, string}, {<<"from">>, 'from', false, false, string}, {<<"to">>, 'to', false, false, string}];
schema('get_scrobbles_output') -> [{<<"scrobbles">>, 'scrobbles', false, false, {list, {record, 'scrobble_view_basic'}}}];
schema('get_scrobbles_params') -> [{<<"did">>, 'did', false, false, string}, {<<"following">>, 'following', false, false, boolean}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"filter">>, 'filter', false, false, string}];
schema('get_shout_replies_output') -> [{<<"shouts">>, 'shouts', false, false, {list, {record, 'shout_view'}}}];
schema('get_shout_replies_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_similar_songs_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"similarSongs2">>, 'similar_songs2', false, false, json_value}];
schema('get_similar_songs_params') -> [{<<"id">>, 'id', true, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('get_song_recent_listeners_output') -> [{<<"listeners">>, 'listeners', false, false, {list, {record, 'song_recent_listener_view'}}}];
schema('get_song_recent_listeners_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"offset">>, 'offset', false, false, integer}, {<<"limit">>, 'limit', false, false, integer}];
schema('get_songs_by_genre_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"songsByGenre">>, 'songs_by_genre', false, false, json_value}];
schema('get_songs_by_genre_params') -> [{<<"genre">>, 'genre', true, false, string}, {<<"count">>, 'count', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}];
schema('get_songs_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_songs_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}, {<<"spotifyId">>, 'spotify_id', false, false, string}, {<<"filter">>, 'filter', false, false, string}];
schema('get_starred_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"starred2">>, 'starred2', false, false, json_value}];
schema('get_starred_params') -> [];
schema('get_stats_params') -> [{<<"did">>, 'did', true, false, string}];
schema('get_stories_params') -> [{<<"size">>, 'size', false, false, integer}, {<<"feed">>, 'feed', false, false, string}, {<<"following">>, 'following', false, false, boolean}];
schema('get_stream_url_output') -> [{<<"url">>, 'url', true, false, string}];
schema('get_stream_url_params') -> [{<<"id">>, 'id', true, false, string}, {<<"maxBitRate">>, 'max_bit_rate', false, false, integer}, {<<"format">>, 'format', false, false, string}];
schema('get_temporary_link_params') -> [{<<"path">>, 'path', true, false, string}];
schema('get_top_artists_output') -> [{<<"artists">>, 'artists', false, false, {list, {record, 'artist_view_basic'}}}];
schema('get_top_artists_params') -> [{<<"did">>, 'did', false, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_top_scrobblers_output') -> [{<<"scrobblers">>, 'scrobblers', false, false, {list, {record, 'charts_scrobbler_view_basic'}}}];
schema('get_top_scrobblers_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_top_songs_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"topSongs">>, 'top_songs', false, false, json_value}];
schema('get_top_songs_params') -> [{<<"artist">>, 'artist', true, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('get_top_tracks_output') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('get_top_tracks_params') -> [{<<"did">>, 'did', false, false, string}, {<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}];
schema('get_track_shouts_output') -> [{<<"shouts">>, 'shouts', false, false, {list, {record, 'shout_view'}}}];
schema('get_track_shouts_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('get_unread_count_output') -> [{<<"count">>, 'count', true, false, integer}];
schema('get_user_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"user">>, 'user', false, false, json_value}];
schema('get_user_params') -> [];
schema('get_wrapped_params') -> [{<<"did">>, 'did', true, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"period">>, 'period', false, false, string}];
schema('googledrive_download_file_params') -> [{<<"fileId">>, 'file_id', true, false, string}];
schema('googledrive_file_list_view') -> [{<<"files">>, 'files', false, false, {list, {record, 'googledrive_file_view'}}}, {<<"directory">>, 'directory', false, false, {record, 'googledrive_response_directory_view'}}, {<<"parentDirectory">>, 'parent_directory', false, false, {record, 'googledrive_response_parent_directory_view'}}, {<<"directories">>, 'directories', false, false, {list, {record, 'googledrive_response_directories_item_view'}}}];
schema('googledrive_file_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"fileId">>, 'file_id', false, false, string}, {<<"directoryId">>, 'directory_id', false, false, string}, {<<"trackId">>, 'track_id', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('googledrive_get_files_params') -> [{<<"at">>, 'at', false, false, string}];
schema('googledrive_response_directories_item_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"fileId">>, 'file_id', false, false, string}, {<<"path">>, 'path', false, false, string}, {<<"parentId">>, 'parent_id', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('googledrive_response_directory_view') -> [];
schema('googledrive_response_parent_directory_view') -> [];
schema('graph_not_found_actor') -> [{<<"actor">>, 'actor', true, false, string}, {<<"notFound">>, 'not_found', true, false, boolean}];
schema('graph_relationship') -> [{<<"did">>, 'did', true, false, string}, {<<"following">>, 'following', false, false, string}, {<<"followedBy">>, 'followed_by', false, false, string}];
schema('insert_directory_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"directory">>, 'directory', true, false, string}, {<<"position">>, 'position', false, false, integer}];
schema('insert_files_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"files">>, 'files', true, false, {list, string}}, {<<"position">>, 'position', false, false, integer}];
schema('library_create_playlist_input') -> [{<<"name">>, 'name', true, false, string}];
schema('library_create_playlist_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"playlist">>, 'playlist', false, false, json_value}, {<<"atprotoError">>, 'atproto_error', false, false, string}];
schema('library_get_album_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"album">>, 'album', false, false, json_value}];
schema('library_get_album_params') -> [{<<"id">>, 'id', true, false, string}];
schema('library_get_artist_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"artist">>, 'artist', false, false, json_value}];
schema('library_get_artist_params') -> [{<<"id">>, 'id', true, false, string}];
schema('library_get_artists_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"artists">>, 'artists', false, false, json_value}];
schema('library_get_artists_params') -> [];
schema('library_get_playlist_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"playlist">>, 'playlist', false, false, json_value}];
schema('library_get_playlist_params') -> [{<<"id">>, 'id', true, false, string}];
schema('library_get_playlists_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"playlists">>, 'playlists', false, false, json_value}];
schema('library_get_playlists_params') -> [];
schema('library_get_song_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"song">>, 'song', false, false, json_value}];
schema('library_get_song_params') -> [{<<"id">>, 'id', true, false, string}];
schema('library_search_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"searchResult3">>, 'search_result3', false, false, json_value}];
schema('library_search_params') -> [{<<"query">>, 'query', true, false, string}, {<<"artistCount">>, 'artist_count', false, false, integer}, {<<"artistOffset">>, 'artist_offset', false, false, integer}, {<<"albumCount">>, 'album_count', false, false, integer}, {<<"albumOffset">>, 'album_offset', false, false, integer}, {<<"songCount">>, 'song_count', false, false, integer}, {<<"songOffset">>, 'song_offset', false, false, integer}];
schema('library_update_playlist_input') -> [{<<"playlistId">>, 'playlist_id', true, false, string}, {<<"name">>, 'name', false, false, string}, {<<"comment">>, 'comment', false, false, string}, {<<"songIdToAdd">>, 'song_id_to_add', false, false, string}, {<<"songIndexToRemove">>, 'song_index_to_remove', false, false, integer}];
schema('library_update_playlist_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"atprotoError">>, 'atproto_error', false, false, string}];
schema('like_record') -> [{<<"createdAt">>, 'created_at', true, false, string}, {<<"subject">>, 'subject', true, false, {record, 'strong_ref'}}];
schema('like_shout_input') -> [{<<"uri">>, 'uri', false, false, string}];
schema('like_song_input') -> [{<<"uri">>, 'uri', false, false, string}];
schema('list_notifications_output') -> [{<<"notifications">>, 'notifications', true, false, {list, {record, 'notification_view'}}}, {<<"unreadCount">>, 'unread_count', true, false, integer}, {<<"cursor">>, 'cursor', false, false, string}];
schema('list_notifications_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"cursor">>, 'cursor', false, false, string}];
schema('list_presets_output') -> [{<<"presets">>, 'presets', true, false, {list, {record, 'equalizer_preset_view'}}}];
schema('list_presets_params') -> [{<<"did">>, 'did', false, false, string}];
schema('match_song_params') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"album">>, 'album', false, false, string}, {<<"mbId">>, 'mb_id', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}];
schema('mirror_source_view') -> [{<<"provider">>, 'provider', true, false, string}, {<<"enabled">>, 'enabled', true, false, boolean}, {<<"pushEnabled">>, 'push_enabled', false, false, boolean}, {<<"externalUsername">>, 'external_username', false, false, string}, {<<"hasCredentials">>, 'has_credentials', true, false, boolean}, {<<"lastPolledAt">>, 'last_polled_at', false, false, string}, {<<"lastScrobbleSeenAt">>, 'last_scrobble_seen_at', false, false, string}];
schema('notification_actor') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}];
schema('notification_subject_view') -> [{<<"uri">>, 'uri', true, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}];
schema('notification_view') -> [{<<"id">>, 'id', true, false, string}, {<<"type">>, 'type', true, false, string}, {<<"read">>, 'read', true, false, boolean}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"subjectUri">>, 'subject_uri', false, false, string}, {<<"shoutId">>, 'shout_id', false, false, string}, {<<"shoutContent">>, 'shout_content', false, false, string}, {<<"actor">>, 'actor', false, false, {record, 'notification_actor'}}, {<<"subject">>, 'subject', false, false, {record, 'notification_subject_view'}}];
schema('ping_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('ping_params') -> [];
schema('play_directory_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"directoryId">>, 'directory_id', true, false, string}, {<<"shuffle">>, 'shuffle', false, false, boolean}, {<<"recurse">>, 'recurse', false, false, boolean}, {<<"position">>, 'position', false, false, integer}];
schema('player_currently_playing_view_detailed') -> [{<<"title">>, 'title', false, false, string}, {<<"device">>, 'device', false, false, json_value}, {<<"shuffle_state">>, 'shuffle_state', false, false, boolean}, {<<"repeat_state">>, 'repeat_state', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, integer}, {<<"context">>, 'context', false, true, json_value}, {<<"progress_ms">>, 'progress_ms', false, true, integer}, {<<"item">>, 'item', false, true, json_value}, {<<"currently_playing_type">>, 'currently_playing_type', false, false, string}, {<<"actions">>, 'actions', false, false, json_value}, {<<"is_playing">>, 'is_playing', false, false, boolean}, {<<"uri">>, 'uri', false, true, string}, {<<"albumUri">>, 'album_uri', false, true, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"liked">>, 'liked', false, false, boolean}];
schema('player_get_currently_playing_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"actor">>, 'actor', false, false, string}];
schema('player_next_params') -> [{<<"playerId">>, 'player_id', false, false, string}];
schema('player_pause_params') -> [{<<"playerId">>, 'player_id', false, false, string}];
schema('player_playback_queue_view_detailed') -> [{<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}];
schema('player_play_params') -> [{<<"playerId">>, 'player_id', false, false, string}];
schema('player_previous_params') -> [{<<"playerId">>, 'player_id', false, false, string}];
schema('player_seek_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"position">>, 'position', true, false, integer}];
schema('play_file_params') -> [{<<"playerId">>, 'player_id', false, false, string}, {<<"fileId">>, 'file_id', true, false, string}];
schema('playlist_create_playlist_output') -> [{<<"uri">>, 'uri', true, false, string}, {<<"cid">>, 'cid', true, false, string}];
schema('playlist_create_playlist_params') -> [{<<"name">>, 'name', true, false, string}, {<<"description">>, 'description', false, false, string}, {<<"pictureUrl">>, 'picture_url', false, false, string}];
schema('playlist_get_playlist_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"filter">>, 'filter', false, false, string}];
schema('playlist_get_playlists_output') -> [{<<"playlists">>, 'playlists', false, false, {list, {record, 'playlist_view_basic'}}}];
schema('playlist_get_playlists_params') -> [{<<"limit">>, 'limit', false, false, integer}, {<<"offset">>, 'offset', false, false, integer}, {<<"filter">>, 'filter', false, false, string}];
schema('playlist_record') -> [{<<"name">>, 'name', true, false, string}, {<<"description">>, 'description', false, false, string}, {<<"picture">>, 'picture', false, false, {record, blob_ref}}, {<<"pictureUrl">>, 'picture_url', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"spotifyLink">>, 'spotify_link', false, false, string}, {<<"tidalLink">>, 'tidal_link', false, false, string}, {<<"youtubeLink">>, 'youtube_link', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, false, string}];
schema('playlist_song_record') -> [{<<"playlist">>, 'playlist', true, false, {record, 'strong_ref'}}, {<<"song">>, 'song', true, false, {record, 'strong_ref'}}, {<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"album">>, 'album', true, false, string}, {<<"albumArtist">>, 'album_artist', true, false, string}, {<<"duration">>, 'duration', true, false, integer}, {<<"albumArtUrl">>, 'album_art_url', false, false, string}, {<<"addedAt">>, 'added_at', true, false, string}];
schema('playlist_update_playlist_output') -> [{<<"uri">>, 'uri', true, false, string}, {<<"cid">>, 'cid', true, false, string}];
schema('playlist_update_playlist_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"name">>, 'name', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"pictureUrl">>, 'picture_url', false, false, string}];
schema('playlist_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"curatorDid">>, 'curator_did', false, false, string}, {<<"curatorHandle">>, 'curator_handle', false, false, string}, {<<"curatorName">>, 'curator_name', false, false, string}, {<<"curatorAvatarUrl">>, 'curator_avatar_url', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"coverImageUrl">>, 'cover_image_url', false, true, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"trackCount">>, 'track_count', false, false, integer}, {<<"trackArts">>, 'track_arts', false, false, {list, string}}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"curatorDId">>, 'curator_d_id', false, false, string}];
schema('playlist_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"curatorDid">>, 'curator_did', false, false, string}, {<<"curatorHandle">>, 'curator_handle', false, false, string}, {<<"curatorName">>, 'curator_name', false, false, string}, {<<"curatorAvatarUrl">>, 'curator_avatar_url', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"coverImageUrl">>, 'cover_image_url', false, true, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"tracks">>, 'tracks', false, false, {list, {record, 'song_view_basic'}}}, {<<"curatorDId">>, 'curator_d_id', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"trackCount">>, 'track_count', false, false, integer}];
schema('profile_record') -> [{<<"displayName">>, 'display_name', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"avatar">>, 'avatar', false, false, {record, blob_ref}}, {<<"banner">>, 'banner', false, false, {record, blob_ref}}, {<<"labels">>, 'labels', false, false, json_value}, {<<"joinedViaStarterPack">>, 'joined_via_starter_pack', false, false, {record, 'strong_ref'}}, {<<"createdAt">>, 'created_at', false, false, string}];
schema('put_audio_settings_input') -> [{<<"crossfade">>, 'crossfade', false, false, {record, 'rockbox_crossfade_settings'}}, {<<"equalizer">>, 'equalizer', false, false, {record, 'rockbox_equalizer_settings'}}, {<<"replayGain">>, 'replay_gain', false, false, {record, 'rockbox_replay_gain_settings'}}, {<<"tone">>, 'tone', false, false, {record, 'rockbox_tone_settings'}}];
schema('put_mirror_source_input') -> [{<<"provider">>, 'provider', true, false, string}, {<<"enabled">>, 'enabled', false, false, boolean}, {<<"pushEnabled">>, 'push_enabled', false, false, boolean}, {<<"externalUsername">>, 'external_username', false, false, string}, {<<"apiKey">>, 'api_key', false, false, string}];
schema('put_preset_input') -> [{<<"name">>, 'name', true, false, string}, {<<"precut">>, 'precut', false, false, integer}, {<<"bands">>, 'bands', true, false, {list, {record, 'rockbox_equalizer_band'}}}];
schema('radio_record') -> [{<<"name">>, 'name', true, false, string}, {<<"url">>, 'url', true, false, string}, {<<"description">>, 'description', false, false, string}, {<<"genre">>, 'genre', false, false, string}, {<<"logo">>, 'logo', false, false, {record, blob_ref}}, {<<"website">>, 'website', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}];
schema('radio_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}];
schema('radio_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"description">>, 'description', false, false, string}, {<<"website">>, 'website', false, false, string}, {<<"url">>, 'url', false, false, string}, {<<"genre">>, 'genre', false, false, string}, {<<"logo">>, 'logo', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}];
schema('remove_apikey_params') -> [{<<"id">>, 'id', true, false, string}];
schema('remove_playlist_params') -> [{<<"uri">>, 'uri', true, false, string}];
schema('remove_shout_params') -> [{<<"id">>, 'id', true, false, string}];
schema('remove_track_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"songUri">>, 'song_uri', false, false, string}, {<<"index">>, 'index', false, false, integer}];
schema('reply_shout_input') -> [{<<"shoutId">>, 'shout_id', true, false, string}, {<<"message">>, 'message', true, false, string}];
schema('report_shout_input') -> [{<<"shoutId">>, 'shout_id', true, false, string}, {<<"reason">>, 'reason', false, false, string}];
schema('rockbox_crossfade_settings') -> [{<<"mode">>, 'mode', false, false, string}, {<<"fadeInDelay">>, 'fade_in_delay', false, false, integer}, {<<"fadeInDuration">>, 'fade_in_duration', false, false, integer}, {<<"fadeOutDelay">>, 'fade_out_delay', false, false, integer}, {<<"fadeOutDuration">>, 'fade_out_duration', false, false, integer}, {<<"fadeOutMixMode">>, 'fade_out_mix_mode', false, false, string}];
schema('rockbox_equalizer_band') -> [{<<"frequency">>, 'frequency', true, false, integer}, {<<"gain">>, 'gain', true, false, integer}, {<<"q">>, 'q', true, false, integer}];
schema('rockbox_equalizer_settings') -> [{<<"enabled">>, 'enabled', false, false, boolean}, {<<"precut">>, 'precut', false, false, integer}, {<<"bands">>, 'bands', false, false, {list, {record, 'rockbox_equalizer_band'}}}];
schema('rockbox_replay_gain_settings') -> [{<<"mode">>, 'mode', false, false, string}, {<<"preamp">>, 'preamp', false, false, integer}, {<<"preventClipping">>, 'prevent_clipping', false, false, boolean}];
schema('rockbox_settings_view') -> [{<<"crossfade">>, 'crossfade', false, false, {record, 'rockbox_crossfade_settings'}}, {<<"equalizer">>, 'equalizer', false, false, {record, 'rockbox_equalizer_settings'}}, {<<"replayGain">>, 'replay_gain', false, false, {record, 'rockbox_replay_gain_settings'}}, {<<"tone">>, 'tone', false, false, {record, 'rockbox_tone_settings'}}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('rockbox_tone_settings') -> [{<<"bass">>, 'bass', false, false, integer}, {<<"treble">>, 'treble', false, false, integer}, {<<"balance">>, 'balance', false, false, integer}, {<<"channels">>, 'channels', false, false, string}];
schema('save_play_queue_input') -> [{<<"id">>, 'id', false, false, string}, {<<"current">>, 'current', false, false, string}, {<<"position">>, 'position', false, false, integer}];
schema('save_play_queue_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('scrobble_first_scrobble_view') -> [{<<"handle">>, 'handle', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, string}];
schema('scrobble_input') -> [{<<"id">>, 'id', true, false, string}, {<<"time">>, 'time', false, false, integer}, {<<"submission">>, 'submission', false, false, boolean}];
schema('scrobble_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('scrobble_record') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"artists">>, 'artists', false, false, {list, {record, 'artist_mbid'}}}, {<<"albumArtist">>, 'album_artist', true, false, string}, {<<"album">>, 'album', true, false, string}, {<<"duration">>, 'duration', true, false, integer}, {<<"trackNumber">>, 'track_number', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"composer">>, 'composer', false, false, string}, {<<"lyrics">>, 'lyrics', false, false, string}, {<<"copyrightMessage">>, 'copyright_message', false, false, string}, {<<"wiki">>, 'wiki', false, false, string}, {<<"albumArt">>, 'album_art', false, false, {record, blob_ref}}, {<<"albumArtUrl">>, 'album_art_url', false, false, string}, {<<"youtubeLink">>, 'youtube_link', false, false, string}, {<<"spotifyLink">>, 'spotify_link', false, false, string}, {<<"tidalLink">>, 'tidal_link', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"label">>, 'label', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}];
schema('scrobble_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"trackId">>, 'track_id', false, true, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"albumArtist">>, 'album_artist', false, true, string}, {<<"album">>, 'album', false, false, string}, {<<"albumUri">>, 'album_uri', false, true, string}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"trackUri">>, 'track_uri', false, true, string}, {<<"handle">>, 'handle', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"liked">>, 'liked', false, false, boolean}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"cover">>, 'cover', false, true, string}, {<<"date">>, 'date', false, false, string}, {<<"user">>, 'user', false, false, string}, {<<"userDisplayName">>, 'user_display_name', false, false, string}, {<<"userAvatar">>, 'user_avatar', false, false, string}, {<<"tags">>, 'tags', false, true, {list, string}}, {<<"mbId">>, 'mb_id', false, true, string}, {<<"mbid">>, 'mbid', false, true, string}, {<<"isrc">>, 'isrc', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"composer">>, 'composer', false, true, string}, {<<"trackNumber">>, 'track_number', false, true, integer}, {<<"duration">>, 'duration', false, false, integer}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"genre">>, 'genre', false, true, string}, {<<"label">>, 'label', false, true, string}, {<<"copyrightMessage">>, 'copyright_message', false, true, string}, {<<"key">>, 'key', false, true, string}, {<<"xataVersion">>, 'xata_version', false, false, integer}, {<<"bpm">>, 'bpm', false, false, float}, {<<"updatedAt">>, 'updated_at', false, false, json_value}];
schema('scrobble_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"user">>, 'user', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"album">>, 'album', false, false, string}, {<<"albumUri">>, 'album_uri', false, false, string}, {<<"cover">>, 'cover', false, false, string}, {<<"date">>, 'date', false, false, string}, {<<"uri">>, 'uri', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"liked">>, 'liked', false, false, boolean}, {<<"trackUri">>, 'track_uri', false, false, string}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"listeners">>, 'listeners', false, false, integer}, {<<"scrobbles">>, 'scrobbles', false, false, integer}, {<<"artists">>, 'artists', false, false, {list, {record, 'artist_view_basic'}}}, {<<"firstScrobble">>, 'first_scrobble', false, false, {record, 'scrobble_first_scrobble_view'}}, {<<"mbId">>, 'mb_id', false, true, string}, {<<"isrc">>, 'isrc', false, true, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"albumArtist">>, 'album_artist', false, true, string}, {<<"trackNumber">>, 'track_number', false, true, integer}, {<<"duration">>, 'duration', false, false, integer}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"discNumber">>, 'disc_number', false, true, integer}, {<<"lyrics">>, 'lyrics', false, true, string}, {<<"composer">>, 'composer', false, true, string}, {<<"genre">>, 'genre', false, true, string}, {<<"label">>, 'label', false, true, string}, {<<"copyrightMessage">>, 'copyright_message', false, true, string}, {<<"key">>, 'key', false, true, string}, {<<"acoustidFingerprint">>, 'acoustid_fingerprint', false, true, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}, {<<"mbid">>, 'mbid', false, true, string}, {<<"bpm">>, 'bpm', false, false, float}];
schema('settings_record') -> [{<<"crossfade">>, 'crossfade', false, false, {record, 'rockbox_crossfade_settings'}}, {<<"equalizer">>, 'equalizer', false, false, {record, 'rockbox_equalizer_settings'}}, {<<"replayGain">>, 'replay_gain', false, false, {record, 'rockbox_replay_gain_settings'}}, {<<"tone">>, 'tone', false, false, {record, 'rockbox_tone_settings'}}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}];
schema('shout_author') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, true, string}, {<<"avatar">>, 'avatar', false, true, string}];
schema('shout_gif') -> [{<<"url">>, 'url', true, false, string}, {<<"previewUrl">>, 'preview_url', false, false, string}, {<<"alt">>, 'alt', false, false, string}, {<<"width">>, 'width', false, false, integer}, {<<"height">>, 'height', false, false, integer}];
schema('shout_mention') -> [{<<"did">>, 'did', true, false, string}, {<<"byteStart">>, 'byte_start', true, false, integer}, {<<"byteEnd">>, 'byte_end', true, false, integer}];
schema('shout_record') -> [{<<"message">>, 'message', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"parent">>, 'parent', false, false, {record, 'strong_ref'}}, {<<"subject">>, 'subject', true, false, {record, 'strong_ref'}}, {<<"gif">>, 'gif', false, false, {record, 'shout_gif'}}, {<<"facets">>, 'facets', false, false, {list, {record, 'shout_mention'}}}];
schema('shout_view') -> [{<<"id">>, 'id', false, false, string}, {<<"message">>, 'message', false, false, string}, {<<"parent">>, 'parent', false, true, string}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"author">>, 'author', false, false, {record, 'shout_author'}}, {<<"gif">>, 'gif', false, false, {record, 'shout_gif'}}, {<<"facets">>, 'facets', false, false, {list, {record, 'shout_mention'}}}, {<<"content">>, 'content', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"likes">>, 'likes', false, false, integer}, {<<"liked">>, 'liked', false, false, boolean}];
schema('song_first_scrobble_view') -> [{<<"handle">>, 'handle', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, string}];
schema('song_get_song_params') -> [{<<"uri">>, 'uri', false, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}, {<<"spotifyId">>, 'spotify_id', false, false, string}];
schema('song_match_view') -> [{<<"id">>, 'id', false, false, integer}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"album">>, 'album', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}, {<<"durationMs">>, 'duration_ms', false, false, integer}, {<<"trackNumber">>, 'track_number', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"link">>, 'link', false, false, string}, {<<"preview">>, 'preview', false, false, string}, {<<"rank">>, 'rank', false, false, integer}, {<<"explicit">>, 'explicit', false, false, boolean}, {<<"score">>, 'score', false, false, integer}];
schema('song_recent_listener_view') -> [{<<"id">>, 'id', false, false, string}, {<<"did">>, 'did', false, false, string}, {<<"handle">>, 'handle', false, false, string}, {<<"displayName">>, 'display_name', false, false, string}, {<<"avatar">>, 'avatar', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, string}, {<<"scrobbleUri">>, 'scrobble_uri', false, false, string}];
schema('song_record') -> [{<<"title">>, 'title', true, false, string}, {<<"artist">>, 'artist', true, false, string}, {<<"artists">>, 'artists', false, false, {list, {record, 'artist_mbid'}}}, {<<"albumArtist">>, 'album_artist', true, false, string}, {<<"album">>, 'album', true, false, string}, {<<"duration">>, 'duration', true, false, integer}, {<<"trackNumber">>, 'track_number', false, false, integer}, {<<"discNumber">>, 'disc_number', false, false, integer}, {<<"releaseDate">>, 'release_date', false, false, string}, {<<"year">>, 'year', false, false, integer}, {<<"genre">>, 'genre', false, false, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"composer">>, 'composer', false, false, string}, {<<"lyrics">>, 'lyrics', false, false, string}, {<<"copyrightMessage">>, 'copyright_message', false, false, string}, {<<"wiki">>, 'wiki', false, false, string}, {<<"albumArt">>, 'album_art', false, false, {record, blob_ref}}, {<<"albumArtUrl">>, 'album_art_url', false, false, string}, {<<"youtubeLink">>, 'youtube_link', false, false, string}, {<<"spotifyLink">>, 'spotify_link', false, false, string}, {<<"tidalLink">>, 'tidal_link', false, false, string}, {<<"appleMusicLink">>, 'apple_music_link', false, false, string}, {<<"createdAt">>, 'created_at', true, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"label">>, 'label', false, false, string}, {<<"isrc">>, 'isrc', false, false, string}];
schema('song_response_mb_artists_item_view') -> [{<<"mbid">>, 'mbid', false, false, string}, {<<"name">>, 'name', false, false, string}];
schema('song_view_basic') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArtist">>, 'album_artist', false, false, string}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"uri">>, 'uri', false, true, string}, {<<"album">>, 'album', false, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"trackNumber">>, 'track_number', false, true, integer}, {<<"discNumber">>, 'disc_number', false, true, integer}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"liked">>, 'liked', false, false, boolean}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"albumUri">>, 'album_uri', false, true, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"isrc">>, 'isrc', false, true, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"mbId">>, 'mb_id', false, true, string}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"lyrics">>, 'lyrics', false, true, string}, {<<"composer">>, 'composer', false, true, string}, {<<"genre">>, 'genre', false, true, string}, {<<"label">>, 'label', false, true, string}, {<<"copyrightMessage">>, 'copyright_message', false, true, string}, {<<"key">>, 'key', false, true, string}, {<<"acoustidFingerprint">>, 'acoustid_fingerprint', false, true, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}, {<<"bpm">>, 'bpm', false, false, float}];
schema('song_view_detailed') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArtist">>, 'album_artist', false, false, string}, {<<"albumArt">>, 'album_art', false, true, string}, {<<"uri">>, 'uri', false, true, string}, {<<"album">>, 'album', false, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"trackNumber">>, 'track_number', false, true, integer}, {<<"discNumber">>, 'disc_number', false, true, integer}, {<<"playCount">>, 'play_count', false, false, integer}, {<<"likesCount">>, 'likes_count', false, false, integer}, {<<"liked">>, 'liked', false, false, boolean}, {<<"uniqueListeners">>, 'unique_listeners', false, false, integer}, {<<"albumUri">>, 'album_uri', false, true, string}, {<<"artistUri">>, 'artist_uri', false, true, string}, {<<"sha256">>, 'sha256', false, false, string}, {<<"mbid">>, 'mbid', false, false, string}, {<<"isrc">>, 'isrc', false, true, string}, {<<"tags">>, 'tags', false, false, {list, string}}, {<<"createdAt">>, 'created_at', false, false, string}, {<<"artists">>, 'artists', false, false, {list, {record, 'artist_view_basic'}}}, {<<"firstScrobble">>, 'first_scrobble', false, false, {record, 'song_first_scrobble_view'}}, {<<"matches">>, 'matches', false, false, {list, {record, 'song_match_view'}}}, {<<"mbId">>, 'mb_id', false, true, string}, {<<"updatedAt">>, 'updated_at', false, false, string}, {<<"releaseDate">>, 'release_date', false, true, string}, {<<"year">>, 'year', false, true, integer}, {<<"artistPicture">>, 'artist_picture', false, true, string}, {<<"genres">>, 'genres', false, true, {list, string}}, {<<"mbArtists">>, 'mb_artists', false, true, {list, {record, 'song_response_mb_artists_item_view'}}}, {<<"youtubeLink">>, 'youtube_link', false, true, string}, {<<"spotifyLink">>, 'spotify_link', false, true, string}, {<<"appleMusicLink">>, 'apple_music_link', false, true, string}, {<<"tidalLink">>, 'tidal_link', false, true, string}, {<<"lyrics">>, 'lyrics', false, true, string}, {<<"composer">>, 'composer', false, true, string}, {<<"genre">>, 'genre', false, true, string}, {<<"label">>, 'label', false, true, string}, {<<"copyrightMessage">>, 'copyright_message', false, true, string}, {<<"key">>, 'key', false, true, string}, {<<"acoustidFingerprint">>, 'acoustid_fingerprint', false, true, string}, {<<"xataVersion">>, 'xata_version', false, true, integer}, {<<"bpm">>, 'bpm', false, false, float}];
schema('spotify_get_currently_playing_params') -> [{<<"actor">>, 'actor', false, false, string}];
schema('spotify_seek_params') -> [{<<"position">>, 'position', true, false, integer}];
schema('spotify_track_view') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"album">>, 'album', false, false, string}, {<<"duration">>, 'duration', false, false, integer}, {<<"previewUrl">>, 'preview_url', false, false, string}];
schema('star_input') -> [{<<"id">>, 'id', true, false, string}, {<<"albumId">>, 'album_id', false, false, string}, {<<"artistId">>, 'artist_id', false, false, string}];
schema('star_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('start_playlist_params') -> [{<<"uri">>, 'uri', true, false, string}, {<<"shuffle">>, 'shuffle', false, false, boolean}, {<<"position">>, 'position', false, false, integer}];
schema('start_scan_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}, {<<"scanStatus">>, 'scan_status', false, false, json_value}];
schema('start_scan_params') -> [];
schema('stats_global_stats_view') -> [{<<"scrobbles">>, 'scrobbles', false, false, integer}, {<<"users">>, 'users', false, false, integer}, {<<"artists">>, 'artists', false, false, integer}, {<<"albums">>, 'albums', false, false, integer}, {<<"tracks">>, 'tracks', false, false, integer}];
schema('stats_view') -> [{<<"scrobbles">>, 'scrobbles', false, false, integer}, {<<"artists">>, 'artists', false, false, integer}, {<<"lovedTracks">>, 'loved_tracks', false, false, integer}, {<<"albums">>, 'albums', false, false, integer}, {<<"tracks">>, 'tracks', false, false, integer}];
schema('stats_wrapped_album') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}];
schema('stats_wrapped_artist') -> [{<<"id">>, 'id', false, false, string}, {<<"name">>, 'name', false, false, string}, {<<"picture">>, 'picture', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}];
schema('stats_wrapped_day_count') -> [{<<"date">>, 'date', false, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('stats_wrapped_genre_count') -> [{<<"genre">>, 'genre', false, false, string}, {<<"count">>, 'count', false, false, integer}];
schema('stats_wrapped_milestone') -> [{<<"trackTitle">>, 'track_title', false, false, string}, {<<"artistName">>, 'artist_name', false, false, string}, {<<"timestamp">>, 'timestamp', false, false, string}, {<<"trackUri">>, 'track_uri', false, false, string}];
schema('stats_wrapped_month_count') -> [{<<"month">>, 'month', false, false, integer}, {<<"count">>, 'count', false, false, integer}];
schema('stats_wrapped_track') -> [{<<"id">>, 'id', false, false, string}, {<<"title">>, 'title', false, false, string}, {<<"artist">>, 'artist', false, false, string}, {<<"albumArt">>, 'album_art', false, false, string}, {<<"uri">>, 'uri', false, false, string}, {<<"artistUri">>, 'artist_uri', false, false, string}, {<<"albumUri">>, 'album_uri', false, false, string}, {<<"playCount">>, 'play_count', false, false, integer}];
schema('stats_wrapped_view') -> [{<<"year">>, 'year', false, false, integer}, {<<"period">>, 'period', false, false, string}, {<<"startDate">>, 'start_date', false, false, string}, {<<"endDate">>, 'end_date', false, false, string}, {<<"totalScrobbles">>, 'total_scrobbles', false, false, integer}, {<<"totalListeningTimeMinutes">>, 'total_listening_time_minutes', false, false, integer}, {<<"topArtists">>, 'top_artists', false, false, {list, {record, 'stats_wrapped_artist'}}}, {<<"topTracks">>, 'top_tracks', false, false, {list, {record, 'stats_wrapped_track'}}}, {<<"topAlbums">>, 'top_albums', false, false, {list, {record, 'stats_wrapped_album'}}}, {<<"topGenres">>, 'top_genres', false, false, {list, {record, 'stats_wrapped_genre_count'}}}, {<<"scrobblesPerMonth">>, 'scrobbles_per_month', false, false, {list, {record, 'stats_wrapped_month_count'}}}, {<<"scrobblesPerDay">>, 'scrobbles_per_day', false, false, {list, {record, 'stats_wrapped_day_count'}}}, {<<"mostActiveDay">>, 'most_active_day', false, false, {record, 'stats_wrapped_day_count'}}, {<<"mostActiveHour">>, 'most_active_hour', false, false, integer}, {<<"newArtistsCount">>, 'new_artists_count', false, false, integer}, {<<"longestStreak">>, 'longest_streak', false, false, integer}, {<<"firstScrobble">>, 'first_scrobble', false, false, {record, 'stats_wrapped_milestone'}}, {<<"lastScrobble">>, 'last_scrobble', false, false, {record, 'stats_wrapped_milestone'}}];
schema('status_record') -> [{<<"track">>, 'track', true, false, {record, 'actor_track_view'}}, {<<"startedAt">>, 'started_at', true, false, string}, {<<"expiresAt">>, 'expires_at', false, false, string}];
schema('strong_ref') -> [{<<"uri">>, 'uri', true, false, string}, {<<"cid">>, 'cid', true, false, string}];
schema('unfollow_account_output') -> [{<<"subject">>, 'subject', true, false, {record, 'actor_profile_view_basic'}}, {<<"followers">>, 'followers', true, false, {list, {record, 'actor_profile_view_basic'}}}, {<<"cursor">>, 'cursor', false, false, string}];
schema('unfollow_account_params') -> [{<<"account">>, 'account', true, false, string}];
schema('unstar_input') -> [{<<"id">>, 'id', true, false, string}, {<<"albumId">>, 'album_id', false, false, string}, {<<"artistId">>, 'artist_id', false, false, string}];
schema('unstar_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('update_apikey_input') -> [{<<"id">>, 'id', true, false, string}, {<<"name">>, 'name', true, false, string}, {<<"description">>, 'description', false, false, string}];
schema('update_now_playing_input') -> [{<<"id">>, 'id', true, false, string}];
schema('update_now_playing_output') -> [{<<"status">>, 'status', false, false, string}, {<<"version">>, 'version', false, false, string}, {<<"type">>, 'type', false, false, string}, {<<"serverVersion">>, 'server_version', false, false, string}, {<<"openSubsonic">>, 'open_subsonic', false, false, boolean}];
schema('update_seen_input') -> [{<<"ids">>, 'ids', false, false, {list, string}}];
schema('update_seen_output') -> [{<<"unreadCount">>, 'unread_count', true, false, integer}].
-spec decode_blob_cid_ref(map()) -> {ok, blob_cid_ref()} | {error, term()}.
decode_blob_cid_ref(Value) -> rocksky_typed_codec:decode('blob_cid_ref', Value).
-spec encode_blob_cid_ref(blob_cid_ref()) -> map().
encode_blob_cid_ref(Value) -> rocksky_typed_codec:encode('blob_cid_ref', Value).

-spec decode_blob_ref(map()) -> {ok, blob_ref()} | {error, term()}.
decode_blob_ref(Value) -> rocksky_typed_codec:decode('blob_ref', Value).
-spec encode_blob_ref(blob_ref()) -> map().
encode_blob_ref(Value) -> rocksky_typed_codec:encode('blob_ref', Value).

-spec decode_actor_artist_view_basic(map()) -> {ok, actor_artist_view_basic()} | {error, term()}.
decode_actor_artist_view_basic(Value) -> rocksky_typed_codec:decode('actor_artist_view_basic', Value).
-spec encode_actor_artist_view_basic(actor_artist_view_basic()) -> map().
encode_actor_artist_view_basic(Value) -> rocksky_typed_codec:encode('actor_artist_view_basic', Value).

-spec decode_actor_compatibility_view_basic(map()) -> {ok, actor_compatibility_view_basic()} | {error, term()}.
decode_actor_compatibility_view_basic(Value) -> rocksky_typed_codec:decode('actor_compatibility_view_basic', Value).
-spec encode_actor_compatibility_view_basic(actor_compatibility_view_basic()) -> map().
encode_actor_compatibility_view_basic(Value) -> rocksky_typed_codec:encode('actor_compatibility_view_basic', Value).

-spec decode_actor_neighbour_view_basic(map()) -> {ok, actor_neighbour_view_basic()} | {error, term()}.
decode_actor_neighbour_view_basic(Value) -> rocksky_typed_codec:decode('actor_neighbour_view_basic', Value).
-spec encode_actor_neighbour_view_basic(actor_neighbour_view_basic()) -> map().
encode_actor_neighbour_view_basic(Value) -> rocksky_typed_codec:encode('actor_neighbour_view_basic', Value).

-spec decode_actor_profile_view_basic(map()) -> {ok, actor_profile_view_basic()} | {error, term()}.
decode_actor_profile_view_basic(Value) -> rocksky_typed_codec:decode('actor_profile_view_basic', Value).
-spec encode_actor_profile_view_basic(actor_profile_view_basic()) -> map().
encode_actor_profile_view_basic(Value) -> rocksky_typed_codec:encode('actor_profile_view_basic', Value).

-spec decode_actor_profile_view_detailed(map()) -> {ok, actor_profile_view_detailed()} | {error, term()}.
decode_actor_profile_view_detailed(Value) -> rocksky_typed_codec:decode('actor_profile_view_detailed', Value).
-spec encode_actor_profile_view_detailed(actor_profile_view_detailed()) -> map().
encode_actor_profile_view_detailed(Value) -> rocksky_typed_codec:encode('actor_profile_view_detailed', Value).

-spec decode_actor_response_dropbox_view(map()) -> {ok, actor_response_dropbox_view()} | {error, term()}.
decode_actor_response_dropbox_view(Value) -> rocksky_typed_codec:decode('actor_response_dropbox_view', Value).
-spec encode_actor_response_dropbox_view(actor_response_dropbox_view()) -> map().
encode_actor_response_dropbox_view(Value) -> rocksky_typed_codec:encode('actor_response_dropbox_view', Value).

-spec decode_actor_response_googledrive_view(map()) -> {ok, actor_response_googledrive_view()} | {error, term()}.
decode_actor_response_googledrive_view(Value) -> rocksky_typed_codec:decode('actor_response_googledrive_view', Value).
-spec encode_actor_response_googledrive_view(actor_response_googledrive_view()) -> map().
encode_actor_response_googledrive_view(Value) -> rocksky_typed_codec:encode('actor_response_googledrive_view', Value).

-spec decode_actor_response_spotify_user_view(map()) -> {ok, actor_response_spotify_user_view()} | {error, term()}.
decode_actor_response_spotify_user_view(Value) -> rocksky_typed_codec:decode('actor_response_spotify_user_view', Value).
-spec encode_actor_response_spotify_user_view(actor_response_spotify_user_view()) -> map().
encode_actor_response_spotify_user_view(Value) -> rocksky_typed_codec:encode('actor_response_spotify_user_view', Value).

-spec decode_actor_track_view(map()) -> {ok, actor_track_view()} | {error, term()}.
decode_actor_track_view(Value) -> rocksky_typed_codec:decode('actor_track_view', Value).
-spec encode_actor_track_view(actor_track_view()) -> map().
encode_actor_track_view(Value) -> rocksky_typed_codec:encode('actor_track_view', Value).

-spec decode_add_directory_to_queue_params(map()) -> {ok, add_directory_to_queue_params()} | {error, term()}.
decode_add_directory_to_queue_params(Value) -> rocksky_typed_codec:decode('add_directory_to_queue_params', Value).
-spec encode_add_directory_to_queue_params(add_directory_to_queue_params()) -> map().
encode_add_directory_to_queue_params(Value) -> rocksky_typed_codec:encode('add_directory_to_queue_params', Value).

-spec decode_add_items_to_queue_params(map()) -> {ok, add_items_to_queue_params()} | {error, term()}.
decode_add_items_to_queue_params(Value) -> rocksky_typed_codec:decode('add_items_to_queue_params', Value).
-spec encode_add_items_to_queue_params(add_items_to_queue_params()) -> map().
encode_add_items_to_queue_params(Value) -> rocksky_typed_codec:encode('add_items_to_queue_params', Value).

-spec decode_add_songs_output(map()) -> {ok, add_songs_output()} | {error, term()}.
decode_add_songs_output(Value) -> rocksky_typed_codec:decode('add_songs_output', Value).
-spec encode_add_songs_output(add_songs_output()) -> map().
encode_add_songs_output(Value) -> rocksky_typed_codec:encode('add_songs_output', Value).

-spec decode_add_songs_params(map()) -> {ok, add_songs_params()} | {error, term()}.
decode_add_songs_params(Value) -> rocksky_typed_codec:decode('add_songs_params', Value).
-spec encode_add_songs_params(add_songs_params()) -> map().
encode_add_songs_params(Value) -> rocksky_typed_codec:encode('add_songs_params', Value).

-spec decode_album_discogs_artist_view(map()) -> {ok, album_discogs_artist_view()} | {error, term()}.
decode_album_discogs_artist_view(Value) -> rocksky_typed_codec:decode('album_discogs_artist_view', Value).
-spec encode_album_discogs_artist_view(album_discogs_artist_view()) -> map().
encode_album_discogs_artist_view(Value) -> rocksky_typed_codec:encode('album_discogs_artist_view', Value).

-spec decode_album_discogs_credit_view(map()) -> {ok, album_discogs_credit_view()} | {error, term()}.
decode_album_discogs_credit_view(Value) -> rocksky_typed_codec:decode('album_discogs_credit_view', Value).
-spec encode_album_discogs_credit_view(album_discogs_credit_view()) -> map().
encode_album_discogs_credit_view(Value) -> rocksky_typed_codec:encode('album_discogs_credit_view', Value).

-spec decode_album_discogs_identifier_view(map()) -> {ok, album_discogs_identifier_view()} | {error, term()}.
decode_album_discogs_identifier_view(Value) -> rocksky_typed_codec:decode('album_discogs_identifier_view', Value).
-spec encode_album_discogs_identifier_view(album_discogs_identifier_view()) -> map().
encode_album_discogs_identifier_view(Value) -> rocksky_typed_codec:encode('album_discogs_identifier_view', Value).

-spec decode_album_discogs_label_view(map()) -> {ok, album_discogs_label_view()} | {error, term()}.
decode_album_discogs_label_view(Value) -> rocksky_typed_codec:decode('album_discogs_label_view', Value).
-spec encode_album_discogs_label_view(album_discogs_label_view()) -> map().
encode_album_discogs_label_view(Value) -> rocksky_typed_codec:encode('album_discogs_label_view', Value).

-spec decode_album_discogs_master_view(map()) -> {ok, album_discogs_master_view()} | {error, term()}.
decode_album_discogs_master_view(Value) -> rocksky_typed_codec:decode('album_discogs_master_view', Value).
-spec encode_album_discogs_master_view(album_discogs_master_view()) -> map().
encode_album_discogs_master_view(Value) -> rocksky_typed_codec:encode('album_discogs_master_view', Value).

-spec decode_album_discogs_track_view(map()) -> {ok, album_discogs_track_view()} | {error, term()}.
decode_album_discogs_track_view(Value) -> rocksky_typed_codec:decode('album_discogs_track_view', Value).
-spec encode_album_discogs_track_view(album_discogs_track_view()) -> map().
encode_album_discogs_track_view(Value) -> rocksky_typed_codec:encode('album_discogs_track_view', Value).

-spec decode_album_discogs_view(map()) -> {ok, album_discogs_view()} | {error, term()}.
decode_album_discogs_view(Value) -> rocksky_typed_codec:decode('album_discogs_view', Value).
-spec encode_album_discogs_view(album_discogs_view()) -> map().
encode_album_discogs_view(Value) -> rocksky_typed_codec:encode('album_discogs_view', Value).

-spec decode_album_get_album_params(map()) -> {ok, album_get_album_params()} | {error, term()}.
decode_album_get_album_params(Value) -> rocksky_typed_codec:decode('album_get_album_params', Value).
-spec encode_album_get_album_params(album_get_album_params()) -> map().
encode_album_get_album_params(Value) -> rocksky_typed_codec:encode('album_get_album_params', Value).

-spec decode_album_record(map()) -> {ok, album_record()} | {error, term()}.
decode_album_record(Value) -> rocksky_typed_codec:decode('album_record', Value).
-spec encode_album_record(album_record()) -> map().
encode_album_record(Value) -> rocksky_typed_codec:encode('album_record', Value).

-spec decode_album_view_basic(map()) -> {ok, album_view_basic()} | {error, term()}.
decode_album_view_basic(Value) -> rocksky_typed_codec:decode('album_view_basic', Value).
-spec encode_album_view_basic(album_view_basic()) -> map().
encode_album_view_basic(Value) -> rocksky_typed_codec:encode('album_view_basic', Value).

-spec decode_album_view_detailed(map()) -> {ok, album_view_detailed()} | {error, term()}.
decode_album_view_detailed(Value) -> rocksky_typed_codec:decode('album_view_detailed', Value).
-spec encode_album_view_detailed(album_view_detailed()) -> map().
encode_album_view_detailed(Value) -> rocksky_typed_codec:encode('album_view_detailed', Value).

-spec decode_api_key_view(map()) -> {ok, api_key_view()} | {error, term()}.
decode_api_key_view(Value) -> rocksky_typed_codec:decode('api_key_view', Value).
-spec encode_api_key_view(api_key_view()) -> map().
encode_api_key_view(Value) -> rocksky_typed_codec:encode('api_key_view', Value).

-spec decode_artist_get_artist_params(map()) -> {ok, artist_get_artist_params()} | {error, term()}.
decode_artist_get_artist_params(Value) -> rocksky_typed_codec:decode('artist_get_artist_params', Value).
-spec encode_artist_get_artist_params(artist_get_artist_params()) -> map().
encode_artist_get_artist_params(Value) -> rocksky_typed_codec:encode('artist_get_artist_params', Value).

-spec decode_artist_get_artists_output(map()) -> {ok, artist_get_artists_output()} | {error, term()}.
decode_artist_get_artists_output(Value) -> rocksky_typed_codec:decode('artist_get_artists_output', Value).
-spec encode_artist_get_artists_output(artist_get_artists_output()) -> map().
encode_artist_get_artists_output(Value) -> rocksky_typed_codec:encode('artist_get_artists_output', Value).

-spec decode_artist_get_artists_params(map()) -> {ok, artist_get_artists_params()} | {error, term()}.
decode_artist_get_artists_params(Value) -> rocksky_typed_codec:decode('artist_get_artists_params', Value).
-spec encode_artist_get_artists_params(artist_get_artists_params()) -> map().
encode_artist_get_artists_params(Value) -> rocksky_typed_codec:encode('artist_get_artists_params', Value).

-spec decode_artist_listener_view_basic(map()) -> {ok, artist_listener_view_basic()} | {error, term()}.
decode_artist_listener_view_basic(Value) -> rocksky_typed_codec:decode('artist_listener_view_basic', Value).
-spec encode_artist_listener_view_basic(artist_listener_view_basic()) -> map().
encode_artist_listener_view_basic(Value) -> rocksky_typed_codec:encode('artist_listener_view_basic', Value).

-spec decode_artist_mbid(map()) -> {ok, artist_mbid()} | {error, term()}.
decode_artist_mbid(Value) -> rocksky_typed_codec:decode('artist_mbid', Value).
-spec encode_artist_mbid(artist_mbid()) -> map().
encode_artist_mbid(Value) -> rocksky_typed_codec:encode('artist_mbid', Value).

-spec decode_artist_recent_listener_view(map()) -> {ok, artist_recent_listener_view()} | {error, term()}.
decode_artist_recent_listener_view(Value) -> rocksky_typed_codec:decode('artist_recent_listener_view', Value).
-spec encode_artist_recent_listener_view(artist_recent_listener_view()) -> map().
encode_artist_recent_listener_view(Value) -> rocksky_typed_codec:encode('artist_recent_listener_view', Value).

-spec decode_artist_record(map()) -> {ok, artist_record()} | {error, term()}.
decode_artist_record(Value) -> rocksky_typed_codec:decode('artist_record', Value).
-spec encode_artist_record(artist_record()) -> map().
encode_artist_record(Value) -> rocksky_typed_codec:encode('artist_record', Value).

-spec decode_artist_song_view_basic(map()) -> {ok, artist_song_view_basic()} | {error, term()}.
decode_artist_song_view_basic(Value) -> rocksky_typed_codec:decode('artist_song_view_basic', Value).
-spec encode_artist_song_view_basic(artist_song_view_basic()) -> map().
encode_artist_song_view_basic(Value) -> rocksky_typed_codec:encode('artist_song_view_basic', Value).

-spec decode_artist_view_basic(map()) -> {ok, artist_view_basic()} | {error, term()}.
decode_artist_view_basic(Value) -> rocksky_typed_codec:decode('artist_view_basic', Value).
-spec encode_artist_view_basic(artist_view_basic()) -> map().
encode_artist_view_basic(Value) -> rocksky_typed_codec:encode('artist_view_basic', Value).

-spec decode_artist_view_detailed(map()) -> {ok, artist_view_detailed()} | {error, term()}.
decode_artist_view_detailed(Value) -> rocksky_typed_codec:decode('artist_view_detailed', Value).
-spec encode_artist_view_detailed(artist_view_detailed()) -> map().
encode_artist_view_detailed(Value) -> rocksky_typed_codec:encode('artist_view_detailed', Value).

-spec decode_charts_decade_view_basic(map()) -> {ok, charts_decade_view_basic()} | {error, term()}.
decode_charts_decade_view_basic(Value) -> rocksky_typed_codec:decode('charts_decade_view_basic', Value).
-spec encode_charts_decade_view_basic(charts_decade_view_basic()) -> map().
encode_charts_decade_view_basic(Value) -> rocksky_typed_codec:encode('charts_decade_view_basic', Value).

-spec decode_charts_scrobbler_view_basic(map()) -> {ok, charts_scrobbler_view_basic()} | {error, term()}.
decode_charts_scrobbler_view_basic(Value) -> rocksky_typed_codec:decode('charts_scrobbler_view_basic', Value).
-spec encode_charts_scrobbler_view_basic(charts_scrobbler_view_basic()) -> map().
encode_charts_scrobbler_view_basic(Value) -> rocksky_typed_codec:encode('charts_scrobbler_view_basic', Value).

-spec decode_charts_scrobble_view_basic(map()) -> {ok, charts_scrobble_view_basic()} | {error, term()}.
decode_charts_scrobble_view_basic(Value) -> rocksky_typed_codec:decode('charts_scrobble_view_basic', Value).
-spec encode_charts_scrobble_view_basic(charts_scrobble_view_basic()) -> map().
encode_charts_scrobble_view_basic(Value) -> rocksky_typed_codec:encode('charts_scrobble_view_basic', Value).

-spec decode_charts_view(map()) -> {ok, charts_view()} | {error, term()}.
decode_charts_view(Value) -> rocksky_typed_codec:decode('charts_view', Value).
-spec encode_charts_view(charts_view()) -> map().
encode_charts_view(Value) -> rocksky_typed_codec:encode('charts_view', Value).

-spec decode_create_apikey_input(map()) -> {ok, create_apikey_input()} | {error, term()}.
decode_create_apikey_input(Value) -> rocksky_typed_codec:decode('create_apikey_input', Value).
-spec encode_create_apikey_input(create_apikey_input()) -> map().
encode_create_apikey_input(Value) -> rocksky_typed_codec:encode('create_apikey_input', Value).

-spec decode_create_scrobble_input(map()) -> {ok, create_scrobble_input()} | {error, term()}.
decode_create_scrobble_input(Value) -> rocksky_typed_codec:decode('create_scrobble_input', Value).
-spec encode_create_scrobble_input(create_scrobble_input()) -> map().
encode_create_scrobble_input(Value) -> rocksky_typed_codec:encode('create_scrobble_input', Value).

-spec decode_create_shout_input(map()) -> {ok, create_shout_input()} | {error, term()}.
decode_create_shout_input(Value) -> rocksky_typed_codec:decode('create_shout_input', Value).
-spec encode_create_shout_input(create_shout_input()) -> map().
encode_create_shout_input(Value) -> rocksky_typed_codec:encode('create_shout_input', Value).

-spec decode_create_song_input(map()) -> {ok, create_song_input()} | {error, term()}.
decode_create_song_input(Value) -> rocksky_typed_codec:decode('create_song_input', Value).
-spec encode_create_song_input(create_song_input()) -> map().
encode_create_song_input(Value) -> rocksky_typed_codec:encode('create_song_input', Value).

-spec decode_delete_album_input(map()) -> {ok, delete_album_input()} | {error, term()}.
decode_delete_album_input(Value) -> rocksky_typed_codec:decode('delete_album_input', Value).
-spec encode_delete_album_input(delete_album_input()) -> map().
encode_delete_album_input(Value) -> rocksky_typed_codec:encode('delete_album_input', Value).

-spec decode_delete_album_output(map()) -> {ok, delete_album_output()} | {error, term()}.
decode_delete_album_output(Value) -> rocksky_typed_codec:decode('delete_album_output', Value).
-spec encode_delete_album_output(delete_album_output()) -> map().
encode_delete_album_output(Value) -> rocksky_typed_codec:encode('delete_album_output', Value).

-spec decode_delete_playlist_input(map()) -> {ok, delete_playlist_input()} | {error, term()}.
decode_delete_playlist_input(Value) -> rocksky_typed_codec:decode('delete_playlist_input', Value).
-spec encode_delete_playlist_input(delete_playlist_input()) -> map().
encode_delete_playlist_input(Value) -> rocksky_typed_codec:encode('delete_playlist_input', Value).

-spec decode_delete_playlist_output(map()) -> {ok, delete_playlist_output()} | {error, term()}.
decode_delete_playlist_output(Value) -> rocksky_typed_codec:decode('delete_playlist_output', Value).
-spec encode_delete_playlist_output(delete_playlist_output()) -> map().
encode_delete_playlist_output(Value) -> rocksky_typed_codec:encode('delete_playlist_output', Value).

-spec decode_delete_preset_params(map()) -> {ok, delete_preset_params()} | {error, term()}.
decode_delete_preset_params(Value) -> rocksky_typed_codec:decode('delete_preset_params', Value).
-spec encode_delete_preset_params(delete_preset_params()) -> map().
encode_delete_preset_params(Value) -> rocksky_typed_codec:encode('delete_preset_params', Value).

-spec decode_delete_song_input(map()) -> {ok, delete_song_input()} | {error, term()}.
decode_delete_song_input(Value) -> rocksky_typed_codec:decode('delete_song_input', Value).
-spec encode_delete_song_input(delete_song_input()) -> map().
encode_delete_song_input(Value) -> rocksky_typed_codec:encode('delete_song_input', Value).

-spec decode_delete_song_output(map()) -> {ok, delete_song_output()} | {error, term()}.
decode_delete_song_output(Value) -> rocksky_typed_codec:decode('delete_song_output', Value).
-spec encode_delete_song_output(delete_song_output()) -> map().
encode_delete_song_output(Value) -> rocksky_typed_codec:encode('delete_song_output', Value).

-spec decode_describe_feed_generator_output(map()) -> {ok, describe_feed_generator_output()} | {error, term()}.
decode_describe_feed_generator_output(Value) -> rocksky_typed_codec:decode('describe_feed_generator_output', Value).
-spec encode_describe_feed_generator_output(describe_feed_generator_output()) -> map().
encode_describe_feed_generator_output(Value) -> rocksky_typed_codec:encode('describe_feed_generator_output', Value).

-spec decode_dislike_shout_input(map()) -> {ok, dislike_shout_input()} | {error, term()}.
decode_dislike_shout_input(Value) -> rocksky_typed_codec:decode('dislike_shout_input', Value).
-spec encode_dislike_shout_input(dislike_shout_input()) -> map().
encode_dislike_shout_input(Value) -> rocksky_typed_codec:encode('dislike_shout_input', Value).

-spec decode_dislike_song_input(map()) -> {ok, dislike_song_input()} | {error, term()}.
decode_dislike_song_input(Value) -> rocksky_typed_codec:decode('dislike_song_input', Value).
-spec encode_dislike_song_input(dislike_song_input()) -> map().
encode_dislike_song_input(Value) -> rocksky_typed_codec:encode('dislike_song_input', Value).

-spec decode_dropbox_download_file_params(map()) -> {ok, dropbox_download_file_params()} | {error, term()}.
decode_dropbox_download_file_params(Value) -> rocksky_typed_codec:decode('dropbox_download_file_params', Value).
-spec encode_dropbox_download_file_params(dropbox_download_file_params()) -> map().
encode_dropbox_download_file_params(Value) -> rocksky_typed_codec:encode('dropbox_download_file_params', Value).

-spec decode_dropbox_file_list_view(map()) -> {ok, dropbox_file_list_view()} | {error, term()}.
decode_dropbox_file_list_view(Value) -> rocksky_typed_codec:decode('dropbox_file_list_view', Value).
-spec encode_dropbox_file_list_view(dropbox_file_list_view()) -> map().
encode_dropbox_file_list_view(Value) -> rocksky_typed_codec:encode('dropbox_file_list_view', Value).

-spec decode_dropbox_file_view(map()) -> {ok, dropbox_file_view()} | {error, term()}.
decode_dropbox_file_view(Value) -> rocksky_typed_codec:decode('dropbox_file_view', Value).
-spec encode_dropbox_file_view(dropbox_file_view()) -> map().
encode_dropbox_file_view(Value) -> rocksky_typed_codec:encode('dropbox_file_view', Value).

-spec decode_dropbox_get_files_params(map()) -> {ok, dropbox_get_files_params()} | {error, term()}.
decode_dropbox_get_files_params(Value) -> rocksky_typed_codec:decode('dropbox_get_files_params', Value).
-spec encode_dropbox_get_files_params(dropbox_get_files_params()) -> map().
encode_dropbox_get_files_params(Value) -> rocksky_typed_codec:encode('dropbox_get_files_params', Value).

-spec decode_dropbox_response_directories_item_view(map()) -> {ok, dropbox_response_directories_item_view()} | {error, term()}.
decode_dropbox_response_directories_item_view(Value) -> rocksky_typed_codec:decode('dropbox_response_directories_item_view', Value).
-spec encode_dropbox_response_directories_item_view(dropbox_response_directories_item_view()) -> map().
encode_dropbox_response_directories_item_view(Value) -> rocksky_typed_codec:encode('dropbox_response_directories_item_view', Value).

-spec decode_dropbox_response_directory_view(map()) -> {ok, dropbox_response_directory_view()} | {error, term()}.
decode_dropbox_response_directory_view(Value) -> rocksky_typed_codec:decode('dropbox_response_directory_view', Value).
-spec encode_dropbox_response_directory_view(dropbox_response_directory_view()) -> map().
encode_dropbox_response_directory_view(Value) -> rocksky_typed_codec:encode('dropbox_response_directory_view', Value).

-spec decode_dropbox_response_parent_directory_view(map()) -> {ok, dropbox_response_parent_directory_view()} | {error, term()}.
decode_dropbox_response_parent_directory_view(Value) -> rocksky_typed_codec:decode('dropbox_response_parent_directory_view', Value).
-spec encode_dropbox_response_parent_directory_view(dropbox_response_parent_directory_view()) -> map().
encode_dropbox_response_parent_directory_view(Value) -> rocksky_typed_codec:encode('dropbox_response_parent_directory_view', Value).

-spec decode_dropbox_temporary_link_view(map()) -> {ok, dropbox_temporary_link_view()} | {error, term()}.
decode_dropbox_temporary_link_view(Value) -> rocksky_typed_codec:decode('dropbox_temporary_link_view', Value).
-spec encode_dropbox_temporary_link_view(dropbox_temporary_link_view()) -> map().
encode_dropbox_temporary_link_view(Value) -> rocksky_typed_codec:encode('dropbox_temporary_link_view', Value).

-spec decode_equalizer_preset_view(map()) -> {ok, equalizer_preset_view()} | {error, term()}.
decode_equalizer_preset_view(Value) -> rocksky_typed_codec:decode('equalizer_preset_view', Value).
-spec encode_equalizer_preset_view(equalizer_preset_view()) -> map().
encode_equalizer_preset_view(Value) -> rocksky_typed_codec:encode('equalizer_preset_view', Value).

-spec decode_equalizer_record(map()) -> {ok, equalizer_record()} | {error, term()}.
decode_equalizer_record(Value) -> rocksky_typed_codec:decode('equalizer_record', Value).
-spec encode_equalizer_record(equalizer_record()) -> map().
encode_equalizer_record(Value) -> rocksky_typed_codec:encode('equalizer_record', Value).

-spec decode_feed_generators_view(map()) -> {ok, feed_generators_view()} | {error, term()}.
decode_feed_generators_view(Value) -> rocksky_typed_codec:decode('feed_generators_view', Value).
-spec encode_feed_generators_view(feed_generators_view()) -> map().
encode_feed_generators_view(Value) -> rocksky_typed_codec:encode('feed_generators_view', Value).

-spec decode_feed_generator_view(map()) -> {ok, feed_generator_view()} | {error, term()}.
decode_feed_generator_view(Value) -> rocksky_typed_codec:decode('feed_generator_view', Value).
-spec encode_feed_generator_view(feed_generator_view()) -> map().
encode_feed_generator_view(Value) -> rocksky_typed_codec:encode('feed_generator_view', Value).

-spec decode_feed_item_view(map()) -> {ok, feed_item_view()} | {error, term()}.
decode_feed_item_view(Value) -> rocksky_typed_codec:decode('feed_item_view', Value).
-spec encode_feed_item_view(feed_item_view()) -> map().
encode_feed_item_view(Value) -> rocksky_typed_codec:encode('feed_item_view', Value).

-spec decode_feed_recommendations_view(map()) -> {ok, feed_recommendations_view()} | {error, term()}.
decode_feed_recommendations_view(Value) -> rocksky_typed_codec:decode('feed_recommendations_view', Value).
-spec encode_feed_recommendations_view(feed_recommendations_view()) -> map().
encode_feed_recommendations_view(Value) -> rocksky_typed_codec:encode('feed_recommendations_view', Value).

-spec decode_feed_recommendation_view(map()) -> {ok, feed_recommendation_view()} | {error, term()}.
decode_feed_recommendation_view(Value) -> rocksky_typed_codec:decode('feed_recommendation_view', Value).
-spec encode_feed_recommendation_view(feed_recommendation_view()) -> map().
encode_feed_recommendation_view(Value) -> rocksky_typed_codec:encode('feed_recommendation_view', Value).

-spec decode_feed_recommended_albums_view(map()) -> {ok, feed_recommended_albums_view()} | {error, term()}.
decode_feed_recommended_albums_view(Value) -> rocksky_typed_codec:decode('feed_recommended_albums_view', Value).
-spec encode_feed_recommended_albums_view(feed_recommended_albums_view()) -> map().
encode_feed_recommended_albums_view(Value) -> rocksky_typed_codec:encode('feed_recommended_albums_view', Value).

-spec decode_feed_recommended_album_view(map()) -> {ok, feed_recommended_album_view()} | {error, term()}.
decode_feed_recommended_album_view(Value) -> rocksky_typed_codec:decode('feed_recommended_album_view', Value).
-spec encode_feed_recommended_album_view(feed_recommended_album_view()) -> map().
encode_feed_recommended_album_view(Value) -> rocksky_typed_codec:encode('feed_recommended_album_view', Value).

-spec decode_feed_recommended_artists_view(map()) -> {ok, feed_recommended_artists_view()} | {error, term()}.
decode_feed_recommended_artists_view(Value) -> rocksky_typed_codec:decode('feed_recommended_artists_view', Value).
-spec encode_feed_recommended_artists_view(feed_recommended_artists_view()) -> map().
encode_feed_recommended_artists_view(Value) -> rocksky_typed_codec:encode('feed_recommended_artists_view', Value).

-spec decode_feed_recommended_artist_view(map()) -> {ok, feed_recommended_artist_view()} | {error, term()}.
decode_feed_recommended_artist_view(Value) -> rocksky_typed_codec:decode('feed_recommended_artist_view', Value).
-spec encode_feed_recommended_artist_view(feed_recommended_artist_view()) -> map().
encode_feed_recommended_artist_view(Value) -> rocksky_typed_codec:encode('feed_recommended_artist_view', Value).

-spec decode_feed_search_federation(map()) -> {ok, feed_search_federation()} | {error, term()}.
decode_feed_search_federation(Value) -> rocksky_typed_codec:decode('feed_search_federation', Value).
-spec encode_feed_search_federation(feed_search_federation()) -> map().
encode_feed_search_federation(Value) -> rocksky_typed_codec:encode('feed_search_federation', Value).

-spec decode_feed_search_hit(map()) -> {ok, feed_search_hit()} | {error, term()}.
decode_feed_search_hit(Value) -> rocksky_typed_codec:decode('feed_search_hit', Value).
-spec encode_feed_search_hit(feed_search_hit()) -> map().
encode_feed_search_hit(Value) -> rocksky_typed_codec:encode('feed_search_hit', Value).

-spec decode_feed_search_params(map()) -> {ok, feed_search_params()} | {error, term()}.
decode_feed_search_params(Value) -> rocksky_typed_codec:decode('feed_search_params', Value).
-spec encode_feed_search_params(feed_search_params()) -> map().
encode_feed_search_params(Value) -> rocksky_typed_codec:encode('feed_search_params', Value).

-spec decode_feed_search_results_view(map()) -> {ok, feed_search_results_view()} | {error, term()}.
decode_feed_search_results_view(Value) -> rocksky_typed_codec:decode('feed_search_results_view', Value).
-spec encode_feed_search_results_view(feed_search_results_view()) -> map().
encode_feed_search_results_view(Value) -> rocksky_typed_codec:encode('feed_search_results_view', Value).

-spec decode_feed_stories_view(map()) -> {ok, feed_stories_view()} | {error, term()}.
decode_feed_stories_view(Value) -> rocksky_typed_codec:decode('feed_stories_view', Value).
-spec encode_feed_stories_view(feed_stories_view()) -> map().
encode_feed_stories_view(Value) -> rocksky_typed_codec:encode('feed_stories_view', Value).

-spec decode_feed_story_view(map()) -> {ok, feed_story_view()} | {error, term()}.
decode_feed_story_view(Value) -> rocksky_typed_codec:decode('feed_story_view', Value).
-spec encode_feed_story_view(feed_story_view()) -> map().
encode_feed_story_view(Value) -> rocksky_typed_codec:encode('feed_story_view', Value).

-spec decode_feed_uri_view(map()) -> {ok, feed_uri_view()} | {error, term()}.
decode_feed_uri_view(Value) -> rocksky_typed_codec:decode('feed_uri_view', Value).
-spec encode_feed_uri_view(feed_uri_view()) -> map().
encode_feed_uri_view(Value) -> rocksky_typed_codec:encode('feed_uri_view', Value).

-spec decode_feed_view(map()) -> {ok, feed_view()} | {error, term()}.
decode_feed_view(Value) -> rocksky_typed_codec:decode('feed_view', Value).
-spec encode_feed_view(feed_view()) -> map().
encode_feed_view(Value) -> rocksky_typed_codec:encode('feed_view', Value).

-spec decode_follow_account_output(map()) -> {ok, follow_account_output()} | {error, term()}.
decode_follow_account_output(Value) -> rocksky_typed_codec:decode('follow_account_output', Value).
-spec encode_follow_account_output(follow_account_output()) -> map().
encode_follow_account_output(Value) -> rocksky_typed_codec:encode('follow_account_output', Value).

-spec decode_follow_account_params(map()) -> {ok, follow_account_params()} | {error, term()}.
decode_follow_account_params(Value) -> rocksky_typed_codec:decode('follow_account_params', Value).
-spec encode_follow_account_params(follow_account_params()) -> map().
encode_follow_account_params(Value) -> rocksky_typed_codec:encode('follow_account_params', Value).

-spec decode_follow_record(map()) -> {ok, follow_record()} | {error, term()}.
decode_follow_record(Value) -> rocksky_typed_codec:decode('follow_record', Value).
-spec encode_follow_record(follow_record()) -> map().
encode_follow_record(Value) -> rocksky_typed_codec:encode('follow_record', Value).

-spec decode_generator_record(map()) -> {ok, generator_record()} | {error, term()}.
decode_generator_record(Value) -> rocksky_typed_codec:decode('generator_record', Value).
-spec encode_generator_record(generator_record()) -> map().
encode_generator_record(Value) -> rocksky_typed_codec:encode('generator_record', Value).

-spec decode_get_actor_albums_output(map()) -> {ok, get_actor_albums_output()} | {error, term()}.
decode_get_actor_albums_output(Value) -> rocksky_typed_codec:decode('get_actor_albums_output', Value).
-spec encode_get_actor_albums_output(get_actor_albums_output()) -> map().
encode_get_actor_albums_output(Value) -> rocksky_typed_codec:encode('get_actor_albums_output', Value).

-spec decode_get_actor_albums_params(map()) -> {ok, get_actor_albums_params()} | {error, term()}.
decode_get_actor_albums_params(Value) -> rocksky_typed_codec:decode('get_actor_albums_params', Value).
-spec encode_get_actor_albums_params(get_actor_albums_params()) -> map().
encode_get_actor_albums_params(Value) -> rocksky_typed_codec:encode('get_actor_albums_params', Value).

-spec decode_get_actor_artists_output(map()) -> {ok, get_actor_artists_output()} | {error, term()}.
decode_get_actor_artists_output(Value) -> rocksky_typed_codec:decode('get_actor_artists_output', Value).
-spec encode_get_actor_artists_output(get_actor_artists_output()) -> map().
encode_get_actor_artists_output(Value) -> rocksky_typed_codec:encode('get_actor_artists_output', Value).

-spec decode_get_actor_artists_params(map()) -> {ok, get_actor_artists_params()} | {error, term()}.
decode_get_actor_artists_params(Value) -> rocksky_typed_codec:decode('get_actor_artists_params', Value).
-spec encode_get_actor_artists_params(get_actor_artists_params()) -> map().
encode_get_actor_artists_params(Value) -> rocksky_typed_codec:encode('get_actor_artists_params', Value).

-spec decode_get_actor_compatibility_output(map()) -> {ok, get_actor_compatibility_output()} | {error, term()}.
decode_get_actor_compatibility_output(Value) -> rocksky_typed_codec:decode('get_actor_compatibility_output', Value).
-spec encode_get_actor_compatibility_output(get_actor_compatibility_output()) -> map().
encode_get_actor_compatibility_output(Value) -> rocksky_typed_codec:encode('get_actor_compatibility_output', Value).

-spec decode_get_actor_compatibility_params(map()) -> {ok, get_actor_compatibility_params()} | {error, term()}.
decode_get_actor_compatibility_params(Value) -> rocksky_typed_codec:decode('get_actor_compatibility_params', Value).
-spec encode_get_actor_compatibility_params(get_actor_compatibility_params()) -> map().
encode_get_actor_compatibility_params(Value) -> rocksky_typed_codec:encode('get_actor_compatibility_params', Value).

-spec decode_get_actor_loved_songs_output(map()) -> {ok, get_actor_loved_songs_output()} | {error, term()}.
decode_get_actor_loved_songs_output(Value) -> rocksky_typed_codec:decode('get_actor_loved_songs_output', Value).
-spec encode_get_actor_loved_songs_output(get_actor_loved_songs_output()) -> map().
encode_get_actor_loved_songs_output(Value) -> rocksky_typed_codec:encode('get_actor_loved_songs_output', Value).

-spec decode_get_actor_loved_songs_params(map()) -> {ok, get_actor_loved_songs_params()} | {error, term()}.
decode_get_actor_loved_songs_params(Value) -> rocksky_typed_codec:decode('get_actor_loved_songs_params', Value).
-spec encode_get_actor_loved_songs_params(get_actor_loved_songs_params()) -> map().
encode_get_actor_loved_songs_params(Value) -> rocksky_typed_codec:encode('get_actor_loved_songs_params', Value).

-spec decode_get_actor_neighbours_output(map()) -> {ok, get_actor_neighbours_output()} | {error, term()}.
decode_get_actor_neighbours_output(Value) -> rocksky_typed_codec:decode('get_actor_neighbours_output', Value).
-spec encode_get_actor_neighbours_output(get_actor_neighbours_output()) -> map().
encode_get_actor_neighbours_output(Value) -> rocksky_typed_codec:encode('get_actor_neighbours_output', Value).

-spec decode_get_actor_neighbours_params(map()) -> {ok, get_actor_neighbours_params()} | {error, term()}.
decode_get_actor_neighbours_params(Value) -> rocksky_typed_codec:decode('get_actor_neighbours_params', Value).
-spec encode_get_actor_neighbours_params(get_actor_neighbours_params()) -> map().
encode_get_actor_neighbours_params(Value) -> rocksky_typed_codec:encode('get_actor_neighbours_params', Value).

-spec decode_get_actor_playlists_output(map()) -> {ok, get_actor_playlists_output()} | {error, term()}.
decode_get_actor_playlists_output(Value) -> rocksky_typed_codec:decode('get_actor_playlists_output', Value).
-spec encode_get_actor_playlists_output(get_actor_playlists_output()) -> map().
encode_get_actor_playlists_output(Value) -> rocksky_typed_codec:encode('get_actor_playlists_output', Value).

-spec decode_get_actor_playlists_params(map()) -> {ok, get_actor_playlists_params()} | {error, term()}.
decode_get_actor_playlists_params(Value) -> rocksky_typed_codec:decode('get_actor_playlists_params', Value).
-spec encode_get_actor_playlists_params(get_actor_playlists_params()) -> map().
encode_get_actor_playlists_params(Value) -> rocksky_typed_codec:encode('get_actor_playlists_params', Value).

-spec decode_get_actor_scrobbles_output(map()) -> {ok, get_actor_scrobbles_output()} | {error, term()}.
decode_get_actor_scrobbles_output(Value) -> rocksky_typed_codec:decode('get_actor_scrobbles_output', Value).
-spec encode_get_actor_scrobbles_output(get_actor_scrobbles_output()) -> map().
encode_get_actor_scrobbles_output(Value) -> rocksky_typed_codec:encode('get_actor_scrobbles_output', Value).

-spec decode_get_actor_scrobbles_params(map()) -> {ok, get_actor_scrobbles_params()} | {error, term()}.
decode_get_actor_scrobbles_params(Value) -> rocksky_typed_codec:decode('get_actor_scrobbles_params', Value).
-spec encode_get_actor_scrobbles_params(get_actor_scrobbles_params()) -> map().
encode_get_actor_scrobbles_params(Value) -> rocksky_typed_codec:encode('get_actor_scrobbles_params', Value).

-spec decode_get_actor_songs_output(map()) -> {ok, get_actor_songs_output()} | {error, term()}.
decode_get_actor_songs_output(Value) -> rocksky_typed_codec:decode('get_actor_songs_output', Value).
-spec encode_get_actor_songs_output(get_actor_songs_output()) -> map().
encode_get_actor_songs_output(Value) -> rocksky_typed_codec:encode('get_actor_songs_output', Value).

-spec decode_get_actor_songs_params(map()) -> {ok, get_actor_songs_params()} | {error, term()}.
decode_get_actor_songs_params(Value) -> rocksky_typed_codec:decode('get_actor_songs_params', Value).
-spec encode_get_actor_songs_params(get_actor_songs_params()) -> map().
encode_get_actor_songs_params(Value) -> rocksky_typed_codec:encode('get_actor_songs_params', Value).

-spec decode_get_album_info_output(map()) -> {ok, get_album_info_output()} | {error, term()}.
decode_get_album_info_output(Value) -> rocksky_typed_codec:decode('get_album_info_output', Value).
-spec encode_get_album_info_output(get_album_info_output()) -> map().
encode_get_album_info_output(Value) -> rocksky_typed_codec:encode('get_album_info_output', Value).

-spec decode_get_album_info_params(map()) -> {ok, get_album_info_params()} | {error, term()}.
decode_get_album_info_params(Value) -> rocksky_typed_codec:decode('get_album_info_params', Value).
-spec encode_get_album_info_params(get_album_info_params()) -> map().
encode_get_album_info_params(Value) -> rocksky_typed_codec:encode('get_album_info_params', Value).

-spec decode_get_album_list_output(map()) -> {ok, get_album_list_output()} | {error, term()}.
decode_get_album_list_output(Value) -> rocksky_typed_codec:decode('get_album_list_output', Value).
-spec encode_get_album_list_output(get_album_list_output()) -> map().
encode_get_album_list_output(Value) -> rocksky_typed_codec:encode('get_album_list_output', Value).

-spec decode_get_album_list_params(map()) -> {ok, get_album_list_params()} | {error, term()}.
decode_get_album_list_params(Value) -> rocksky_typed_codec:decode('get_album_list_params', Value).
-spec encode_get_album_list_params(get_album_list_params()) -> map().
encode_get_album_list_params(Value) -> rocksky_typed_codec:encode('get_album_list_params', Value).

-spec decode_get_album_recommendations_params(map()) -> {ok, get_album_recommendations_params()} | {error, term()}.
decode_get_album_recommendations_params(Value) -> rocksky_typed_codec:decode('get_album_recommendations_params', Value).
-spec encode_get_album_recommendations_params(get_album_recommendations_params()) -> map().
encode_get_album_recommendations_params(Value) -> rocksky_typed_codec:encode('get_album_recommendations_params', Value).

-spec decode_get_album_shouts_output(map()) -> {ok, get_album_shouts_output()} | {error, term()}.
decode_get_album_shouts_output(Value) -> rocksky_typed_codec:decode('get_album_shouts_output', Value).
-spec encode_get_album_shouts_output(get_album_shouts_output()) -> map().
encode_get_album_shouts_output(Value) -> rocksky_typed_codec:encode('get_album_shouts_output', Value).

-spec decode_get_album_shouts_params(map()) -> {ok, get_album_shouts_params()} | {error, term()}.
decode_get_album_shouts_params(Value) -> rocksky_typed_codec:decode('get_album_shouts_params', Value).
-spec encode_get_album_shouts_params(get_album_shouts_params()) -> map().
encode_get_album_shouts_params(Value) -> rocksky_typed_codec:encode('get_album_shouts_params', Value).

-spec decode_get_albums_output(map()) -> {ok, get_albums_output()} | {error, term()}.
decode_get_albums_output(Value) -> rocksky_typed_codec:decode('get_albums_output', Value).
-spec encode_get_albums_output(get_albums_output()) -> map().
encode_get_albums_output(Value) -> rocksky_typed_codec:encode('get_albums_output', Value).

-spec decode_get_albums_params(map()) -> {ok, get_albums_params()} | {error, term()}.
decode_get_albums_params(Value) -> rocksky_typed_codec:decode('get_albums_params', Value).
-spec encode_get_albums_params(get_albums_params()) -> map().
encode_get_albums_params(Value) -> rocksky_typed_codec:encode('get_albums_params', Value).

-spec decode_get_album_tracks_output(map()) -> {ok, get_album_tracks_output()} | {error, term()}.
decode_get_album_tracks_output(Value) -> rocksky_typed_codec:decode('get_album_tracks_output', Value).
-spec encode_get_album_tracks_output(get_album_tracks_output()) -> map().
encode_get_album_tracks_output(Value) -> rocksky_typed_codec:encode('get_album_tracks_output', Value).

-spec decode_get_album_tracks_params(map()) -> {ok, get_album_tracks_params()} | {error, term()}.
decode_get_album_tracks_params(Value) -> rocksky_typed_codec:decode('get_album_tracks_params', Value).
-spec encode_get_album_tracks_params(get_album_tracks_params()) -> map().
encode_get_album_tracks_params(Value) -> rocksky_typed_codec:encode('get_album_tracks_params', Value).

-spec decode_get_apikeys_output(map()) -> {ok, get_apikeys_output()} | {error, term()}.
decode_get_apikeys_output(Value) -> rocksky_typed_codec:decode('get_apikeys_output', Value).
-spec encode_get_apikeys_output(get_apikeys_output()) -> map().
encode_get_apikeys_output(Value) -> rocksky_typed_codec:encode('get_apikeys_output', Value).

-spec decode_get_apikeys_params(map()) -> {ok, get_apikeys_params()} | {error, term()}.
decode_get_apikeys_params(Value) -> rocksky_typed_codec:decode('get_apikeys_params', Value).
-spec encode_get_apikeys_params(get_apikeys_params()) -> map().
encode_get_apikeys_params(Value) -> rocksky_typed_codec:encode('get_apikeys_params', Value).

-spec decode_get_artist_albums_output(map()) -> {ok, get_artist_albums_output()} | {error, term()}.
decode_get_artist_albums_output(Value) -> rocksky_typed_codec:decode('get_artist_albums_output', Value).
-spec encode_get_artist_albums_output(get_artist_albums_output()) -> map().
encode_get_artist_albums_output(Value) -> rocksky_typed_codec:encode('get_artist_albums_output', Value).

-spec decode_get_artist_albums_params(map()) -> {ok, get_artist_albums_params()} | {error, term()}.
decode_get_artist_albums_params(Value) -> rocksky_typed_codec:decode('get_artist_albums_params', Value).
-spec encode_get_artist_albums_params(get_artist_albums_params()) -> map().
encode_get_artist_albums_params(Value) -> rocksky_typed_codec:encode('get_artist_albums_params', Value).

-spec decode_get_artist_info_output(map()) -> {ok, get_artist_info_output()} | {error, term()}.
decode_get_artist_info_output(Value) -> rocksky_typed_codec:decode('get_artist_info_output', Value).
-spec encode_get_artist_info_output(get_artist_info_output()) -> map().
encode_get_artist_info_output(Value) -> rocksky_typed_codec:encode('get_artist_info_output', Value).

-spec decode_get_artist_info_params(map()) -> {ok, get_artist_info_params()} | {error, term()}.
decode_get_artist_info_params(Value) -> rocksky_typed_codec:decode('get_artist_info_params', Value).
-spec encode_get_artist_info_params(get_artist_info_params()) -> map().
encode_get_artist_info_params(Value) -> rocksky_typed_codec:encode('get_artist_info_params', Value).

-spec decode_get_artist_listeners_output(map()) -> {ok, get_artist_listeners_output()} | {error, term()}.
decode_get_artist_listeners_output(Value) -> rocksky_typed_codec:decode('get_artist_listeners_output', Value).
-spec encode_get_artist_listeners_output(get_artist_listeners_output()) -> map().
encode_get_artist_listeners_output(Value) -> rocksky_typed_codec:encode('get_artist_listeners_output', Value).

-spec decode_get_artist_listeners_params(map()) -> {ok, get_artist_listeners_params()} | {error, term()}.
decode_get_artist_listeners_params(Value) -> rocksky_typed_codec:decode('get_artist_listeners_params', Value).
-spec encode_get_artist_listeners_params(get_artist_listeners_params()) -> map().
encode_get_artist_listeners_params(Value) -> rocksky_typed_codec:encode('get_artist_listeners_params', Value).

-spec decode_get_artist_recent_listeners_output(map()) -> {ok, get_artist_recent_listeners_output()} | {error, term()}.
decode_get_artist_recent_listeners_output(Value) -> rocksky_typed_codec:decode('get_artist_recent_listeners_output', Value).
-spec encode_get_artist_recent_listeners_output(get_artist_recent_listeners_output()) -> map().
encode_get_artist_recent_listeners_output(Value) -> rocksky_typed_codec:encode('get_artist_recent_listeners_output', Value).

-spec decode_get_artist_recent_listeners_params(map()) -> {ok, get_artist_recent_listeners_params()} | {error, term()}.
decode_get_artist_recent_listeners_params(Value) -> rocksky_typed_codec:decode('get_artist_recent_listeners_params', Value).
-spec encode_get_artist_recent_listeners_params(get_artist_recent_listeners_params()) -> map().
encode_get_artist_recent_listeners_params(Value) -> rocksky_typed_codec:encode('get_artist_recent_listeners_params', Value).

-spec decode_get_artist_recommendations_params(map()) -> {ok, get_artist_recommendations_params()} | {error, term()}.
decode_get_artist_recommendations_params(Value) -> rocksky_typed_codec:decode('get_artist_recommendations_params', Value).
-spec encode_get_artist_recommendations_params(get_artist_recommendations_params()) -> map().
encode_get_artist_recommendations_params(Value) -> rocksky_typed_codec:encode('get_artist_recommendations_params', Value).

-spec decode_get_artist_shouts_output(map()) -> {ok, get_artist_shouts_output()} | {error, term()}.
decode_get_artist_shouts_output(Value) -> rocksky_typed_codec:decode('get_artist_shouts_output', Value).
-spec encode_get_artist_shouts_output(get_artist_shouts_output()) -> map().
encode_get_artist_shouts_output(Value) -> rocksky_typed_codec:encode('get_artist_shouts_output', Value).

-spec decode_get_artist_shouts_params(map()) -> {ok, get_artist_shouts_params()} | {error, term()}.
decode_get_artist_shouts_params(Value) -> rocksky_typed_codec:decode('get_artist_shouts_params', Value).
-spec encode_get_artist_shouts_params(get_artist_shouts_params()) -> map().
encode_get_artist_shouts_params(Value) -> rocksky_typed_codec:encode('get_artist_shouts_params', Value).

-spec decode_get_artist_tracks_output(map()) -> {ok, get_artist_tracks_output()} | {error, term()}.
decode_get_artist_tracks_output(Value) -> rocksky_typed_codec:decode('get_artist_tracks_output', Value).
-spec encode_get_artist_tracks_output(get_artist_tracks_output()) -> map().
encode_get_artist_tracks_output(Value) -> rocksky_typed_codec:encode('get_artist_tracks_output', Value).

-spec decode_get_artist_tracks_params(map()) -> {ok, get_artist_tracks_params()} | {error, term()}.
decode_get_artist_tracks_params(Value) -> rocksky_typed_codec:decode('get_artist_tracks_params', Value).
-spec encode_get_artist_tracks_params(get_artist_tracks_params()) -> map().
encode_get_artist_tracks_params(Value) -> rocksky_typed_codec:encode('get_artist_tracks_params', Value).

-spec decode_get_audio_settings_params(map()) -> {ok, get_audio_settings_params()} | {error, term()}.
decode_get_audio_settings_params(Value) -> rocksky_typed_codec:decode('get_audio_settings_params', Value).
-spec encode_get_audio_settings_params(get_audio_settings_params()) -> map().
encode_get_audio_settings_params(Value) -> rocksky_typed_codec:encode('get_audio_settings_params', Value).

-spec decode_get_cover_art_url_output(map()) -> {ok, get_cover_art_url_output()} | {error, term()}.
decode_get_cover_art_url_output(Value) -> rocksky_typed_codec:decode('get_cover_art_url_output', Value).
-spec encode_get_cover_art_url_output(get_cover_art_url_output()) -> map().
encode_get_cover_art_url_output(Value) -> rocksky_typed_codec:encode('get_cover_art_url_output', Value).

-spec decode_get_cover_art_url_params(map()) -> {ok, get_cover_art_url_params()} | {error, term()}.
decode_get_cover_art_url_params(Value) -> rocksky_typed_codec:decode('get_cover_art_url_params', Value).
-spec encode_get_cover_art_url_params(get_cover_art_url_params()) -> map().
encode_get_cover_art_url_params(Value) -> rocksky_typed_codec:encode('get_cover_art_url_params', Value).

-spec decode_get_decades_output(map()) -> {ok, get_decades_output()} | {error, term()}.
decode_get_decades_output(Value) -> rocksky_typed_codec:decode('get_decades_output', Value).
-spec encode_get_decades_output(get_decades_output()) -> map().
encode_get_decades_output(Value) -> rocksky_typed_codec:encode('get_decades_output', Value).

-spec decode_get_decades_params(map()) -> {ok, get_decades_params()} | {error, term()}.
decode_get_decades_params(Value) -> rocksky_typed_codec:decode('get_decades_params', Value).
-spec encode_get_decades_params(get_decades_params()) -> map().
encode_get_decades_params(Value) -> rocksky_typed_codec:encode('get_decades_params', Value).

-spec decode_get_download_url_output(map()) -> {ok, get_download_url_output()} | {error, term()}.
decode_get_download_url_output(Value) -> rocksky_typed_codec:decode('get_download_url_output', Value).
-spec encode_get_download_url_output(get_download_url_output()) -> map().
encode_get_download_url_output(Value) -> rocksky_typed_codec:encode('get_download_url_output', Value).

-spec decode_get_download_url_params(map()) -> {ok, get_download_url_params()} | {error, term()}.
decode_get_download_url_params(Value) -> rocksky_typed_codec:decode('get_download_url_params', Value).
-spec encode_get_download_url_params(get_download_url_params()) -> map().
encode_get_download_url_params(Value) -> rocksky_typed_codec:encode('get_download_url_params', Value).

-spec decode_get_feed_generator_output(map()) -> {ok, get_feed_generator_output()} | {error, term()}.
decode_get_feed_generator_output(Value) -> rocksky_typed_codec:decode('get_feed_generator_output', Value).
-spec encode_get_feed_generator_output(get_feed_generator_output()) -> map().
encode_get_feed_generator_output(Value) -> rocksky_typed_codec:encode('get_feed_generator_output', Value).

-spec decode_get_feed_generator_params(map()) -> {ok, get_feed_generator_params()} | {error, term()}.
decode_get_feed_generator_params(Value) -> rocksky_typed_codec:decode('get_feed_generator_params', Value).
-spec encode_get_feed_generator_params(get_feed_generator_params()) -> map().
encode_get_feed_generator_params(Value) -> rocksky_typed_codec:encode('get_feed_generator_params', Value).

-spec decode_get_feed_generators_params(map()) -> {ok, get_feed_generators_params()} | {error, term()}.
decode_get_feed_generators_params(Value) -> rocksky_typed_codec:decode('get_feed_generators_params', Value).
-spec encode_get_feed_generators_params(get_feed_generators_params()) -> map().
encode_get_feed_generators_params(Value) -> rocksky_typed_codec:encode('get_feed_generators_params', Value).

-spec decode_get_feed_params(map()) -> {ok, get_feed_params()} | {error, term()}.
decode_get_feed_params(Value) -> rocksky_typed_codec:decode('get_feed_params', Value).
-spec encode_get_feed_params(get_feed_params()) -> map().
encode_get_feed_params(Value) -> rocksky_typed_codec:encode('get_feed_params', Value).

-spec decode_get_feed_skeleton_output(map()) -> {ok, get_feed_skeleton_output()} | {error, term()}.
decode_get_feed_skeleton_output(Value) -> rocksky_typed_codec:decode('get_feed_skeleton_output', Value).
-spec encode_get_feed_skeleton_output(get_feed_skeleton_output()) -> map().
encode_get_feed_skeleton_output(Value) -> rocksky_typed_codec:encode('get_feed_skeleton_output', Value).

-spec decode_get_feed_skeleton_params(map()) -> {ok, get_feed_skeleton_params()} | {error, term()}.
decode_get_feed_skeleton_params(Value) -> rocksky_typed_codec:decode('get_feed_skeleton_params', Value).
-spec encode_get_feed_skeleton_params(get_feed_skeleton_params()) -> map().
encode_get_feed_skeleton_params(Value) -> rocksky_typed_codec:encode('get_feed_skeleton_params', Value).

-spec decode_get_file_params(map()) -> {ok, get_file_params()} | {error, term()}.
decode_get_file_params(Value) -> rocksky_typed_codec:decode('get_file_params', Value).
-spec encode_get_file_params(get_file_params()) -> map().
encode_get_file_params(Value) -> rocksky_typed_codec:encode('get_file_params', Value).

-spec decode_get_followers_output(map()) -> {ok, get_followers_output()} | {error, term()}.
decode_get_followers_output(Value) -> rocksky_typed_codec:decode('get_followers_output', Value).
-spec encode_get_followers_output(get_followers_output()) -> map().
encode_get_followers_output(Value) -> rocksky_typed_codec:encode('get_followers_output', Value).

-spec decode_get_followers_params(map()) -> {ok, get_followers_params()} | {error, term()}.
decode_get_followers_params(Value) -> rocksky_typed_codec:decode('get_followers_params', Value).
-spec encode_get_followers_params(get_followers_params()) -> map().
encode_get_followers_params(Value) -> rocksky_typed_codec:encode('get_followers_params', Value).

-spec decode_get_follows_output(map()) -> {ok, get_follows_output()} | {error, term()}.
decode_get_follows_output(Value) -> rocksky_typed_codec:decode('get_follows_output', Value).
-spec encode_get_follows_output(get_follows_output()) -> map().
encode_get_follows_output(Value) -> rocksky_typed_codec:encode('get_follows_output', Value).

-spec decode_get_follows_params(map()) -> {ok, get_follows_params()} | {error, term()}.
decode_get_follows_params(Value) -> rocksky_typed_codec:decode('get_follows_params', Value).
-spec encode_get_follows_params(get_follows_params()) -> map().
encode_get_follows_params(Value) -> rocksky_typed_codec:encode('get_follows_params', Value).

-spec decode_get_genres_output(map()) -> {ok, get_genres_output()} | {error, term()}.
decode_get_genres_output(Value) -> rocksky_typed_codec:decode('get_genres_output', Value).
-spec encode_get_genres_output(get_genres_output()) -> map().
encode_get_genres_output(Value) -> rocksky_typed_codec:encode('get_genres_output', Value).

-spec decode_get_genres_params(map()) -> {ok, get_genres_params()} | {error, term()}.
decode_get_genres_params(Value) -> rocksky_typed_codec:decode('get_genres_params', Value).
-spec encode_get_genres_params(get_genres_params()) -> map().
encode_get_genres_params(Value) -> rocksky_typed_codec:encode('get_genres_params', Value).

-spec decode_get_global_stats_params(map()) -> {ok, get_global_stats_params()} | {error, term()}.
decode_get_global_stats_params(Value) -> rocksky_typed_codec:decode('get_global_stats_params', Value).
-spec encode_get_global_stats_params(get_global_stats_params()) -> map().
encode_get_global_stats_params(Value) -> rocksky_typed_codec:encode('get_global_stats_params', Value).

-spec decode_get_indexes_output(map()) -> {ok, get_indexes_output()} | {error, term()}.
decode_get_indexes_output(Value) -> rocksky_typed_codec:decode('get_indexes_output', Value).
-spec encode_get_indexes_output(get_indexes_output()) -> map().
encode_get_indexes_output(Value) -> rocksky_typed_codec:encode('get_indexes_output', Value).

-spec decode_get_indexes_params(map()) -> {ok, get_indexes_params()} | {error, term()}.
decode_get_indexes_params(Value) -> rocksky_typed_codec:decode('get_indexes_params', Value).
-spec encode_get_indexes_params(get_indexes_params()) -> map().
encode_get_indexes_params(Value) -> rocksky_typed_codec:encode('get_indexes_params', Value).

-spec decode_get_internet_radio_stations_output(map()) -> {ok, get_internet_radio_stations_output()} | {error, term()}.
decode_get_internet_radio_stations_output(Value) -> rocksky_typed_codec:decode('get_internet_radio_stations_output', Value).
-spec encode_get_internet_radio_stations_output(get_internet_radio_stations_output()) -> map().
encode_get_internet_radio_stations_output(Value) -> rocksky_typed_codec:encode('get_internet_radio_stations_output', Value).

-spec decode_get_internet_radio_stations_params(map()) -> {ok, get_internet_radio_stations_params()} | {error, term()}.
decode_get_internet_radio_stations_params(Value) -> rocksky_typed_codec:decode('get_internet_radio_stations_params', Value).
-spec encode_get_internet_radio_stations_params(get_internet_radio_stations_params()) -> map().
encode_get_internet_radio_stations_params(Value) -> rocksky_typed_codec:encode('get_internet_radio_stations_params', Value).

-spec decode_get_known_followers_output(map()) -> {ok, get_known_followers_output()} | {error, term()}.
decode_get_known_followers_output(Value) -> rocksky_typed_codec:decode('get_known_followers_output', Value).
-spec encode_get_known_followers_output(get_known_followers_output()) -> map().
encode_get_known_followers_output(Value) -> rocksky_typed_codec:encode('get_known_followers_output', Value).

-spec decode_get_known_followers_params(map()) -> {ok, get_known_followers_params()} | {error, term()}.
decode_get_known_followers_params(Value) -> rocksky_typed_codec:decode('get_known_followers_params', Value).
-spec encode_get_known_followers_params(get_known_followers_params()) -> map().
encode_get_known_followers_params(Value) -> rocksky_typed_codec:encode('get_known_followers_params', Value).

-spec decode_get_license_output(map()) -> {ok, get_license_output()} | {error, term()}.
decode_get_license_output(Value) -> rocksky_typed_codec:decode('get_license_output', Value).
-spec encode_get_license_output(get_license_output()) -> map().
encode_get_license_output(Value) -> rocksky_typed_codec:encode('get_license_output', Value).

-spec decode_get_license_params(map()) -> {ok, get_license_params()} | {error, term()}.
decode_get_license_params(Value) -> rocksky_typed_codec:decode('get_license_params', Value).
-spec encode_get_license_params(get_license_params()) -> map().
encode_get_license_params(Value) -> rocksky_typed_codec:encode('get_license_params', Value).

-spec decode_get_lyrics_output(map()) -> {ok, get_lyrics_output()} | {error, term()}.
decode_get_lyrics_output(Value) -> rocksky_typed_codec:decode('get_lyrics_output', Value).
-spec encode_get_lyrics_output(get_lyrics_output()) -> map().
encode_get_lyrics_output(Value) -> rocksky_typed_codec:encode('get_lyrics_output', Value).

-spec decode_get_lyrics_params(map()) -> {ok, get_lyrics_params()} | {error, term()}.
decode_get_lyrics_params(Value) -> rocksky_typed_codec:decode('get_lyrics_params', Value).
-spec encode_get_lyrics_params(get_lyrics_params()) -> map().
encode_get_lyrics_params(Value) -> rocksky_typed_codec:encode('get_lyrics_params', Value).

-spec decode_get_metadata_output(map()) -> {ok, get_metadata_output()} | {error, term()}.
decode_get_metadata_output(Value) -> rocksky_typed_codec:decode('get_metadata_output', Value).
-spec encode_get_metadata_output(get_metadata_output()) -> map().
encode_get_metadata_output(Value) -> rocksky_typed_codec:encode('get_metadata_output', Value).

-spec decode_get_metadata_params(map()) -> {ok, get_metadata_params()} | {error, term()}.
decode_get_metadata_params(Value) -> rocksky_typed_codec:decode('get_metadata_params', Value).
-spec encode_get_metadata_params(get_metadata_params()) -> map().
encode_get_metadata_params(Value) -> rocksky_typed_codec:encode('get_metadata_params', Value).

-spec decode_get_mirror_sources_output(map()) -> {ok, get_mirror_sources_output()} | {error, term()}.
decode_get_mirror_sources_output(Value) -> rocksky_typed_codec:decode('get_mirror_sources_output', Value).
-spec encode_get_mirror_sources_output(get_mirror_sources_output()) -> map().
encode_get_mirror_sources_output(Value) -> rocksky_typed_codec:encode('get_mirror_sources_output', Value).

-spec decode_get_mirror_sources_params(map()) -> {ok, get_mirror_sources_params()} | {error, term()}.
decode_get_mirror_sources_params(Value) -> rocksky_typed_codec:decode('get_mirror_sources_params', Value).
-spec encode_get_mirror_sources_params(get_mirror_sources_params()) -> map().
encode_get_mirror_sources_params(Value) -> rocksky_typed_codec:encode('get_mirror_sources_params', Value).

-spec decode_get_music_directory_output(map()) -> {ok, get_music_directory_output()} | {error, term()}.
decode_get_music_directory_output(Value) -> rocksky_typed_codec:decode('get_music_directory_output', Value).
-spec encode_get_music_directory_output(get_music_directory_output()) -> map().
encode_get_music_directory_output(Value) -> rocksky_typed_codec:encode('get_music_directory_output', Value).

-spec decode_get_music_directory_params(map()) -> {ok, get_music_directory_params()} | {error, term()}.
decode_get_music_directory_params(Value) -> rocksky_typed_codec:decode('get_music_directory_params', Value).
-spec encode_get_music_directory_params(get_music_directory_params()) -> map().
encode_get_music_directory_params(Value) -> rocksky_typed_codec:encode('get_music_directory_params', Value).

-spec decode_get_music_folders_output(map()) -> {ok, get_music_folders_output()} | {error, term()}.
decode_get_music_folders_output(Value) -> rocksky_typed_codec:decode('get_music_folders_output', Value).
-spec encode_get_music_folders_output(get_music_folders_output()) -> map().
encode_get_music_folders_output(Value) -> rocksky_typed_codec:encode('get_music_folders_output', Value).

-spec decode_get_music_folders_params(map()) -> {ok, get_music_folders_params()} | {error, term()}.
decode_get_music_folders_params(Value) -> rocksky_typed_codec:decode('get_music_folders_params', Value).
-spec encode_get_music_folders_params(get_music_folders_params()) -> map().
encode_get_music_folders_params(Value) -> rocksky_typed_codec:encode('get_music_folders_params', Value).

-spec decode_get_now_playing_output(map()) -> {ok, get_now_playing_output()} | {error, term()}.
decode_get_now_playing_output(Value) -> rocksky_typed_codec:decode('get_now_playing_output', Value).
-spec encode_get_now_playing_output(get_now_playing_output()) -> map().
encode_get_now_playing_output(Value) -> rocksky_typed_codec:encode('get_now_playing_output', Value).

-spec decode_get_now_playing_params(map()) -> {ok, get_now_playing_params()} | {error, term()}.
decode_get_now_playing_params(Value) -> rocksky_typed_codec:decode('get_now_playing_params', Value).
-spec encode_get_now_playing_params(get_now_playing_params()) -> map().
encode_get_now_playing_params(Value) -> rocksky_typed_codec:encode('get_now_playing_params', Value).

-spec decode_get_playback_queue_params(map()) -> {ok, get_playback_queue_params()} | {error, term()}.
decode_get_playback_queue_params(Value) -> rocksky_typed_codec:decode('get_playback_queue_params', Value).
-spec encode_get_playback_queue_params(get_playback_queue_params()) -> map().
encode_get_playback_queue_params(Value) -> rocksky_typed_codec:encode('get_playback_queue_params', Value).

-spec decode_get_play_queue_output(map()) -> {ok, get_play_queue_output()} | {error, term()}.
decode_get_play_queue_output(Value) -> rocksky_typed_codec:decode('get_play_queue_output', Value).
-spec encode_get_play_queue_output(get_play_queue_output()) -> map().
encode_get_play_queue_output(Value) -> rocksky_typed_codec:encode('get_play_queue_output', Value).

-spec decode_get_play_queue_params(map()) -> {ok, get_play_queue_params()} | {error, term()}.
decode_get_play_queue_params(Value) -> rocksky_typed_codec:decode('get_play_queue_params', Value).
-spec encode_get_play_queue_params(get_play_queue_params()) -> map().
encode_get_play_queue_params(Value) -> rocksky_typed_codec:encode('get_play_queue_params', Value).

-spec decode_get_profile_params(map()) -> {ok, get_profile_params()} | {error, term()}.
decode_get_profile_params(Value) -> rocksky_typed_codec:decode('get_profile_params', Value).
-spec encode_get_profile_params(get_profile_params()) -> map().
encode_get_profile_params(Value) -> rocksky_typed_codec:encode('get_profile_params', Value).

-spec decode_get_profile_shouts_output(map()) -> {ok, get_profile_shouts_output()} | {error, term()}.
decode_get_profile_shouts_output(Value) -> rocksky_typed_codec:decode('get_profile_shouts_output', Value).
-spec encode_get_profile_shouts_output(get_profile_shouts_output()) -> map().
encode_get_profile_shouts_output(Value) -> rocksky_typed_codec:encode('get_profile_shouts_output', Value).

-spec decode_get_profile_shouts_params(map()) -> {ok, get_profile_shouts_params()} | {error, term()}.
decode_get_profile_shouts_params(Value) -> rocksky_typed_codec:decode('get_profile_shouts_params', Value).
-spec encode_get_profile_shouts_params(get_profile_shouts_params()) -> map().
encode_get_profile_shouts_params(Value) -> rocksky_typed_codec:encode('get_profile_shouts_params', Value).

-spec decode_get_random_songs_output(map()) -> {ok, get_random_songs_output()} | {error, term()}.
decode_get_random_songs_output(Value) -> rocksky_typed_codec:decode('get_random_songs_output', Value).
-spec encode_get_random_songs_output(get_random_songs_output()) -> map().
encode_get_random_songs_output(Value) -> rocksky_typed_codec:encode('get_random_songs_output', Value).

-spec decode_get_random_songs_params(map()) -> {ok, get_random_songs_params()} | {error, term()}.
decode_get_random_songs_params(Value) -> rocksky_typed_codec:decode('get_random_songs_params', Value).
-spec encode_get_random_songs_params(get_random_songs_params()) -> map().
encode_get_random_songs_params(Value) -> rocksky_typed_codec:encode('get_random_songs_params', Value).

-spec decode_get_recommendations_params(map()) -> {ok, get_recommendations_params()} | {error, term()}.
decode_get_recommendations_params(Value) -> rocksky_typed_codec:decode('get_recommendations_params', Value).
-spec encode_get_recommendations_params(get_recommendations_params()) -> map().
encode_get_recommendations_params(Value) -> rocksky_typed_codec:encode('get_recommendations_params', Value).

-spec decode_get_scan_status_output(map()) -> {ok, get_scan_status_output()} | {error, term()}.
decode_get_scan_status_output(Value) -> rocksky_typed_codec:decode('get_scan_status_output', Value).
-spec encode_get_scan_status_output(get_scan_status_output()) -> map().
encode_get_scan_status_output(Value) -> rocksky_typed_codec:encode('get_scan_status_output', Value).

-spec decode_get_scan_status_params(map()) -> {ok, get_scan_status_params()} | {error, term()}.
decode_get_scan_status_params(Value) -> rocksky_typed_codec:decode('get_scan_status_params', Value).
-spec encode_get_scan_status_params(get_scan_status_params()) -> map().
encode_get_scan_status_params(Value) -> rocksky_typed_codec:encode('get_scan_status_params', Value).

-spec decode_get_scrobble_params(map()) -> {ok, get_scrobble_params()} | {error, term()}.
decode_get_scrobble_params(Value) -> rocksky_typed_codec:decode('get_scrobble_params', Value).
-spec encode_get_scrobble_params(get_scrobble_params()) -> map().
encode_get_scrobble_params(Value) -> rocksky_typed_codec:encode('get_scrobble_params', Value).

-spec decode_get_scrobbles_chart_params(map()) -> {ok, get_scrobbles_chart_params()} | {error, term()}.
decode_get_scrobbles_chart_params(Value) -> rocksky_typed_codec:decode('get_scrobbles_chart_params', Value).
-spec encode_get_scrobbles_chart_params(get_scrobbles_chart_params()) -> map().
encode_get_scrobbles_chart_params(Value) -> rocksky_typed_codec:encode('get_scrobbles_chart_params', Value).

-spec decode_get_scrobbles_output(map()) -> {ok, get_scrobbles_output()} | {error, term()}.
decode_get_scrobbles_output(Value) -> rocksky_typed_codec:decode('get_scrobbles_output', Value).
-spec encode_get_scrobbles_output(get_scrobbles_output()) -> map().
encode_get_scrobbles_output(Value) -> rocksky_typed_codec:encode('get_scrobbles_output', Value).

-spec decode_get_scrobbles_params(map()) -> {ok, get_scrobbles_params()} | {error, term()}.
decode_get_scrobbles_params(Value) -> rocksky_typed_codec:decode('get_scrobbles_params', Value).
-spec encode_get_scrobbles_params(get_scrobbles_params()) -> map().
encode_get_scrobbles_params(Value) -> rocksky_typed_codec:encode('get_scrobbles_params', Value).

-spec decode_get_shout_replies_output(map()) -> {ok, get_shout_replies_output()} | {error, term()}.
decode_get_shout_replies_output(Value) -> rocksky_typed_codec:decode('get_shout_replies_output', Value).
-spec encode_get_shout_replies_output(get_shout_replies_output()) -> map().
encode_get_shout_replies_output(Value) -> rocksky_typed_codec:encode('get_shout_replies_output', Value).

-spec decode_get_shout_replies_params(map()) -> {ok, get_shout_replies_params()} | {error, term()}.
decode_get_shout_replies_params(Value) -> rocksky_typed_codec:decode('get_shout_replies_params', Value).
-spec encode_get_shout_replies_params(get_shout_replies_params()) -> map().
encode_get_shout_replies_params(Value) -> rocksky_typed_codec:encode('get_shout_replies_params', Value).

-spec decode_get_similar_songs_output(map()) -> {ok, get_similar_songs_output()} | {error, term()}.
decode_get_similar_songs_output(Value) -> rocksky_typed_codec:decode('get_similar_songs_output', Value).
-spec encode_get_similar_songs_output(get_similar_songs_output()) -> map().
encode_get_similar_songs_output(Value) -> rocksky_typed_codec:encode('get_similar_songs_output', Value).

-spec decode_get_similar_songs_params(map()) -> {ok, get_similar_songs_params()} | {error, term()}.
decode_get_similar_songs_params(Value) -> rocksky_typed_codec:decode('get_similar_songs_params', Value).
-spec encode_get_similar_songs_params(get_similar_songs_params()) -> map().
encode_get_similar_songs_params(Value) -> rocksky_typed_codec:encode('get_similar_songs_params', Value).

-spec decode_get_song_recent_listeners_output(map()) -> {ok, get_song_recent_listeners_output()} | {error, term()}.
decode_get_song_recent_listeners_output(Value) -> rocksky_typed_codec:decode('get_song_recent_listeners_output', Value).
-spec encode_get_song_recent_listeners_output(get_song_recent_listeners_output()) -> map().
encode_get_song_recent_listeners_output(Value) -> rocksky_typed_codec:encode('get_song_recent_listeners_output', Value).

-spec decode_get_song_recent_listeners_params(map()) -> {ok, get_song_recent_listeners_params()} | {error, term()}.
decode_get_song_recent_listeners_params(Value) -> rocksky_typed_codec:decode('get_song_recent_listeners_params', Value).
-spec encode_get_song_recent_listeners_params(get_song_recent_listeners_params()) -> map().
encode_get_song_recent_listeners_params(Value) -> rocksky_typed_codec:encode('get_song_recent_listeners_params', Value).

-spec decode_get_songs_by_genre_output(map()) -> {ok, get_songs_by_genre_output()} | {error, term()}.
decode_get_songs_by_genre_output(Value) -> rocksky_typed_codec:decode('get_songs_by_genre_output', Value).
-spec encode_get_songs_by_genre_output(get_songs_by_genre_output()) -> map().
encode_get_songs_by_genre_output(Value) -> rocksky_typed_codec:encode('get_songs_by_genre_output', Value).

-spec decode_get_songs_by_genre_params(map()) -> {ok, get_songs_by_genre_params()} | {error, term()}.
decode_get_songs_by_genre_params(Value) -> rocksky_typed_codec:decode('get_songs_by_genre_params', Value).
-spec encode_get_songs_by_genre_params(get_songs_by_genre_params()) -> map().
encode_get_songs_by_genre_params(Value) -> rocksky_typed_codec:encode('get_songs_by_genre_params', Value).

-spec decode_get_songs_output(map()) -> {ok, get_songs_output()} | {error, term()}.
decode_get_songs_output(Value) -> rocksky_typed_codec:decode('get_songs_output', Value).
-spec encode_get_songs_output(get_songs_output()) -> map().
encode_get_songs_output(Value) -> rocksky_typed_codec:encode('get_songs_output', Value).

-spec decode_get_songs_params(map()) -> {ok, get_songs_params()} | {error, term()}.
decode_get_songs_params(Value) -> rocksky_typed_codec:decode('get_songs_params', Value).
-spec encode_get_songs_params(get_songs_params()) -> map().
encode_get_songs_params(Value) -> rocksky_typed_codec:encode('get_songs_params', Value).

-spec decode_get_starred_output(map()) -> {ok, get_starred_output()} | {error, term()}.
decode_get_starred_output(Value) -> rocksky_typed_codec:decode('get_starred_output', Value).
-spec encode_get_starred_output(get_starred_output()) -> map().
encode_get_starred_output(Value) -> rocksky_typed_codec:encode('get_starred_output', Value).

-spec decode_get_starred_params(map()) -> {ok, get_starred_params()} | {error, term()}.
decode_get_starred_params(Value) -> rocksky_typed_codec:decode('get_starred_params', Value).
-spec encode_get_starred_params(get_starred_params()) -> map().
encode_get_starred_params(Value) -> rocksky_typed_codec:encode('get_starred_params', Value).

-spec decode_get_stats_params(map()) -> {ok, get_stats_params()} | {error, term()}.
decode_get_stats_params(Value) -> rocksky_typed_codec:decode('get_stats_params', Value).
-spec encode_get_stats_params(get_stats_params()) -> map().
encode_get_stats_params(Value) -> rocksky_typed_codec:encode('get_stats_params', Value).

-spec decode_get_stories_params(map()) -> {ok, get_stories_params()} | {error, term()}.
decode_get_stories_params(Value) -> rocksky_typed_codec:decode('get_stories_params', Value).
-spec encode_get_stories_params(get_stories_params()) -> map().
encode_get_stories_params(Value) -> rocksky_typed_codec:encode('get_stories_params', Value).

-spec decode_get_stream_url_output(map()) -> {ok, get_stream_url_output()} | {error, term()}.
decode_get_stream_url_output(Value) -> rocksky_typed_codec:decode('get_stream_url_output', Value).
-spec encode_get_stream_url_output(get_stream_url_output()) -> map().
encode_get_stream_url_output(Value) -> rocksky_typed_codec:encode('get_stream_url_output', Value).

-spec decode_get_stream_url_params(map()) -> {ok, get_stream_url_params()} | {error, term()}.
decode_get_stream_url_params(Value) -> rocksky_typed_codec:decode('get_stream_url_params', Value).
-spec encode_get_stream_url_params(get_stream_url_params()) -> map().
encode_get_stream_url_params(Value) -> rocksky_typed_codec:encode('get_stream_url_params', Value).

-spec decode_get_temporary_link_params(map()) -> {ok, get_temporary_link_params()} | {error, term()}.
decode_get_temporary_link_params(Value) -> rocksky_typed_codec:decode('get_temporary_link_params', Value).
-spec encode_get_temporary_link_params(get_temporary_link_params()) -> map().
encode_get_temporary_link_params(Value) -> rocksky_typed_codec:encode('get_temporary_link_params', Value).

-spec decode_get_top_artists_output(map()) -> {ok, get_top_artists_output()} | {error, term()}.
decode_get_top_artists_output(Value) -> rocksky_typed_codec:decode('get_top_artists_output', Value).
-spec encode_get_top_artists_output(get_top_artists_output()) -> map().
encode_get_top_artists_output(Value) -> rocksky_typed_codec:encode('get_top_artists_output', Value).

-spec decode_get_top_artists_params(map()) -> {ok, get_top_artists_params()} | {error, term()}.
decode_get_top_artists_params(Value) -> rocksky_typed_codec:decode('get_top_artists_params', Value).
-spec encode_get_top_artists_params(get_top_artists_params()) -> map().
encode_get_top_artists_params(Value) -> rocksky_typed_codec:encode('get_top_artists_params', Value).

-spec decode_get_top_scrobblers_output(map()) -> {ok, get_top_scrobblers_output()} | {error, term()}.
decode_get_top_scrobblers_output(Value) -> rocksky_typed_codec:decode('get_top_scrobblers_output', Value).
-spec encode_get_top_scrobblers_output(get_top_scrobblers_output()) -> map().
encode_get_top_scrobblers_output(Value) -> rocksky_typed_codec:encode('get_top_scrobblers_output', Value).

-spec decode_get_top_scrobblers_params(map()) -> {ok, get_top_scrobblers_params()} | {error, term()}.
decode_get_top_scrobblers_params(Value) -> rocksky_typed_codec:decode('get_top_scrobblers_params', Value).
-spec encode_get_top_scrobblers_params(get_top_scrobblers_params()) -> map().
encode_get_top_scrobblers_params(Value) -> rocksky_typed_codec:encode('get_top_scrobblers_params', Value).

-spec decode_get_top_songs_output(map()) -> {ok, get_top_songs_output()} | {error, term()}.
decode_get_top_songs_output(Value) -> rocksky_typed_codec:decode('get_top_songs_output', Value).
-spec encode_get_top_songs_output(get_top_songs_output()) -> map().
encode_get_top_songs_output(Value) -> rocksky_typed_codec:encode('get_top_songs_output', Value).

-spec decode_get_top_songs_params(map()) -> {ok, get_top_songs_params()} | {error, term()}.
decode_get_top_songs_params(Value) -> rocksky_typed_codec:decode('get_top_songs_params', Value).
-spec encode_get_top_songs_params(get_top_songs_params()) -> map().
encode_get_top_songs_params(Value) -> rocksky_typed_codec:encode('get_top_songs_params', Value).

-spec decode_get_top_tracks_output(map()) -> {ok, get_top_tracks_output()} | {error, term()}.
decode_get_top_tracks_output(Value) -> rocksky_typed_codec:decode('get_top_tracks_output', Value).
-spec encode_get_top_tracks_output(get_top_tracks_output()) -> map().
encode_get_top_tracks_output(Value) -> rocksky_typed_codec:encode('get_top_tracks_output', Value).

-spec decode_get_top_tracks_params(map()) -> {ok, get_top_tracks_params()} | {error, term()}.
decode_get_top_tracks_params(Value) -> rocksky_typed_codec:decode('get_top_tracks_params', Value).
-spec encode_get_top_tracks_params(get_top_tracks_params()) -> map().
encode_get_top_tracks_params(Value) -> rocksky_typed_codec:encode('get_top_tracks_params', Value).

-spec decode_get_track_shouts_output(map()) -> {ok, get_track_shouts_output()} | {error, term()}.
decode_get_track_shouts_output(Value) -> rocksky_typed_codec:decode('get_track_shouts_output', Value).
-spec encode_get_track_shouts_output(get_track_shouts_output()) -> map().
encode_get_track_shouts_output(Value) -> rocksky_typed_codec:encode('get_track_shouts_output', Value).

-spec decode_get_track_shouts_params(map()) -> {ok, get_track_shouts_params()} | {error, term()}.
decode_get_track_shouts_params(Value) -> rocksky_typed_codec:decode('get_track_shouts_params', Value).
-spec encode_get_track_shouts_params(get_track_shouts_params()) -> map().
encode_get_track_shouts_params(Value) -> rocksky_typed_codec:encode('get_track_shouts_params', Value).

-spec decode_get_unread_count_output(map()) -> {ok, get_unread_count_output()} | {error, term()}.
decode_get_unread_count_output(Value) -> rocksky_typed_codec:decode('get_unread_count_output', Value).
-spec encode_get_unread_count_output(get_unread_count_output()) -> map().
encode_get_unread_count_output(Value) -> rocksky_typed_codec:encode('get_unread_count_output', Value).

-spec decode_get_user_output(map()) -> {ok, get_user_output()} | {error, term()}.
decode_get_user_output(Value) -> rocksky_typed_codec:decode('get_user_output', Value).
-spec encode_get_user_output(get_user_output()) -> map().
encode_get_user_output(Value) -> rocksky_typed_codec:encode('get_user_output', Value).

-spec decode_get_user_params(map()) -> {ok, get_user_params()} | {error, term()}.
decode_get_user_params(Value) -> rocksky_typed_codec:decode('get_user_params', Value).
-spec encode_get_user_params(get_user_params()) -> map().
encode_get_user_params(Value) -> rocksky_typed_codec:encode('get_user_params', Value).

-spec decode_get_wrapped_params(map()) -> {ok, get_wrapped_params()} | {error, term()}.
decode_get_wrapped_params(Value) -> rocksky_typed_codec:decode('get_wrapped_params', Value).
-spec encode_get_wrapped_params(get_wrapped_params()) -> map().
encode_get_wrapped_params(Value) -> rocksky_typed_codec:encode('get_wrapped_params', Value).

-spec decode_googledrive_download_file_params(map()) -> {ok, googledrive_download_file_params()} | {error, term()}.
decode_googledrive_download_file_params(Value) -> rocksky_typed_codec:decode('googledrive_download_file_params', Value).
-spec encode_googledrive_download_file_params(googledrive_download_file_params()) -> map().
encode_googledrive_download_file_params(Value) -> rocksky_typed_codec:encode('googledrive_download_file_params', Value).

-spec decode_googledrive_file_list_view(map()) -> {ok, googledrive_file_list_view()} | {error, term()}.
decode_googledrive_file_list_view(Value) -> rocksky_typed_codec:decode('googledrive_file_list_view', Value).
-spec encode_googledrive_file_list_view(googledrive_file_list_view()) -> map().
encode_googledrive_file_list_view(Value) -> rocksky_typed_codec:encode('googledrive_file_list_view', Value).

-spec decode_googledrive_file_view(map()) -> {ok, googledrive_file_view()} | {error, term()}.
decode_googledrive_file_view(Value) -> rocksky_typed_codec:decode('googledrive_file_view', Value).
-spec encode_googledrive_file_view(googledrive_file_view()) -> map().
encode_googledrive_file_view(Value) -> rocksky_typed_codec:encode('googledrive_file_view', Value).

-spec decode_googledrive_get_files_params(map()) -> {ok, googledrive_get_files_params()} | {error, term()}.
decode_googledrive_get_files_params(Value) -> rocksky_typed_codec:decode('googledrive_get_files_params', Value).
-spec encode_googledrive_get_files_params(googledrive_get_files_params()) -> map().
encode_googledrive_get_files_params(Value) -> rocksky_typed_codec:encode('googledrive_get_files_params', Value).

-spec decode_googledrive_response_directories_item_view(map()) -> {ok, googledrive_response_directories_item_view()} | {error, term()}.
decode_googledrive_response_directories_item_view(Value) -> rocksky_typed_codec:decode('googledrive_response_directories_item_view', Value).
-spec encode_googledrive_response_directories_item_view(googledrive_response_directories_item_view()) -> map().
encode_googledrive_response_directories_item_view(Value) -> rocksky_typed_codec:encode('googledrive_response_directories_item_view', Value).

-spec decode_googledrive_response_directory_view(map()) -> {ok, googledrive_response_directory_view()} | {error, term()}.
decode_googledrive_response_directory_view(Value) -> rocksky_typed_codec:decode('googledrive_response_directory_view', Value).
-spec encode_googledrive_response_directory_view(googledrive_response_directory_view()) -> map().
encode_googledrive_response_directory_view(Value) -> rocksky_typed_codec:encode('googledrive_response_directory_view', Value).

-spec decode_googledrive_response_parent_directory_view(map()) -> {ok, googledrive_response_parent_directory_view()} | {error, term()}.
decode_googledrive_response_parent_directory_view(Value) -> rocksky_typed_codec:decode('googledrive_response_parent_directory_view', Value).
-spec encode_googledrive_response_parent_directory_view(googledrive_response_parent_directory_view()) -> map().
encode_googledrive_response_parent_directory_view(Value) -> rocksky_typed_codec:encode('googledrive_response_parent_directory_view', Value).

-spec decode_graph_not_found_actor(map()) -> {ok, graph_not_found_actor()} | {error, term()}.
decode_graph_not_found_actor(Value) -> rocksky_typed_codec:decode('graph_not_found_actor', Value).
-spec encode_graph_not_found_actor(graph_not_found_actor()) -> map().
encode_graph_not_found_actor(Value) -> rocksky_typed_codec:encode('graph_not_found_actor', Value).

-spec decode_graph_relationship(map()) -> {ok, graph_relationship()} | {error, term()}.
decode_graph_relationship(Value) -> rocksky_typed_codec:decode('graph_relationship', Value).
-spec encode_graph_relationship(graph_relationship()) -> map().
encode_graph_relationship(Value) -> rocksky_typed_codec:encode('graph_relationship', Value).

-spec decode_insert_directory_params(map()) -> {ok, insert_directory_params()} | {error, term()}.
decode_insert_directory_params(Value) -> rocksky_typed_codec:decode('insert_directory_params', Value).
-spec encode_insert_directory_params(insert_directory_params()) -> map().
encode_insert_directory_params(Value) -> rocksky_typed_codec:encode('insert_directory_params', Value).

-spec decode_insert_files_params(map()) -> {ok, insert_files_params()} | {error, term()}.
decode_insert_files_params(Value) -> rocksky_typed_codec:decode('insert_files_params', Value).
-spec encode_insert_files_params(insert_files_params()) -> map().
encode_insert_files_params(Value) -> rocksky_typed_codec:encode('insert_files_params', Value).

-spec decode_library_create_playlist_input(map()) -> {ok, library_create_playlist_input()} | {error, term()}.
decode_library_create_playlist_input(Value) -> rocksky_typed_codec:decode('library_create_playlist_input', Value).
-spec encode_library_create_playlist_input(library_create_playlist_input()) -> map().
encode_library_create_playlist_input(Value) -> rocksky_typed_codec:encode('library_create_playlist_input', Value).

-spec decode_library_create_playlist_output(map()) -> {ok, library_create_playlist_output()} | {error, term()}.
decode_library_create_playlist_output(Value) -> rocksky_typed_codec:decode('library_create_playlist_output', Value).
-spec encode_library_create_playlist_output(library_create_playlist_output()) -> map().
encode_library_create_playlist_output(Value) -> rocksky_typed_codec:encode('library_create_playlist_output', Value).

-spec decode_library_get_album_output(map()) -> {ok, library_get_album_output()} | {error, term()}.
decode_library_get_album_output(Value) -> rocksky_typed_codec:decode('library_get_album_output', Value).
-spec encode_library_get_album_output(library_get_album_output()) -> map().
encode_library_get_album_output(Value) -> rocksky_typed_codec:encode('library_get_album_output', Value).

-spec decode_library_get_album_params(map()) -> {ok, library_get_album_params()} | {error, term()}.
decode_library_get_album_params(Value) -> rocksky_typed_codec:decode('library_get_album_params', Value).
-spec encode_library_get_album_params(library_get_album_params()) -> map().
encode_library_get_album_params(Value) -> rocksky_typed_codec:encode('library_get_album_params', Value).

-spec decode_library_get_artist_output(map()) -> {ok, library_get_artist_output()} | {error, term()}.
decode_library_get_artist_output(Value) -> rocksky_typed_codec:decode('library_get_artist_output', Value).
-spec encode_library_get_artist_output(library_get_artist_output()) -> map().
encode_library_get_artist_output(Value) -> rocksky_typed_codec:encode('library_get_artist_output', Value).

-spec decode_library_get_artist_params(map()) -> {ok, library_get_artist_params()} | {error, term()}.
decode_library_get_artist_params(Value) -> rocksky_typed_codec:decode('library_get_artist_params', Value).
-spec encode_library_get_artist_params(library_get_artist_params()) -> map().
encode_library_get_artist_params(Value) -> rocksky_typed_codec:encode('library_get_artist_params', Value).

-spec decode_library_get_artists_output(map()) -> {ok, library_get_artists_output()} | {error, term()}.
decode_library_get_artists_output(Value) -> rocksky_typed_codec:decode('library_get_artists_output', Value).
-spec encode_library_get_artists_output(library_get_artists_output()) -> map().
encode_library_get_artists_output(Value) -> rocksky_typed_codec:encode('library_get_artists_output', Value).

-spec decode_library_get_artists_params(map()) -> {ok, library_get_artists_params()} | {error, term()}.
decode_library_get_artists_params(Value) -> rocksky_typed_codec:decode('library_get_artists_params', Value).
-spec encode_library_get_artists_params(library_get_artists_params()) -> map().
encode_library_get_artists_params(Value) -> rocksky_typed_codec:encode('library_get_artists_params', Value).

-spec decode_library_get_playlist_output(map()) -> {ok, library_get_playlist_output()} | {error, term()}.
decode_library_get_playlist_output(Value) -> rocksky_typed_codec:decode('library_get_playlist_output', Value).
-spec encode_library_get_playlist_output(library_get_playlist_output()) -> map().
encode_library_get_playlist_output(Value) -> rocksky_typed_codec:encode('library_get_playlist_output', Value).

-spec decode_library_get_playlist_params(map()) -> {ok, library_get_playlist_params()} | {error, term()}.
decode_library_get_playlist_params(Value) -> rocksky_typed_codec:decode('library_get_playlist_params', Value).
-spec encode_library_get_playlist_params(library_get_playlist_params()) -> map().
encode_library_get_playlist_params(Value) -> rocksky_typed_codec:encode('library_get_playlist_params', Value).

-spec decode_library_get_playlists_output(map()) -> {ok, library_get_playlists_output()} | {error, term()}.
decode_library_get_playlists_output(Value) -> rocksky_typed_codec:decode('library_get_playlists_output', Value).
-spec encode_library_get_playlists_output(library_get_playlists_output()) -> map().
encode_library_get_playlists_output(Value) -> rocksky_typed_codec:encode('library_get_playlists_output', Value).

-spec decode_library_get_playlists_params(map()) -> {ok, library_get_playlists_params()} | {error, term()}.
decode_library_get_playlists_params(Value) -> rocksky_typed_codec:decode('library_get_playlists_params', Value).
-spec encode_library_get_playlists_params(library_get_playlists_params()) -> map().
encode_library_get_playlists_params(Value) -> rocksky_typed_codec:encode('library_get_playlists_params', Value).

-spec decode_library_get_song_output(map()) -> {ok, library_get_song_output()} | {error, term()}.
decode_library_get_song_output(Value) -> rocksky_typed_codec:decode('library_get_song_output', Value).
-spec encode_library_get_song_output(library_get_song_output()) -> map().
encode_library_get_song_output(Value) -> rocksky_typed_codec:encode('library_get_song_output', Value).

-spec decode_library_get_song_params(map()) -> {ok, library_get_song_params()} | {error, term()}.
decode_library_get_song_params(Value) -> rocksky_typed_codec:decode('library_get_song_params', Value).
-spec encode_library_get_song_params(library_get_song_params()) -> map().
encode_library_get_song_params(Value) -> rocksky_typed_codec:encode('library_get_song_params', Value).

-spec decode_library_search_output(map()) -> {ok, library_search_output()} | {error, term()}.
decode_library_search_output(Value) -> rocksky_typed_codec:decode('library_search_output', Value).
-spec encode_library_search_output(library_search_output()) -> map().
encode_library_search_output(Value) -> rocksky_typed_codec:encode('library_search_output', Value).

-spec decode_library_search_params(map()) -> {ok, library_search_params()} | {error, term()}.
decode_library_search_params(Value) -> rocksky_typed_codec:decode('library_search_params', Value).
-spec encode_library_search_params(library_search_params()) -> map().
encode_library_search_params(Value) -> rocksky_typed_codec:encode('library_search_params', Value).

-spec decode_library_update_playlist_input(map()) -> {ok, library_update_playlist_input()} | {error, term()}.
decode_library_update_playlist_input(Value) -> rocksky_typed_codec:decode('library_update_playlist_input', Value).
-spec encode_library_update_playlist_input(library_update_playlist_input()) -> map().
encode_library_update_playlist_input(Value) -> rocksky_typed_codec:encode('library_update_playlist_input', Value).

-spec decode_library_update_playlist_output(map()) -> {ok, library_update_playlist_output()} | {error, term()}.
decode_library_update_playlist_output(Value) -> rocksky_typed_codec:decode('library_update_playlist_output', Value).
-spec encode_library_update_playlist_output(library_update_playlist_output()) -> map().
encode_library_update_playlist_output(Value) -> rocksky_typed_codec:encode('library_update_playlist_output', Value).

-spec decode_like_record(map()) -> {ok, like_record()} | {error, term()}.
decode_like_record(Value) -> rocksky_typed_codec:decode('like_record', Value).
-spec encode_like_record(like_record()) -> map().
encode_like_record(Value) -> rocksky_typed_codec:encode('like_record', Value).

-spec decode_like_shout_input(map()) -> {ok, like_shout_input()} | {error, term()}.
decode_like_shout_input(Value) -> rocksky_typed_codec:decode('like_shout_input', Value).
-spec encode_like_shout_input(like_shout_input()) -> map().
encode_like_shout_input(Value) -> rocksky_typed_codec:encode('like_shout_input', Value).

-spec decode_like_song_input(map()) -> {ok, like_song_input()} | {error, term()}.
decode_like_song_input(Value) -> rocksky_typed_codec:decode('like_song_input', Value).
-spec encode_like_song_input(like_song_input()) -> map().
encode_like_song_input(Value) -> rocksky_typed_codec:encode('like_song_input', Value).

-spec decode_list_notifications_output(map()) -> {ok, list_notifications_output()} | {error, term()}.
decode_list_notifications_output(Value) -> rocksky_typed_codec:decode('list_notifications_output', Value).
-spec encode_list_notifications_output(list_notifications_output()) -> map().
encode_list_notifications_output(Value) -> rocksky_typed_codec:encode('list_notifications_output', Value).

-spec decode_list_notifications_params(map()) -> {ok, list_notifications_params()} | {error, term()}.
decode_list_notifications_params(Value) -> rocksky_typed_codec:decode('list_notifications_params', Value).
-spec encode_list_notifications_params(list_notifications_params()) -> map().
encode_list_notifications_params(Value) -> rocksky_typed_codec:encode('list_notifications_params', Value).

-spec decode_list_presets_output(map()) -> {ok, list_presets_output()} | {error, term()}.
decode_list_presets_output(Value) -> rocksky_typed_codec:decode('list_presets_output', Value).
-spec encode_list_presets_output(list_presets_output()) -> map().
encode_list_presets_output(Value) -> rocksky_typed_codec:encode('list_presets_output', Value).

-spec decode_list_presets_params(map()) -> {ok, list_presets_params()} | {error, term()}.
decode_list_presets_params(Value) -> rocksky_typed_codec:decode('list_presets_params', Value).
-spec encode_list_presets_params(list_presets_params()) -> map().
encode_list_presets_params(Value) -> rocksky_typed_codec:encode('list_presets_params', Value).

-spec decode_match_song_params(map()) -> {ok, match_song_params()} | {error, term()}.
decode_match_song_params(Value) -> rocksky_typed_codec:decode('match_song_params', Value).
-spec encode_match_song_params(match_song_params()) -> map().
encode_match_song_params(Value) -> rocksky_typed_codec:encode('match_song_params', Value).

-spec decode_mirror_source_view(map()) -> {ok, mirror_source_view()} | {error, term()}.
decode_mirror_source_view(Value) -> rocksky_typed_codec:decode('mirror_source_view', Value).
-spec encode_mirror_source_view(mirror_source_view()) -> map().
encode_mirror_source_view(Value) -> rocksky_typed_codec:encode('mirror_source_view', Value).

-spec decode_notification_actor(map()) -> {ok, notification_actor()} | {error, term()}.
decode_notification_actor(Value) -> rocksky_typed_codec:decode('notification_actor', Value).
-spec encode_notification_actor(notification_actor()) -> map().
encode_notification_actor(Value) -> rocksky_typed_codec:encode('notification_actor', Value).

-spec decode_notification_subject_view(map()) -> {ok, notification_subject_view()} | {error, term()}.
decode_notification_subject_view(Value) -> rocksky_typed_codec:decode('notification_subject_view', Value).
-spec encode_notification_subject_view(notification_subject_view()) -> map().
encode_notification_subject_view(Value) -> rocksky_typed_codec:encode('notification_subject_view', Value).

-spec decode_notification_view(map()) -> {ok, notification_view()} | {error, term()}.
decode_notification_view(Value) -> rocksky_typed_codec:decode('notification_view', Value).
-spec encode_notification_view(notification_view()) -> map().
encode_notification_view(Value) -> rocksky_typed_codec:encode('notification_view', Value).

-spec decode_ping_output(map()) -> {ok, ping_output()} | {error, term()}.
decode_ping_output(Value) -> rocksky_typed_codec:decode('ping_output', Value).
-spec encode_ping_output(ping_output()) -> map().
encode_ping_output(Value) -> rocksky_typed_codec:encode('ping_output', Value).

-spec decode_ping_params(map()) -> {ok, ping_params()} | {error, term()}.
decode_ping_params(Value) -> rocksky_typed_codec:decode('ping_params', Value).
-spec encode_ping_params(ping_params()) -> map().
encode_ping_params(Value) -> rocksky_typed_codec:encode('ping_params', Value).

-spec decode_play_directory_params(map()) -> {ok, play_directory_params()} | {error, term()}.
decode_play_directory_params(Value) -> rocksky_typed_codec:decode('play_directory_params', Value).
-spec encode_play_directory_params(play_directory_params()) -> map().
encode_play_directory_params(Value) -> rocksky_typed_codec:encode('play_directory_params', Value).

-spec decode_player_currently_playing_view_detailed(map()) -> {ok, player_currently_playing_view_detailed()} | {error, term()}.
decode_player_currently_playing_view_detailed(Value) -> rocksky_typed_codec:decode('player_currently_playing_view_detailed', Value).
-spec encode_player_currently_playing_view_detailed(player_currently_playing_view_detailed()) -> map().
encode_player_currently_playing_view_detailed(Value) -> rocksky_typed_codec:encode('player_currently_playing_view_detailed', Value).

-spec decode_player_get_currently_playing_params(map()) -> {ok, player_get_currently_playing_params()} | {error, term()}.
decode_player_get_currently_playing_params(Value) -> rocksky_typed_codec:decode('player_get_currently_playing_params', Value).
-spec encode_player_get_currently_playing_params(player_get_currently_playing_params()) -> map().
encode_player_get_currently_playing_params(Value) -> rocksky_typed_codec:encode('player_get_currently_playing_params', Value).

-spec decode_player_next_params(map()) -> {ok, player_next_params()} | {error, term()}.
decode_player_next_params(Value) -> rocksky_typed_codec:decode('player_next_params', Value).
-spec encode_player_next_params(player_next_params()) -> map().
encode_player_next_params(Value) -> rocksky_typed_codec:encode('player_next_params', Value).

-spec decode_player_pause_params(map()) -> {ok, player_pause_params()} | {error, term()}.
decode_player_pause_params(Value) -> rocksky_typed_codec:decode('player_pause_params', Value).
-spec encode_player_pause_params(player_pause_params()) -> map().
encode_player_pause_params(Value) -> rocksky_typed_codec:encode('player_pause_params', Value).

-spec decode_player_playback_queue_view_detailed(map()) -> {ok, player_playback_queue_view_detailed()} | {error, term()}.
decode_player_playback_queue_view_detailed(Value) -> rocksky_typed_codec:decode('player_playback_queue_view_detailed', Value).
-spec encode_player_playback_queue_view_detailed(player_playback_queue_view_detailed()) -> map().
encode_player_playback_queue_view_detailed(Value) -> rocksky_typed_codec:encode('player_playback_queue_view_detailed', Value).

-spec decode_player_play_params(map()) -> {ok, player_play_params()} | {error, term()}.
decode_player_play_params(Value) -> rocksky_typed_codec:decode('player_play_params', Value).
-spec encode_player_play_params(player_play_params()) -> map().
encode_player_play_params(Value) -> rocksky_typed_codec:encode('player_play_params', Value).

-spec decode_player_previous_params(map()) -> {ok, player_previous_params()} | {error, term()}.
decode_player_previous_params(Value) -> rocksky_typed_codec:decode('player_previous_params', Value).
-spec encode_player_previous_params(player_previous_params()) -> map().
encode_player_previous_params(Value) -> rocksky_typed_codec:encode('player_previous_params', Value).

-spec decode_player_seek_params(map()) -> {ok, player_seek_params()} | {error, term()}.
decode_player_seek_params(Value) -> rocksky_typed_codec:decode('player_seek_params', Value).
-spec encode_player_seek_params(player_seek_params()) -> map().
encode_player_seek_params(Value) -> rocksky_typed_codec:encode('player_seek_params', Value).

-spec decode_play_file_params(map()) -> {ok, play_file_params()} | {error, term()}.
decode_play_file_params(Value) -> rocksky_typed_codec:decode('play_file_params', Value).
-spec encode_play_file_params(play_file_params()) -> map().
encode_play_file_params(Value) -> rocksky_typed_codec:encode('play_file_params', Value).

-spec decode_playlist_create_playlist_output(map()) -> {ok, playlist_create_playlist_output()} | {error, term()}.
decode_playlist_create_playlist_output(Value) -> rocksky_typed_codec:decode('playlist_create_playlist_output', Value).
-spec encode_playlist_create_playlist_output(playlist_create_playlist_output()) -> map().
encode_playlist_create_playlist_output(Value) -> rocksky_typed_codec:encode('playlist_create_playlist_output', Value).

-spec decode_playlist_create_playlist_params(map()) -> {ok, playlist_create_playlist_params()} | {error, term()}.
decode_playlist_create_playlist_params(Value) -> rocksky_typed_codec:decode('playlist_create_playlist_params', Value).
-spec encode_playlist_create_playlist_params(playlist_create_playlist_params()) -> map().
encode_playlist_create_playlist_params(Value) -> rocksky_typed_codec:encode('playlist_create_playlist_params', Value).

-spec decode_playlist_get_playlist_params(map()) -> {ok, playlist_get_playlist_params()} | {error, term()}.
decode_playlist_get_playlist_params(Value) -> rocksky_typed_codec:decode('playlist_get_playlist_params', Value).
-spec encode_playlist_get_playlist_params(playlist_get_playlist_params()) -> map().
encode_playlist_get_playlist_params(Value) -> rocksky_typed_codec:encode('playlist_get_playlist_params', Value).

-spec decode_playlist_get_playlists_output(map()) -> {ok, playlist_get_playlists_output()} | {error, term()}.
decode_playlist_get_playlists_output(Value) -> rocksky_typed_codec:decode('playlist_get_playlists_output', Value).
-spec encode_playlist_get_playlists_output(playlist_get_playlists_output()) -> map().
encode_playlist_get_playlists_output(Value) -> rocksky_typed_codec:encode('playlist_get_playlists_output', Value).

-spec decode_playlist_get_playlists_params(map()) -> {ok, playlist_get_playlists_params()} | {error, term()}.
decode_playlist_get_playlists_params(Value) -> rocksky_typed_codec:decode('playlist_get_playlists_params', Value).
-spec encode_playlist_get_playlists_params(playlist_get_playlists_params()) -> map().
encode_playlist_get_playlists_params(Value) -> rocksky_typed_codec:encode('playlist_get_playlists_params', Value).

-spec decode_playlist_record(map()) -> {ok, playlist_record()} | {error, term()}.
decode_playlist_record(Value) -> rocksky_typed_codec:decode('playlist_record', Value).
-spec encode_playlist_record(playlist_record()) -> map().
encode_playlist_record(Value) -> rocksky_typed_codec:encode('playlist_record', Value).

-spec decode_playlist_song_record(map()) -> {ok, playlist_song_record()} | {error, term()}.
decode_playlist_song_record(Value) -> rocksky_typed_codec:decode('playlist_song_record', Value).
-spec encode_playlist_song_record(playlist_song_record()) -> map().
encode_playlist_song_record(Value) -> rocksky_typed_codec:encode('playlist_song_record', Value).

-spec decode_playlist_update_playlist_output(map()) -> {ok, playlist_update_playlist_output()} | {error, term()}.
decode_playlist_update_playlist_output(Value) -> rocksky_typed_codec:decode('playlist_update_playlist_output', Value).
-spec encode_playlist_update_playlist_output(playlist_update_playlist_output()) -> map().
encode_playlist_update_playlist_output(Value) -> rocksky_typed_codec:encode('playlist_update_playlist_output', Value).

-spec decode_playlist_update_playlist_params(map()) -> {ok, playlist_update_playlist_params()} | {error, term()}.
decode_playlist_update_playlist_params(Value) -> rocksky_typed_codec:decode('playlist_update_playlist_params', Value).
-spec encode_playlist_update_playlist_params(playlist_update_playlist_params()) -> map().
encode_playlist_update_playlist_params(Value) -> rocksky_typed_codec:encode('playlist_update_playlist_params', Value).

-spec decode_playlist_view_basic(map()) -> {ok, playlist_view_basic()} | {error, term()}.
decode_playlist_view_basic(Value) -> rocksky_typed_codec:decode('playlist_view_basic', Value).
-spec encode_playlist_view_basic(playlist_view_basic()) -> map().
encode_playlist_view_basic(Value) -> rocksky_typed_codec:encode('playlist_view_basic', Value).

-spec decode_playlist_view_detailed(map()) -> {ok, playlist_view_detailed()} | {error, term()}.
decode_playlist_view_detailed(Value) -> rocksky_typed_codec:decode('playlist_view_detailed', Value).
-spec encode_playlist_view_detailed(playlist_view_detailed()) -> map().
encode_playlist_view_detailed(Value) -> rocksky_typed_codec:encode('playlist_view_detailed', Value).

-spec decode_profile_record(map()) -> {ok, profile_record()} | {error, term()}.
decode_profile_record(Value) -> rocksky_typed_codec:decode('profile_record', Value).
-spec encode_profile_record(profile_record()) -> map().
encode_profile_record(Value) -> rocksky_typed_codec:encode('profile_record', Value).

-spec decode_put_audio_settings_input(map()) -> {ok, put_audio_settings_input()} | {error, term()}.
decode_put_audio_settings_input(Value) -> rocksky_typed_codec:decode('put_audio_settings_input', Value).
-spec encode_put_audio_settings_input(put_audio_settings_input()) -> map().
encode_put_audio_settings_input(Value) -> rocksky_typed_codec:encode('put_audio_settings_input', Value).

-spec decode_put_mirror_source_input(map()) -> {ok, put_mirror_source_input()} | {error, term()}.
decode_put_mirror_source_input(Value) -> rocksky_typed_codec:decode('put_mirror_source_input', Value).
-spec encode_put_mirror_source_input(put_mirror_source_input()) -> map().
encode_put_mirror_source_input(Value) -> rocksky_typed_codec:encode('put_mirror_source_input', Value).

-spec decode_put_preset_input(map()) -> {ok, put_preset_input()} | {error, term()}.
decode_put_preset_input(Value) -> rocksky_typed_codec:decode('put_preset_input', Value).
-spec encode_put_preset_input(put_preset_input()) -> map().
encode_put_preset_input(Value) -> rocksky_typed_codec:encode('put_preset_input', Value).

-spec decode_radio_record(map()) -> {ok, radio_record()} | {error, term()}.
decode_radio_record(Value) -> rocksky_typed_codec:decode('radio_record', Value).
-spec encode_radio_record(radio_record()) -> map().
encode_radio_record(Value) -> rocksky_typed_codec:encode('radio_record', Value).

-spec decode_radio_view_basic(map()) -> {ok, radio_view_basic()} | {error, term()}.
decode_radio_view_basic(Value) -> rocksky_typed_codec:decode('radio_view_basic', Value).
-spec encode_radio_view_basic(radio_view_basic()) -> map().
encode_radio_view_basic(Value) -> rocksky_typed_codec:encode('radio_view_basic', Value).

-spec decode_radio_view_detailed(map()) -> {ok, radio_view_detailed()} | {error, term()}.
decode_radio_view_detailed(Value) -> rocksky_typed_codec:decode('radio_view_detailed', Value).
-spec encode_radio_view_detailed(radio_view_detailed()) -> map().
encode_radio_view_detailed(Value) -> rocksky_typed_codec:encode('radio_view_detailed', Value).

-spec decode_remove_apikey_params(map()) -> {ok, remove_apikey_params()} | {error, term()}.
decode_remove_apikey_params(Value) -> rocksky_typed_codec:decode('remove_apikey_params', Value).
-spec encode_remove_apikey_params(remove_apikey_params()) -> map().
encode_remove_apikey_params(Value) -> rocksky_typed_codec:encode('remove_apikey_params', Value).

-spec decode_remove_playlist_params(map()) -> {ok, remove_playlist_params()} | {error, term()}.
decode_remove_playlist_params(Value) -> rocksky_typed_codec:decode('remove_playlist_params', Value).
-spec encode_remove_playlist_params(remove_playlist_params()) -> map().
encode_remove_playlist_params(Value) -> rocksky_typed_codec:encode('remove_playlist_params', Value).

-spec decode_remove_shout_params(map()) -> {ok, remove_shout_params()} | {error, term()}.
decode_remove_shout_params(Value) -> rocksky_typed_codec:decode('remove_shout_params', Value).
-spec encode_remove_shout_params(remove_shout_params()) -> map().
encode_remove_shout_params(Value) -> rocksky_typed_codec:encode('remove_shout_params', Value).

-spec decode_remove_track_params(map()) -> {ok, remove_track_params()} | {error, term()}.
decode_remove_track_params(Value) -> rocksky_typed_codec:decode('remove_track_params', Value).
-spec encode_remove_track_params(remove_track_params()) -> map().
encode_remove_track_params(Value) -> rocksky_typed_codec:encode('remove_track_params', Value).

-spec decode_reply_shout_input(map()) -> {ok, reply_shout_input()} | {error, term()}.
decode_reply_shout_input(Value) -> rocksky_typed_codec:decode('reply_shout_input', Value).
-spec encode_reply_shout_input(reply_shout_input()) -> map().
encode_reply_shout_input(Value) -> rocksky_typed_codec:encode('reply_shout_input', Value).

-spec decode_report_shout_input(map()) -> {ok, report_shout_input()} | {error, term()}.
decode_report_shout_input(Value) -> rocksky_typed_codec:decode('report_shout_input', Value).
-spec encode_report_shout_input(report_shout_input()) -> map().
encode_report_shout_input(Value) -> rocksky_typed_codec:encode('report_shout_input', Value).

-spec decode_rockbox_crossfade_settings(map()) -> {ok, rockbox_crossfade_settings()} | {error, term()}.
decode_rockbox_crossfade_settings(Value) -> rocksky_typed_codec:decode('rockbox_crossfade_settings', Value).
-spec encode_rockbox_crossfade_settings(rockbox_crossfade_settings()) -> map().
encode_rockbox_crossfade_settings(Value) -> rocksky_typed_codec:encode('rockbox_crossfade_settings', Value).

-spec decode_rockbox_equalizer_band(map()) -> {ok, rockbox_equalizer_band()} | {error, term()}.
decode_rockbox_equalizer_band(Value) -> rocksky_typed_codec:decode('rockbox_equalizer_band', Value).
-spec encode_rockbox_equalizer_band(rockbox_equalizer_band()) -> map().
encode_rockbox_equalizer_band(Value) -> rocksky_typed_codec:encode('rockbox_equalizer_band', Value).

-spec decode_rockbox_equalizer_settings(map()) -> {ok, rockbox_equalizer_settings()} | {error, term()}.
decode_rockbox_equalizer_settings(Value) -> rocksky_typed_codec:decode('rockbox_equalizer_settings', Value).
-spec encode_rockbox_equalizer_settings(rockbox_equalizer_settings()) -> map().
encode_rockbox_equalizer_settings(Value) -> rocksky_typed_codec:encode('rockbox_equalizer_settings', Value).

-spec decode_rockbox_replay_gain_settings(map()) -> {ok, rockbox_replay_gain_settings()} | {error, term()}.
decode_rockbox_replay_gain_settings(Value) -> rocksky_typed_codec:decode('rockbox_replay_gain_settings', Value).
-spec encode_rockbox_replay_gain_settings(rockbox_replay_gain_settings()) -> map().
encode_rockbox_replay_gain_settings(Value) -> rocksky_typed_codec:encode('rockbox_replay_gain_settings', Value).

-spec decode_rockbox_settings_view(map()) -> {ok, rockbox_settings_view()} | {error, term()}.
decode_rockbox_settings_view(Value) -> rocksky_typed_codec:decode('rockbox_settings_view', Value).
-spec encode_rockbox_settings_view(rockbox_settings_view()) -> map().
encode_rockbox_settings_view(Value) -> rocksky_typed_codec:encode('rockbox_settings_view', Value).

-spec decode_rockbox_tone_settings(map()) -> {ok, rockbox_tone_settings()} | {error, term()}.
decode_rockbox_tone_settings(Value) -> rocksky_typed_codec:decode('rockbox_tone_settings', Value).
-spec encode_rockbox_tone_settings(rockbox_tone_settings()) -> map().
encode_rockbox_tone_settings(Value) -> rocksky_typed_codec:encode('rockbox_tone_settings', Value).

-spec decode_save_play_queue_input(map()) -> {ok, save_play_queue_input()} | {error, term()}.
decode_save_play_queue_input(Value) -> rocksky_typed_codec:decode('save_play_queue_input', Value).
-spec encode_save_play_queue_input(save_play_queue_input()) -> map().
encode_save_play_queue_input(Value) -> rocksky_typed_codec:encode('save_play_queue_input', Value).

-spec decode_save_play_queue_output(map()) -> {ok, save_play_queue_output()} | {error, term()}.
decode_save_play_queue_output(Value) -> rocksky_typed_codec:decode('save_play_queue_output', Value).
-spec encode_save_play_queue_output(save_play_queue_output()) -> map().
encode_save_play_queue_output(Value) -> rocksky_typed_codec:encode('save_play_queue_output', Value).

-spec decode_scrobble_first_scrobble_view(map()) -> {ok, scrobble_first_scrobble_view()} | {error, term()}.
decode_scrobble_first_scrobble_view(Value) -> rocksky_typed_codec:decode('scrobble_first_scrobble_view', Value).
-spec encode_scrobble_first_scrobble_view(scrobble_first_scrobble_view()) -> map().
encode_scrobble_first_scrobble_view(Value) -> rocksky_typed_codec:encode('scrobble_first_scrobble_view', Value).

-spec decode_scrobble_input(map()) -> {ok, scrobble_input()} | {error, term()}.
decode_scrobble_input(Value) -> rocksky_typed_codec:decode('scrobble_input', Value).
-spec encode_scrobble_input(scrobble_input()) -> map().
encode_scrobble_input(Value) -> rocksky_typed_codec:encode('scrobble_input', Value).

-spec decode_scrobble_output(map()) -> {ok, scrobble_output()} | {error, term()}.
decode_scrobble_output(Value) -> rocksky_typed_codec:decode('scrobble_output', Value).
-spec encode_scrobble_output(scrobble_output()) -> map().
encode_scrobble_output(Value) -> rocksky_typed_codec:encode('scrobble_output', Value).

-spec decode_scrobble_record(map()) -> {ok, scrobble_record()} | {error, term()}.
decode_scrobble_record(Value) -> rocksky_typed_codec:decode('scrobble_record', Value).
-spec encode_scrobble_record(scrobble_record()) -> map().
encode_scrobble_record(Value) -> rocksky_typed_codec:encode('scrobble_record', Value).

-spec decode_scrobble_view_basic(map()) -> {ok, scrobble_view_basic()} | {error, term()}.
decode_scrobble_view_basic(Value) -> rocksky_typed_codec:decode('scrobble_view_basic', Value).
-spec encode_scrobble_view_basic(scrobble_view_basic()) -> map().
encode_scrobble_view_basic(Value) -> rocksky_typed_codec:encode('scrobble_view_basic', Value).

-spec decode_scrobble_view_detailed(map()) -> {ok, scrobble_view_detailed()} | {error, term()}.
decode_scrobble_view_detailed(Value) -> rocksky_typed_codec:decode('scrobble_view_detailed', Value).
-spec encode_scrobble_view_detailed(scrobble_view_detailed()) -> map().
encode_scrobble_view_detailed(Value) -> rocksky_typed_codec:encode('scrobble_view_detailed', Value).

-spec decode_settings_record(map()) -> {ok, settings_record()} | {error, term()}.
decode_settings_record(Value) -> rocksky_typed_codec:decode('settings_record', Value).
-spec encode_settings_record(settings_record()) -> map().
encode_settings_record(Value) -> rocksky_typed_codec:encode('settings_record', Value).

-spec decode_shout_author(map()) -> {ok, shout_author()} | {error, term()}.
decode_shout_author(Value) -> rocksky_typed_codec:decode('shout_author', Value).
-spec encode_shout_author(shout_author()) -> map().
encode_shout_author(Value) -> rocksky_typed_codec:encode('shout_author', Value).

-spec decode_shout_gif(map()) -> {ok, shout_gif()} | {error, term()}.
decode_shout_gif(Value) -> rocksky_typed_codec:decode('shout_gif', Value).
-spec encode_shout_gif(shout_gif()) -> map().
encode_shout_gif(Value) -> rocksky_typed_codec:encode('shout_gif', Value).

-spec decode_shout_mention(map()) -> {ok, shout_mention()} | {error, term()}.
decode_shout_mention(Value) -> rocksky_typed_codec:decode('shout_mention', Value).
-spec encode_shout_mention(shout_mention()) -> map().
encode_shout_mention(Value) -> rocksky_typed_codec:encode('shout_mention', Value).

-spec decode_shout_record(map()) -> {ok, shout_record()} | {error, term()}.
decode_shout_record(Value) -> rocksky_typed_codec:decode('shout_record', Value).
-spec encode_shout_record(shout_record()) -> map().
encode_shout_record(Value) -> rocksky_typed_codec:encode('shout_record', Value).

-spec decode_shout_view(map()) -> {ok, shout_view()} | {error, term()}.
decode_shout_view(Value) -> rocksky_typed_codec:decode('shout_view', Value).
-spec encode_shout_view(shout_view()) -> map().
encode_shout_view(Value) -> rocksky_typed_codec:encode('shout_view', Value).

-spec decode_song_first_scrobble_view(map()) -> {ok, song_first_scrobble_view()} | {error, term()}.
decode_song_first_scrobble_view(Value) -> rocksky_typed_codec:decode('song_first_scrobble_view', Value).
-spec encode_song_first_scrobble_view(song_first_scrobble_view()) -> map().
encode_song_first_scrobble_view(Value) -> rocksky_typed_codec:encode('song_first_scrobble_view', Value).

-spec decode_song_get_song_params(map()) -> {ok, song_get_song_params()} | {error, term()}.
decode_song_get_song_params(Value) -> rocksky_typed_codec:decode('song_get_song_params', Value).
-spec encode_song_get_song_params(song_get_song_params()) -> map().
encode_song_get_song_params(Value) -> rocksky_typed_codec:encode('song_get_song_params', Value).

-spec decode_song_match_view(map()) -> {ok, song_match_view()} | {error, term()}.
decode_song_match_view(Value) -> rocksky_typed_codec:decode('song_match_view', Value).
-spec encode_song_match_view(song_match_view()) -> map().
encode_song_match_view(Value) -> rocksky_typed_codec:encode('song_match_view', Value).

-spec decode_song_recent_listener_view(map()) -> {ok, song_recent_listener_view()} | {error, term()}.
decode_song_recent_listener_view(Value) -> rocksky_typed_codec:decode('song_recent_listener_view', Value).
-spec encode_song_recent_listener_view(song_recent_listener_view()) -> map().
encode_song_recent_listener_view(Value) -> rocksky_typed_codec:encode('song_recent_listener_view', Value).

-spec decode_song_record(map()) -> {ok, song_record()} | {error, term()}.
decode_song_record(Value) -> rocksky_typed_codec:decode('song_record', Value).
-spec encode_song_record(song_record()) -> map().
encode_song_record(Value) -> rocksky_typed_codec:encode('song_record', Value).

-spec decode_song_response_mb_artists_item_view(map()) -> {ok, song_response_mb_artists_item_view()} | {error, term()}.
decode_song_response_mb_artists_item_view(Value) -> rocksky_typed_codec:decode('song_response_mb_artists_item_view', Value).
-spec encode_song_response_mb_artists_item_view(song_response_mb_artists_item_view()) -> map().
encode_song_response_mb_artists_item_view(Value) -> rocksky_typed_codec:encode('song_response_mb_artists_item_view', Value).

-spec decode_song_view_basic(map()) -> {ok, song_view_basic()} | {error, term()}.
decode_song_view_basic(Value) -> rocksky_typed_codec:decode('song_view_basic', Value).
-spec encode_song_view_basic(song_view_basic()) -> map().
encode_song_view_basic(Value) -> rocksky_typed_codec:encode('song_view_basic', Value).

-spec decode_song_view_detailed(map()) -> {ok, song_view_detailed()} | {error, term()}.
decode_song_view_detailed(Value) -> rocksky_typed_codec:decode('song_view_detailed', Value).
-spec encode_song_view_detailed(song_view_detailed()) -> map().
encode_song_view_detailed(Value) -> rocksky_typed_codec:encode('song_view_detailed', Value).

-spec decode_spotify_get_currently_playing_params(map()) -> {ok, spotify_get_currently_playing_params()} | {error, term()}.
decode_spotify_get_currently_playing_params(Value) -> rocksky_typed_codec:decode('spotify_get_currently_playing_params', Value).
-spec encode_spotify_get_currently_playing_params(spotify_get_currently_playing_params()) -> map().
encode_spotify_get_currently_playing_params(Value) -> rocksky_typed_codec:encode('spotify_get_currently_playing_params', Value).

-spec decode_spotify_seek_params(map()) -> {ok, spotify_seek_params()} | {error, term()}.
decode_spotify_seek_params(Value) -> rocksky_typed_codec:decode('spotify_seek_params', Value).
-spec encode_spotify_seek_params(spotify_seek_params()) -> map().
encode_spotify_seek_params(Value) -> rocksky_typed_codec:encode('spotify_seek_params', Value).

-spec decode_spotify_track_view(map()) -> {ok, spotify_track_view()} | {error, term()}.
decode_spotify_track_view(Value) -> rocksky_typed_codec:decode('spotify_track_view', Value).
-spec encode_spotify_track_view(spotify_track_view()) -> map().
encode_spotify_track_view(Value) -> rocksky_typed_codec:encode('spotify_track_view', Value).

-spec decode_star_input(map()) -> {ok, star_input()} | {error, term()}.
decode_star_input(Value) -> rocksky_typed_codec:decode('star_input', Value).
-spec encode_star_input(star_input()) -> map().
encode_star_input(Value) -> rocksky_typed_codec:encode('star_input', Value).

-spec decode_star_output(map()) -> {ok, star_output()} | {error, term()}.
decode_star_output(Value) -> rocksky_typed_codec:decode('star_output', Value).
-spec encode_star_output(star_output()) -> map().
encode_star_output(Value) -> rocksky_typed_codec:encode('star_output', Value).

-spec decode_start_playlist_params(map()) -> {ok, start_playlist_params()} | {error, term()}.
decode_start_playlist_params(Value) -> rocksky_typed_codec:decode('start_playlist_params', Value).
-spec encode_start_playlist_params(start_playlist_params()) -> map().
encode_start_playlist_params(Value) -> rocksky_typed_codec:encode('start_playlist_params', Value).

-spec decode_start_scan_output(map()) -> {ok, start_scan_output()} | {error, term()}.
decode_start_scan_output(Value) -> rocksky_typed_codec:decode('start_scan_output', Value).
-spec encode_start_scan_output(start_scan_output()) -> map().
encode_start_scan_output(Value) -> rocksky_typed_codec:encode('start_scan_output', Value).

-spec decode_start_scan_params(map()) -> {ok, start_scan_params()} | {error, term()}.
decode_start_scan_params(Value) -> rocksky_typed_codec:decode('start_scan_params', Value).
-spec encode_start_scan_params(start_scan_params()) -> map().
encode_start_scan_params(Value) -> rocksky_typed_codec:encode('start_scan_params', Value).

-spec decode_stats_global_stats_view(map()) -> {ok, stats_global_stats_view()} | {error, term()}.
decode_stats_global_stats_view(Value) -> rocksky_typed_codec:decode('stats_global_stats_view', Value).
-spec encode_stats_global_stats_view(stats_global_stats_view()) -> map().
encode_stats_global_stats_view(Value) -> rocksky_typed_codec:encode('stats_global_stats_view', Value).

-spec decode_stats_view(map()) -> {ok, stats_view()} | {error, term()}.
decode_stats_view(Value) -> rocksky_typed_codec:decode('stats_view', Value).
-spec encode_stats_view(stats_view()) -> map().
encode_stats_view(Value) -> rocksky_typed_codec:encode('stats_view', Value).

-spec decode_stats_wrapped_album(map()) -> {ok, stats_wrapped_album()} | {error, term()}.
decode_stats_wrapped_album(Value) -> rocksky_typed_codec:decode('stats_wrapped_album', Value).
-spec encode_stats_wrapped_album(stats_wrapped_album()) -> map().
encode_stats_wrapped_album(Value) -> rocksky_typed_codec:encode('stats_wrapped_album', Value).

-spec decode_stats_wrapped_artist(map()) -> {ok, stats_wrapped_artist()} | {error, term()}.
decode_stats_wrapped_artist(Value) -> rocksky_typed_codec:decode('stats_wrapped_artist', Value).
-spec encode_stats_wrapped_artist(stats_wrapped_artist()) -> map().
encode_stats_wrapped_artist(Value) -> rocksky_typed_codec:encode('stats_wrapped_artist', Value).

-spec decode_stats_wrapped_day_count(map()) -> {ok, stats_wrapped_day_count()} | {error, term()}.
decode_stats_wrapped_day_count(Value) -> rocksky_typed_codec:decode('stats_wrapped_day_count', Value).
-spec encode_stats_wrapped_day_count(stats_wrapped_day_count()) -> map().
encode_stats_wrapped_day_count(Value) -> rocksky_typed_codec:encode('stats_wrapped_day_count', Value).

-spec decode_stats_wrapped_genre_count(map()) -> {ok, stats_wrapped_genre_count()} | {error, term()}.
decode_stats_wrapped_genre_count(Value) -> rocksky_typed_codec:decode('stats_wrapped_genre_count', Value).
-spec encode_stats_wrapped_genre_count(stats_wrapped_genre_count()) -> map().
encode_stats_wrapped_genre_count(Value) -> rocksky_typed_codec:encode('stats_wrapped_genre_count', Value).

-spec decode_stats_wrapped_milestone(map()) -> {ok, stats_wrapped_milestone()} | {error, term()}.
decode_stats_wrapped_milestone(Value) -> rocksky_typed_codec:decode('stats_wrapped_milestone', Value).
-spec encode_stats_wrapped_milestone(stats_wrapped_milestone()) -> map().
encode_stats_wrapped_milestone(Value) -> rocksky_typed_codec:encode('stats_wrapped_milestone', Value).

-spec decode_stats_wrapped_month_count(map()) -> {ok, stats_wrapped_month_count()} | {error, term()}.
decode_stats_wrapped_month_count(Value) -> rocksky_typed_codec:decode('stats_wrapped_month_count', Value).
-spec encode_stats_wrapped_month_count(stats_wrapped_month_count()) -> map().
encode_stats_wrapped_month_count(Value) -> rocksky_typed_codec:encode('stats_wrapped_month_count', Value).

-spec decode_stats_wrapped_track(map()) -> {ok, stats_wrapped_track()} | {error, term()}.
decode_stats_wrapped_track(Value) -> rocksky_typed_codec:decode('stats_wrapped_track', Value).
-spec encode_stats_wrapped_track(stats_wrapped_track()) -> map().
encode_stats_wrapped_track(Value) -> rocksky_typed_codec:encode('stats_wrapped_track', Value).

-spec decode_stats_wrapped_view(map()) -> {ok, stats_wrapped_view()} | {error, term()}.
decode_stats_wrapped_view(Value) -> rocksky_typed_codec:decode('stats_wrapped_view', Value).
-spec encode_stats_wrapped_view(stats_wrapped_view()) -> map().
encode_stats_wrapped_view(Value) -> rocksky_typed_codec:encode('stats_wrapped_view', Value).

-spec decode_status_record(map()) -> {ok, status_record()} | {error, term()}.
decode_status_record(Value) -> rocksky_typed_codec:decode('status_record', Value).
-spec encode_status_record(status_record()) -> map().
encode_status_record(Value) -> rocksky_typed_codec:encode('status_record', Value).

-spec decode_strong_ref(map()) -> {ok, strong_ref()} | {error, term()}.
decode_strong_ref(Value) -> rocksky_typed_codec:decode('strong_ref', Value).
-spec encode_strong_ref(strong_ref()) -> map().
encode_strong_ref(Value) -> rocksky_typed_codec:encode('strong_ref', Value).

-spec decode_unfollow_account_output(map()) -> {ok, unfollow_account_output()} | {error, term()}.
decode_unfollow_account_output(Value) -> rocksky_typed_codec:decode('unfollow_account_output', Value).
-spec encode_unfollow_account_output(unfollow_account_output()) -> map().
encode_unfollow_account_output(Value) -> rocksky_typed_codec:encode('unfollow_account_output', Value).

-spec decode_unfollow_account_params(map()) -> {ok, unfollow_account_params()} | {error, term()}.
decode_unfollow_account_params(Value) -> rocksky_typed_codec:decode('unfollow_account_params', Value).
-spec encode_unfollow_account_params(unfollow_account_params()) -> map().
encode_unfollow_account_params(Value) -> rocksky_typed_codec:encode('unfollow_account_params', Value).

-spec decode_unstar_input(map()) -> {ok, unstar_input()} | {error, term()}.
decode_unstar_input(Value) -> rocksky_typed_codec:decode('unstar_input', Value).
-spec encode_unstar_input(unstar_input()) -> map().
encode_unstar_input(Value) -> rocksky_typed_codec:encode('unstar_input', Value).

-spec decode_unstar_output(map()) -> {ok, unstar_output()} | {error, term()}.
decode_unstar_output(Value) -> rocksky_typed_codec:decode('unstar_output', Value).
-spec encode_unstar_output(unstar_output()) -> map().
encode_unstar_output(Value) -> rocksky_typed_codec:encode('unstar_output', Value).

-spec decode_update_apikey_input(map()) -> {ok, update_apikey_input()} | {error, term()}.
decode_update_apikey_input(Value) -> rocksky_typed_codec:decode('update_apikey_input', Value).
-spec encode_update_apikey_input(update_apikey_input()) -> map().
encode_update_apikey_input(Value) -> rocksky_typed_codec:encode('update_apikey_input', Value).

-spec decode_update_now_playing_input(map()) -> {ok, update_now_playing_input()} | {error, term()}.
decode_update_now_playing_input(Value) -> rocksky_typed_codec:decode('update_now_playing_input', Value).
-spec encode_update_now_playing_input(update_now_playing_input()) -> map().
encode_update_now_playing_input(Value) -> rocksky_typed_codec:encode('update_now_playing_input', Value).

-spec decode_update_now_playing_output(map()) -> {ok, update_now_playing_output()} | {error, term()}.
decode_update_now_playing_output(Value) -> rocksky_typed_codec:decode('update_now_playing_output', Value).
-spec encode_update_now_playing_output(update_now_playing_output()) -> map().
encode_update_now_playing_output(Value) -> rocksky_typed_codec:encode('update_now_playing_output', Value).

-spec decode_update_seen_input(map()) -> {ok, update_seen_input()} | {error, term()}.
decode_update_seen_input(Value) -> rocksky_typed_codec:decode('update_seen_input', Value).
-spec encode_update_seen_input(update_seen_input()) -> map().
encode_update_seen_input(Value) -> rocksky_typed_codec:encode('update_seen_input', Value).

-spec decode_update_seen_output(map()) -> {ok, update_seen_output()} | {error, term()}.
decode_update_seen_output(Value) -> rocksky_typed_codec:decode('update_seen_output', Value).
-spec encode_update_seen_output(update_seen_output()) -> map().
encode_update_seen_output(Value) -> rocksky_typed_codec:encode('update_seen_output', Value).
