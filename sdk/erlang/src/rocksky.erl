%% Official Erlang SDK for Rocksky — a friendly wrapper over the Rustler NIF
%% (`rocksky_nif`) that binds the shared Rust core (rocksky-sdk). AppView reads,
%% record writes (scrobble fan-out, like/follow/shout), and the identity hashes
%% shared across every Rocksky SDK.
%%
%% Reads/writes return `{ok, Value}` | `{error, Message}` (decoded from the NIF's
%% JSON envelope). Records are passed as maps with camelCase binary keys, e.g.
%% #{<<"title">> => <<"Chaser">>, <<"artist">> => <<"Calibro 35">>, ...}.
-module(rocksky).

-export([profile/1, profile/2, scrobbles/2, scrobbles/4, top_tracks/0,
         top_tracks/2, top_tracks/3, global_stats/0, global_stats/1,
         get/2, get/3, get/4, get_raw/4, match_song/2, match_song/5,
         top_tracks_interval/3, top_tracks_interval/4, top_tracks_interval_raw/7,
         top_artists_interval/3, top_artists_interval/4, top_artists_interval_raw/7,
         song_hash/3, album_hash/2, artist_hash/1,
         agent_login/3, agent_login/4, agent_login/5, agent_scrobble/2,
         agent_scrobble_match/2, agent_scrobble_match/7, agent_sync_repo/1,
         agent_hydrate_from_jetstream/1, agent_like/3,
         agent_follow/2, agent_shout/4, agent_refresh_session/1]).

%% Decode a NIF JSON-envelope binary into {ok, Value} | {error, Message}.
unwrap(Bin) ->
    case json:decode(Bin) of
        #{<<"error">> := Msg} -> {error, Msg};
        #{<<"ok">> := Value} -> {ok, Value};
        Other -> {ok, Other}
    end.

b(V) when is_binary(V) -> V;
b(V) when is_list(V) -> list_to_binary(V);
b(undefined) -> <<>>.

%% ---- reads (unauthenticated) ----

profile(Actor) -> profile(Actor, <<>>).
profile(Actor, Base) -> unwrap(rocksky_nif:profile(b(Base), b(Actor))).

scrobbles(Actor, Limit) -> scrobbles(Actor, Limit, 0, <<>>).
scrobbles(Actor, Limit, Offset, Base) ->
    unwrap(rocksky_nif:scrobbles(b(Base), b(Actor), Limit, Offset)).

top_tracks() -> top_tracks(50, 0).
top_tracks(Limit, Offset) -> top_tracks(Limit, Offset, <<>>).
%% `Base` overrides the AppView URL (default when empty).
top_tracks(Limit, Offset, Base) -> unwrap(rocksky_nif:top_tracks(b(Base), Limit, Offset)).

global_stats() -> global_stats(<<>>).
global_stats(Base) -> unwrap(rocksky_nif:global_stats(b(Base))).

