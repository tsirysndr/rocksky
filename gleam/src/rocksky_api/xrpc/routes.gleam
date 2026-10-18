//// Registers every XRPC method. One line per method module.

import rocksky_api/xrpc/app/rocksky/feed/get_album_recommendations
import rocksky_api/xrpc/app/rocksky/feed/get_recommendations

import rocksky_api/xrpc/app/rocksky/feed/get_artist_recommendations

import rocksky_api/xrpc/app/rocksky/song/create_song

import rocksky_api/xrpc/app/rocksky/feed/get_stories

import rocksky_api/xrpc/app/rocksky/feed/get_feed

import rocksky_api/xrpc/app/rocksky/actor/get_actor_compatibility
import rocksky_api/xrpc/app/rocksky/actor/get_actor_neighbours
import rocksky_api/xrpc/app/rocksky/library/create_playlist as library_create_playlist
import rocksky_api/xrpc/app/rocksky/library/delete_album as library_delete_album
import rocksky_api/xrpc/app/rocksky/library/delete_playlist as library_delete_playlist
import rocksky_api/xrpc/app/rocksky/library/delete_song as library_delete_song
import rocksky_api/xrpc/app/rocksky/library/update_playlist as library_update_playlist
import rocksky_api/xrpc/app/rocksky/stats/get_wrapped

import rocksky_api/xrpc/app/rocksky/apikey/create_apikey as apikey_create_apikey
import rocksky_api/xrpc/app/rocksky/apikey/get_apikeys as apikey_get_apikeys
import rocksky_api/xrpc/app/rocksky/apikey/remove_apikey as apikey_remove_apikey
import rocksky_api/xrpc/app/rocksky/apikey/update_apikey as apikey_update_apikey
import rocksky_api/xrpc/app/rocksky/feed/search as feed_search
import rocksky_api/xrpc/app/rocksky/player/add_items_to_queue
import rocksky_api/xrpc/app/rocksky/player/get_currently_playing as player_get_currently_playing
import rocksky_api/xrpc/app/rocksky/player/get_playback_queue as player_get_playback_queue
import rocksky_api/xrpc/app/rocksky/player/next as player_next
import rocksky_api/xrpc/app/rocksky/player/pause as player_pause
import rocksky_api/xrpc/app/rocksky/player/play as player_play
import rocksky_api/xrpc/app/rocksky/player/play_directory as player_play_directory
import rocksky_api/xrpc/app/rocksky/player/play_file as player_play_file
import rocksky_api/xrpc/app/rocksky/player/previous as player_previous
import rocksky_api/xrpc/app/rocksky/player/seek as player_seek
import rocksky_api/xrpc/app/rocksky/playlist/insert_directory as playlist_insert_directory
import rocksky_api/xrpc/app/rocksky/playlist/insert_files as playlist_insert_files
import rocksky_api/xrpc/app/rocksky/playlist/start_playlist as playlist_start_playlist

import rocksky_api/xrpc/app/rocksky/like/dislike_song
import rocksky_api/xrpc/app/rocksky/like/like_song
import rocksky_api/xrpc/app/rocksky/scrobble/create_scrobble
import rocksky_api/xrpc/app/rocksky/song/match_song

import rocksky_api/xrpc/app/rocksky/charts/get_top_scrobblers
import rocksky_api/xrpc/app/rocksky/like/dislike_shout
import rocksky_api/xrpc/app/rocksky/like/like_shout
import rocksky_api/xrpc/app/rocksky/playlist/add_songs
import rocksky_api/xrpc/app/rocksky/playlist/create_playlist
import rocksky_api/xrpc/app/rocksky/playlist/remove_playlist
import rocksky_api/xrpc/app/rocksky/playlist/remove_track
import rocksky_api/xrpc/app/rocksky/playlist/update_playlist
import rocksky_api/xrpc/app/rocksky/shout/create_shout
import rocksky_api/xrpc/app/rocksky/shout/get_album_shouts
import rocksky_api/xrpc/app/rocksky/shout/get_artist_shouts
import rocksky_api/xrpc/app/rocksky/shout/get_profile_shouts
import rocksky_api/xrpc/app/rocksky/shout/get_shout_replies
import rocksky_api/xrpc/app/rocksky/shout/get_track_shouts
import rocksky_api/xrpc/app/rocksky/shout/remove_shout
import rocksky_api/xrpc/app/rocksky/shout/reply_shout
import rocksky_api/xrpc/app/rocksky/shout/report_shout
import rocksky_api/xrpc/app/rocksky/spotify/get_currently_playing as spotify_current
import rocksky_api/xrpc/app/rocksky/spotify/next as spotify_next
import rocksky_api/xrpc/app/rocksky/spotify/pause as spotify_pause
import rocksky_api/xrpc/app/rocksky/spotify/play as spotify_play
import rocksky_api/xrpc/app/rocksky/spotify/previous as spotify_previous
import rocksky_api/xrpc/app/rocksky/spotify/seek as spotify_seek

