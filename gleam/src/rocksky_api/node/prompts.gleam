import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

@external(javascript, "./prompts_ffi.mjs", "text")
pub fn text(message: String) -> Promise(Result(Option(String), Exception))

@external(javascript, "./prompts_ffi.mjs", "confirm")
pub fn confirm(
  message: String,
  initial: Bool,
) -> Promise(Result(Bool, Exception))

@external(javascript, "./prompts_ffi.mjs", "textInitial")
pub fn text_initial(
  message: String,
  initial: Option(String),
) -> Promise(Result(Option(String), Exception))

@external(javascript, "./prompts_ffi.mjs", "choose")
pub fn choose(
  message: String,
  choices: List(#(String, String)),
  initial: Int,
) -> Promise(Result(Option(String), Exception))
