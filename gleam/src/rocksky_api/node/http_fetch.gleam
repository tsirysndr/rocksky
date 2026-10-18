import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/abort.{type Signal}
import rocksky_api/node/js.{type Exception}

pub type Response

@external(javascript, "./http_fetch_ffi.mjs", "get")
pub fn get(
  url: String,
  headers: List(#(String, String)),
  signal: Signal,
) -> Promise(Result(Response, Exception))

@external(javascript, "./http_fetch_ffi.mjs", "status")
pub fn status(response: Response) -> Int

@external(javascript, "./http_fetch_ffi.mjs", "header")
pub fn header(response: Response, name: String) -> Option(String)

@external(javascript, "./http_fetch_ffi.mjs", "json")
pub fn json(response: Response) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./http_fetch_ffi.mjs", "request")
pub fn request(
  url: String,
  method: String,
  headers: List(#(String, String)),
  body: Option(String),
) -> Promise(Result(Response, Exception))

@external(javascript, "./http_fetch_ffi.mjs", "text")
pub fn text(response: Response) -> Promise(Result(String, Exception))

@external(javascript, "./http_fetch_ffi.mjs", "bytes")
pub fn bytes(response: Response) -> Promise(Result(BitArray, Exception))