import rocksky_api/xrpc/app/rocksky/actor/get_actor_albums
import rocksky_api/xrpc/app/rocksky/actor/get_actor_artists
import rocksky_api/xrpc/app/rocksky/actor/get_actor_loved_songs
import rocksky_api/xrpc/app/rocksky/actor/get_actor_playlists
import rocksky_api/xrpc/app/rocksky/actor/get_actor_scrobbles
import rocksky_api/xrpc/app/rocksky/actor/get_actor_songs
import rocksky_api/xrpc/app/rocksky/actor/get_profile
import rocksky_api/xrpc/app/rocksky/album/get_albums
import rocksky_api/xrpc/app/rocksky/artist/get_artist_events
import rocksky_api/xrpc/app/rocksky/artist/get_artist_listeners
import rocksky_api/xrpc/app/rocksky/artist/get_artists
import rocksky_api/xrpc/app/rocksky/charts/get_decades
import rocksky_api/xrpc/app/rocksky/charts/get_scrobbles_chart
import rocksky_api/xrpc/app/rocksky/charts/get_top_artists
import rocksky_api/xrpc/app/rocksky/charts/get_top_tracks
import rocksky_api/xrpc/app/rocksky/event/get_event
import rocksky_api/xrpc/app/rocksky/event/get_event_rsvps
import rocksky_api/xrpc/app/rocksky/event/get_events
import rocksky_api/xrpc/app/rocksky/event/put_rsvp
import rocksky_api/xrpc/app/rocksky/feed/get_feed_generator
import rocksky_api/xrpc/app/rocksky/feed/get_feed_generators
import rocksky_api/xrpc/app/rocksky/playlist/get_playlist
import rocksky_api/xrpc/app/rocksky/playlist/get_playlists
import rocksky_api/xrpc/app/rocksky/scrobble/get_scrobbles
import rocksky_api/xrpc/app/rocksky/stats/get_global_stats
import rocksky_api/xrpc/app/rocksky/stats/get_stats

import rocksky_api/context.{type Context}
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/xrpc/app/rocksky/scrobble/get_scrobble

import rocksky_api/xrpc/app/rocksky/song/get_song

import rocksky_api/xrpc/app/rocksky/rockbox/get_audio_settings

import rocksky_api/xrpc/app/rocksky/rockbox/put_audio_settings

import rocksky_api/xrpc/app/rocksky/equalizer/delete_preset

import rocksky_api/xrpc/app/rocksky/equalizer/put_preset

import rocksky_api/xrpc/app/rocksky/equalizer/list_presets

import rocksky_api/xrpc/app/rocksky/song/get_song_recent_listeners

import rocksky_api/xrpc/app/rocksky/artist/get_artist_recent_listeners

import rocksky_api/xrpc/app/rocksky/notification/get_unread_count

import rocksky_api/xrpc/app/rocksky/notification/update_seen

import rocksky_api/xrpc/app/rocksky/notification/list_notifications

import rocksky_api/xrpc/app/rocksky/mirror/get_mirror_sources

import rocksky_api/xrpc/app/rocksky/mirror/put_mirror_source

import rocksky_api/xrpc/app/rocksky/song/get_songs

import rocksky_api/xrpc/app/rocksky/album/get_album

import rocksky_api/xrpc/app/rocksky/album/get_album_tracks

import rocksky_api/xrpc/app/rocksky/artist/get_artist

import rocksky_api/xrpc/app/rocksky/library/routes as library

import rocksky_api/xrpc/app/rocksky/graph/get_followers

import rocksky_api/xrpc/app/rocksky/graph/get_follows

import rocksky_api/xrpc/app/rocksky/graph/get_known_followers

import rocksky_api/xrpc/app/rocksky/graph/follow_account

import rocksky_api/xrpc/app/rocksky/graph/unfollow_account

import rocksky_api/xrpc/app/rocksky/artist/get_artist_albums

import rocksky_api/xrpc/app/rocksky/artist/get_artist_tracks

