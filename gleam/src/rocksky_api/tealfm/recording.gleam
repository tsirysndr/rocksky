import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option}
import rocksky_api/node/js

@external(javascript, "./recording_ffi.mjs", "lookup")
pub fn lookup(
  base_url: String,
  title: String,
  artist: String,
  album: String,
  duration_ms: Int,
  isrc: String,
) -> Promise(Result(Option(String), js.Exception))

@external(javascript, "./recording_ffi.mjs", "forQueue")
pub fn for_queue(record: Json, isrc: String) -> Json

@external(javascript, "./recording_ffi.mjs", "resolvePending")
pub fn resolve_pending(
  base_url: String,
  record: Dynamic,
) -> Promise(Result(Option(Dynamic), js.Exception))
