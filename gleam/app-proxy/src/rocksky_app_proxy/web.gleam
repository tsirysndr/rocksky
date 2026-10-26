import gleam/javascript/promise.{type Promise}

pub type Request

pub type Response

pub type Environment

pub type Url

pub type Headers =
  List(#(String, String))

@external(javascript, "./web_ffi.mjs", "url")
pub fn url(request: Request) -> Url

@external(javascript, "./web_ffi.mjs", "pathname")
pub fn pathname(url: Url) -> String

@external(javascript, "./web_ffi.mjs", "method")
pub fn method(request: Request) -> String

@external(javascript, "./web_ffi.mjs", "header")
pub fn header(request: Request, name: String) -> String

@external(javascript, "./web_ffi.mjs", "env")
pub fn env(environment: Environment, name: String) -> String

@external(javascript, "./web_ffi.mjs", "query_has")
pub fn query_has(url: Url, name: String) -> Bool

@external(javascript, "./web_ffi.mjs", "query")
pub fn query(url: Url, name: String) -> String

@external(javascript, "./web_ffi.mjs", "matches")
pub fn matches(value: String, pattern: String) -> Bool

@external(javascript, "./web_ffi.mjs", "response")
pub fn response(
  body: String,
  status: Int,
  headers: Headers,
  empty: Bool,
) -> Response

@external(javascript, "./web_ffi.mjs", "copy")
pub fn copy(
  response: Response,
  headers: Headers,
  remove: List(String),
  empty: Bool,
) -> Response

@external(javascript, "./web_ffi.mjs", "status")
pub fn status(response: Response) -> Int

@external(javascript, "./web_ffi.mjs", "response_header")
pub fn response_header(response: Response, name: String) -> String

@external(javascript, "./web_ffi.mjs", "forward")
pub fn forward(
  request: Request,
  host: String,
  no_cache: Bool,
) -> Promise(Response)

@external(javascript, "./web_ffi.mjs", "static_fetch")
pub fn static_fetch(
  url: String,
  method: String,
  headers: Headers,
  no_cache: Bool,
) -> Promise(Response)

@external(javascript, "./web_ffi.mjs", "asset_url")
pub fn asset_url(url: Url, path: String) -> String

@external(javascript, "./web_ffi.mjs", "redirect")
pub fn redirect(url: Url, path: String) -> Response

@external(javascript, "./web_ffi.mjs", "og_url")
pub fn og_url(url: Url) -> String

@external(javascript, "./web_ffi.mjs", "url_string")
pub fn url_string(url: Url) -> String

@external(javascript, "./web_ffi.mjs", "text")
pub fn text(response: Response) -> Promise(String)

@external(javascript, "./web_ffi.mjs", "decode_component")
pub fn decode_component(value: String) -> String