%% Universal read escape hatch — call any app.rocksky.* query by nsid. `Params`
%% is a map of string params (e.g. #{<<"did">> => Did, <<"limit">> => 20}); the
%% whole read-query catalog is reachable here.
get(Nsid, Params) -> get(Nsid, Params, <<>>, <<>>).
get(Nsid, Params, Base) -> get(Nsid, Params, Base, <<>>).
%% `Token`, when non-empty, is sent as an Authorization: Bearer header.
get(Nsid, Params, Base, Token) ->
    unwrap(rocksky_nif:get(b(Base), b(Nsid), iolist_to_binary(json:encode(Params)), b(Token))).

%% Flat form for cross-language callers passing a pre-encoded JSON params object.
get_raw(Base, Nsid, ParamsJson, Token) ->
    unwrap(rocksky_nif:get(b(Base), b(Nsid), b(ParamsJson), b(Token))).

%% Resolve full canonical metadata for a bare title + artist (matchSong).
match_song(Title, Artist) -> match_song(<<>>, Title, Artist, <<>>, <<>>).
match_song(Base, Title, Artist, MbId, Isrc) ->
    unwrap(rocksky_nif:match_song(b(Base), b(Title), b(Artist), b(MbId), b(Isrc))).

%% Top charts over a typed date window. `Interval` is one of: all | {days, N} |
%% {weeks, N} | {months, N} | {years, N} | {range, StartRfc3339, EndRfc3339}.
top_tracks_interval(Limit, Offset, Interval) ->
    top_tracks_interval(Limit, Offset, Interval, <<>>).
top_tracks_interval(Limit, Offset, Interval, Base) ->
    {U, N, S, E} = interval_parts(Interval),
    unwrap(rocksky_nif:top_tracks_interval(b(Base), Limit, Offset, U, N, S, E)).

top_artists_interval(Limit, Offset, Interval) ->
    top_artists_interval(Limit, Offset, Interval, <<>>).
top_artists_interval(Limit, Offset, Interval, Base) ->
    {U, N, S, E} = interval_parts(Interval),
    unwrap(rocksky_nif:top_artists_interval(b(Base), Limit, Offset, U, N, S, E)).

%% Flat interval forms for cross-language callers (Unit/N/Start/End directly).
top_tracks_interval_raw(Base, Limit, Offset, Unit, N, Start, End) ->
    unwrap(rocksky_nif:top_tracks_interval(b(Base), Limit, Offset, b(Unit), N, b(Start), b(End))).
top_artists_interval_raw(Base, Limit, Offset, Unit, N, Start, End) ->
    unwrap(rocksky_nif:top_artists_interval(b(Base), Limit, Offset, b(Unit), N, b(Start), b(End))).

interval_parts(all) -> {<<"all">>, 0, <<>>, <<>>};
interval_parts({days, N}) -> {<<"days">>, N, <<>>, <<>>};
interval_parts({weeks, N}) -> {<<"weeks">>, N, <<>>, <<>>};
interval_parts({months, N}) -> {<<"months">>, N, <<>>, <<>>};
interval_parts({years, N}) -> {<<"years">>, N, <<>>, <<>>};
interval_parts({range, S, E}) -> {<<"range">>, 0, b(S), b(E)}.

%% Identity hashes — identical across every Rocksky SDK.
song_hash(Title, Artist, Album) ->
    rocksky_nif:song_hash(b(Title), b(Artist), b(Album)).
album_hash(Album, AlbumArtist) ->
    rocksky_nif:album_hash(b(Album), b(AlbumArtist)).
artist_hash(AlbumArtist) -> rocksky_nif:artist_hash(b(AlbumArtist)).

%% ---- authenticated agent ----
%%
%% `Agent` is an opaque NIF resource from agent_login/3,4 (raises on failure).

agent_login(SessionPath, Identifier, Password) ->
    agent_login(SessionPath, Identifier, Password, <<>>).
agent_login(SessionPath, Identifier, Password, AppView) ->
    agent_login(SessionPath, Identifier, Password, AppView, <<>>).
%% `DedupPath` enables the local dedup index (for agent_sync_repo / hydrate).
agent_login(SessionPath, Identifier, Password, AppView, DedupPath) ->
    rocksky_nif:agent_login(b(SessionPath), b(Identifier), b(Password),
                            b(AppView), b(DedupPath)).

%% Scrobble a play (fans out to artist/album/song/scrobble). Track is a map with
%% camelCase binary keys. Returns {ok, #{<<"scrobbleUri">> := _, ...}}.
agent_scrobble(Agent, Track) ->
    unwrap(rocksky_nif:agent_scrobble(Agent, iolist_to_binary(json:encode(Track)))).

%% Scrobble from just a title + artist (album optional): resolve full metadata
%% via matchSong, then fan out.
%% Scrobble from a title + artist. `Input` is a map with camelCase binary keys:
%% required <<"title">>/<<"artist">>; optional <<"album">>, <<"mbId">>,
%% <<"isrc">> (match anchors) and <<"timestamp">> (scrobbled-at Unix seconds).
agent_scrobble_match(Agent, Input) when is_map(Input) ->
    unwrap(rocksky_nif:agent_scrobble_match(Agent, iolist_to_binary(json:encode(Input)))).

%% Flat form (used by the Gleam SDK): empty strings / 0 are omitted so they don't
%% override a matched field.
agent_scrobble_match(Agent, Title, Artist, Album, MbId, Isrc, Timestamp) ->
    M0 = #{<<"title">> => b(Title), <<"artist">> => b(Artist)},
    M1 = put_ne(M0, <<"album">>, Album),
    M2 = put_ne(M1, <<"mbId">>, MbId),
    M3 = put_ne(M2, <<"isrc">>, Isrc),
    M4 = case Timestamp of 0 -> M3; T -> M3#{<<"timestamp">> => T} end,
    agent_scrobble_match(Agent, M4).

%% Put `K => V` only when the binary value is non-empty.
put_ne(M, K, V) ->
    case b(V) of <<>> -> M; Bin -> M#{K => Bin} end.

%% Download the caller's repo and (re)build the local dedup index (needs a
%% DedupPath at login). Returns the per-collection counts.
agent_sync_repo(Agent) -> unwrap(rocksky_nif:agent_sync_repo(Agent)).

%% Keep the local dedup index hydrated from Jetstream in the background.
agent_hydrate_from_jetstream(Agent) ->
    unwrap(rocksky_nif:agent_hydrate_from_jetstream(Agent)).

agent_like(Agent, Uri, Cid) -> unwrap(rocksky_nif:agent_like(Agent, b(Uri), b(Cid))).
agent_follow(Agent, Did) -> unwrap(rocksky_nif:agent_follow(Agent, b(Did))).
agent_shout(Agent, SubjectUri, SubjectCid, Message) ->
    unwrap(rocksky_nif:agent_shout(Agent, b(SubjectUri), b(SubjectCid), b(Message))).
agent_refresh_session(Agent) -> unwrap(rocksky_nif:agent_refresh_session(Agent)).
