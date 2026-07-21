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
         top_tracks/2, global_stats/0, global_stats/1,
         song_hash/3, album_hash/2, artist_hash/1,
         agent_login/3, agent_login/4, agent_scrobble/2, agent_like/3,
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
top_tracks(Limit, Offset) -> unwrap(rocksky_nif:top_tracks(<<>>, Limit, Offset)).

global_stats() -> global_stats(<<>>).
global_stats(Base) -> unwrap(rocksky_nif:global_stats(b(Base))).

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
    rocksky_nif:agent_login(b(SessionPath), b(Identifier), b(Password), b(AppView), <<>>).

%% Scrobble a play (fans out to artist/album/song/scrobble). Track is a map with
%% camelCase binary keys. Returns {ok, #{<<"scrobbleUri">> := _, ...}}.
agent_scrobble(Agent, Track) ->
    unwrap(rocksky_nif:agent_scrobble(Agent, json:encode(Track))).

agent_like(Agent, Uri, Cid) -> unwrap(rocksky_nif:agent_like(Agent, b(Uri), b(Cid))).
agent_follow(Agent, Did) -> unwrap(rocksky_nif:agent_follow(Agent, b(Did))).
agent_shout(Agent, SubjectUri, SubjectCid, Message) ->
    unwrap(rocksky_nif:agent_shout(Agent, b(SubjectUri), b(SubjectCid), b(Message))).
agent_refresh_session(Agent) -> unwrap(rocksky_nif:agent_refresh_session(Agent)).
