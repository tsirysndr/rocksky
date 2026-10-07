-module(rocksky_typed_tests).
-include_lib("eunit/include/eunit.hrl").
-include("rocksky_models.hrl").
params_test() ->
  Params = #get_actor_scrobbles_params{did = <<"alice.test">>, limit = 20},
  ?assertEqual(#{<<"did">> => <<"alice.test">>, <<"limit">> => 20}, rocksky_models:encode_get_actor_scrobbles_params(Params)),
  ?assertMatch({error, _}, rocksky_models:decode_get_actor_scrobbles_params(#{})).
nested_response_test() ->
  Wire = #{<<"discogs">> => #{<<"releaseId">> => 123, <<"formats">> => [<<"Vinyl">>], <<"credits">> => [#{<<"name">> => <<"Producer">>}]}},
  {ok, Album} = rocksky_models:decode_album_view_detailed(Wire),
  ?assertEqual(123, (Album#album_view_detailed.discogs)#album_discogs_view.release_id),
  ?assertEqual(Wire, rocksky_models:encode_album_view_detailed(Album)).
malformed_test() ->
  ?assertMatch({error, _}, rocksky_models:decode_song_view_detailed(#{<<"title">> => 42})),
  ?assertMatch({error, _}, rocksky_models:decode_album_view_detailed(#{<<"discogs">> => #{<<"formats">> => [42]}})).
nullable_float_test() ->
  {ok, Song} = rocksky_models:decode_song_view_detailed(#{<<"bpm">> => 123.5, <<"mbId">> => null}),
  ?assertEqual(123.5, Song#song_view_detailed.bpm),
  ?assertEqual(undefined, Song#song_view_detailed.mb_id).

transport_test() ->
  {ok, Listener} = gen_tcp:listen(0, [binary, {active, false}, {ip, {127,0,0,1}}]),
  {ok, {_, Port}} = inet:sockname(Listener),
  Parent = self(),
  spawn(fun() ->
    {ok, Socket} = gen_tcp:accept(Listener, 5000),
    {ok, Request} = gen_tcp:recv(Socket, 0, 5000),
    Body = <<"{\"title\":\"Track\",\"mbId\":\"recording-id\"}">>,
    ok = gen_tcp:send(Socket, ["HTTP/1.1 200 OK\r\nContent-Length: ", integer_to_list(byte_size(Body)), "\r\nConnection: close\r\n\r\n", Body]),
    gen_tcp:close(Socket),
    Parent ! {request, Request}
  end),
  Base = iolist_to_binary(["http://127.0.0.1:", integer_to_list(Port)]),
  Client = rocksky_xrpc:with_endpoint(rocksky_xrpc:new(), Base),
  {ok, Song} = rocksky_xrpc:song_get_song(Client, #song_get_song_params{uri = <<"at://test song">>}),
  ?assertEqual(<<"recording-id">>, Song#song_view_detailed.mb_id),
  receive {request, Request} ->
    ?assertNotEqual(nomatch, binary:match(Request, <<"GET /xrpc/app.rocksky.song.getSong?uri=at%3A%2F%2Ftest+song">>))
  after 5000 -> error(missing_request)
  end,
  gen_tcp:close(Listener).
