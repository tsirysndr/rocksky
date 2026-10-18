//// Binding to the `redis` (node-redis v4) client.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Client

/// Connects; `on_error` is wired to the client's `error` event.
@external(javascript, "./redis_ffi.mjs", "connect")
pub fn connect(
  url: String,
  on_error: fn(Exception) -> Nil,
) -> Promise(Result(Client, Exception))

@external(javascript, "./redis_ffi.mjs", "get")
pub fn get(
  client: Client,
  key: String,
) -> Promise(Result(Option(String), Exception))

@external(javascript, "./redis_ffi.mjs", "set")
pub fn set(
  client: Client,
  key: String,
  value: String,
) -> Promise(Result(Nil, Exception))

/// `SET key value EX seconds`.
@external(javascript, "./redis_ffi.mjs", "setEx")
pub fn set_ex(
  client: Client,
  key: String,
  seconds: Int,
  value: String,
) -> Promise(Result(Nil, Exception))

/// `SET key value NX EX seconds`; `True` when the key was claimed.
@external(javascript, "./redis_ffi.mjs", "setNxEx")
pub fn set_nx_ex(
  client: Client,
  key: String,
  seconds: Int,
  value: String,
) -> Promise(Result(Bool, Exception))

@external(javascript, "./redis_ffi.mjs", "del")
pub fn del(
  client: Client,
  keys: List(String),
) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "incr")
pub fn incr(client: Client, key: String) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "ttl")
pub fn ttl(client: Client, key: String) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "expire")
pub fn expire(
  client: Client,
  key: String,
  seconds: Int,
) -> Promise(Result(Bool, Exception))

@external(javascript, "./redis_ffi.mjs", "keys")
pub fn keys(
  client: Client,
  pattern: String,
) -> Promise(Result(List(String), Exception))

@external(javascript, "./redis_ffi.mjs", "exists")
pub fn exists(client: Client, key: String) -> Promise(Result(Bool, Exception))

@external(javascript, "./redis_ffi.mjs", "publish")
pub fn publish(
  client: Client,
  channel: String,
  message: String,
) -> Promise(Result(Int, Exception))

/// `EVAL` of a Lua script; the raw reply.
@external(javascript, "./redis_ffi.mjs", "eval")
pub fn eval(
  client: Client,
  script: String,
  keys: List(String),
  args: List(String),
) -> Promise(Result(Dynamic, Exception))

/// Atomic sliding-window step: ZADD now, trim below `min_score`, ZCARD, EXPIRE.
/// Returns the cardinality after the trim.
@external(javascript, "./redis_ffi.mjs", "slidingWindowCount")
pub fn sliding_window_count(
  client: Client,
  key: String,
  score: Int,
  member: String,
  min_score: Int,
  expire_seconds: Int,
) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "hGetAll")
pub fn h_get_all(
  client: Client,
  key: String,
) -> Promise(Result(List(#(String, String)), Exception))

@external(javascript, "./redis_ffi.mjs", "hSet")
pub fn h_set(
  client: Client,
  key: String,
  field: String,
  value: String,
) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "lPush")
pub fn l_push(
  client: Client,
  key: String,
  value: String,
) -> Promise(Result(Int, Exception))

@external(javascript, "./redis_ffi.mjs", "lRange")
pub fn l_range(
  client: Client,
  key: String,
  start: Int,
  stop: Int,
) -> Promise(Result(List(String), Exception))

@external(javascript, "./redis_ffi.mjs", "quit")
pub fn quit(client: Client) -> Promise(Nil)
