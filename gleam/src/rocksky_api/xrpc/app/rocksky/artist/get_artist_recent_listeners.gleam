import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, field, one, select, where}
import rocksky_api/drizzle/schema/artists
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/lib/recent_listeners
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cached =
    query_cache.cached(
      60_000,
      200,
      fn(params) {
        models.encode_get_artist_recent_listeners_params(params)
        |> json.to_string
      },
      fn(params) { retrieve(ctx, params) },
    )
  let fallback =
    models.GetArtistRecentListenersOutput(listeners: Some([]))
    |> models.encode_get_artist_recent_listeners_output
  xrpc_server.method(
    server,
    "app.rocksky.artist.getArtistRecentListeners",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getArtistRecentListeners")
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_artist_recent_listeners_params_decoder(),
      )
      use listeners <- task.map(cached(params))
      models.GetArtistRecentListenersOutput(listeners: Some(listeners))
      |> models.encode_get_artist_recent_listeners_output
    },
  )
}

fn retrieve(ctx: Context, params: models.GetArtistRecentListenersParams) {
  let table = artists.table()
  use subject <- task.then(
    select(table, field("id", artists.id(table)))
    |> where(eq(artists.uri(table), Some(params.uri)))
    |> one(ctx.db),
  )
  case subject {
    None -> task.ok([])
    Some(id) -> {
      use listeners <- task.map(recent_listeners.retrieve(
        ctx,
        id,
        True,
        option.unwrap(params.limit, 20),
        option.unwrap(params.offset, 0),
      ))
      list.map(listeners, fn(l) {
        models.ArtistRecentListenerView(
          id: Some(l.id),
          did: Some(l.did),
          handle: Some(l.handle),
          display_name: Some(l.name),
          avatar: Some(l.avatar),
          timestamp: Some(l.timestamp),
          scrobble_uri: Some(l.uri),
        )
      })
    }
  }
}
