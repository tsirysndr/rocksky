import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, from, in_array, where}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/ranking
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(120_000, 200)
  let fallback =
    models.GetTopArtistsOutput(Some([])) |> models.encode_get_top_artists_output
  xrpc_server.method(server, "app.rocksky.charts.getTopArtists", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getTopArtists")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Fallback(fallback)),
      models.get_top_artists_params_decoder(),
    )
    use artists <- task.map(
      query_cache.get(
        cache,
        models.encode_get_top_artists_params(params) |> json.to_string,
        fn() { retrieve(ctx, params) },
      ),
    )
    models.GetTopArtistsOutput(Some(artists))
    |> models.encode_get_top_artists_output
  })
}

fn retrieve(ctx: Context, params: models.GetTopArtistsParams) {
  let table = a.table()
  let limit = case params.limit {
    None | Some(0) -> 50
    Some(n) -> n
  }
  use counts <- task.then(ranking.retrieve(
    ctx,
    True,
    params.did,
    params.start_date,
    params.end_date,
    limit,
    option.unwrap(params.offset, 0),
  ))
  let ids = list.filter_map(counts, fn(r) { option.to_result(r.0, Nil) })
  use artists <- task.map(
    from(table) |> where(in_array(a.id(table), ids)) |> all(ctx.read_db),
  )
  list.filter_map(counts, fn(count) {
    case list.find(artists, fn(a) { Some(a.id) == count.0 }) {
      Error(_) -> Error(Nil)
      Ok(a) ->
        Ok(
          models.ArtistViewBasic(
            ..models.new_artist_view_basic(),
            id: Some(a.id),
            name: Some(a.name),
            picture: a.picture,
            sha256: Some(a.sha256),
            uri: a.uri,
            play_count: Some(count.1.0),
            unique_listeners: Some(count.1.1),
            tags: Some(option.unwrap(a.genres, [])),
          ),
        )
    }
  })
}
