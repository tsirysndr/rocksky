//// A typed representation of JSON for schema-defined unknown/open values.
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/dict
import gleam/option

pub type JsonValue {
  Null
  Boolean(Bool)
  Integer(Int)
  Float(Float)
  String(String)
  Array(List(JsonValue))
  Object(List(#(String, JsonValue)))
}

pub fn decoder() -> decode.Decoder(JsonValue) {
  use <- decode.recursive
  decode.one_of(decode.int |> decode.map(Integer), [
    decode.float |> decode.map(Float),
    decode.string |> decode.map(String),
    decode.bool |> decode.map(Boolean),
    decode.list(decoder()) |> decode.map(Array),
    decode.dict(decode.string, decoder()) |> decode.map(fn(d) { Object(dict.to_list(d)) }),
    decode.optional(decode.string) |> decode.then(fn(v) {
      case v {
        option.None -> decode.success(Null)
        option.Some(_) -> decode.failure(Null, "null")
      }
    }),
  ])
}

pub fn encode(value: JsonValue) -> json.Json {
  case value {
    Null -> json.null()
    Boolean(v) -> json.bool(v)
    Integer(v) -> json.int(v)
    Float(v) -> json.float(v)
    String(v) -> json.string(v)
    Array(v) -> json.array(v, encode)
    Object(v) -> json.object(list.map(v, fn(pair) { #(pair.0, encode(pair.1)) }))
  }
}

/// Lexicon bytes are encoded as UTF-8 JSON strings only when valid text.
@external(erlang, "base64", "encode")
fn base64_encode(value: BitArray) -> String
pub fn encode_bytes(value: BitArray) -> json.Json { json.string(base64_encode(value)) }
