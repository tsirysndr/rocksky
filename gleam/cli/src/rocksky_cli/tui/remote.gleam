import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

pub type Remote

pub type Mpris

@external(javascript, "./remote_ffi.mjs", "connect")
pub fn connect(
  name: String,
  url: String,
  token: fn() -> String,
  command: fn(String, Dynamic) -> Promise(Nil),
) -> Promise(Result(Remote, String))

@external(javascript, "./remote_ffi.mjs", "push")
pub fn push(
  remote: Remote,
  status: String,
  track: Dynamic,
  queue: List(Dynamic),
  index: Int,
) -> Nil

@external(javascript, "./remote_ffi.mjs", "disconnect")
pub fn disconnect(remote: Remote) -> Nil

@external(javascript, "./remote_ffi.mjs", "mpris")
pub fn mpris(
  command: fn(String, Dynamic) -> Promise(Nil),
) -> Promise(Result(Mpris, String))

@external(javascript, "./remote_ffi.mjs", "mpris_update")
pub fn mpris_update(
  mpris: Mpris,
  status: String,
  track: Dynamic,
  index: Int,
) -> Nil

@external(javascript, "./remote_ffi.mjs", "mpris_close")
pub fn mpris_close(mpris: Mpris) -> Nil

@external(javascript, "./remote_ffi.mjs", "interval")
pub fn interval(ms: Int, callback: fn() -> Promise(Nil)) -> fn() -> Nil
