import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lexicon/models
import rocksky_api/lib/actor_catalog
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/song
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(120_000, 200)
  let fallback =
    models.GetActorSongsOutput(Some([])) |> models.encode_get_actor_songs_output
  xrpc_server.method(server, "app.rocksky.actor.getActorSongs", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getActorSongs")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Fallback(fallback)),
      models.get_actor_songs_params_decoder(),
    )
    query_cache.get(
      cache,
      models.encode_get_actor_songs_params(params) |> json.to_string,
      fn() {
        let table = t.table()
        use rows <- task.map(actor_catalog.retrieve(
          ctx,
          table,
          t.id(table),
          fn(row) { row.id },
          sc.track_id(sc.table()),
          None,
          params.did,
          params.start_date,
          params.end_date,
          option.unwrap(params.limit, 10),
          option.unwrap(params.offset, 0),
        ))
        models.GetActorSongsOutput(
          Some(list.map(rows, fn(r) { song.catalog(r.0, r.1, r.2) })),
        )
        |> models.encode_get_actor_songs_output
      },
    )
  })
}
