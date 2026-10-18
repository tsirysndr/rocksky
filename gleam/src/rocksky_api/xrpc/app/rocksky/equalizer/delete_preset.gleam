import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.equalizer.deletePreset",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("deletePreset")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate)
      use output <- promise.map(
        handler.query(
          req,
          options,
          models.delete_preset_params_decoder(),
          fn(params) {
            use did <- task.then(task.from_result(handler.authenticated(req)))
            use agent <- task.then(agent.require(ctx, did))
            use _ <- task.map(
              task.attempt_result(atp.delete_record(
                agent,
                did,
                "app.rocksky.equalizer",
                params.rkey,
              )),
            )
            json.null()
          },
        ),
      )
      case output {
        xrpc_server.Json(_) -> xrpc_server.NoContent
        _ -> output
      }
    },
  )
}
