import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/string
import rocksky_cli/node

pub type Agent

pub type Index

pub type Subscription

@external(javascript, "./sdk_ffi.mjs", "login")
pub fn login(
  identifier: String,
  password: String,
) -> Promise(Result(Agent, String))

@external(javascript, "./sdk_ffi.mjs", "did")
pub fn did(agent: Agent) -> String

@external(javascript, "./sdk_ffi.mjs", "open_index")
pub fn open_index(
  agent: Agent,
  path: String,
  key: fn(String, String, String, Int) -> String,
) -> Promise(Result(Index, String))

@external(javascript, "./sdk_ffi.mjs", "sync")
pub fn sync(agent: Agent) -> Promise(Result(Dynamic, String))

@external(javascript, "./sdk_ffi.mjs", "hydrate")
pub fn hydrate(agent: Agent) -> Subscription

@external(javascript, "./sdk_ffi.mjs", "stop")
pub fn stop(subscription: Subscription) -> Promise(Nil)

@external(javascript, "./sdk_ffi.mjs", "close")
pub fn close(index: Index) -> Promise(Nil)

@external(javascript, "./sdk_ffi.mjs", "rate_limit")
pub fn rate_limit(agent: Agent, rate: Int, disabled: Bool) -> Dynamic

@external(javascript, "./sdk_ffi.mjs", "publish")
pub fn publish(
  agent: Agent,
  index: Index,
  track: Dynamic,
  fallback: fn(Dynamic) -> Bool,
) -> Promise(Result(String, Dynamic))

@external(javascript, "./sdk_ffi.mjs", "signal")
pub fn signal(callback: fn() -> Nil) -> fn() -> Nil

@external(javascript, "./sdk_ffi.mjs", "parallel")
pub fn parallel(
  items: List(a),
  concurrency: Int,
  work: fn(a) -> Promise(Nil),
) -> Promise(Nil)

pub fn play_key(
  did: String,
  title: String,
  artist: String,
  seconds: Int,
) -> String {
  json.array(
    [
      json.string(did),
      json.string(title |> node.normalize |> string.trim |> string.lowercase),
      json.string(artist |> node.normalize |> string.trim |> string.lowercase),
      json.int(seconds),
    ],
    fn(x) { x },
  )
  |> json.to_string
}

@external(javascript, "./sdk_ffi.mjs", "records")
pub fn records(index: Index) -> List(Dynamic)

@external(javascript, "./sdk_ffi.mjs", "watch_index")
pub fn watch_index(index: Index, callback: fn(Dynamic) -> Nil) -> fn() -> Nil

@external(javascript, "./sdk_ffi.mjs", "until_signal")
pub fn until_signal() -> Promise(Nil)
