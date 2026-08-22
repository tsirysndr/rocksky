%% Canonical RSQL builder vectors — identical across every Rocksky SDK. Only
%% exercises rocksky_filter (pure Erlang), so no NIF is loaded.
-module(rocksky_filter_tests).

-include_lib("eunit/include/eunit.hrl").

-import(rocksky_filter,
        [eq/2, ne/2, gt/2, ge/2, lt/2, le/2, in/2, out/2,
         is_null/1, is_not_null/1, and_/2, or_/2, build/1]).

eq_bare_test() ->
    ?assertEqual(<<"artist==Radiohead">>, build(eq(artist, <<"Radiohead">>))).

eq_quoted_space_test() ->
    ?assertEqual(<<"artist==\"Daft Punk\"">>, build(eq(artist, <<"Daft Punk">>))).

eq_escaped_quotes_test() ->
    ?assertEqual(<<"title==\"He said \\\"hi\\\"\"">>,
                 build(eq(title, <<"He said \"hi\"">>))).

eq_wildcard_unquoted_test() ->
    ?assertEqual(<<"artist==Daft*">>, build(eq(artist, <<"Daft*">>))).

ne_test() ->
    ?assertEqual(<<"artist!=Eminem">>, build(ne(artist, <<"Eminem">>))).

gt_test() ->
    ?assertEqual(<<"duration=gt=200000">>, build(gt(duration, 200000))).

ge_test() ->
    ?assertEqual(<<"year=ge=2000">>, build(ge(year, 2000))).

lt_test() ->
    ?assertEqual(<<"trackNumber=lt=5">>, build(lt(trackNumber, 5))).

le_test() ->
    ?assertEqual(<<"year=le=1999">>, build(le(year, 1999))).

in_test() ->
    ?assertEqual(<<"genre=in=(house,electro)">>,
                 build(in(genre, [<<"house">>, <<"electro">>]))).

out_quoted_test() ->
    ?assertEqual(<<"genre=out=(\"hip hop\")">>, build(out(genre, [<<"hip hop">>]))).

is_null_test() ->
    ?assertEqual(<<"uri==null">>, build(is_null(uri))).

is_not_null_test() ->
    ?assertEqual(<<"uri!=null">>, build(is_not_null(uri))).

and_test() ->
    ?assertEqual(<<"artist==Radiohead;duration=gt=200000">>,
                 build(and_(eq(artist, <<"Radiohead">>), gt(duration, 200000)))).

or_test() ->
    ?assertEqual(<<"artist==Radiohead,artist==Muse">>,
                 build(or_(eq(artist, <<"Radiohead">>), eq(artist, <<"Muse">>)))).

and_parenthesizes_or_operand_left_test() ->
    ?assertEqual(<<"(artist==Radiohead,artist==Muse);duration=gt=200000">>,
                 build(and_(or_(eq(artist, <<"Radiohead">>), eq(artist, <<"Muse">>)),
                            gt(duration, 200000)))).

and_parenthesizes_or_operand_right_test() ->
    ?assertEqual(<<"artist==Radiohead;(genre==house,genre==electro)">>,
                 build(and_(eq(artist, <<"Radiohead">>),
                            or_(eq(genre, <<"house">>), eq(genre, <<"electro">>))))).

or_never_parenthesizes_test() ->
    ?assertEqual(<<"artist==Radiohead;duration=gt=200000,genre==house">>,
                 build(or_(and_(eq(artist, <<"Radiohead">>), gt(duration, 200000)),
                           eq(genre, <<"house">>)))).

dotted_selector_atom_test() ->
    ?assertEqual(<<"track.artist==\"Daft Punk\"">>,
                 build(eq('track.artist', <<"Daft Punk">>))).

boolean_value_test() ->
    ?assertEqual(<<"liked==true">>, build(eq(liked, true))).

empty_in_errors_test() ->
    ?assertError({empty_list, _, _}, in(genre, [])).

empty_out_errors_test() ->
    ?assertError({empty_list, _, _}, out(genre, [])).

binary_field_accepted_test() ->
    ?assertEqual(<<"artist==Radiohead">>, build(eq(<<"artist">>, <<"Radiohead">>))),
    ?assertEqual(<<"track.artist==\"Daft Punk\"">>,
                 build(eq(<<"track.artist">>, <<"Daft Punk">>))).

build_identity_on_binary_test() ->
    ?assertEqual(<<"artist==Radiohead">>, build(<<"artist==Radiohead">>)).
