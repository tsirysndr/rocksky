import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/node/axios
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(
    server,
    "app.rocksky.player.addItemsToQueue",
    Some(auth.verifier(ctx)),
    fn(req) {
      use _ <- promise.map(
        handler.query(
          req,
          handler.options("addItemsToQueue"),
          models.add_items_to_queue_params_decoder(),
          fn(params) {
            use did <- task.then(task.from_result(handler.authenticated(req)))
            use _ <- task.map(
              axios.post(
                ctx.tracklist,
                "/tracklist.addTracks",
                json.object([
                  #("did", json.string(did)),
                  #("track_ids", json.array(params.items, json.string)),
                ]),
                axios.default_options(),
              )
              |> task.attempt_result,
            )
            json.object([])
          },
        ),
      )
      xrpc_server.NoContent
    },
  )
}
