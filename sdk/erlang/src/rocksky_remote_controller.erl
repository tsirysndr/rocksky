%% RemoteController — build a Rocksky remote UI over the remote-control WebSocket
%% (see remote-ws/PROTOCOL.md). The other half of rocksky_remote_player: connect/
%% 2,3 registers in the background; you observe the user's players by polling
%% next_event/1 in a loop (device list, now-playing, status, queue) and drive them
%% by sending commands (set_primary/command/seek/queue_jump/queue_remove/enqueue).
%% Heartbeat, reconnect, and the register handshake are handled by the native core.
%%
%% Every command takes a `Target` device id; pass <<>> (or undefined) to
%% broadcast to all the user's devices.
%%
%%   Ctl = rocksky_remote_controller:connect(Token, <<"My Controller">>),
%%   rocksky_remote_controller:spawn_listener(Ctl, fun handle_event/1),
%%   rocksky_remote_controller:set_primary(Ctl, DeviceId),
%%   rocksky_remote_controller:pause(Ctl, DeviceId),
%%   rocksky_remote_controller:seek(Ctl, DeviceId, 42000),
%%   ...
%%   rocksky_remote_controller:disconnect(Ctl).
%%
%% `Controller` is an opaque NIF resource from connect/2,3 (GC'd). Commands
%% return {ok, Value} | {error, Message}.
-module(rocksky_remote_controller).

-export([connect/2, connect/3, next_event/1, set_primary/2, command/3,
         play/1, play/2, pause/1, pause/2, next/1, next/2,
         previous/1, previous/2, seek/3, queue_jump/3, queue_remove/3,
         enqueue/6, disconnect/1, spawn_listener/2]).

%% Connect and register a controller. `Name` is a registration label (controllers
%% are hidden from device lists); connect/3 overrides the WebSocket URL (empty =
%% public endpoint). Returns the opaque controller resource.
connect(Token, Name) -> connect(Token, Name, <<>>).
connect(Token, Name, Url) ->
    rocksky_nif:remote_controller_connect(b(Token), b(Name), b(Url)).

%% Block until the next update, returned as a decoded event map with a
%% <<"type">> key (devices | device_registered | device_unregistered |
%% primary_changed | now_playing | status | queue). Returns `undefined` once the
%% controller is disconnected.
next_event(Controller) ->
    case unwrap(rocksky_nif:remote_controller_next_event(Controller)) of
        {ok, null} -> undefined;
        {ok, Event} -> Event;
        {error, _} = Err -> Err
    end.

%% Choose the primary (scrobble/profile) device.
set_primary(Controller, DeviceId) ->
    unwrap(rocksky_nif:remote_controller_set_primary(Controller, b(DeviceId))).

%% Send a simple command to a device: <<"play">> | <<"pause">> | <<"next">> |
%% <<"previous">>. `Target` is a device id, or <<>>/undefined to broadcast.
command(Controller, Action, Target) ->
    unwrap(rocksky_nif:remote_controller_command(Controller, b(Action), b(Target))).

%% Convenience wrappers over command/3 (arity /1 broadcasts to all devices).
play(Controller) -> play(Controller, <<>>).
play(Controller, Target) -> command(Controller, <<"play">>, Target).
pause(Controller) -> pause(Controller, <<>>).
pause(Controller, Target) -> command(Controller, <<"pause">>, Target).
next(Controller) -> next(Controller, <<>>).
next(Controller, Target) -> command(Controller, <<"next">>, Target).
previous(Controller) -> previous(Controller, <<>>).
previous(Controller, Target) -> command(Controller, <<"previous">>, Target).

%% Seek the target device to `PositionMs` (<<>>/undefined target = broadcast).
seek(Controller, Target, PositionMs) ->
    unwrap(rocksky_nif:remote_controller_seek(Controller, b(Target), PositionMs)).

%% Jump to `Index` in the target device's queue (<<>>/undefined = broadcast).
queue_jump(Controller, Target, Index) ->
    unwrap(rocksky_nif:remote_controller_queue_jump(Controller, b(Target), Index)).

%% Remove queue item `Index` on the target device (<<>>/undefined = broadcast).
queue_remove(Controller, Target, Index) ->
    unwrap(rocksky_nif:remote_controller_queue_remove(Controller, b(Target), Index)).

%% Enqueue `Tracks` (a list of queue-item maps, camelCase binary keys) on the
%% target device. `Mode` is <<"now">> | <<"next">> | <<"last">>; `Shuffle` is a
%% boolean; `StartIndex` is 0-based. <<>>/undefined target = broadcast.
enqueue(Controller, Target, Tracks, Mode, Shuffle, StartIndex) when is_list(Tracks) ->
    unwrap(rocksky_nif:remote_controller_enqueue(
        Controller, b(Target), iolist_to_binary(json:encode(Tracks)),
        b(Mode), Shuffle, StartIndex)).

%% Disconnect and stop the background task.
disconnect(Controller) ->
    unwrap(rocksky_nif:remote_controller_disconnect(Controller)).

%% Spawn a process that polls next_event/1 in a loop and hands each decoded event
%% to `Handler` — a fun/1 (called with the event map) or a pid (which receives
%% `{rocksky_event, Event}`). The loop ends when the controller disconnects
%% (next_event returns `undefined`). Returns the listener Pid.
spawn_listener(Controller, Handler) ->
    spawn(fun() -> listen_loop(Controller, Handler) end).

listen_loop(Controller, Handler) ->
    case next_event(Controller) of
        undefined -> ok;
        {error, _} -> ok;
        Event ->
            dispatch(Handler, Event),
            listen_loop(Controller, Handler)
    end.

dispatch(Handler, Event) when is_function(Handler, 1) -> Handler(Event);
dispatch(Handler, Event) when is_pid(Handler) -> Handler ! {rocksky_event, Event}.

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
