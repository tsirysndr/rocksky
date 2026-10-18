import gleam/dict
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{integer_as_real, nullable}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/albums as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lexicon/models
import rocksky_api/lib/catalog_page
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

fn fields(table) {
  dict.from_list([
    #("title", rsql.Text(nullable(a.title(table)))),
    #("artist", rsql.Text(nullable(a.artist(table)))),
    #("year", rsql.Number(integer_as_real(a.year(table)))),
    #("releaseDate", rsql.Text(a.release_date(table))),
    #("sha256", rsql.Text(nullable(a.sha256(table)))),
    #("uri", rsql.Text(a.uri(table))),
    #("artistUri", rsql.Text(a.artist_uri(table))),
    #("createdAt", rsql.Date(nullable(a.created_at(table)))),
  ])
}

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(30_000, 200)
  let fallback =
    models.GetAlbumsOutput(Some([])) |> models.encode_get_albums_output
  let table = a.table()
  xrpc_server.method(server, "app.rocksky.album.getAlbums", None, fn(req) {
    case handler.params(req, models.get_albums_params_decoder()) {
      Error(e) -> promise.resolve(xrpc_server.fail(e))
      Ok(params) ->
        case rsql.compile(params.filter, fields(table)) {
          Error(message) ->
            promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
          Ok(filter) -> {
            use <- handler.run(
              handler.options("getAlbums")
              |> handler.timeout(120_000)
              |> handler.on_error(handler.Fallback(fallback)),
            )
            query_cache.get(
              cache,
              models.encode_get_albums_params(params) |> json.to_string,
              fn() {
                use rows <- task.map(catalog_page.retrieve(
                  ctx,
                  table,
                  a.id(table),
                  a.created_at(table),
                  fn(row) { row.id },
                  sc.album_id(sc.table()),
                  filter,
                  False,
                  option.unwrap(params.limit, 100),
                  option.unwrap(params.offset, 0),
                ))
                let albums =
                  list.map(rows, fn(r) {
                    let a = r.0
                    models.AlbumViewBasic(
                      ..models.new_album_view_basic(),
                      id: Some(a.id),
                      uri: a.uri,
                      title: Some(a.title),
                      artist: Some(a.artist),
                      artist_uri: a.artist_uri,
                      year: a.year,
                      album_art: a.album_art,
                      release_date: a.release_date,
                      sha256: Some(a.sha256),
                      play_count: Some(r.1),
                      unique_listeners: Some(r.2),
                    )
                  })
                models.GetAlbumsOutput(Some(albums))
                |> models.encode_get_albums_output
              },
            )
          }
        }
    }
  })
}
