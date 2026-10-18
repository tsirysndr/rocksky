import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/event_view
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.event.getEvent",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getEvent")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.get_event_params_decoder(),
      )
      use found <- task.then(event_view.find(ctx, params.uri))
      case found {
        None -> task.fail(error.RequestError("NotFound", "Event not found"))
        Some(row) -> {
          use events <- task.then(event_view.hydrate(
            ctx,
            [row],
            handler.caller(req),
          ))
          case list.first(events) {
            Error(_) ->
              task.fail(error.RequestError("NotFound", "Event not found"))
            Ok(event) -> task.ok(models.encode_event_view(event))
          }
        }
      }
    },
  )
}
