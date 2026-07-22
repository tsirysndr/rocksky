%% Raw NIF module: loads the Rustler-built native library and declares the NIF
%% stubs. Each function is replaced by the native implementation on load; the
%% Erlang bodies only run if loading failed. Reads/writes return JSON binaries
%% ({"ok"|"error"} envelopes); the identity hashes return the hex binary directly.
%%
%% Prefer the friendly `rocksky` module over calling these directly.
-module(rocksky_nif).

-export([profile/2, scrobbles/4, songs/4, albums/4, artists/4, feed/4,
         search/2, top_artists/3, top_tracks/3, global_stats/1,
         get/4, match_song/5, top_tracks_interval/7, top_artists_interval/7,
         loved_songs/4, catalog_albums/4, catalog_artists/4, catalog_songs/4,
         album_tracks/2, artist_albums/2, artist_tracks/4, scrobble_feed/5,
         scrobble/2, follows/4, followers/4, known_followers/4, album/2,
         artist/2, song/5, actor_playlists/4, neighbours/2, compatibility/2,
         artist_listeners/4, artist_recent_listeners/4, song_recent_listeners/4,
         scrobbles_chart/8, feed_generators/2, feed_generator/2, stories/4,
         recommendations/3, artist_recommendations/3, album_recommendations/3,
         stats/2, wrapped/3, mirror_sources/1, currently_playing/3,
         playback_queue/2, spotify_currently_playing/2, playlists/3, playlist/2,
         album_shouts/4, artist_shouts/4, profile_shouts/4, track_shouts/2,
         shout_replies/4, audio_settings/2, apikeys/3,
         song_hash/3, album_hash/2, artist_hash/1,
         agent_login/5, agent_did/1, agent_refresh_session/1, agent_scrobble/2,
         agent_scrobble_match/6, agent_sync_repo/1, agent_hydrate_from_jetstream/1,
         agent_create_song/2, agent_create_album/2, agent_create_artist/2,
         agent_like/3, agent_unlike/2, agent_follow/2, agent_unfollow/2,
         agent_shout/4, agent_reply_shout/6, agent_set_now_playing/2,
         agent_clear_now_playing/1]).

-on_load(init/0).

init() ->
    Base = filename:join(nif_dir(), "rocksky_nif"),
    SoPath =
        case target_triple() of
            undefined -> Base;
            Target -> resolve_nif(Base, Target)
        end,
    erlang:load_nif(SoPath, 0).

%% Resolve the extension-less path handed to load_nif (which appends the OS
%% suffix). Order of preference:
%%   1. priv/rocksky_nif-<triple>.so  — a CI-built, per-triple artifact
%%   2. priv/rocksky_nif.so           — a local `./build-core.sh` dev build
%%   3. a checksum-verified copy in the user cache, downloaded on first use
%%      (the Hex path — the .so is too large to bundle in the 8 MB tarball).
resolve_nif(Base, Target) ->
    Suffixed = Base ++ "-" ++ Target,
    case filelib:is_regular(Suffixed ++ ".so") of
        true ->
            Suffixed;
        false ->
            case filelib:is_regular(Base ++ ".so") of
                true ->
                    Base;
                false ->
                    case ensure_cached(Target) of
                        {ok, Path} -> Path;
                        {error, _} -> Base   %% load_nif fails -> stubs raise
                    end
            end
    end.

%% Directory holding the NIF .so — the app's priv when installed, or ../priv
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

%% Canonical target triple matching the priv/rocksky_nif-<triple>.so release
%% asset names. `undefined` on a platform we don't ship a prebuilt for.
target_triple() ->
    Arch = normalize_arch(hd(string:lexemes(
        erlang:system_info(system_architecture), "-"))),
    case os:type() of
        {unix, darwin} -> Arch ++ "-apple-darwin";
        {unix, linux} -> Arch ++ "-linux-gnu";
        {unix, freebsd} -> Arch ++ "-unknown-freebsd";
        {unix, netbsd} -> Arch ++ "-unknown-netbsd";
        {unix, openbsd} -> Arch ++ "-unknown-openbsd";
        _ -> undefined
    end.

normalize_arch("amd64") -> "x86_64";
normalize_arch("arm64") -> "aarch64";
normalize_arch(Arch) -> Arch.

