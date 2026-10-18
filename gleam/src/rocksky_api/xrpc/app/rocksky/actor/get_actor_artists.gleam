import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{ne}
import rocksky_api/drizzle/schema/artists as t
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lexicon/models
import rocksky_api/lib/actor_catalog
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(120_000, 200)
  let fallback =
    models.GetActorArtistsOutput(Some([]))
    |> models.encode_get_actor_artists_output
  xrpc_server.method(server, "app.rocksky.actor.getActorArtists", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getActorArtists")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Fallback(fallback)),
      models.get_actor_artists_params_decoder(),
    )
    query_cache.get(
      cache,
      models.encode_get_actor_artists_params(params) |> json.to_string,
      fn() {
        let table = t.table()
        use rows <- task.map(actor_catalog.retrieve(
          ctx,
          table,
          t.id(table),
          fn(row) { row.id },
          sc.artist_id(sc.table()),
          Some(ne(t.name(table), "Various Artists")),
          params.did,
          params.start_date,
          params.end_date,
          option.unwrap(params.limit, 10),
          option.unwrap(params.offset, 0),
        ))
        models.GetActorArtistsOutput(
          Some(
            list.map(rows, fn(r) {
              models.ArtistViewBasic(
                ..models.new_artist_view_basic(),
                id: Some(r.0.id),
                name: Some(r.0.name),
                picture: r.0.picture,
                sha256: Some(r.0.sha256),
                uri: r.0.uri,
                tags: Some(option.unwrap(r.0.genres, [])),
                play_count: Some(r.1),
                unique_listeners: Some(r.2),
              )
            }),
          ),
        )
        |> models.encode_get_actor_artists_output
      },
    )
  })
}
