%% Ergonomic wrappers for the authenticated app.rocksky.library.* API (uploaded
%% music). Build a client once with new/1 (or new/2 to override the AppView URL)
%% and pass it to every call — the access token is bound in the client, not
%% repeated per call. Optional params go in an Opts map with camelCase binary
%% keys. Returns {ok, Value} | {error, Message}.
-module(rocksky_library).

-export([new/1, new/2, ping/1, get_license/1, get_music_folders/1, get_scan_status/1, start_scan/1, get_user/1, get_artists/1, get_indexes/1, get_artist/2, get_artist_info/2, get_album/2, get_album_list/2, get_album_list/3, get_album_info/2, get_song/2, get_random_songs/1, get_random_songs/2, get_songs_by_genre/2, get_songs_by_genre/3, get_similar_songs/2, get_similar_songs/3, get_top_songs/2, get_top_songs/3, get_lyrics/1, get_lyrics/2, get_music_directory/2, get_genres/1, search/2, search/3, get_starred/1, star/2, star/3, unstar/2, unstar/3, get_playlists/1, get_playlist/2, create_playlist/2, update_playlist/2, update_playlist/3, delete_playlist/2, delete_song/2, delete_album/2, scrobble/2, scrobble/3, update_now_playing/2, get_now_playing/1, get_play_queue/1, save_play_queue/1, save_play_queue/2, get_stream_url/2, get_stream_url/3, get_download_url/2, get_cover_art_url/2, get_cover_art_url/3, get_internet_radio_stations/1]).

%% Build a library client bound to a (required, non-empty) access token.
new(Token) -> new(Token, <<>>).
new(Token, Base) -> #{token => b(Token), base => b(Base)}.

