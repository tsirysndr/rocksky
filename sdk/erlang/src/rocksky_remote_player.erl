%% RemotePlayer — build a Rocksky-controllable player over the remote-control
%% WebSocket (see remote-ws/PROTOCOL.md). connect/2,3 registers as a device in
%% the background; you advertise what you're playing (set_now_playing/set_status/
%% set_queue) and poll next_command/1 in a loop to react to controller commands
%% (play/pause/next/previous/seek/enqueue/queue actions). Heartbeat, reconnect,
%% and the device-id handshake are handled by the native core.
%%
%%   Player = rocksky_remote_player:connect(Token, <<"My Player">>),
%%   rocksky_remote_player:set_now_playing(Player, #{
%%       <<"title">> => <<"Chaser">>, <<"artist">> => <<"Calibro 35">>,
%%       <<"durationMs">> => 182320, <<"elapsedMs">> => 0, <<"isPlaying">> => true}),
%%   rocksky_remote_player:set_status(Player, <<"playing">>),
%%   %% spawn a loop that hands each decoded command to your fun:
%%   rocksky_remote_player:spawn_listener(Player, fun handle_command/1),
%%   ...
%%   rocksky_remote_player:disconnect(Player).
%%
%% `Player` is an opaque NIF resource from connect/2,3 (GC'd; disconnect/1 just
%% stops the background task). Setters return {ok, Value} | {error, Message}.
-module(rocksky_remote_player).

-export([connect/2, connect/3, next_command/1, set_now_playing/2,
         set_status/2, set_queue/3, disconnect/1,
         spawn_listener/2]).

%% Connect and register a controllable player. `Name` is the miniplayer
%% device-picker label; connect/3 overrides the WebSocket URL (empty = public
%% endpoint). Returns the opaque player resource (raises on native load failure).
connect(Token, Name) -> connect(Token, Name, <<>>).
connect(Token, Name, Url) ->
    rocksky_nif:remote_player_connect(b(Token), b(Name), b(Url)).

%% Block until the next controller command, returned as a decoded command map
%% (e.g. #{<<"action">> => <<"play">>} or #{<<"action">> => <<"seek">>,
%% <<"position">> => Ms}). Returns `undefined` once the player is disconnected.
next_command(Player) ->
    case unwrap(rocksky_nif:remote_player_next_command(Player)) of
        {ok, null} -> undefined;
        {ok, Cmd} -> Cmd;
        {error, _} = Err -> Err
    end.

%% Advertise the currently-playing track. `Track` is a map with camelCase binary
%% keys: <<"title">>, <<"artist">>, and optional <<"album">>, <<"albumArtist">>,
%% <<"albumArt">>, <<"durationMs">>, <<"elapsedMs">>, <<"isPlaying">>. Call it
%% whenever the track changes and periodically with a fresh <<"elapsedMs">>.
set_now_playing(Player, Track) when is_map(Track) ->
    unwrap(rocksky_nif:remote_player_set_now_playing(
        Player, iolist_to_binary(json:encode(Track)))).

%% Advertise transport status: <<"playing">> | <<"paused">> | <<"stopped">>.
set_status(Player, Status) ->
    unwrap(rocksky_nif:remote_player_set_status(Player, b(Status))).

%% Advertise the playback queue + active index. `Items` is a list of queue-item
%% maps (camelCase binary keys, see the PROTOCOL / spec); `Index` is 0-based.
set_queue(Player, Items, Index) when is_list(Items) ->
    unwrap(rocksky_nif:remote_player_set_queue(
        Player, iolist_to_binary(json:encode(Items)), Index)).

%% Disconnect and stop the background task (the resource stays valid until GC'd).
disconnect(Player) ->
    unwrap(rocksky_nif:remote_player_disconnect(Player)).

%% Spawn a process that polls next_command/1 in a loop and hands each decoded
%% command to `Handler` — a fun/1 (called with the command map) or a pid (which
%% receives `{rocksky_command, Command}`). The loop ends when the player
%% disconnects (next_command returns `undefined`). Returns the listener Pid.
spawn_listener(Player, Handler) ->
    spawn(fun() -> listen_loop(Player, Handler) end).

listen_loop(Player, Handler) ->
    case next_command(Player) of
        undefined -> ok;
        {error, _} -> ok;
        Command ->
            dispatch(Handler, Command),
            listen_loop(Player, Handler)
    end.

dispatch(Handler, Command) when is_function(Handler, 1) -> Handler(Command);
dispatch(Handler, Command) when is_pid(Handler) -> Handler ! {rocksky_command, Command}.

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
