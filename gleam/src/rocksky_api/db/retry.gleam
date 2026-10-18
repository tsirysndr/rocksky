//// Which database failures are worth retrying.

import gleam/list
import rocksky_api/error.{type Error}
import rocksky_api/node/js

const transient = [
  "econnreset", "epipe", "connection terminated",
  "connection ended unexpectedly", "server closed the connection unexpectedly",
  "client has encountered a connection error",
  "terminating connection due to administrator command",
]

const fatal = [
  "timeout exceeded when trying to connect",
  "canceling statement due to statement timeout",
  "canceling statement due to user request", "too many clients already",
  "remaining connection slots are reserved",
]

pub fn is_transient(err: Error) -> Bool {
  let message = case err {
    error.Js(e) -> lower(js.describe(e))
    _ -> error.lower_message(err)
  }
  case list.any(fatal, fn(n) { string_contains(message, n) }) {
    True -> False
    False -> list.any(transient, fn(n) { string_contains(message, n) })
  }
}

const connection_codes = [
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENETUNREACH",
  "EHOSTUNREACH", "EAI_AGAIN", "57P01", "57P02", "57P03", "08000", "08001",
  "08003", "08004", "08006", "08007",
]

/// Connection-level failures, through the `cause` chain.
pub fn is_connection_error(err: Error) -> Bool {
  case err {
    error.Js(e) -> {
      has_code(e, connection_codes)
      || list.any(js.causes(e), fn(cause) {
        connection_message(js.message(cause))
      })
    }
    _ -> connection_message(error.lower_message(err))
  }
}

fn connection_message(message: String) -> Bool {
  js.regex_test(
    "^(?:connection (?:terminated|closed)(?: unexpectedly| due to connection timeout)?|client (?:has encountered a connection error|was closed).*|timeout exceeded when trying to connect)$",
    lower(message),
  )
}

@external(javascript, "./retry_ffi.mjs", "contains")
fn string_contains(haystack: String, needle: String) -> Bool

@external(javascript, "./retry_ffi.mjs", "lower")
fn lower(s: String) -> String

@external(javascript, "./retry_ffi.mjs", "hasCode")
fn has_code(error: js.Exception, codes: List(String)) -> Bool
