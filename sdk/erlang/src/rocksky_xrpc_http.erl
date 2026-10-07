%% Generated transport shared by the Gleam and Erlang typed XRPC APIs.
-module(rocksky_xrpc_http).
-export([request/7]).

request(Method, Base, Nsid, ParamsJson, BodyJson, Token, Timeout) ->
    try
        true = Method =:= get orelse Method =:= post,
        {match, _} = re:run(Nsid, <<"^[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)+$">>),
        BaseMap = uri_string:parse(Base),
        true = lists:member(maps:get(scheme, BaseMap), [<<"http">>, <<"https">>]),
        Params = json:decode(ParamsJson),
        true = is_map(Params),
        Pairs = lists:flatmap(fun({K, V}) -> param(K, V) end, lists:sort(maps:to_list(Params))),
        Query = uri_string:compose_query(Pairs),
        Root = string:trim(Base, trailing, "/"),
        Url = binary_to_list(iolist_to_binary([Root, "/xrpc/", Nsid, case Query of <<>> -> <<>>; [] -> <<>>; _ -> ["?", Query] end])),
        Headers = [{"accept", "application/json"}, {"user-agent", "Rocksky-SDK/typed-xrpc"}] ++
            case Token of <<>> -> []; _ -> [{"authorization", "Bearer " ++ binary_to_list(Token)}] end,
        {ok, _} = application:ensure_all_started(inets),
        {ok, _} = application:ensure_all_started(ssl),
        Ssl = [{verify, verify_peer}, {cacerts, public_key:cacerts_get()},
               {customize_hostname_check, [{match_fun, public_key:pkix_verify_hostname_match_fun(https)}]}],
        Request = case Method of
            get -> {Url, Headers};
            post -> {Url, Headers, "application/json", BodyJson}
        end,
        case httpc:request(Method, Request, [{timeout, Timeout}, {connect_timeout, Timeout}, {autoredirect, false}, {ssl, Ssl}], [{body_format, binary}]) of
            {ok, {{_, Status, _}, _, Body}} -> {ok, {Status, Body}};
            {error, Reason} -> {error, format(Reason)}
        end
    catch
        _:Reason0 -> {error, format(Reason0)}
    end.

param(_, null) -> [];
param(K, V) when is_list(V) -> lists:flatmap(fun(Item) -> param(K, Item) end, V);
param(K, V) -> [{K, scalar(V)}].
scalar(V) when is_binary(V) -> V;
scalar(V) when is_integer(V) -> integer_to_binary(V);
scalar(V) when is_float(V) -> float_to_binary(V, [short]);
scalar(true) -> <<"true">>;
scalar(false) -> <<"false">>;
scalar(_) -> error(invalid_query_parameter).
format(Reason) -> unicode:characters_to_binary(io_lib:format("~p", [Reason])).
