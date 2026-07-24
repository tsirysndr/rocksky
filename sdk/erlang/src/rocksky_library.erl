%% Ergonomic wrappers for the authenticated app.rocksky.library.* API (uploaded
%% music). Every function requires a non-empty Token (Bearer); string args are
%% binaries, optional params go in an Opts map with camelCase binary keys.
%% Returns {ok, Value} | {error, Message}.
-module(rocksky_library).

-export([ping/1, get_license/1, get_music_folders/1, get_scan_status/1, start_scan/1, get_user/1, get_artists/1, get_indexes/1, get_artist/2, get_artist_info/2, get_album/2, get_album_list/3, get_album_info/2, get_song/2, get_random_songs/2, get_songs_by_genre/3, get_similar_songs/3, get_top_songs/3, get_lyrics/2, get_music_directory/2, get_genres/1, search/3, get_starred/1, star/3, unstar/3, get_playlists/1, get_playlist/2, create_playlist/2, update_playlist/3, delete_playlist/2, delete_song/2, delete_album/2, scrobble/3, update_now_playing/2, get_now_playing/1, get_play_queue/1, save_play_queue/2, get_stream_url/3, get_download_url/2, get_cover_art_url/3, get_internet_radio_stations/1]).

%% app.rocksky.library.ping
ping(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.ping">>, #{}).

%% app.rocksky.library.getLicense
get_license(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getLicense">>, #{}).

%% app.rocksky.library.getMusicFolders
get_music_folders(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getMusicFolders">>, #{}).

%% app.rocksky.library.getScanStatus
get_scan_status(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getScanStatus">>, #{}).

%% app.rocksky.library.startScan
start_scan(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.startScan">>, #{}).

%% app.rocksky.library.getUser
get_user(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getUser">>, #{}).

%% app.rocksky.library.getArtists
get_artists(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getArtists">>, #{}).

%% app.rocksky.library.getIndexes
get_indexes(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getIndexes">>, #{}).

%% app.rocksky.library.getArtist
get_artist(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getArtist">>, #{<<"id">> => Id}).

%% app.rocksky.library.getArtistInfo
get_artist_info(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getArtistInfo">>, #{<<"id">> => Id}).

%% app.rocksky.library.getAlbum
get_album(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getAlbum">>, #{<<"id">> => Id}).

%% app.rocksky.library.getAlbumList
get_album_list(Token, Type, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getAlbumList">>, maps:merge(#{<<"type">> => Type}, Opts)).

%% app.rocksky.library.getAlbumInfo
get_album_info(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getAlbumInfo">>, #{<<"id">> => Id}).

%% app.rocksky.library.getSong
get_song(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getSong">>, #{<<"id">> => Id}).

%% app.rocksky.library.getRandomSongs
get_random_songs(Token, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getRandomSongs">>, Opts).

%% app.rocksky.library.getSongsByGenre
get_songs_by_genre(Token, Genre, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getSongsByGenre">>, maps:merge(#{<<"genre">> => Genre}, Opts)).

%% app.rocksky.library.getSimilarSongs
get_similar_songs(Token, Id, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getSimilarSongs">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getTopSongs
get_top_songs(Token, Artist, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getTopSongs">>, maps:merge(#{<<"artist">> => Artist}, Opts)).

%% app.rocksky.library.getLyrics
get_lyrics(Token, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getLyrics">>, Opts).

%% app.rocksky.library.getMusicDirectory
get_music_directory(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getMusicDirectory">>, #{<<"id">> => Id}).

%% app.rocksky.library.getGenres
get_genres(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getGenres">>, #{}).

%% app.rocksky.library.search
search(Token, Query, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.search">>, maps:merge(#{<<"query">> => Query}, Opts)).

%% app.rocksky.library.getStarred
get_starred(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getStarred">>, #{}).

%% app.rocksky.library.star
star(Token, Id, Opts) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.star">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.unstar
unstar(Token, Id, Opts) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.unstar">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getPlaylists
get_playlists(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getPlaylists">>, #{}).

%% app.rocksky.library.getPlaylist
get_playlist(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getPlaylist">>, #{<<"id">> => Id}).

%% app.rocksky.library.createPlaylist
create_playlist(Token, Name) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.createPlaylist">>, #{<<"name">> => Name}).

%% app.rocksky.library.updatePlaylist
update_playlist(Token, PlaylistId, Opts) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.updatePlaylist">>, maps:merge(#{<<"playlistId">> => PlaylistId}, Opts)).

%% app.rocksky.library.deletePlaylist
delete_playlist(Token, Id) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.deletePlaylist">>, #{<<"id">> => Id}).

%% app.rocksky.library.deleteSong
delete_song(Token, Id) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.deleteSong">>, #{<<"id">> => Id}).

%% app.rocksky.library.deleteAlbum
delete_album(Token, Id) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.deleteAlbum">>, #{<<"id">> => Id}).

%% app.rocksky.library.scrobble
scrobble(Token, Id, Opts) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.scrobble">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.updateNowPlaying
update_now_playing(Token, Id) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.updateNowPlaying">>, #{<<"id">> => Id}).

%% app.rocksky.library.getNowPlaying
get_now_playing(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getNowPlaying">>, #{}).

%% app.rocksky.library.getPlayQueue
get_play_queue(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getPlayQueue">>, #{}).

%% app.rocksky.library.savePlayQueue
save_play_queue(Token, Opts) ->
    rocksky:library_post(<<>>, Token, <<"app.rocksky.library.savePlayQueue">>, Opts).

%% app.rocksky.library.getStreamUrl
get_stream_url(Token, Id, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getStreamUrl">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getDownloadUrl
get_download_url(Token, Id) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getDownloadUrl">>, #{<<"id">> => Id}).

%% app.rocksky.library.getCoverArtUrl
get_cover_art_url(Token, Id, Opts) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getCoverArtUrl">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getInternetRadioStations
get_internet_radio_stations(Token) ->
    rocksky:library_get(<<>>, Token, <<"app.rocksky.library.getInternetRadioStations">>, #{}).
