import gleam/javascript/promise as gleam_promise
import gleam/option as gleam_option
import rocksky_api/node/js.{type Exception}

pub type Signal

@external(javascript, "./abort_ffi.mjs", "check")
pub fn check(signal: Signal) -> Result(Nil, Exception)

@external(javascript, "./abort_ffi.mjs", "timeout")
pub fn timeout(ms: Int) -> Signal

@external(javascript, "./abort_ffi.mjs", "any")
pub fn any(signals: List(Signal)) -> Signal

@external(javascript, "./abort_ffi.mjs", "aborted")
pub fn aborted(signal: Signal) -> Bool

@external(javascript, "./abort_ffi.mjs", "sleep")
pub fn sleep(
  ms: Int,
  signal: gleam_option.Option(Signal),
) -> gleam_promise.Promise(Result(Nil, js.Exception))
