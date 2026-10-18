import gleam/dict
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{and, array_contains, in_array, nullable}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lexicon/models
import rocksky_api/lib/catalog_page
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

fn fields(table) {
  dict.from_list([
    #("name", rsql.Text(nullable(a.name(table)))),
    #("genres", rsql.TextArray(a.genres(table))),
    #("bornIn", rsql.Text(a.born_in(table))),
    #("born", rsql.Date(a.born(table))),
    #("died", rsql.Date(a.died(table))),
    #("sha256", rsql.Text(nullable(a.sha256(table)))),
    #("uri", rsql.Text(a.uri(table))),
    #("createdAt", rsql.Date(nullable(a.created_at(table)))),
  ])
}

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(30_000, 200)
  let fallback =
    models.ArtistGetArtistsOutput(Some([]))
    |> models.encode_artist_get_artists_output
  let table = a.table()
  xrpc_server.method(server, "app.rocksky.artist.getArtists", None, fn(req) {
    case handler.params(req, models.artist_get_artists_params_decoder()) {
      Error(e) -> promise.resolve(xrpc_server.fail(e))
      Ok(params) ->
        case rsql.compile(params.filter, fields(table)) {
          Error(message) ->
            promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
          Ok(filter) -> {
            use <- handler.run(
              handler.options("getArtists")
              |> handler.on_error(handler.Fallback(fallback)),
            )
            query_cache.get(
              cache,
              models.encode_artist_get_artists_params(params) |> json.to_string,
              fn() {
                let names =
                  option.unwrap(params.names, "")
                  |> string.split(",")
                  |> list.map(string.trim)
                  |> list.filter(fn(n) { n != "" })
                let conditions = case filter {
                  None -> []
                  Some(f) -> [f]
                }
                let conditions = case names {
                  [] -> conditions
                  _ -> [in_array(a.name(table), names), ..conditions]
                }
                let conditions = case params.genre {
                  None | Some("") -> conditions
                  Some(genre) -> [
                    array_contains(a.genres(table), [genre]),
                    ..conditions
                  ]
                }
                let filter = case conditions {
                  [] -> None
                  _ -> Some(and(conditions))
                }
                use rows <- task.map(catalog_page.retrieve(
                  ctx,
                  table,
                  a.id(table),
                  a.created_at(table),
                  fn(row) { row.id },
                  sc.artist_id(sc.table()),
                  filter,
                  True,
                  option.unwrap(params.limit, 100),
                  option.unwrap(params.offset, 0),
                ))
                let artists =
                  list.map(rows, fn(r) {
                    let a = r.0
                    models.ArtistViewBasic(
                      ..models.new_artist_view_basic(),
                      id: Some(a.id),
                      name: Some(a.name),
                      picture: a.picture,
                      sha256: Some(a.sha256),
                      uri: a.uri,
                      genres: Some(option.unwrap(a.genres, [])),
                      play_count: Some(r.1),
                      unique_listeners: Some(r.2),
                    )
                  })
                models.ArtistGetArtistsOutput(Some(artists))
                |> models.encode_artist_get_artists_output
              },
            )
          }
        }
    }
  })
}
