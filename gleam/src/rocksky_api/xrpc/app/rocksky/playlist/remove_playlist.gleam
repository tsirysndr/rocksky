import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/playlists/service
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(
    server,
    "app.rocksky.playlist.removePlaylist",
    Some(auth.verifier(ctx)),
    fn(req) {
      use output <- promise.map(
        handler.query(
          req,
          handler.options("playlist.removePlaylist")
            |> handler.timeout(60_000)
            |> handler.no_retry
            |> handler.on_error(handler.Propagate),
          models.remove_playlist_params_decoder(),
          fn(params) {
            let work = {
              use did <- task.then(task.from_result(handler.authenticated(req)))
              use agent <- task.then(agent.require(ctx, did))
              use _ <- task.map(service.remove(ctx, agent, did, params.uri))
              json.object([])
            }
            work |> task.map_error(fn(e) { error.Message(error.to_string(e)) })
          },
        ),
      )
      case output {
        xrpc_server.Json(_) -> xrpc_server.NoContent
        other -> other
      }
    },
  )
}
