import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import rocksky_api/node/js.{type Exception}

@external(javascript, "./music_metadata_ffi.mjs", "parse")
pub fn parse(
  bytes: BitArray,
  mime: String,
) -> Promise(Result(Dynamic, Exception))
