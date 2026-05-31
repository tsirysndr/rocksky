-module(rocksky_test_ffi).

-export([push_request/1, read_requests/0, clear_requests/0]).

clear_requests() ->
    erase(rocksky_test_requests),
    nil.

%% Stash a request in the process dictionary under a fixed key. Each gleeunit
%% test runs in its own process, so concurrent tests don't see each other's
%% captures.
push_request(Req) ->
    Existing = case get(rocksky_test_requests) of
        undefined -> [];
        L -> L
    end,
    put(rocksky_test_requests, [Req | Existing]),
    nil.

read_requests() ->
    case get(rocksky_test_requests) of
        undefined -> [];
        L -> lists:reverse(L)
    end.
