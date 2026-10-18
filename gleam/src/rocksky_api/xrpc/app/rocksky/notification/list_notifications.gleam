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
    "app.rocksky.notification.listNotifications",
    Some(auth.verifier(ctx)),
    fn(req) {
      let empty = models.ListNotificationsOutput([], 0, None)
      let options =
        handler.options("listNotifications")
        |> handler.no_retry
        |> handler.on_error(
          handler.Fallback(models.encode_list_notifications_output(empty)),
        )
      use params <- handler.query(
        req,
        options,
        models.list_notifications_params_decoder(),
      )
      use user <- task.then(service.user_id(ctx, handler.caller(req)))
      use output <- task.map(case user {
        None -> task.ok(empty)
        Some(id) -> {
          use #(notifications, cursor) <- task.then(service.list_notifications(
            ctx,
            id,
            option.unwrap(params.limit, 30),
            params.cursor,
          ))
          use count <- task.map(service.unread_count(ctx, id))
          models.ListNotificationsOutput(notifications, count, cursor)
        }
      })
      models.encode_list_notifications_output(output)
    },
  )
}
