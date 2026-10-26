import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

pub type Response {
  Response(status: Int, body: String, content_type: String)
}

@external(javascript, "./http_ffi.mjs", "serve")
pub fn serve(
  port: Int,
  handler: fn(Dynamic) -> Promise(Response),
  close: fn() -> Promise(Nil),
) -> Promise(Nil)
