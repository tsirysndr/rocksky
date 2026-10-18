//// Binding to `axios`: shared instances with a base URL, typed responses.

import rocksky_api/node/abort

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option, None, Some}
import rocksky_api/node/js.{type Exception}

pub type Instance

pub type Response {
  Response(status: Int, headers: List(#(String, String)), data: Dynamic)
}

pub type Options {
  Options(
    headers: List(#(String, String)),
    params: List(#(String, String)),
    timeout_ms: Option(Int),
    /// `"json"`, `"text"`, `"arraybuffer"` or `"stream"`.
    response_type: Option(String),
    /// Accept any status instead of rejecting on 4xx/5xx.
    validate_status: Bool,
  )
}

pub fn default_options() -> Options {
  Options(
    headers: [],
    params: [],
    timeout_ms: None,
    response_type: None,
    validate_status: False,
  )
}

pub fn with_headers(headers: List(#(String, String))) -> Options {
  Options(..default_options(), headers: headers)
}

pub fn with_params(params: List(#(String, String))) -> Options {
  Options(..default_options(), params: params)
}

pub fn bearer(token: String) -> Options {
  with_headers([#("Authorization", "Bearer " <> token)])
}

pub fn with_timeout(options: Options, ms: Int) -> Options {
  Options(..options, timeout_ms: Some(ms))
}

@external(javascript, "./axios_ffi.mjs", "create")
pub fn create(base_url: String, timeout_ms: Option(Int)) -> Instance

/// The plain `axios` default instance (absolute URLs).
@external(javascript, "./axios_ffi.mjs", "global")
pub fn global() -> Instance

@external(javascript, "./axios_ffi.mjs", "request")
fn request_ffi(
  instance: Instance,
  method: String,
  url: String,
  body: Dynamic,
  options: Options,
) -> Promise(Result(Response, Exception))

pub fn get(
  instance: Instance,
  url: String,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "GET", url, js.undefined(), options)
}

pub fn head(
  instance: Instance,
  url: String,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "HEAD", url, js.undefined(), options)
}

pub fn delete(
  instance: Instance,
  url: String,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "DELETE", url, js.undefined(), options)
}

pub fn post(
  instance: Instance,
  url: String,
  body: Json,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "POST", url, js.coerce(body), options)
}

pub fn put(
  instance: Instance,
  url: String,
  body: Json,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "PUT", url, js.coerce(body), options)
}

pub fn patch(
  instance: Instance,
  url: String,
  body: Json,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "PATCH", url, js.coerce(body), options)
}

/// POST with a raw body (form-encoded string, buffer, …).
pub fn post_raw(
  instance: Instance,
  url: String,
  body: Dynamic,
  options: Options,
) -> Promise(Result(Response, Exception)) {
  request_ffi(instance, "POST", url, body, options)
}

@external(javascript, "./axios_ffi.mjs", "isAxiosError")
pub fn is_axios_error(e: Exception) -> Bool

/// The HTTP status of a rejected request, when the server answered.
@external(javascript, "./axios_ffi.mjs", "errorStatus")
pub fn error_status(e: Exception) -> Option(Int)

@external(javascript, "./axios_ffi.mjs", "errorData")
pub fn error_data(e: Exception) -> Dynamic

pub fn header(response: Response, name: String) -> Option(String) {
  find_header(response.headers, lowercase(name))
}

fn find_header(
  headers: List(#(String, String)),
  name: String,
) -> Option(String) {
  case headers {
    [] -> None
    [#(k, v), ..rest] ->
      case lowercase(k) == name {
        True -> Some(v)
        False -> find_header(rest, name)
      }
  }
}

@external(javascript, "./axios_ffi.mjs", "lowercase")
fn lowercase(s: String) -> String

@external(javascript, "./axios_ffi.mjs", "postWithSignal")
pub fn post_with_signal(
  instance: Instance,
  url: String,
  body: Json,
  signal: Option(abort.Signal),
) -> Promise(Result(Response, Exception))
