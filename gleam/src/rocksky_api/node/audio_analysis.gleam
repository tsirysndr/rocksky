import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import rocksky_api/node/js.{type Exception}

pub type Module

@external(javascript, "./audio_analysis_ffi.mjs", "load")
pub fn load() -> Promise(Result(Module, Exception))

@external(javascript, "./audio_analysis_ffi.mjs", "analyze")
pub fn analyze(
  module: Module,
  bytes: BitArray,
  extension: String,
) -> Promise(Result(Dynamic, Exception))

pub type BatchItem {
  BatchItem(id: String, bytes: BitArray, extension: String)
}

@external(javascript, "./audio_analysis_ffi.mjs", "analyzeBatch")
pub fn analyze_batch(
  module: Module,
  items: List(BatchItem),
  progress: fn(Dynamic) -> Nil,
) -> Promise(Result(Dynamic, Exception))
