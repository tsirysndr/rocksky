import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/xrpc_server
import rocksky_api/uploads/delete_service
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: xrpc_server.Server, ctx: Context, album: Bool) {
  let method = case album {
    True -> "deleteAlbum"
    False -> "deleteSong"
  }
  let noun = case album {
    True -> "album"
    False -> "song"
  }
  xrpc_server.method(
    server,
    "app.rocksky.library." <> method,
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.caller(req) {
        None ->
          promise.resolve(xrpc_server.invalid_request(
            "Missing authenticated DID.",
          ))
        Some(did) ->
          case
            handler.input(
              req,
              decode.field("id", decode.string, decode.success),
            )
          {
            Error(_) | Ok("") ->
              promise.resolve(xrpc_server.invalid_request(
                "Missing " <> noun <> " id.",
              ))
            Ok(id) -> {
              use outcome <- promise.map(case album {
                True -> delete_service.delete_uploads_for_album_id(ctx, did, id)
                False -> delete_service.delete_uploads_for_track(ctx, did, id)
              })
              case outcome {
                Ok(0) ->
                  xrpc_server.Fail(404, "NotFound", case album {
                    True -> "No uploaded songs found for the album."
                    False -> "No uploaded song found for the user."
                  })
                Ok(count) ->
                  xrpc_server.Json(
                    json.object([
                      #("status", json.string("ok")),
                      #("deleted", json.int(count)),
                    ]),
                  )
                Error(error.Unauthorized(message)) ->
                  xrpc_server.Fail(401, "AuthenticationRequired", message)
                Error(e) -> {
                  log.error("[library." <> method <> "] " <> error.describe(e))
                  xrpc_server.Fail(
                    500,
                    "InternalServerError",
                    "Internal error while deleting " <> noun <> ".",
                  )
                }
              }
            }
          }
      }
    },
  )
}
