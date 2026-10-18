import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Response {
  Response(status: Int, location: Option(String), data: Dynamic)
}

@external(javascript, "./fetch_ffi.mjs", "query")
pub fn query(params: Json) -> String

@external(javascript, "./fetch_ffi.mjs", "get")
pub fn get(
  url: String,
  headers: List(#(String, String)),
  manual_redirect: Bool,
) -> Promise(Result(Response, Exception))

@external(javascript, "./fetch_ffi.mjs", "request")
pub fn request(
  url: String,
  method: String,
  headers: List(#(String, String)),
  body: Option(String),
) -> Promise(Result(Response, Exception))