pub fn register(server: Server, ctx: Context) -> Server {
  get_scrobble.register(server, ctx)
  get_song.register(server, ctx)
  get_audio_settings.register(server, ctx)
  put_audio_settings.register(server, ctx)
  delete_preset.register(server, ctx)
  put_preset.register(server, ctx)
  list_presets.register(server, ctx)
  get_song_recent_listeners.register(server, ctx)
  get_artist_recent_listeners.register(server, ctx)
  get_unread_count.register(server, ctx)
  update_seen.register(server, ctx)
  list_notifications.register(server, ctx)
  get_mirror_sources.register(server, ctx)
  put_mirror_source.register(server, ctx)
  get_songs.register(server, ctx)
  get_album.register(server, ctx)
  get_album_tracks.register(server, ctx)
  get_artist.register(server, ctx)
  library.register(server, ctx)
  get_followers.register(server, ctx)
  get_follows.register(server, ctx)
  get_known_followers.register(server, ctx)
  follow_account.register(server, ctx)
  unfollow_account.register(server, ctx)
  get_artist_albums.register(server, ctx)
  get_artist_tracks.register(server, ctx)
  get_global_stats.register(server, ctx)
  get_artist_listeners.register(server, ctx)
  get_decades.register(server, ctx)
  get_top_artists.register(server, ctx)
  get_top_tracks.register(server, ctx)
  get_artists.register(server, ctx)
  get_albums.register(server, ctx)
  get_actor_loved_songs.register(server, ctx)
  get_actor_scrobbles.register(server, ctx)
  get_actor_songs.register(server, ctx)
  get_actor_albums.register(server, ctx)
  get_actor_artists.register(server, ctx)
  get_playlists.register(server, ctx)
  get_actor_playlists.register(server, ctx)
  get_playlist.register(server, ctx)
  get_stories.register(server, ctx)
  get_feed.register(server, ctx)
  get_feed_generator.register(server, ctx)
  get_feed_generators.register(server, ctx)
  get_event.register(server, ctx)
  get_events.register(server, ctx)
  get_event_rsvps.register(server, ctx)
  get_artist_events.register(server, ctx)
  put_rsvp.register(server, ctx)
  get_stats.register(server, ctx)
  get_wrapped.register(server, ctx)
  get_scrobbles.register(server, ctx)
  get_scrobbles_chart.register(server, ctx)
  get_profile.register(server, ctx)
  get_album_shouts.register(server, ctx)
  get_artist_shouts.register(server, ctx)
  get_track_shouts.register(server, ctx)
  get_profile_shouts.register(server, ctx)
  get_shout_replies.register(server, ctx)
  report_shout.register(server, ctx)
  get_top_scrobblers.register(server, ctx)
  spotify_play.register(server, ctx)
  spotify_pause.register(server, ctx)
  spotify_next.register(server, ctx)
  spotify_previous.register(server, ctx)
  spotify_seek.register(server, ctx)
  spotify_current.register(server, ctx)
  create_shout.register(server, ctx)
  reply_shout.register(server, ctx)
  remove_shout.register(server, ctx)
  like_shout.register(server, ctx)
  dislike_shout.register(server, ctx)
  create_playlist.register(server, ctx)
  update_playlist.register(server, ctx)
  add_songs.register(server, ctx)
  remove_playlist.register(server, ctx)
  remove_track.register(server, ctx)
  create_scrobble.register(server, ctx)
  like_song.register(server, ctx)
  dislike_song.register(server, ctx)
  match_song.register(server, ctx)
  create_song.register(server, ctx)
  library_create_playlist.register(server, ctx)
  library_update_playlist.register(server, ctx)
  library_delete_playlist.register(server, ctx)
  library_delete_album.register(server, ctx)
  library_delete_song.register(server, ctx)
  get_actor_compatibility.register(server, ctx)
  get_actor_neighbours.register(server, ctx)
  feed_search.register(server, ctx)
  apikey_create_apikey.register(server, ctx)
  apikey_get_apikeys.register(server, ctx)
  apikey_remove_apikey.register(server, ctx)
  apikey_update_apikey.register(server, ctx)
  player_play.register(server, ctx)
  player_pause.register(server, ctx)
  player_next.register(server, ctx)
  player_previous.register(server, ctx)
  player_seek.register(server, ctx)
  player_get_currently_playing.register(server, ctx)
  player_get_playback_queue.register(server, ctx)
  player_play_file.register(server, ctx)
  player_play_directory.register(server, ctx)
  playlist_insert_files.register(server, ctx)
  playlist_insert_directory.register(server, ctx)
  playlist_start_playlist.register(server, ctx)
  add_items_to_queue.register(server, ctx)
  get_album_recommendations.register(server, ctx)
  get_recommendations.register(server, ctx)
  get_artist_recommendations.register(server, ctx)
  server
}
