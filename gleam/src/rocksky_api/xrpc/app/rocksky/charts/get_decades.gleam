import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, count, count_distinct, current_year, eq_columns, field,
  group_by, gte, inner_join, integer_bucket, is_not_null, lte_columns, nullable,
  order_by, pair, reference, select, where,
}
import rocksky_api/drizzle/schema/albums as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/filters
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(120_000, 200)
  let fallback =
    models.GetDecadesOutput(Some([])) |> models.encode_get_decades_output
  xrpc_server.method(server, "app.rocksky.charts.getDecades", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getDecades")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Fallback(fallback)),
      models.get_decades_params_decoder(),
    )
    use decades <- task.map(
      query_cache.get(
        cache,
        models.encode_get_decades_params(params) |> json.to_string,
        fn() { retrieve(ctx, params) },
      ),
    )
    models.GetDecadesOutput(Some(decades)) |> models.encode_get_decades_output
  })
}

fn retrieve(ctx: Context, params: models.GetDecadesParams) {
  let scrobbles = sc.table()
  let albums = a.table()
  use conditions <- task.then(filters.conditions(
    ctx,
    scrobbles,
    params.did,
    params.start_date,
    params.end_date,
  ))
  let decade = integer_bucket(a.year(albums), 10)
  use rows <- task.map(
    select(
      scrobbles,
      pair(
        field("decade", decade),
        pair(
          field("scrobbles", count()),
          field("unique_albums", count_distinct(sc.album_id(scrobbles))),
        ),
      ),
    )
    |> inner_join(
      albums,
      eq_columns(sc.album_id(scrobbles), nullable(a.id(albums))),
    )
    |> where(
      and([
        is_not_null(a.year(albums)),
        gte(a.year(albums), Some(1900)),
        lte_columns(a.year(albums), nullable(current_year())),
        ..conditions
      ]),
    )
    |> group_by([reference(decade)])
    |> order_by([asc(decade)])
    |> all(ctx.read_db),
  )
  list.filter_map(rows, fn(r) {
    case r.0 {
      None -> Error(Nil)
      Some(decade) ->
        Ok(models.ChartsDecadeViewBasic(Some(decade), Some(r.1.0), Some(r.1.1)))
    }
  })
}
