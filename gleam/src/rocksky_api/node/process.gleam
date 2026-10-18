import gleam/dynamic.{type Dynamic}
import gleam/option.{type Option}

@external(javascript, "./process_ffi.mjs", "argv")
pub fn argv() -> List(String)

@external(javascript, "./process_ffi.mjs", "exit")
pub fn exit(code: Int) -> a

@external(javascript, "./process_ffi.mjs", "pid")
pub fn pid() -> Int

@external(javascript, "./process_ffi.mjs", "env")
pub fn env(name: String) -> Option(String)

/// Registers a handler for a process event such as `unhandledRejection`.
@external(javascript, "./process_ffi.mjs", "on")
pub fn on(event: String, handler: fn(Dynamic) -> Nil) -> Nil

@external(javascript, "./process_ffi.mjs", "once")
pub fn once(event: String, handler: fn(Dynamic) -> Nil) -> Nil

@external(javascript, "./process_ffi.mjs", "kill")
pub fn kill_self(signal: String) -> Nil

@external(javascript, "./process_ffi.mjs", "setDnsIpv4First")
pub fn set_dns_ipv4_first() -> Nil

/// Keeps the event loop alive forever (servers and subscribers).
@external(javascript, "./process_ffi.mjs", "keepAlive")
pub fn keep_alive() -> Nil

@external(javascript, "./process_ffi.mjs", "setInterval")
pub fn set_interval(ms: Int, f: fn() -> Nil) -> Dynamic

@external(javascript, "./process_ffi.mjs", "clearInterval")
pub fn clear_interval(handle: Dynamic) -> Nil

@external(javascript, "./process_ffi.mjs", "setTimeout")
pub fn set_timeout(ms: Int, f: fn() -> Nil) -> Dynamic

@external(javascript, "./process_ffi.mjs", "clearTimeout")
pub fn clear_timeout(handle: Dynamic) -> Nil
