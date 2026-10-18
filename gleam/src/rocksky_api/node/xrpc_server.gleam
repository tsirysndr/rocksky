//// Binding to `@atproto/xrpc-server`.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option, None, Some}
import rocksky_api/error.{type Error}
import rocksky_api/node/express

pub type Server

pub type Credentials {
  Credentials(
    did: Option(String),
    jti: Option(String),
    token_type: Option(String),
  )
}

pub type Auth {
  Anonymous
  Authenticated(Credentials)
}

pub type Request {
  Request(
    params: Dynamic,
    input: Option(Dynamic),
    input_encoding: Option(String),
    auth: Auth,
    req: express.Request,
    res: express.Response,
  )
}

pub type Output {
  NoContent
  Json(body: Json)
  JsonWithHeaders(body: Json, headers: List(#(String, String)))
  /// A raw JS value as the body, e.g. a proxied upstream payload.
  Raw(encoding: String, body: Dynamic)
  Bytes(encoding: String, body: BitArray)
  Fail(status: Int, error: String, message: String)
}

pub type AuthVerifier =
  fn(express.Request) -> Promise(Result(Auth, Error))

pub type Options {
  Options(
    validate_response: Bool,
    json_limit: Int,
    text_limit: Int,
    blob_limit: Int,
  )
}

@external(javascript, "./xrpc_server_ffi.mjs", "createServer")
pub fn create(lexicons: List(Dynamic), options: Options) -> Server

@external(javascript, "./xrpc_server_ffi.mjs", "method")
fn method_ffi(
  server: Server,
  nsid: String,
  auth: Option(fn(express.Request) -> Promise(Result(Auth, String))),
  handler: fn(Request) -> Promise(Output),
) -> Nil

pub fn method(
  server: Server,
  nsid: String,
  auth: Option(AuthVerifier),
  handler: fn(Request) -> Promise(Output),
) -> Nil {
  let auth =
    option.map(auth, fn(verify) {
      fn(req) {
        promise.map(verify(req), fn(r) {
          case r {
            Ok(a) -> Ok(a)
            Error(e) -> Error(error.to_string(e))
          }
        })
      }
    })
  method_ffi(server, nsid, auth, handler)
}

@external(javascript, "./xrpc_server_ffi.mjs", "router")
pub fn router(server: Server) -> express.Middleware

pub fn did(auth: Auth) -> Option(String) {
  case auth {
    Authenticated(Credentials(did: Some(did), ..)) -> Some(did)
    _ -> None
  }
}

/// Maps a service error to the XRPC error reply.
pub fn fail(err: Error) -> Output {
  case err {
    error.Unauthorized(m) -> Fail(401, "AuthenticationRequired", m)
    error.PdsSessionExpired ->
      Fail(
        401,
        "pds_session_expired",
        "Your session with your PDS has expired. Please log in to Rocksky again.",
      )
    error.ScrobbleBotFlagged(m) | error.ScrobbleBlocked(_, m) ->
      Fail(429, "RateLimitExceeded", m)
    error.Forbidden(m) -> Fail(403, "Forbidden", m)
    error.NotFound(m) -> Fail(404, "NotFound", m)
    error.InvalidRequest(m) -> Fail(400, "InvalidRequest", m)
    error.RequestError(name, m) -> Fail(400, name, m)
    error.Timeout(m) -> Fail(504, "UpstreamTimeout", m)
    error.Upstream(status, m) -> Fail(status, "UpstreamFailure", m)
    _ -> Fail(500, "InternalServerError", error.to_string(err))
  }
}

pub fn invalid_request(message: String) -> Output {
  Fail(400, "InvalidRequest", message)
}

pub fn auth_required(message: String) -> Output {
  Fail(401, "AuthenticationRequired", message)
}
