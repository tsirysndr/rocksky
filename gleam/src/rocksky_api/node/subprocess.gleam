import gleam/javascript/promise.{type Promise}
import rocksky_api/node/js.{type Exception}

pub type Output {
  Output(code: Int, stderr: String)
}

@external(javascript, "./subprocess_ffi.mjs", "run")
pub fn run(
  command: String,
  arguments: List(String),
  timeout_ms: Int,
) -> Promise(Result(Output, Exception))
