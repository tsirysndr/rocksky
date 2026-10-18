//// Decoders for values as `pg` hands them back.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode.{type Decoder}
import gleam/float
import gleam/int
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/node/js
import rocksky_api/node/pg

/// `Date` objects, ISO strings (from `to_jsonb`) and epoch numbers.
pub fn timestamp() -> Decoder(Timestamp) {
  use value <- decode.then(decode.dynamic)
  case pg.to_ms(value) {
    Some(ms) ->
      decode.success(timestamp.from_unix_seconds_and_nanoseconds(
        ms / 1000,
        { ms % 1000 } * 1_000_000,
      ))
    None -> decode.failure(timestamp.from_unix_seconds(0), "Timestamp")
  }
}

/// Integers, integral floats, and numeric strings (`count(*)` is `int8`).
pub fn int() -> Decoder(Int) {
  decode.one_of(decode.int, [
    decode.float |> decode.map(float.truncate),
    decode.string
      |> decode.then(fn(s) {
        case int.parse(s) {
          Ok(i) -> decode.success(i)
          Error(_) ->
            case float.parse(s) {
              Ok(f) -> decode.success(float.truncate(f))
              Error(_) -> decode.failure(0, "Int")
            }
        }
      }),
  ])
}

pub fn float() -> Decoder(Float) {
  decode.one_of(decode.float, [
    decode.int |> decode.map(int.to_float),
    decode.string
      |> decode.then(fn(s) {
        case float.parse(s) {
          Ok(f) -> decode.success(f)
          Error(_) ->
            case int.parse(s) {
              Ok(i) -> decode.success(int.to_float(i))
              Error(_) -> decode.failure(0.0, "Float")
            }
        }
      }),
  ])
}

/// Xata exposes version metadata as integers in production, while some local
/// Drizzle schemas declare text. Preserve the string model for both sources.
pub fn version_string() -> Decoder(String) {
  decode.one_of(decode.string, [decode.int |> decode.map(int.to_string)])
}

pub fn string() -> Decoder(String) {
  decode.string
}

pub fn bool() -> Decoder(Bool) {
  decode.bool
}

pub fn nullable(inner: Decoder(a)) -> Decoder(Option(a)) {
  decode.optional(inner)
}

/// A column that may be missing from the row entirely as well as null.
pub fn field(
  name: String,
  inner: Decoder(a),
  next: fn(a) -> Decoder(b),
) -> Decoder(b) {
  decode.field(name, inner, next)
}

pub fn optional_field(
  name: String,
  inner: Decoder(a),
  next: fn(Option(a)) -> Decoder(b),
) -> Decoder(b) {
  decode.optional_field(name, None, decode.optional(inner), next)
}

/// Postgres `text[]`.
pub fn strings() -> Decoder(List(String)) {
  decode.list(decode.string)
}

/// Raw `jsonb`, as the driver already parsed it.
pub fn jsonb() -> Decoder(Dynamic) {
  decode.dynamic
}

pub fn iso8601(t: Timestamp) -> String {
  let #(s, ns) = timestamp.to_unix_seconds_and_nanoseconds(t)
  js.date_to_iso(pg.date_from_ms(s * 1000 + ns / 1_000_000))
}

pub fn optional_iso8601(t: Option(Timestamp)) -> Option(String) {
  option.map(t, iso8601)
}

pub fn to_unix_ms(t: Timestamp) -> Int {
  let #(s, ns) = timestamp.to_unix_seconds_and_nanoseconds(t)
  s * 1000 + ns / 1_000_000
}

pub fn from_unix_ms(ms: Int) -> Timestamp {
  timestamp.from_unix_seconds_and_nanoseconds(
    ms / 1000,
    { ms % 1000 } * 1_000_000,
  )
}

/// Re-encodes a driver-parsed `jsonb` value as JSON.
@external(javascript, "./row_ffi.mjs", "identity")
pub fn dynamic_to_json(d: Dynamic) -> json.Json
