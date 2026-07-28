#!/usr/bin/env escript
%%! -pa ebin
%% RemotePlayer + RemoteController tour over the remote-control WebSocket.
%%
%%   ./build-core.sh && erlc -o ebin src/*.erl
%%   ROCKSKY_TOKEN=<jwt> ./examples/remote_control.escript
%%
%% Requires a Rocksky access token (JWT) in $ROCKSKY_TOKEN.
main(_) ->
    Token = case os:getenv("ROCKSKY_TOKEN") of
                false -> io:format("set ROCKSKY_TOKEN to a Rocksky access token~n"),
                         halt(1);
                T -> list_to_binary(T)
            end,

    %% --- player: advertise what we're "playing" and react to commands ---
    Player = rocksky_remote_player:connect(Token, <<"Erlang Player">>),
    rocksky_remote_player:spawn_listener(Player, fun(Cmd) ->
        io:format("player got command: ~p~n", [Cmd])
    end),
    {ok, _} = rocksky_remote_player:set_now_playing(Player, #{
        <<"title">> => <<"Chaser">>,
        <<"artist">> => <<"Calibro 35">>,
        <<"album">> => <<"Jazzploitation">>,
        <<"albumArtist">> => <<"Calibro 35">>,
        <<"durationMs">> => 182320,
        <<"elapsedMs">> => 0,
        <<"isPlaying">> => true}),
    {ok, _} = rocksky_remote_player:set_status(Player, <<"playing">>),
    {ok, _} = rocksky_remote_player:set_queue(Player, [#{
        <<"title">> => <<"Chaser">>,
        <<"artist">> => <<"Calibro 35">>,
        <<"durationMs">> => 182320}], 0),

    %% --- controller: observe devices and drive the primary ---
    Ctl = rocksky_remote_controller:connect(Token, <<"Erlang Controller">>),
    rocksky_remote_controller:spawn_listener(Ctl, fun(Event) ->
        io:format("controller event: ~p~n", [maps:get(<<"type">>, Event, Event)])
    end),

    %% broadcast a pause to every device (empty target), then seek the player.
    {ok, _} = rocksky_remote_controller:pause(Ctl),
    {ok, _} = rocksky_remote_controller:seek(Ctl, <<>>, 42000),

    io:format("listening for 10s...~n"),
    timer:sleep(10000),

    rocksky_remote_controller:disconnect(Ctl),
    rocksky_remote_player:disconnect(Player),
    io:format("done~n").
