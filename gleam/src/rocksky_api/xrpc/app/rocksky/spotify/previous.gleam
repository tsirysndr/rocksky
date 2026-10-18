import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}

import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/spotify/playback
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.spotify.previous",
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.params(req, decode.success(Nil)) {
        Error(e) -> promise.resolve(xrpc_server.fail(e))
        Ok(_) -> {
          use _ <- promise.map(
            handler.run(handler.options("spotify.previous"), fn() {
              use did <- task.then(task.from_result(handler.authenticated(req)))
              use _ <- task.map(playback.run(ctx, did, playback.Previous))
              json.object([])
            }),
          )
          xrpc_server.NoContent
        }
      }
    },
  )
}
