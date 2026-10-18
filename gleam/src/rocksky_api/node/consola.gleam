//// Binding to `consola` (logging) and `chalk` (terminal colours).

import gleam/dynamic.{type Dynamic}

@external(javascript, "./consola_ffi.mjs", "info")
pub fn info(message: String) -> Nil

@external(javascript, "./consola_ffi.mjs", "warn")
pub fn warn(message: String) -> Nil

@external(javascript, "./consola_ffi.mjs", "error")
pub fn error(message: String) -> Nil

@external(javascript, "./consola_ffi.mjs", "debug")
pub fn debug(message: String) -> Nil

@external(javascript, "./consola_ffi.mjs", "success")
pub fn success(message: String) -> Nil

/// Logs a message followed by a raw JS value (an error, a payload).
@external(javascript, "./consola_ffi.mjs", "errorWith")
pub fn error_with(message: String, value: Dynamic) -> Nil

@external(javascript, "./consola_ffi.mjs", "warnWith")
pub fn warn_with(message: String, value: Dynamic) -> Nil

@external(javascript, "./consola_ffi.mjs", "infoWith")
pub fn info_with(message: String, value: Dynamic) -> Nil

@external(javascript, "./consola_ffi.mjs", "debugWith")
pub fn debug_with(message: String, value: Dynamic) -> Nil

/// Adds a reporter receiving `{ level, type, tag, args }` log objects.
@external(javascript, "./consola_ffi.mjs", "addReporter")
pub fn add_reporter(log: fn(Dynamic) -> Nil) -> Nil

@external(javascript, "./consola_ffi.mjs", "cyan")
pub fn cyan(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "green")
pub fn green(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "greenBright")
pub fn green_bright(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "yellow")
pub fn yellow(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "yellowBright")
pub fn yellow_bright(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "red")
pub fn red(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "magenta")
pub fn magenta(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "gray")
pub fn gray(s: String) -> String

@external(javascript, "./consola_ffi.mjs", "bold")
pub fn bold(s: String) -> String
