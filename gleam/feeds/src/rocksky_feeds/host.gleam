import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_feeds/types.{type Config, type Query, type Response, type Row}

import rocksky_feeds/drizzle.{type Database}

@external(javascript, "./host_ffi.mjs", "env")
pub fn env(name: String) -> String

@external(javascript, "./host_ffi.mjs", "open_database")
pub fn open_database(url: String) -> Database

@external(javascript, "./host_ffi.mjs", "query")
pub fn query(
  database: Database,
  query: Query,
) -> Promise(Result(List(Row), String))

@external(javascript, "./host_ffi.mjs", "verify")
pub fn verify(token: String) -> Promise(Bool)

@external(javascript, "./host_ffi.mjs", "cursor")
pub fn cursor(value: String) -> Option(Int)

@external(javascript, "./host_ffi.mjs", "valid_uri")
pub fn valid_uri(value: String) -> Bool

@external(javascript, "./host_ffi.mjs", "serve")
pub fn serve(
  config: Config,
  database: Database,
  handler: fn(String, String, List(#(String, String)), String) ->
    Promise(Response),
) -> Nil

@external(javascript, "./host_ffi.mjs", "fail")
pub fn fail(message: String) -> Nil

@external(javascript, "./telemetry_ffi.mjs", "feed_span")
pub fn feed_span(
  key: String,
  publisher: String,
  limit: Int,
  paginated: Bool,
  authenticated: Bool,
  run: fn() -> Promise(Result(List(Row), String)),
) -> Promise(Result(List(Row), String))

@external(javascript, "./telemetry_ffi.mjs", "outcome")
pub fn outcome(key: String, status: String) -> Nil
