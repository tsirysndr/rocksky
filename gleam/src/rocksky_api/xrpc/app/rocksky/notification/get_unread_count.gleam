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
    "app.rocksky.notification.getUnreadCount",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("getUnreadCount")
        |> handler.no_retry
        |> handler.on_error(handler.Fallback(
          models.GetUnreadCountOutput(0)
          |> models.encode_get_unread_count_output,
        ))
      use <- handler.run(options)
      use user <- task.then(service.user_id(ctx, handler.caller(req)))
      use count <- task.map(case user {
        None -> task.ok(0)
        Some(id) -> service.unread_count(ctx, id)
      })
      models.GetUnreadCountOutput(count)
      |> models.encode_get_unread_count_output
    },
  )
}
