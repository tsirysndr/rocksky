/// Helpers at untyped JSON/SDK boundaries. Application models remain Gleam values.
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/result

pub fn field(value: Dynamic, key: String) -> Dynamic {
  decode.run(value, decode.field(key, decode.dynamic, decode.success))
  |> result.unwrap(null())
}

pub fn at(value: Dynamic, keys: List(String)) -> Dynamic {
  case keys {
    [] -> value
    [key, ..rest] -> at(field(value, key), rest)
  }
}

pub fn text(value: Dynamic) -> String {
  case decode.run(value, decode.string) {
    Ok(text) -> text
    Error(_) ->
      case decode.run(value, decode.int) {
        Ok(n) -> int.to_string(n)
        Error(_) ->
          case decode.run(value, decode.float) {
            Ok(n) -> float.to_string(n)
            Error(_) -> ""
          }
      }
  }
}

pub fn string(value: Dynamic, key: String) -> String {
  text(field(value, key))
}

pub fn integer(value: Dynamic, key: String, fallback: Int) -> Int {
  let v = field(value, key)
  decode.run(v, decode.int)
  |> result.lazy_unwrap(fn() { int.parse(text(v)) |> result.unwrap(fallback) })
}

pub fn boolean(value: Dynamic, key: String) -> Bool {
  decode.run(field(value, key), decode.bool) |> result.unwrap(False)
}

pub fn items(value: Dynamic) -> List(Dynamic) {
  decode.run(value, decode.list(decode.dynamic)) |> result.unwrap([])
}

pub fn parse(text: String) -> Result(Dynamic, String) {
  json.parse(text, decode.dynamic) |> result.map_error(fn(_) { "Invalid JSON" })
}

@external(javascript, "./value_ffi.mjs", "null_value")
pub fn null() -> Dynamic

@external(javascript, "./value_ffi.mjs", "stringify")
pub fn stringify(value: Dynamic) -> String

@external(javascript, "./value_ffi.mjs", "is_null")
pub fn is_null(value: Dynamic) -> Bool

@external(javascript, "./value_ffi.mjs", "from_json")
pub fn from_json(value: String) -> Dynamic

@external(javascript, "./value_ffi.mjs", "stringify_list")
pub fn stringify_list(items: List(Dynamic)) -> String

@external(javascript, "./value_ffi.mjs", "to_json")
pub fn to_json(value: Dynamic) -> json.Json

@external(javascript, "./value_ffi.mjs", "entries")
pub fn entries(value: Dynamic) -> List(#(String, Dynamic))
