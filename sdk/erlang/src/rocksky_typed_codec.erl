%% Runtime validation for generated records. Unknown wire fields are ignored.
-module(rocksky_typed_codec).
-export([decode/2, decode_value/2, encode/2]).
decode(Name, Value) ->
    try {ok, decode_record(Name, Value)} catch error:Reason -> {error, {decode, Reason}} end.
decode_value(Type, Value) ->
    try {ok, value(Type, Value)} catch error:Reason -> {error, {decode, Reason}} end.
decode_record(Name, Map) when is_map(Map) ->
    Values = [decode_field(Wire, Required, Nullable, Type, Map) || {Wire, _, Required, Nullable, Type} <- rocksky_models:schema(Name)],
    list_to_tuple([Name | Values]);
decode_record(Name, _) -> error({expected_object, Name}).
decode_field(Wire, Required, Nullable, Type, Map) ->
    case maps:find(Wire, Map) of
        error when not Required -> undefined;
        {ok, null} when not Required; Nullable -> undefined;
        {ok, V} -> try value(Type, V) catch error:R -> error({field, Wire, R}) end;
        error -> error({missing_required_field, Wire})
    end.
value(string, V) when is_binary(V) -> V;
value(binary, V) when is_binary(V) -> V;
value(integer, V) when is_integer(V) -> V;
value(float, V) when is_number(V) -> float(V);
value(boolean, V) when is_boolean(V) -> V;
value({list, T}, V) when is_list(V) -> [value(T, X) || X <- V];
value({record, Name}, V) -> decode_record(Name, V);
value(json_value, V) -> json_value(V);
value(Type, _) -> error({invalid_type, Type}).
json_value(V) when is_binary(V); is_number(V); is_boolean(V); V =:= null -> V;
json_value(V) when is_list(V) -> [json_value(X) || X <- V];
json_value(V) when is_map(V) -> maps:from_list([{value(string, K), json_value(X)} || {K,X} <- maps:to_list(V)]);
json_value(_) -> error(invalid_json_value).
encode(Name, Record) when is_tuple(Record), element(1, Record) =:= Name ->
    Fields = rocksky_models:schema(Name),
    true = tuple_size(Record) =:= length(Fields) + 1,
    maps:from_list(lists:flatmap(fun({{Wire, _, Required, Nullable, Type}, V}) ->
        case V of
            undefined when not Required -> [];
            undefined when Nullable -> [{Wire, null}];
            undefined -> error({missing_required_field, Wire});
            _ -> [{Wire, encode_value(Type, V)}]
        end
    end, lists:zip(Fields, tl(tuple_to_list(Record)))));
encode(Name, _) -> error({expected_record, Name}).
encode_value({record, Name}, Value) -> encode(Name, Value);
encode_value({list, Type}, Values) when is_list(Values) -> [encode_value(Type,V) || V <- Values];
encode_value(Type, Value) -> value(Type, Value).
