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
    models.PlaylistGetPlaylistsOutput(Some([]))
    |> models.encode_playlist_get_playlists_output
  xrpc_server.method(server, "app.rocksky.playlist.getPlaylists", None, fn(req) {
    case handler.params(req, models.playlist_get_playlists_params_decoder()) {
      Error(e) -> promise.resolve(xrpc_server.fail(e))
      Ok(params) ->
        case rsql.compile(params.filter, playlists.fields(True)) {
          Error(message) ->
            promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
          Ok(filter) -> {
            use <- handler.run(
              handler.options("getPlaylists")
              |> handler.timeout(10_000)
              |> handler.on_error(handler.Fallback(fallback)),
            )
            use rows <- task.map(playlists.retrieve(
              ctx,
              None,
              filter,
              params.filter,
              Some(case option.unwrap(params.limit, 20) {
                0 -> 20
                n -> n
              }),
              Some(option.unwrap(params.offset, 0)),
            ))
            models.PlaylistGetPlaylistsOutput(Some(rows))
            |> models.encode_playlist_get_playlists_output
          }
        }
    }
  })
}
