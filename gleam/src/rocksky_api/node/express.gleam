//// Binding to `express`, `cors` and `http-proxy-middleware`.

import gleam/dynamic.{type Dynamic}
import gleam/option.{type Option}

pub type App

pub type Request

pub type Response

/// A connect-style middleware or router.
pub type Middleware

@external(javascript, "./express_ffi.mjs", "newApp")
pub fn new() -> App

@external(javascript, "./express_ffi.mjs", "use")
pub fn use_(app: App, middleware: Middleware) -> App

@external(javascript, "./express_ffi.mjs", "cors")
pub fn cors() -> Middleware

@external(javascript, "./express_ffi.mjs", "proxy")
pub fn proxy(target: String) -> Middleware

/// Wraps a Gleam function as middleware; call `next` to continue.
@external(javascript, "./express_ffi.mjs", "middleware")
pub fn middleware(f: fn(Request, Response, fn() -> Nil) -> Nil) -> Middleware

@external(javascript, "./express_ffi.mjs", "listen")
pub fn listen(app: App, port: Int, on_listening: fn() -> Nil) -> Nil

@external(javascript, "./express_ffi.mjs", "path")
pub fn path(req: Request) -> String

@external(javascript, "./express_ffi.mjs", "method")
pub fn method(req: Request) -> String

@external(javascript, "./express_ffi.mjs", "header")
pub fn header(req: Request, name: String) -> Option(String)

/// All request headers, for trace-context propagation.
@external(javascript, "./express_ffi.mjs", "headers")
pub fn headers(req: Request) -> Dynamic

@external(javascript, "./express_ffi.mjs", "statusCode")
pub fn status_code(res: Response) -> Int

@external(javascript, "./express_ffi.mjs", "onFinish")
pub fn on_finish(res: Response, f: fn() -> Nil) -> Nil

@external(javascript, "./express_ffi.mjs", "setHeader")
pub fn set_header(res: Response, name: String, value: String) -> Nil
