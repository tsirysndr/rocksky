//// Native WHATWG URL bindings.

import rocksky_api/node/js.{type Exception}

pub type Url

@external(javascript, "./web_url_ffi.mjs", "parse")
pub fn parse(value: String) -> Result(Url, Exception)

@external(javascript, "./web_url_ffi.mjs", "host")
pub fn host(url: Url) -> String

@external(javascript, "./web_url_ffi.mjs", "protocol")
pub fn protocol(url: Url) -> String

@external(javascript, "./web_url_ffi.mjs", "setHost")
pub fn set_host(url: Url, host: String) -> Nil

@external(javascript, "./web_url_ffi.mjs", "setPort")
pub fn set_port(url: Url, port: String) -> Nil

@external(javascript, "./web_url_ffi.mjs", "setQuery")
pub fn set_query(url: Url, key: String, value: String) -> Nil

@external(javascript, "./web_url_ffi.mjs", "requestLength")
pub fn request_length(url: Url) -> Int

@external(javascript, "./web_url_ffi.mjs", "href")
pub fn href(url: Url) -> String

@external(javascript, "./web_url_ffi.mjs", "resolve")
pub fn resolve(path: String, base: String) -> Result(Url, Exception)

@external(javascript, "./web_url_ffi.mjs", "pathname")
pub fn pathname(url: Url) -> String
