import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

@external(javascript, "./node_ffi.mjs", "print")
pub fn print(text: String) -> Nil

@external(javascript, "./node_ffi.mjs", "error")
pub fn error(text: String) -> Nil

@external(javascript, "./node_ffi.mjs", "exit_code")
pub fn exit_code(code: Int) -> Nil

@external(javascript, "./node_ffi.mjs", "env")
pub fn env(name: String) -> String

@external(javascript, "./node_ffi.mjs", "state_path")
pub fn state_path(name: String) -> String

@external(javascript, "./node_ffi.mjs", "read")
pub fn read(path: String) -> Result(String, String)

@external(javascript, "./node_ffi.mjs", "write")
pub fn write(path: String, data: String) -> Result(Nil, String)

@external(javascript, "./node_ffi.mjs", "remove")
pub fn remove(path: String) -> Nil

@external(javascript, "./node_ffi.mjs", "files")
pub fn files(path: String) -> List(String)

@external(javascript, "./node_ffi.mjs", "is_directory")
pub fn is_directory(path: String) -> Bool

@external(javascript, "./node_ffi.mjs", "absolute")
pub fn absolute(path: String) -> String

@external(javascript, "./node_ffi.mjs", "hash")
pub fn hash(data: String, algorithm: String) -> String

@external(javascript, "./node_ffi.mjs", "timestamp")
pub fn timestamp(date: String) -> Result(Int, String)

@external(javascript, "./node_ffi.mjs", "iso_date")
pub fn iso_date(seconds: Int) -> String

@external(javascript, "./node_ffi.mjs", "now")
pub fn now() -> Int

@external(javascript, "./node_ffi.mjs", "delay")
pub fn delay(ms: Int) -> Promise(Nil)

@external(javascript, "./node_ffi.mjs", "fetch_json")
pub fn fetch_json(
  url: String,
  method: String,
  token: String,
  body: String,
) -> Promise(Result(Dynamic, String))

@external(javascript, "./node_ffi.mjs", "encode")
pub fn encode(text: String) -> String

@external(javascript, "./node_ffi.mjs", "relative_time")
pub fn relative_time(date: String) -> String

@external(javascript, "./node_ffi.mjs", "open_browser")
pub fn open_browser(url: String) -> Promise(Nil)

@external(javascript, "./node_ffi.mjs", "error_text")
pub fn error_text(error: Dynamic) -> String

@external(javascript, "./node_ffi.mjs", "normalize")
pub fn normalize(text: String) -> String

@external(javascript, "./node_ffi.mjs", "random_hex")
pub fn random_hex(bytes: Int) -> String

@external(javascript, "./node_ffi.mjs", "terminate")
pub fn terminate(code: Int) -> Nil

@external(javascript, "./node_ffi.mjs", "shuffled")
pub fn shuffled(items: List(a)) -> List(a)
