//// Binding to `nats` (nats.js): publish/subscribe with string payloads.

import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Connection

pub type Subscription

@external(javascript, "./nats_ffi.mjs", "connect")
pub fn connect(url: String) -> Promise(Result(Connection, Exception))

@external(javascript, "./nats_ffi.mjs", "publish")
pub fn publish(nc: Connection, subject: String, data: String) -> Nil

@external(javascript, "./nats_ffi.mjs", "flush")
pub fn flush(nc: Connection) -> Promise(Nil)

/// Calls `handler` for every message; the handler's promise is awaited before
/// the next message is taken, matching the `for await` loops it replaces.
@external(javascript, "./nats_ffi.mjs", "subscribe")
pub fn subscribe(
  nc: Connection,
  subject: String,
  handler: fn(String) -> Promise(Nil),
) -> Subscription

@external(javascript, "./nats_ffi.mjs", "unsubscribe")
pub fn unsubscribe(sub: Subscription) -> Nil

@external(javascript, "./nats_ffi.mjs", "request")
pub fn request(
  nc: Connection,
  subject: String,
  data: String,
  timeout_ms: Int,
) -> Promise(Result(String, Exception))

@external(javascript, "./nats_ffi.mjs", "drain")
pub fn drain(nc: Connection) -> Promise(Nil)

/// Pull-based subscription for streams that must await each outgoing write.
@external(javascript, "./nats_ffi.mjs", "subscribeRaw")
pub fn subscribe_raw(nc: Connection, subject: String) -> Subscription

@external(javascript, "./nats_ffi.mjs", "nextMessage")
pub fn next_message(
  subscription: Subscription,
) -> Promise(Result(Option(String), Exception))
