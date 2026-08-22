%% Builder for RSQL filter expressions, accepted by the `filter` parameter of
%% the catalog and scrobble-feed queries (app.rocksky.song.getSongs,
%% app.rocksky.artist.getArtists, app.rocksky.album.getAlbums,
%% app.rocksky.scrobble.getScrobbles). Pure Erlang — no NIF involved.
%%
%%   F = rocksky_filter:or_(
%%           rocksky_filter:and_(
%%               rocksky_filter:eq(artist, <<"Daft Punk">>),
%%               rocksky_filter:gt(duration, 200000)),
%%           rocksky_filter:in(genre, [<<"house">>, <<"electro">>])),
%%   rocksky_filter:build(F).
%%   %% <<"artist==\"Daft Punk\";duration=gt=200000,genre=in=(house,electro)">>
%%
%% Fields are atoms (use quoted atoms for dotted selectors, e.g. 'track.artist')
%% or binaries. String values are quoted and escaped automatically when they
%% contain characters RSQL reserves; `*` wildcards pass through unquoted so
%% eq(artist, <<"Daft*">>) performs a case-insensitive match.
-module(rocksky_filter).

-export([eq/2, ne/2, gt/2, ge/2, lt/2, le/2, in/2, out/2,
         is_null/1, is_not_null/1, and_/2, or_/2, build/1]).

-export_type([filter/0, field/0, value/0]).

%% Opaque-ish filter node: {rsql, Kind, Expr}. Compose with and_/2, or_/2;
%% render with build/1.
-type filter() :: {rsql, comparison | 'and' | 'or', binary()}.
-type field() :: atom() | binary() | string().
-type value() :: integer() | float() | boolean() | atom() | binary() | string().

%% ---- comparisons ----

%% `field==value` — equals; `*` in string values is a wildcard.
-spec eq(field(), value()) -> filter().
eq(Field, Value) -> comparison(Field, <<"==">>, Value).

%% `field!=value` — not equals.
-spec ne(field(), value()) -> filter().
ne(Field, Value) -> comparison(Field, <<"!=">>, Value).

%% `field=gt=value` — greater than.
-spec gt(field(), value()) -> filter().
gt(Field, Value) -> comparison(Field, <<"=gt=">>, Value).

%% `field=ge=value` — greater than or equal.
-spec ge(field(), value()) -> filter().
ge(Field, Value) -> comparison(Field, <<"=ge=">>, Value).

%% `field=lt=value` — less than.
-spec lt(field(), value()) -> filter().
lt(Field, Value) -> comparison(Field, <<"=lt=">>, Value).

%% `field=le=value` — less than or equal.
-spec le(field(), value()) -> filter().
le(Field, Value) -> comparison(Field, <<"=le=">>, Value).

%% `field=in=(a,b)` — matches any of the values. Errors on an empty list.
-spec in(field(), [value(), ...]) -> filter().
in(Field, Values) -> list_comparison(Field, <<"=in=">>, Values).

%% `field=out=(a,b)` — matches none of the values. Errors on an empty list.
-spec out(field(), [value(), ...]) -> filter().
out(Field, Values) -> list_comparison(Field, <<"=out=">>, Values).

%% `field==null` — the field is NULL.
-spec is_null(field()) -> filter().
is_null(Field) -> {rsql, comparison, <<(render_field(Field))/binary, "==null">>}.

%% `field!=null` — the field is not NULL.
-spec is_not_null(field()) -> filter().
is_not_null(Field) -> {rsql, comparison, <<(render_field(Field))/binary, "!=null">>}.

%% ---- combinators ('and'/'or' are reserved words, hence the trailing _) ----

%% Both sides must match (`;`). An `or` operand is parenthesized to keep RSQL
%% precedence.
-spec and_(filter(), filter()) -> filter().
and_({rsql, KindA, A}, {rsql, KindB, B}) ->
    {rsql, 'and', <<(parenthesize(KindA, A))/binary, ";",
                    (parenthesize(KindB, B))/binary>>}.

%% Either side may match (`,`).
-spec or_(filter(), filter()) -> filter().
or_({rsql, _, A}, {rsql, _, B}) ->
    {rsql, 'or', <<A/binary, ",", B/binary>>}.

%% The RSQL expression binary to send as the `filter` query param. Also accepts
%% an already-built binary (identity), so callers can pass either.
-spec build(filter() | binary()) -> binary().
build({rsql, _, Expr}) -> Expr;
build(Bin) when is_binary(Bin) -> Bin.

%% ---- internal ----

parenthesize('or', Expr) -> <<"(", Expr/binary, ")">>;
parenthesize(_, Expr) -> Expr.

comparison(Field, Op, Value) ->
    {rsql, comparison,
     <<(render_field(Field))/binary, Op/binary, (render_value(Value))/binary>>}.

list_comparison(Field, Op, []) ->
    error({empty_list, Field, Op});
list_comparison(Field, Op, [_ | _] = Values) ->
    Rendered = lists:join(<<",">>, [render_value(V) || V <- Values]),
    {rsql, comparison,
     <<(render_field(Field))/binary, Op/binary, "(",
       (iolist_to_binary(Rendered))/binary, ")">>}.

render_field(Field) when is_atom(Field) -> atom_to_binary(Field, utf8);
render_field(Field) when is_binary(Field) -> Field;
render_field(Field) when is_list(Field) -> unicode:characters_to_binary(Field).

render_value(true) -> <<"true">>;
render_value(false) -> <<"false">>;
render_value(V) when is_integer(V) -> integer_to_binary(V);
render_value(V) when is_float(V) -> float_to_binary(V, [short]);
render_value(V) when is_atom(V) -> render_string(atom_to_binary(V, utf8));
render_value(V) when is_binary(V) -> render_string(V);
render_value(V) when is_list(V) -> render_string(unicode:characters_to_binary(V)).

%% Bare iff non-empty and every char is in [A-Za-z0-9_.:@*+-] (`*` kept bare so
%% wildcards work); otherwise quoted with `\` and `"` escaped.
render_string(<<>>) -> quote(<<>>);
render_string(Bin) ->
    case is_safe(Bin) of
        true -> Bin;
        false -> quote(Bin)
    end.

is_safe(<<>>) -> true;
is_safe(<<C, Rest/binary>>)
  when C >= $A, C =< $Z; C >= $a, C =< $z; C >= $0, C =< $9;
       C =:= $_; C =:= $.; C =:= $:; C =:= $@; C =:= $*; C =:= $+; C =:= $- ->
    is_safe(Rest);
is_safe(_) -> false.

quote(Bin) ->
    Backslashes = binary:replace(Bin, <<"\\">>, <<"\\\\">>, [global]),
    Escaped = binary:replace(Backslashes, <<"\"">>, <<"\\\"">>, [global]),
    <<"\"", Escaped/binary, "\"">>.
