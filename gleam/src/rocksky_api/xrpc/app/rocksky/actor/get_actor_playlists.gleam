import gleam/javascript/promise
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/rsql
import rocksky_api/lexicon/models
import rocksky_api/lib/playlists
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetActorPlaylistsOutput(Some([]))
    |> models.encode_get_actor_playlists_output
  xrpc_server.method(
    server,
    "app.rocksky.actor.getActorPlaylists",
    None,
    fn(req) {
      case handler.params(req, models.get_actor_playlists_params_decoder()) {
        Error(e) -> promise.resolve(xrpc_server.fail(e))
        Ok(params) ->
          case rsql.compile(params.filter, playlists.fields(False)) {
            Error(message) ->
              promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
            Ok(filter) -> {
              use <- handler.run(
                handler.options("getActorPlaylists")
                |> handler.timeout(120_000)
                |> handler.on_error(handler.Fallback(fallback)),
              )
              use rows <- task.map(playlists.retrieve(
                ctx,
                Some(params.did),
                filter,
                params.filter,
                params.limit,
                params.offset,
              ))
              models.GetActorPlaylistsOutput(Some(rows))
              |> models.encode_get_actor_playlists_output
            }
          }
      }
    },
  )
}
