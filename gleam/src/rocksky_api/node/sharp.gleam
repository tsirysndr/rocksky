import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Metadata {
  Metadata(width: Option(Int), height: Option(Int), format: Option(String))
}

@external(javascript, "./sharp_ffi.mjs", "metadata")
pub fn metadata(bytes: BitArray) -> Promise(Result(Metadata, Exception))
