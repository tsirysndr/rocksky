//// Binding to `hono` and `@hono/node-server`.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type App

/// The per-request context (`c`).
pub type Context

pub type Response

pub type Handler =
  fn(Context) -> Promise(Response)

/// Returns a response to short-circuit, or `None` after calling `next`.
pub type Middleware =
  fn(Context, fn() -> Promise(Nil)) -> Promise(Option(Response))

@external(javascript, "./hono_ffi.mjs", "newApp")
pub fn new() -> App

@external(javascript, "./hono_ffi.mjs", "on")
fn on(app: App, method: String, path: String, handler: Handler) -> App

pub fn get(app: App, path: String, handler: Handler) -> App {
  on(app, "get", path, handler)
}

pub fn post(app: App, path: String, handler: Handler) -> App {
  on(app, "post", path, handler)
}

pub fn put(app: App, path: String, handler: Handler) -> App {
  on(app, "put", path, handler)
}

pub fn patch(app: App, path: String, handler: Handler) -> App {
  on(app, "patch", path, handler)
}

pub fn delete(app: App, path: String, handler: Handler) -> App {
  on(app, "delete", path, handler)
}

pub fn all(app: App, path: String, handler: Handler) -> App {
  on(app, "all", path, handler)
}

@external(javascript, "./hono_ffi.mjs", "use")
pub fn use_(app: App, path: String, middleware: Middleware) -> App

@external(javascript, "./hono_ffi.mjs", "cors")
pub fn cors(app: App) -> App

@external(javascript, "./hono_ffi.mjs", "route")
pub fn route(app: App, path: String, sub: App) -> App

@external(javascript, "./hono_ffi.mjs", "serve")
pub fn serve(app: App, port: Int) -> Nil

// ---- request ---------------------------------------------------------------

@external(javascript, "./hono_ffi.mjs", "param")
pub fn param(c: Context, name: String) -> String

@external(javascript, "./hono_ffi.mjs", "query")
pub fn query(c: Context, name: String) -> Option(String)

@external(javascript, "./hono_ffi.mjs", "queries")
pub fn queries(c: Context) -> List(#(String, String))

@external(javascript, "./hono_ffi.mjs", "header")
pub fn header(c: Context, name: String) -> Option(String)

@external(javascript, "./hono_ffi.mjs", "method")
pub fn method(c: Context) -> String

@external(javascript, "./hono_ffi.mjs", "path")
pub fn path(c: Context) -> String

@external(javascript, "./hono_ffi.mjs", "url")
pub fn url(c: Context) -> String

@external(javascript, "./hono_ffi.mjs", "jsonBody")
pub fn json_body(c: Context) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./hono_ffi.mjs", "textBody")
pub fn text_body(c: Context) -> Promise(Result(String, Exception))

@external(javascript, "./hono_ffi.mjs", "bytesBody")
pub fn bytes_body(c: Context) -> Promise(Result(BitArray, Exception))

pub type FormData

@external(javascript, "./hono_ffi.mjs", "formData")
pub fn form_data(c: Context) -> Promise(Result(FormData, Exception))

@external(javascript, "./hono_ffi.mjs", "formString")
pub fn form_string(form: FormData, name: String) -> Option(String)

pub type File

@external(javascript, "./hono_ffi.mjs", "formFile")
pub fn form_file(form: FormData, name: String) -> Option(File)

@external(javascript, "./hono_ffi.mjs", "fileName")
pub fn file_name(file: File) -> String

@external(javascript, "./hono_ffi.mjs", "fileType")
pub fn file_type(file: File) -> String

@external(javascript, "./hono_ffi.mjs", "fileSize")
pub fn file_size(file: File) -> Int

@external(javascript, "./hono_ffi.mjs", "fileBytes")
pub fn file_bytes(file: File) -> Promise(Result(BitArray, Exception))

/// The raw `Request` (for bindings that need it).
@external(javascript, "./hono_ffi.mjs", "raw")
pub fn raw(c: Context) -> Dynamic

// ---- response --------------------------------------------------------------

@external(javascript, "./hono_ffi.mjs", "setHeader")
pub fn set_header(c: Context, name: String, value: String) -> Nil

@external(javascript, "./hono_ffi.mjs", "json")
pub fn json(c: Context, body: Json, status: Int) -> Response

/// Any JS value as the JSON body (already-shaped upstream payloads).
@external(javascript, "./hono_ffi.mjs", "json")
pub fn json_dynamic(c: Context, body: Dynamic, status: Int) -> Response

@external(javascript, "./hono_ffi.mjs", "text")
pub fn text(c: Context, body: String, status: Int) -> Response

@external(javascript, "./hono_ffi.mjs", "html")
pub fn html(c: Context, body: String, status: Int) -> Response

@external(javascript, "./hono_ffi.mjs", "redirect")
pub fn redirect(c: Context, url: String) -> Response

@external(javascript, "./hono_ffi.mjs", "bytes")
pub fn bytes(
  c: Context,
  body: BitArray,
  status: Int,
  content_type: String,
) -> Response

@external(javascript, "./hono_ffi.mjs", "empty")
pub fn empty(c: Context, status: Int) -> Response

/// Fetches `url` and streams it back with the upstream content type.
@external(javascript, "./hono_ffi.mjs", "proxyFetch")
pub fn proxy_fetch(
  c: Context,
  url: String,
  fallback_content_type: String,
) -> Promise(Result(Response, Exception))

/// Any pre-built web `Response`.
@external(javascript, "./hono_ffi.mjs", "rawResponse")
pub fn raw_response(response: Dynamic) -> Response

pub fn ok(c: Context, body: Json) -> Response {
  json(c, body, 200)
}

pub fn status(c: Context, body: Json, code: Int) -> Response {
  json(c, body, code)
}

pub fn unauthorized(c: Context) -> Response {
  text(c, "Unauthorized", 401)
}

pub fn bad_request(c: Context, message: String) -> Response {
  text(c, message, 400)
}

pub fn not_found(c: Context, message: String) -> Response {
  text(c, message, 404)
}

pub fn internal_error(c: Context, message: String) -> Response {
  text(c, message, 500)
}

pub fn respond(r: Response) -> Promise(Response) {
  promise.resolve(r)
}

// ---- server-sent events ------------------------------------------------------

pub type Stream

@external(javascript, "./hono_ffi.mjs", "streamSse")
pub fn stream_sse(c: Context, body: fn(Stream) -> Promise(Nil)) -> Response

@external(javascript, "./hono_ffi.mjs", "writeSse")
pub fn write_sse(
  stream: Stream,
  event: String,
  data: String,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./hono_ffi.mjs", "onAbort")
pub fn on_abort(stream: Stream, f: fn() -> Nil) -> Nil

@external(javascript, "./hono_ffi.mjs", "streamSleep")
pub fn stream_sleep(stream: Stream, ms: Int) -> Promise(Nil)

@external(javascript, "./hono_ffi.mjs", "streamClosed")
pub fn stream_closed(stream: Stream) -> Bool

@external(javascript, "./hono_ffi.mjs", "bodyResponse")
pub fn body_response(
  body: Dynamic,
  headers: List(#(String, String)),
  status: Int,
) -> Response

pub fn options(app: App, path: String, handler: Handler) -> App {
  on(app, "options", path, handler)
}

@external(javascript, "./hono_ffi.mjs", "fileText")
pub fn file_text(file: File) -> Promise(Result(String, Exception))
