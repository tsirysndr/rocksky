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
         get/2, get/3, get/4, get_raw/4,
         post/2, post/3, post/4, post_raw/4,
         playlists/3, playlist/2,
         create_playlist/2, create_playlist/5, update_playlist/6,
         add_songs_to_playlist/4, remove_playlist_track/4, remove_playlist/3,
         catalog_songs/2, catalog_songs/3, catalog_artists/2, catalog_artists/3,
         catalog_albums/2, catalog_albums/3, scrobble_feed/2, scrobble_feed/3,
         library_get/4, library_post/4, library_get_raw/4, library_post_raw/4,
         match_song/2, match_song/5,
         top_tracks_interval/3, top_tracks_interval/4, top_tracks_interval_raw/7,
         top_artists_interval/3, top_artists_interval/4, top_artists_interval_raw/7,
         song_hash/3, album_hash/2, artist_hash/1,
         agent_login/3, agent_login/4, agent_login/5, agent_scrobble/2,
         agent_scrobble_match/2, agent_scrobble_match/7, agent_sync_repo/1,
         agent_hydrate_from_jetstream/1, agent_like/3,
         agent_follow/2, agent_shout/4, agent_shout_with_gif/5,
         agent_reply_shout_with_gif/7, agent_refresh_session/1,
         unread_count/1, unread_count/2, notifications/1, notifications/2,
         notifications/3, update_seen/2, update_seen/3, update_seen_raw/3,
         agent_shout_with_gif_raw/5, agent_reply_shout_with_gif_raw/7]).

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

%% ---- procedures (app.rocksky.* writes; args ride the query string) ----
%%
%% Universal write escape hatch. Most procedures are auth-gated, so pass Token.
post(Nsid, Params) -> post(Nsid, Params, <<>>, <<>>).
post(Nsid, Params, Base) -> post(Nsid, Params, Base, <<>>).
post(Nsid, Params, Base, Token) ->
    unwrap(rocksky_nif:post(b(Base), b(Nsid), iolist_to_binary(json:encode(Params)), b(Token))).

post_raw(Base, Nsid, ParamsJson, Token) ->
    unwrap(rocksky_nif:post(b(Base), b(Nsid), b(ParamsJson), b(Token))).

%% ---- app.rocksky.playlist.* (the global, AT-Proto-backed playlists) ----
%%
%% Distinct from rocksky_library's playlist functions, which drive the
%% Subsonic/Navidrome library. Writes publish records to the caller's repo and
%% only appear in reads once the AppView has ingested the commit.

playlists(Base, Limit, Offset) ->
    unwrap(rocksky_nif:playlists(b(Base), Limit, Offset)).

playlist(Base, Uri) ->
    unwrap(rocksky_nif:playlist(b(Base), b(Uri))).

%% Returns #{<<"uri">> => ..., <<"cid">> => ...}. Pass <<>> to omit an optional.
create_playlist(Token, Name) -> create_playlist(<<>>, Token, Name, <<>>, <<>>).
create_playlist(Base, Token, Name, Description, PictureUrl) ->
    unwrap(rocksky_nif:create_playlist(b(Base), b(Token), b(Name), b(Description),
                                       b(PictureUrl))).

%% Owner only. The record is rewritten on its existing rkey, so the AT-URI holds.
update_playlist(Base, Token, Uri, Name, Description, PictureUrl) ->
    unwrap(rocksky_nif:update_playlist(b(Base), b(Token), b(Uri), b(Name), b(Description),
                                       b(PictureUrl))).

%% Owner only. Songs are app.rocksky.song AT-URIs; returns the created entries.
add_songs_to_playlist(Base, Token, Uri, Songs) ->
    unwrap(rocksky_nif:add_songs_to_playlist(b(Base), b(Token), b(Uri),
                                             [b(S) || S <- Songs])).