%% --- First-use NIF download (the Hex path) ------------------------------------
%% The Hex package ships priv/rocksky_nif.manifest (repo, release tag and one
%% sha256 per target triple) instead of the multi-megabyte .so files. On first
%% load the matching NIF is fetched from the GitHub release into the user cache
%% dir, verified against the manifest checksum, and reused thereafter.
ensure_cached(Target) ->
    case read_manifest() of
        {error, R} ->
            {error, R};
        {ok, Terms} ->
            case {manifest_tag(Terms), manifest_checksum(Terms, Target)} of
                {undefined, _} -> {error, no_tag};
                {_, undefined} -> {error, {no_checksum, Target}};
                {Tag, Sha} ->
                    Repo = manifest_repo(Terms),
                    File = "rocksky_nif-" ++ Target ++ ".so",
                    Dir = filename:join(cache_root(), Tag),
                    Dest = filename:join(Dir, File),
                    ExtLess = filename:join(Dir, "rocksky_nif-" ++ Target),
                    case filelib:is_regular(Dest) of
                        true ->
                            {ok, ExtLess};
                        false ->
                            Url = "https://github.com/" ++ Repo ++
                                  "/releases/download/" ++ Tag ++ "/" ++ File,
                            case fetch_verify_write(Url, Dest, Dir, Sha) of
                                ok -> {ok, ExtLess};
                                {error, R} -> {error, R}
                            end
                    end
            end
    end.

read_manifest() ->
    file:consult(filename:join(nif_dir(), "rocksky_nif.manifest")).

manifest_tag(Terms) ->
    case lists:keyfind(tag, 1, Terms) of {tag, V} -> V; false -> undefined end.

manifest_repo(Terms) ->
    case lists:keyfind(repo, 1, Terms) of
        {repo, V} -> V;
        false -> "tsirysndr/rocksky"
    end.

manifest_checksum(Terms, Target) ->
    case [S || {checksum, T, S} <- Terms, T =:= Target] of
        [Sha | _] -> Sha;
        [] -> undefined
    end.

cache_root() ->
    filename:basedir(user_cache, "rocksky").

