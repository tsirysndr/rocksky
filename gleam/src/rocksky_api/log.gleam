//// Logging facade over `consola`, with `chalk` colours.

import gleam/dynamic.{type Dynamic}
import rocksky_api/node/consola
import rocksky_api/node/js.{type Exception}

pub fn info(message: String) -> Nil {
  consola.info(message)
}

pub fn warn(message: String) -> Nil {
  consola.warn(message)
}

pub fn error(message: String) -> Nil {
  consola.error(message)
}

pub fn debug(message: String) -> Nil {
  consola.debug(message)
}

pub fn success(message: String) -> Nil {
  consola.success(message)
}

pub fn error_with(message: String, value: Dynamic) -> Nil {
  consola.error_with(message, value)
}

pub fn warn_with(message: String, value: Dynamic) -> Nil {
  consola.warn_with(message, value)
}

pub fn info_with(message: String, value: Dynamic) -> Nil {
  consola.info_with(message, value)
}

pub fn error_exception(message: String, e: Exception) -> Nil {
  consola.error_with(message, js.to_dynamic(e))
}

pub fn warn_exception(message: String, e: Exception) -> Nil {
  consola.warn_with(message, js.to_dynamic(e))
}

pub fn cyan(s: String) -> String {
  consola.cyan(s)
}

pub fn green(s: String) -> String {
  consola.green_bright(s)
}

pub fn yellow(s: String) -> String {
  consola.yellow_bright(s)
}

pub fn red(s: String) -> String {
  consola.red(s)
}

pub fn gray(s: String) -> String {
  consola.gray(s)
}

pub fn magenta(s: String) -> String {
  consola.magenta(s)
}
