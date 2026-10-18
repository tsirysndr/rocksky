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
    "app.rocksky.artist.getArtistEvents",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getArtistEvents")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.get_artist_events_params_decoder(),
      )
      let filters =
        models.GetEventsParams(
          ..models.new_get_events_params(),
          artist: Some(params.uri),
          include_past: params.include_past,
          limit: params.limit,
          offset: params.offset,
        )
      use events <- task.map(event_view.list_events(
        ctx,
        filters,
        handler.caller(req),
      ))
      models.GetArtistEventsOutput(events)
      |> models.encode_get_artist_events_output
    },
  )
}
