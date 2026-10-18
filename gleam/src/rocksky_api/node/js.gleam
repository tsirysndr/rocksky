//// Shared helpers for talking to JavaScript: thrown exceptions, promise
//// results, and raw object access.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}

/// A value thrown by JavaScript code (usually an `Error`).
pub type Exception

@external(javascript, "./js_ffi.mjs", "message")
pub fn message(e: Exception) -> String

@external(javascript, "./js_ffi.mjs", "name")
pub fn name(e: Exception) -> String

@external(javascript, "./js_ffi.mjs", "code")
pub fn code(e: Exception) -> Option(String)

@external(javascript, "./js_ffi.mjs", "status")
pub fn status(e: Exception) -> Option(Int)

/// The `error` field carried by XRPC / atproto errors (e.g. `RecordNotFound`).
@external(javascript, "./js_ffi.mjs", "errorField")
pub fn error_field(e: Exception) -> Option(String)

/// Renders the error with its `AggregateError` members and `cause` chain.
@external(javascript, "./js_ffi.mjs", "describe")
pub fn describe(e: Exception) -> String

@external(javascript, "./js_ffi.mjs", "newError")
pub fn new_error(message: String) -> Exception

@external(javascript, "./js_ffi.mjs", "toDynamic")
pub fn to_dynamic(e: Exception) -> Dynamic

@external(javascript, "./js_ffi.mjs", "fromDynamic")
pub fn from_dynamic(d: Dynamic) -> Exception

/// Throws the exception. Only for re-raising inside bindings.
@external(javascript, "./js_ffi.mjs", "raise")
pub fn raise(e: Exception) -> a

/// Wraps a promise that may reject into one that always resolves.
@external(javascript, "./js_ffi.mjs", "attempt")
pub fn attempt(p: Promise(a)) -> Promise(Result(a, Exception))

/// Runs a synchronous thunk, catching anything thrown.
@external(javascript, "./js_ffi.mjs", "tryCatch")
pub fn try_catch(f: fn() -> a) -> Result(a, Exception)

@external(javascript, "./js_ffi.mjs", "identity")
pub fn coerce(a: a) -> b

@external(javascript, "./js_ffi.mjs", "get")
pub fn get(obj: Dynamic, key: String) -> Dynamic

@external(javascript, "./js_ffi.mjs", "set")
pub fn set(obj: Dynamic, key: String, value: Dynamic) -> Dynamic

@external(javascript, "./js_ffi.mjs", "isNullish")
pub fn is_nullish(d: Dynamic) -> Bool

@external(javascript, "./js_ffi.mjs", "undefined")
pub fn undefined() -> Dynamic

@external(javascript, "./js_ffi.mjs", "nullValue")
pub fn null() -> Dynamic

/// A JS object from string keys.
@external(javascript, "./js_ffi.mjs", "object")
pub fn object(entries: List(#(String, Dynamic))) -> Dynamic

/// Object entries of a plain JS object.
@external(javascript, "./js_ffi.mjs", "entries")
pub fn entries(obj: Dynamic) -> List(#(String, Dynamic))

/// `JSON.stringify`, never throws (falls back to `String(value)`).
@external(javascript, "./js_ffi.mjs", "stringify")
pub fn stringify(d: Dynamic) -> String

/// `JSON.parse`.
@external(javascript, "./js_ffi.mjs", "parseJson")
pub fn parse_json(s: String) -> Result(Dynamic, Exception)

/// Runs a promise for its side effects and reports (never rethrows) failure.
pub fn fire_and_forget(
  p: Promise(Result(a, e)),
  on_error: fn(e) -> Nil,
) -> Nil {
  promise.tap(p, fn(r) {
    case r {
      Ok(_) -> Nil
      Error(e) -> on_error(e)
    }
  })
  Nil
}

@external(javascript, "./js_ffi.mjs", "nowMs")
pub fn now_ms() -> Int

@external(javascript, "./js_ffi.mjs", "hrtimeNanos")
pub fn hrtime_nanos() -> Int

@external(javascript, "./js_ffi.mjs", "dateToIso")
pub fn date_to_iso(d: Dynamic) -> String

@external(javascript, "./js_ffi.mjs", "isDate")
pub fn is_date(d: Dynamic) -> Bool

/// JavaScript string coercion, including objects such as ATProto CIDs.
@external(javascript, "./js_ffi.mjs", "toString")
pub fn to_string(value: Dynamic) -> String

@external(javascript, "./js_ffi.mjs", "stringLength")
pub fn string_length(value: String) -> Int

@external(javascript, "./js_ffi.mjs", "randomInt")
pub fn random_int(max_exclusive: Int) -> Int

@external(javascript, "./js_ffi.mjs", "regexTest")
pub fn regex_test(pattern: String, value: String) -> Bool

@external(javascript, "./js_ffi.mjs", "numberFromString")
pub fn number_from_string(value: String) -> Option(Float)

@external(javascript, "./js_ffi.mjs", "causes")
pub fn causes(error: Exception) -> List(Exception)

@external(javascript, "./js_ffi.mjs", "truthy")
pub fn truthy(value: Dynamic) -> Bool

@external(javascript, "./js_ffi.mjs", "parseDateMs")
pub fn parse_date_ms(value: String) -> Option(Int)