lget(#{token := T, base := B}, Nsid, Params) ->
    rocksky:library_get(B, T, Nsid, Params).

lpost(#{token := T, base := B}, Nsid, Body) ->
    rocksky:library_post(B, T, Nsid, Body).

b(V) when is_binary(V) -> V;
b(V) when is_list(V) -> list_to_binary(V);
b(undefined) -> <<>>.

%% app.rocksky.library.ping
ping(Lib) ->
    lget(Lib, <<"app.rocksky.library.ping">>, #{}).

%% app.rocksky.library.getLicense
get_license(Lib) ->
    lget(Lib, <<"app.rocksky.library.getLicense">>, #{}).

%% app.rocksky.library.getMusicFolders
get_music_folders(Lib) ->
    lget(Lib, <<"app.rocksky.library.getMusicFolders">>, #{}).

%% app.rocksky.library.getScanStatus
get_scan_status(Lib) ->
    lget(Lib, <<"app.rocksky.library.getScanStatus">>, #{}).

%% app.rocksky.library.startScan
start_scan(Lib) ->
    lget(Lib, <<"app.rocksky.library.startScan">>, #{}).

%% app.rocksky.library.getUser
get_user(Lib) ->
    lget(Lib, <<"app.rocksky.library.getUser">>, #{}).

%% app.rocksky.library.getArtists
get_artists(Lib) ->
    lget(Lib, <<"app.rocksky.library.getArtists">>, #{}).

%% app.rocksky.library.getIndexes
get_indexes(Lib) ->
    lget(Lib, <<"app.rocksky.library.getIndexes">>, #{}).

%% app.rocksky.library.getArtist
get_artist(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getArtist">>, #{<<"id">> => Id}).

%% app.rocksky.library.getArtistInfo
get_artist_info(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getArtistInfo">>, #{<<"id">> => Id}).

%% app.rocksky.library.getAlbum
get_album(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getAlbum">>, #{<<"id">> => Id}).

%% app.rocksky.library.getAlbumList
get_album_list(Lib, Type) ->
    get_album_list(Lib, Type, #{}).
get_album_list(Lib, Type, Opts) ->
    lget(Lib, <<"app.rocksky.library.getAlbumList">>, maps:merge(#{<<"type">> => Type}, Opts)).

%% app.rocksky.library.getAlbumInfo
get_album_info(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getAlbumInfo">>, #{<<"id">> => Id}).

%% app.rocksky.library.getSong
get_song(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getSong">>, #{<<"id">> => Id}).

%% app.rocksky.library.getRandomSongs
get_random_songs(Lib) ->
    get_random_songs(Lib, #{}).
get_random_songs(Lib, Opts) ->
    lget(Lib, <<"app.rocksky.library.getRandomSongs">>, Opts).

%% app.rocksky.library.getSongsByGenre
get_songs_by_genre(Lib, Genre) ->
    get_songs_by_genre(Lib, Genre, #{}).
get_songs_by_genre(Lib, Genre, Opts) ->
    lget(Lib, <<"app.rocksky.library.getSongsByGenre">>, maps:merge(#{<<"genre">> => Genre}, Opts)).

%% app.rocksky.library.getSimilarSongs
get_similar_songs(Lib, Id) ->
    get_similar_songs(Lib, Id, #{}).
get_similar_songs(Lib, Id, Opts) ->
    lget(Lib, <<"app.rocksky.library.getSimilarSongs">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getTopSongs
get_top_songs(Lib, Artist) ->
    get_top_songs(Lib, Artist, #{}).
get_top_songs(Lib, Artist, Opts) ->
    lget(Lib, <<"app.rocksky.library.getTopSongs">>, maps:merge(#{<<"artist">> => Artist}, Opts)).

%% app.rocksky.library.getLyrics
get_lyrics(Lib) ->
    get_lyrics(Lib, #{}).
get_lyrics(Lib, Opts) ->
    lget(Lib, <<"app.rocksky.library.getLyrics">>, Opts).

%% app.rocksky.library.getMusicDirectory
get_music_directory(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getMusicDirectory">>, #{<<"id">> => Id}).

%% app.rocksky.library.getGenres
get_genres(Lib) ->
    lget(Lib, <<"app.rocksky.library.getGenres">>, #{}).

%% app.rocksky.library.search
search(Lib, Query) ->
    search(Lib, Query, #{}).
search(Lib, Query, Opts) ->
    lget(Lib, <<"app.rocksky.library.search">>, maps:merge(#{<<"query">> => Query}, Opts)).

%% app.rocksky.library.getStarred
get_starred(Lib) ->
    lget(Lib, <<"app.rocksky.library.getStarred">>, #{}).

%% app.rocksky.library.star
star(Lib, Id) ->
    star(Lib, Id, #{}).
star(Lib, Id, Opts) ->
    lpost(Lib, <<"app.rocksky.library.star">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.unstar
unstar(Lib, Id) ->
    unstar(Lib, Id, #{}).
unstar(Lib, Id, Opts) ->
    lpost(Lib, <<"app.rocksky.library.unstar">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getPlaylists
get_playlists(Lib) ->
    lget(Lib, <<"app.rocksky.library.getPlaylists">>, #{}).

%% app.rocksky.library.getPlaylist
get_playlist(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getPlaylist">>, #{<<"id">> => Id}).

%% app.rocksky.library.createPlaylist
create_playlist(Lib, Name) ->
    lpost(Lib, <<"app.rocksky.library.createPlaylist">>, #{<<"name">> => Name}).

%% app.rocksky.library.updatePlaylist
update_playlist(Lib, PlaylistId) ->
    update_playlist(Lib, PlaylistId, #{}).
update_playlist(Lib, PlaylistId, Opts) ->
    lpost(Lib, <<"app.rocksky.library.updatePlaylist">>, maps:merge(#{<<"playlistId">> => PlaylistId}, Opts)).

%% app.rocksky.library.deletePlaylist
delete_playlist(Lib, Id) ->
    lpost(Lib, <<"app.rocksky.library.deletePlaylist">>, #{<<"id">> => Id}).

%% app.rocksky.library.deleteSong
delete_song(Lib, Id) ->
    lpost(Lib, <<"app.rocksky.library.deleteSong">>, #{<<"id">> => Id}).

%% app.rocksky.library.deleteAlbum
delete_album(Lib, Id) ->
    lpost(Lib, <<"app.rocksky.library.deleteAlbum">>, #{<<"id">> => Id}).

%% app.rocksky.library.scrobble
scrobble(Lib, Id) ->
    scrobble(Lib, Id, #{}).
scrobble(Lib, Id, Opts) ->
    lpost(Lib, <<"app.rocksky.library.scrobble">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.updateNowPlaying
update_now_playing(Lib, Id) ->
    lpost(Lib, <<"app.rocksky.library.updateNowPlaying">>, #{<<"id">> => Id}).

%% app.rocksky.library.getNowPlaying
get_now_playing(Lib) ->
    lget(Lib, <<"app.rocksky.library.getNowPlaying">>, #{}).

%% app.rocksky.library.getPlayQueue
get_play_queue(Lib) ->
    lget(Lib, <<"app.rocksky.library.getPlayQueue">>, #{}).

%% app.rocksky.library.savePlayQueue
save_play_queue(Lib) ->
    save_play_queue(Lib, #{}).
save_play_queue(Lib, Opts) ->
    lpost(Lib, <<"app.rocksky.library.savePlayQueue">>, Opts).

%% app.rocksky.library.getStreamUrl
get_stream_url(Lib, Id) ->
    get_stream_url(Lib, Id, #{}).
get_stream_url(Lib, Id, Opts) ->
    lget(Lib, <<"app.rocksky.library.getStreamUrl">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getDownloadUrl
get_download_url(Lib, Id) ->
    lget(Lib, <<"app.rocksky.library.getDownloadUrl">>, #{<<"id">> => Id}).

%% app.rocksky.library.getCoverArtUrl
get_cover_art_url(Lib, Id) ->
    get_cover_art_url(Lib, Id, #{}).
get_cover_art_url(Lib, Id, Opts) ->
    lget(Lib, <<"app.rocksky.library.getCoverArtUrl">>, maps:merge(#{<<"id">> => Id}, Opts)).

%% app.rocksky.library.getInternetRadioStations
get_internet_radio_stations(Lib) ->
    lget(Lib, <<"app.rocksky.library.getInternetRadioStations">>, #{}).
