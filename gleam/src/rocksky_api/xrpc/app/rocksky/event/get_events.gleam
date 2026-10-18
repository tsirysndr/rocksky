import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/event_view
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.event.getEvents",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getEvents")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.get_events_params_decoder(),
      )
      use events <- task.map(event_view.list_events(
        ctx,
        params,
        handler.caller(req),
      ))
      models.GetEventsOutput(events) |> models.encode_get_events_output
    },
  )
}
