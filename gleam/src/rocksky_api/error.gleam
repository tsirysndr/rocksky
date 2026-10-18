//// The error type every service and handler returns.

import gleam/dynamic
import gleam/dynamic/decode
import gleam/int
import gleam/list
import gleam/string
import rocksky_api/node/js.{type Exception}

pub type Error {
  /// Thrown by a JavaScript binding (pg, redis, atproto, ...).
  Js(Exception)
  Decode(context: String, errors: List(decode.DecodeError))
  Message(String)
  NotFound(String)
  Unauthorized(String)
  Forbidden(String)
  ScrobbleBotFlagged(message: String)
  ScrobbleBlocked(retry_after: Int, message: String)
  InvalidRequest(String)
  RequestError(name: String, message: String)
  Timeout(String)
  Upstream(status: Int, message: String)
  /// The user's PDS session is gone: client must sign in again.
  PdsSessionExpired
}

pub fn to_string(error: Error) -> String {
  case error {
    Js(e) -> js.message(e)
    Decode(context, errors) ->
      context <> ": " <> string.join(list.map(errors, describe_decode), "; ")
    Message(m) -> m
    NotFound(m) -> m
    Unauthorized(m) -> m
    Forbidden(m) -> m
    ScrobbleBotFlagged(m) -> m
    ScrobbleBlocked(_, m) -> m
    InvalidRequest(m) -> m
    RequestError(_, m) -> m
    Timeout(m) -> m
    Upstream(status, m) -> "upstream " <> int.to_string(status) <> ": " <> m
    PdsSessionExpired -> "PDS session expired"
  }
}

/// Full rendering, including an exception's cause chain.
pub fn describe(error: Error) -> String {
  case error {
    Js(e) -> js.describe(e)
    _ -> to_string(error)
  }
}

pub fn describe_decode(e: decode.DecodeError) -> String {
  "expected "
  <> e.expected
  <> ", found "
  <> e.found
  <> " at "
  <> string.join(e.path, ".")
}

pub fn message(m: String) -> Error {
  Message(m)
}

pub fn from_js(e: Exception) -> Error {
  Js(e)
}

/// The exception as a loggable JS value.
pub fn to_js(e: Exception) -> dynamic.Dynamic {
  js.to_dynamic(e)
}

pub fn map_js(r: Result(a, Exception)) -> Result(a, Error) {
  case r {
    Ok(v) -> Ok(v)
    Error(e) -> Error(Js(e))
  }
}

pub fn decode(
  context: String,
  r: Result(a, List(decode.DecodeError)),
) -> Result(a, Error) {
  case r {
    Ok(v) -> Ok(v)
    Error(errors) -> Error(Decode(context, errors))
  }
}

/// Lower-cased message, for substring matching on driver errors.
pub fn lower_message(error: Error) -> String {
  string.lowercase(to_string(error))
}

pub fn contains(error: Error, needle: String) -> Bool {
  string.contains(lower_message(error), string.lowercase(needle))
}
