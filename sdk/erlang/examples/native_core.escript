#!/usr/bin/env escript
%%! -pa ebin
%% Read-only tour of the native Rocksky core (no auth needed).
%%
%%   ./build-core.sh && erlc -o ebin src/*.erl
%%   ./examples/native_core.escript
%%
%% The write side (agent_login + agent_scrobble) is shown commented below.
main(_) ->
    {ok, S} = rocksky:global_stats(),
    io:format("global: ~p scrobbles · ~p users · ~p tracks~n",
              [maps:get(<<"scrobbles">>, S), maps:get(<<"users">>, S),
               maps:get(<<"tracks">>, S)]),
    io:format("top tracks:~n", []),
    {ok, TT} = rocksky:top_tracks(5, 0),
    [io:format("  ~s - ~s~n",
               [maps:get(<<"artist">>, T, <<"?">>), maps:get(<<"title">>, T, <<"?">>)])
     || T <- TT],
    io:format("song hash: ~s~n",
              [rocksky:song_hash(<<"Chaser">>, <<"Calibro 35">>, <<"Jazzploitation">>)]).

%% --- write side (uncomment with real credentials) ---
%% Agent = rocksky:agent_login(<<"session.json">>, <<"alice.bsky.social">>, <<"app-pw">>),
%% {ok, Out} = rocksky:agent_scrobble(Agent, #{
%%     <<"title">> => <<"Chaser">>, <<"artist">> => <<"Calibro 35">>,
%%     <<"album">> => <<"Jazzploitation">>, <<"albumArtist">> => <<"Calibro 35">>,
%%     <<"durationMs">> => 182320}),
%% io:format("scrobbled: ~s~n", [maps:get(<<"scrobbleUri">>, Out)]).
