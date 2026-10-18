import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/notifications/service
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.notification.updateSeen",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("updateSeen")
        |> handler.no_retry
        |> handler.on_error(handler.Fallback(
          models.UpdateSeenOutput(0) |> models.encode_update_seen_output,
        ))
      use input <- handler.procedure_body(
        req,
        options,
        models.update_seen_input_decoder(),
      )
      use user <- task.then(service.user_id(ctx, handler.caller(req)))
      use count <- task.map(case user {
        None -> task.ok(0)
        Some(id) -> service.mark_seen(ctx, id, option.unwrap(input.ids, []))
      })
      models.UpdateSeenOutput(count) |> models.encode_update_seen_output
    },
  )
}