%% Only the repo that added an entry can retract it.
remove_playlist_track(Base, Token, Uri, SongUri) ->
    unwrap(rocksky_nif:remove_playlist_track(b(Base), b(Token), b(Uri), b(SongUri))).

%% Owner only — removes the playlist and the caller's own entries.
remove_playlist(Base, Token, Uri) ->
    unwrap(rocksky_nif:remove_playlist(b(Base), b(Token), b(Uri))).

%% ---- catalog + scrobble feed (optionally RSQL-filtered) ----
%%
%% `Opts` is a map that may contain `genre` (binary), `filter` (a rocksky_filter
%% node or an already-built RSQL binary — see rocksky_filter) and `base` (AppView
%% URL override). Absent/empty options are omitted from the query.

%% The song catalog (app.rocksky.song.getSongs).
catalog_songs(Limit, Offset) -> catalog_songs(Limit, Offset, #{}).
catalog_songs(Limit, Offset, Opts) ->
    catalog_query(<<"app.rocksky.song.getSongs">>, Limit, Offset, Opts).

%% The artist catalog (app.rocksky.artist.getArtists).
catalog_artists(Limit, Offset) -> catalog_artists(Limit, Offset, #{}).
catalog_artists(Limit, Offset, Opts) ->
    catalog_query(<<"app.rocksky.artist.getArtists">>, Limit, Offset, Opts).

%% The album catalog (app.rocksky.album.getAlbums).
catalog_albums(Limit, Offset) -> catalog_albums(Limit, Offset, #{}).
catalog_albums(Limit, Offset, Opts) ->
    catalog_query(<<"app.rocksky.album.getAlbums">>, Limit, Offset, Opts).

%% The scrobble feed (app.rocksky.scrobble.getScrobbles). `Opts` may contain
%% `did` (scope to one user), `following => true` (the did's network feed),
%% `filter` (rocksky_filter node or RSQL binary) and `base`.
scrobble_feed(Limit, Offset) -> scrobble_feed(Limit, Offset, #{}).
scrobble_feed(Limit, Offset, Opts) ->
    P0 = #{<<"limit">> => Limit, <<"offset">> => Offset},
    P1 = put_ne(P0, <<"did">>, maps:get(did, Opts, undefined)),
    P2 = case maps:get(following, Opts, false) of
             true -> P1#{<<"following">> => true};
             _ -> P1
         end,
    get(<<"app.rocksky.scrobble.getScrobbles">>, put_filter(P2, Opts),
        maps:get(base, Opts, <<>>)).

catalog_query(Nsid, Limit, Offset, Opts) ->
    P0 = #{<<"limit">> => Limit, <<"offset">> => Offset},
    P1 = put_ne(P0, <<"genre">>, maps:get(genre, Opts, undefined)),
    get(Nsid, put_filter(P1, Opts), maps:get(base, Opts, <<>>)).

%% Put <<"filter">> when Opts carries one, run through rocksky_filter:build/1
%% (accepts a filter node or an already-built binary; empty binaries omitted).
put_filter(M, Opts) ->
    case maps:get(filter, Opts, undefined) of
        undefined -> M;
        Filter -> put_ne(M, <<"filter">>, rocksky_filter:build(Filter))
    end.

%% ---- notifications (auth-gated; `Token` required) ----

%% The authenticated viewer's unread-notification count. Returns
%% {ok, #{<<"count">> => N}}.
unread_count(Token) -> unread_count(Token, <<>>).
unread_count(Token, Base) ->
    get(<<"app.rocksky.notification.getUnreadCount">>, #{}, Base, Token).

%% The authenticated viewer's notifications, most recent first. `Params` is a map
%% that may contain <<"limit">> (default 30) and <<"cursor">>. Returns
%% {ok, #{<<"notifications">> => [...], <<"unreadCount">> => N, <<"cursor">> => C}}.
notifications(Token) -> notifications(Token, #{}, <<>>).
notifications(Token, Params) -> notifications(Token, Params, <<>>).
notifications(Token, Params, Base) ->
    get(<<"app.rocksky.notification.listNotifications">>, Params, Base, Token).

%% Mark notifications as viewed. `Ids` is a list of notification id binaries, or
%% [] to mark all. Returns {ok, #{<<"unreadCount">> => N}}.
update_seen(Token, Ids) -> update_seen(Token, Ids, <<>>).
update_seen(Token, Ids, Base) ->
    unwrap(rocksky_nif:update_seen(b(Base), b(Token), iolist_to_binary(json:encode(Ids)))).

%% Flat form for cross-language callers passing a pre-encoded JSON ids array.
update_seen_raw(Token, IdsJson, Base) ->
    unwrap(rocksky_nif:update_seen(b(Base), b(Token), b(IdsJson))).

%% ---- authenticated library.* (uploaded-music) escape hatches ----
%% Every app.rocksky.library.* call requires auth — `Token` must be non-empty.
%% `Params`/`Body` are maps with camelCase binary keys; the *_raw forms take a
%% pre-encoded JSON string (for cross-language callers, e.g. Gleam).

library_get(Base, Token, Nsid, Params) ->
    unwrap(rocksky_nif:library_get(b(Base), b(Token), b(Nsid),
                                   iolist_to_binary(json:encode(Params)))).

library_post(Base, Token, Nsid, Body) ->
    unwrap(rocksky_nif:library_post(b(Base), b(Token), b(Nsid),
                                    iolist_to_binary(json:encode(Body)))).

library_get_raw(Base, Token, Nsid, ParamsJson) ->
    unwrap(rocksky_nif:library_get(b(Base), b(Token), b(Nsid), b(ParamsJson))).

library_post_raw(Base, Token, Nsid, BodyJson) ->
    unwrap(rocksky_nif:library_post(b(Base), b(Token), b(Nsid), b(BodyJson))).

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

%% Post a shout with an optional GIF/sticker/clip. Pass at least one of `Message`
%% / `Gif`. `Gif` is a map (<<"url">> required, plus <<"previewUrl">>, <<"alt">>,
%% <<"width">>, <<"height">>) or `undefined`.
agent_shout_with_gif(Agent, SubjectUri, SubjectCid, Message, Gif) ->
    unwrap(rocksky_nif:agent_shout_with_gif(
        Agent, b(SubjectUri), b(SubjectCid), b(Message), gif_json(Gif))).

%% Reply to a shout with an optional GIF/sticker/clip (see agent_shout_with_gif),
%% plus a parent strong-ref (`ParentUri`/`ParentCid`).
agent_reply_shout_with_gif(Agent, SubjectUri, SubjectCid, ParentUri, ParentCid, Message, Gif) ->
    unwrap(rocksky_nif:agent_reply_shout_with_gif(
        Agent, b(SubjectUri), b(SubjectCid), b(ParentUri), b(ParentCid),
        b(Message), gif_json(Gif))).

agent_refresh_session(Agent) -> unwrap(rocksky_nif:agent_refresh_session(Agent)).

%% Encode a GIF embed map to a JSON binary; `undefined` yields an empty binary.
gif_json(undefined) -> <<>>;
gif_json(Gif) -> iolist_to_binary(json:encode(Gif)).

%% Flat forms for cross-language callers passing a pre-encoded JSON gif embed
%% (empty binary for none) and a plain message binary.
agent_shout_with_gif_raw(Agent, SubjectUri, SubjectCid, Message, GifJson) ->
    unwrap(rocksky_nif:agent_shout_with_gif(
        Agent, b(SubjectUri), b(SubjectCid), b(Message), b(GifJson))).

agent_reply_shout_with_gif_raw(Agent, SubjectUri, SubjectCid, ParentUri, ParentCid, Message, GifJson) ->
    unwrap(rocksky_nif:agent_reply_shout_with_gif(
        Agent, b(SubjectUri), b(SubjectCid), b(ParentUri), b(ParentCid),
        b(Message), b(GifJson))).
