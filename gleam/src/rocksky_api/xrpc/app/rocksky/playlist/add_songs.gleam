import gleam/json
import gleam/option.{Some}

import rocksky_api/context.{type Context}
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
    "app.rocksky.playlist.addSongs",
    Some(auth.verifier(ctx)),
    fn(req) {
      handler.query(
        req,
        handler.options("playlist.addSongs")
          |> handler.timeout(60_000)
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.add_songs_params_decoder(),
        fn(params) {
          let work = {
            use did <- task.then(task.from_result(handler.authenticated(req)))
            use agent <- task.then(agent.require(ctx, did))
            use value <- task.map(service.add_songs(
              ctx,
              agent,
              did,
              params.uri,
              params.songs,
            ))
            json.object([#("uris", json.array(value, json.string))])
          }
          work
        },
      )
    },
  )
}