fetch_verify_write(Url, Dest, Dir, Sha) ->
    _ = application:ensure_all_started(crypto),
    _ = application:ensure_all_started(inets),
    _ = application:ensure_all_started(ssl),
    HttpOpts = [{timeout, 120000}, {connect_timeout, 15000},
                {autoredirect, true}, {ssl, tls_opts()}],
    Req = {Url, [{"user-agent", "rocksky-erlang"}]},
    case httpc:request(get, Req, HttpOpts, [{body_format, binary}]) of
        {ok, {{_, 200, _}, _Hdrs, Body}} ->
            case sha256_hex(Body) of
                Sha ->
                    ok = filelib:ensure_dir(filename:join(Dir, "keep")),
                    Tmp = Dest ++ ".download",
                    case file:write_file(Tmp, Body) of
                        ok ->
                            _ = file:change_mode(Tmp, 8#755),
                            file:rename(Tmp, Dest);
                        {error, R} -> {error, R}
                    end;
                Got ->
                    {error, {checksum_mismatch, [{want, Sha}, {got, Got}]}}
            end;
        {ok, {{_, Code, _}, _, _}} -> {error, {http_status, Code}};
        {error, R} -> {error, R}
    end.

%% Verify the TLS chain when the platform exposes the OS trust store (OTP 25+),
%% else skip peer verification — payload integrity is guaranteed by the sha256
%% check regardless, since the checksum ships inside the signed Hex tarball.
tls_opts() ->
    try public_key:cacerts_get() of
        Certs ->
            [{verify, verify_peer}, {depth, 99}, {cacerts, Certs},
             {customize_hostname_check,
              [{match_fun, public_key:pkix_verify_hostname_match_fun(https)}]}]
    catch
        _:_ -> [{verify, verify_none}]
    end.

sha256_hex(Bin) ->
    lists:flatten([io_lib:format("~2.16.0b", [B])
                   || <<B>> <= crypto:hash(sha256, Bin)]).

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
get(_Base, _Nsid, _ParamsJson, _Token) -> ?NOT_LOADED.
match_song(_Base, _Title, _Artist, _MbId, _Isrc) -> ?NOT_LOADED.
top_tracks_interval(_Base, _Limit, _Offset, _Unit, _N, _Start, _End) -> ?NOT_LOADED.
top_artists_interval(_Base, _Limit, _Offset, _Unit, _N, _Start, _End) -> ?NOT_LOADED.
loved_songs(_Base, _Did, _Limit, _Offset) -> ?NOT_LOADED.
catalog_albums(_Base, _Limit, _Offset, _Genre) -> ?NOT_LOADED.
catalog_artists(_Base, _Limit, _Offset, _Genre) -> ?NOT_LOADED.
catalog_songs(_Base, _Limit, _Offset, _Genre) -> ?NOT_LOADED.
album_tracks(_Base, _Uri) -> ?NOT_LOADED.
artist_albums(_Base, _Uri) -> ?NOT_LOADED.
artist_tracks(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
scrobble_feed(_Base, _Did, _Following, _Limit, _Offset) -> ?NOT_LOADED.
scrobble(_Base, _Uri) -> ?NOT_LOADED.
follows(_Base, _Actor, _Limit, _Cursor) -> ?NOT_LOADED.
followers(_Base, _Actor, _Limit, _Cursor) -> ?NOT_LOADED.
known_followers(_Base, _Actor, _Limit, _Cursor) -> ?NOT_LOADED.
album(_Base, _Uri) -> ?NOT_LOADED.
artist(_Base, _Uri) -> ?NOT_LOADED.
song(_Base, _Uri, _MbId, _Isrc, _SpotifyId) -> ?NOT_LOADED.
actor_playlists(_Base, _Did, _Limit, _Offset) -> ?NOT_LOADED.
neighbours(_Base, _Did) -> ?NOT_LOADED.
compatibility(_Base, _Did) -> ?NOT_LOADED.
artist_listeners(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
artist_recent_listeners(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
song_recent_listeners(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
scrobbles_chart(_Base, _Did, _ArtistUri, _AlbumUri, _SongUri, _Genre, _From, _To) -> ?NOT_LOADED.
feed_generators(_Base, _Size) -> ?NOT_LOADED.
feed_generator(_Base, _Feed) -> ?NOT_LOADED.
stories(_Base, _Size, _Feed, _Following) -> ?NOT_LOADED.
recommendations(_Base, _Did, _Limit) -> ?NOT_LOADED.
artist_recommendations(_Base, _Did, _Limit) -> ?NOT_LOADED.
album_recommendations(_Base, _Did, _Limit) -> ?NOT_LOADED.
stats(_Base, _Did) -> ?NOT_LOADED.
wrapped(_Base, _Did, _Year) -> ?NOT_LOADED.
mirror_sources(_Base) -> ?NOT_LOADED.
currently_playing(_Base, _PlayerId, _Actor) -> ?NOT_LOADED.
playback_queue(_Base, _PlayerId) -> ?NOT_LOADED.
spotify_currently_playing(_Base, _Actor) -> ?NOT_LOADED.
playlists(_Base, _Limit, _Offset) -> ?NOT_LOADED.
playlist(_Base, _Uri) -> ?NOT_LOADED.
album_shouts(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
artist_shouts(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
profile_shouts(_Base, _Did, _Limit, _Offset) -> ?NOT_LOADED.
track_shouts(_Base, _Uri) -> ?NOT_LOADED.
shout_replies(_Base, _Uri, _Limit, _Offset) -> ?NOT_LOADED.
audio_settings(_Base, _Did) -> ?NOT_LOADED.
apikeys(_Base, _Limit, _Offset) -> ?NOT_LOADED.
song_hash(_Title, _Artist, _Album) -> ?NOT_LOADED.
album_hash(_Album, _AlbumArtist) -> ?NOT_LOADED.
artist_hash(_AlbumArtist) -> ?NOT_LOADED.
agent_login(_Session, _Id, _Pw, _AppView, _DedupPath) -> ?NOT_LOADED.
agent_did(_Agent) -> ?NOT_LOADED.
agent_refresh_session(_Agent) -> ?NOT_LOADED.
agent_scrobble(_Agent, _Json) -> ?NOT_LOADED.
agent_scrobble_match(_Agent, _Title, _Artist, _Album, _MbId, _Isrc) -> ?NOT_LOADED.
agent_sync_repo(_Agent) -> ?NOT_LOADED.
agent_hydrate_from_jetstream(_Agent) -> ?NOT_LOADED.
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
