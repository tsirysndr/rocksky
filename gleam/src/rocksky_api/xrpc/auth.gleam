//// The optional-auth verifier shared by every XRPC method: anonymous
//// without a token, credentials when the bearer verifies.

import gleam/javascript/promise.{type Promise}
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/error.{type Error}
import rocksky_api/lib/verify_token
import rocksky_api/node/express
import rocksky_api/node/xrpc_server.{type Auth}
import rocksky_api/task

pub fn verifier(
  ctx: Context,
) -> fn(express.Request) -> Promise(Result(Auth, Error)) {
  fn(req) {
    case express.header(req, "authorization") {
      None -> task.ok(xrpc_server.Anonymous)
      Some(header) ->
        case string.split(header, " ") {
          [_, token, ..] ->
            case string.trim(token) {
              "" | "null" -> task.ok(xrpc_server.Anonymous)
              bearer ->
                verify_token.verify(ctx.env, ctx.db, bearer)
                |> task.map(fn(p) {
                  xrpc_server.Authenticated(xrpc_server.Credentials(
                    did: p.did,
                    jti: p.jti,
                    token_type: p.token_type,
                  ))
                })
            }
          _ -> task.ok(xrpc_server.Anonymous)
        }
    }
  }
}

/// The caller's DID, or `Unauthorized`.
pub fn require_did(auth: Auth) -> Result(String, Error) {
  case xrpc_server.did(auth) {
    Some(did) -> Ok(did)
    None -> Error(error.Unauthorized("Authentication required"))
  }
}
