import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

pub type Server

pub type Child

@external(javascript, "./host_ffi.mjs", "oauth_listener")
pub fn oauth_listener(
  port: Int,
  callback: fn(Dynamic) -> Result(Nil, String),
) -> Promise(Result(Server, String))

@external(javascript, "./host_ffi.mjs", "close_server")
pub fn close_server(server: Server) -> Nil

@external(javascript, "./host_ffi.mjs", "mcp_binary")
pub fn mcp_binary() -> Promise(String)

@external(javascript, "./host_ffi.mjs", "spawn")
pub fn spawn(binary: String, args: List(String)) -> Nil

@external(javascript, "./host_ffi.mjs", "upload")
pub fn upload(
  url: String,
  token: String,
  file: String,
  mime: String,
  storage: String,
  progress: fn(Int) -> Nil,
) -> Promise(Result(Dynamic, String))
