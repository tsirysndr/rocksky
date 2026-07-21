%% Raw NIF module: loads the Rustler-built native library and declares the NIF
%% stubs. Each function is replaced by the native implementation on load; the
%% Erlang bodies only run if loading failed. Reads/writes return JSON binaries
%% ({"ok"|"error"} envelopes); the identity hashes return the hex binary directly.
%%
%% Prefer the friendly `rocksky` module over calling these directly.
-module(rocksky_nif).

-export([profile/2, scrobbles/4, songs/4, albums/4, artists/4, feed/4,
         search/2, top_artists/3, top_tracks/3, global_stats/1,
         song_hash/3, album_hash/2, artist_hash/1,
         agent_login/5, agent_did/1, agent_refresh_session/1, agent_scrobble/2,
         agent_create_song/2, agent_create_album/2, agent_create_artist/2,
         agent_like/3, agent_unlike/2, agent_follow/2, agent_unfollow/2,
         agent_shout/4, agent_reply_shout/6, agent_set_now_playing/2,
         agent_clear_now_playing/1]).

-on_load(init/0).

init() ->
    erlang:load_nif(filename:join(nif_dir(), "rocksky_nif"), 0).

%% Directory holding rocksky_nif.so — the app's priv when installed, or ../priv
%% relative to the .beam for a raw monorepo build. Override with $ROCKSKY_NIF_DIR.
nif_dir() ->
    case os:getenv("ROCKSKY_NIF_DIR") of
        false ->
            case code:priv_dir(rocksky_erl) of
                {error, _} ->
                    case code:which(?MODULE) of
                        Beam when is_list(Beam) ->
                            filename:join([filename:dirname(Beam), "..", "priv"]);
                        _ ->
                            "priv"
                    end;
                Dir ->
                    Dir
            end;
        Env ->
            Env
    end.

-define(NOT_LOADED, erlang:nif_error(rocksky_nif_not_loaded)).

profile(_Base, _Actor) -> ?NOT_LOADED.
scrobbles(_Base, _Actor, _Limit, _Offset) -> ?NOT_LOADED.
songs(_Base, _Actor, _Limit, _Offset) -> ?NOT_LOADED.
albums(_Base, _Actor, _Limit, _Offset) -> ?NOT_LOADED.
artists(_Base, _Actor, _Limit, _Offset) -> ?NOT_LOADED.
feed(_Base, _Feed, _Limit, _Cursor) -> ?NOT_LOADED.
search(_Base, _Query) -> ?NOT_LOADED.
top_artists(_Base, _Limit, _Offset) -> ?NOT_LOADED.
top_tracks(_Base, _Limit, _Offset) -> ?NOT_LOADED.
global_stats(_Base) -> ?NOT_LOADED.
song_hash(_Title, _Artist, _Album) -> ?NOT_LOADED.
album_hash(_Album, _AlbumArtist) -> ?NOT_LOADED.
artist_hash(_AlbumArtist) -> ?NOT_LOADED.
agent_login(_Session, _Id, _Pw, _AppView, _DedupPath) -> ?NOT_LOADED.
agent_did(_Agent) -> ?NOT_LOADED.
agent_refresh_session(_Agent) -> ?NOT_LOADED.
agent_scrobble(_Agent, _Json) -> ?NOT_LOADED.
agent_create_song(_Agent, _Json) -> ?NOT_LOADED.
agent_create_album(_Agent, _Json) -> ?NOT_LOADED.
agent_create_artist(_Agent, _Json) -> ?NOT_LOADED.
agent_like(_Agent, _Uri, _Cid) -> ?NOT_LOADED.
agent_unlike(_Agent, _Uri) -> ?NOT_LOADED.
agent_follow(_Agent, _Did) -> ?NOT_LOADED.
agent_unfollow(_Agent, _Did) -> ?NOT_LOADED.
agent_shout(_Agent, _SubjectUri, _SubjectCid, _Message) -> ?NOT_LOADED.
agent_reply_shout(_Agent, _SubjectUri, _SubjectCid, _ParentUri, _ParentCid, _Message) -> ?NOT_LOADED.
agent_set_now_playing(_Agent, _Json) -> ?NOT_LOADED.
agent_clear_now_playing(_Agent) -> ?NOT_LOADED.
