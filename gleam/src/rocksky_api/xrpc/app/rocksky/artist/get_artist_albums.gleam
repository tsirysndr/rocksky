import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  aliased_field, all, all_columns, column, count, count_distinct, eq, eq_columns,
  field, group_by, in_array, integer, left_join, nested, nullable, one, optional,
  pair, reference, select, subquery, text, where,
}
import rocksky_api/drizzle/schema/albums as a
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(600_000, 200)
  xrpc_server.method(
    server,
    "app.rocksky.artist.getArtistAlbums",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getArtistAlbums")
          |> handler.on_error(handler.Propagate),
        models.get_artist_albums_params_decoder(),
      )
      use albums <- task.map(
        query_cache.get(
          cache,
          models.encode_get_artist_albums_params(params) |> json.to_string,
          fn() { retrieve(ctx, params.uri) },
        ),
      )
      models.GetArtistAlbumsOutput(albums: Some(albums))
      |> models.encode_get_artist_albums_output
    },
  )
}

fn retrieve(ctx: Context, uri: String) {
  let artists = ar.table()
  use artist <- task.then(
    select(artists, field("id", ar.id(artists)))
    |> where(eq(ar.uri(artists), Some(uri)))
    |> one(ctx.read_db),
  )
  case artist {
    None -> task.ok([])
    Some(artist_id) -> {
      let links = aa.table()
      use linked_ids <- task.then(
        select(links, field("id", nullable(aa.album_id(links))))
        |> where(eq(aa.artist_id(links), artist_id))
        |> all(ctx.read_db),
      )
      let ids =
        list.filter_map(linked_ids, fn(id) {
          case id {
            Some(id) -> Ok(id)
            None -> Error(Nil)
          }
        })
        |> list.unique
      case ids {
        [] -> task.ok([])
        _ -> retrieve_albums(ctx, ids)
      }
    }
  }
}

fn retrieve_albums(ctx: Context, ids: List(String)) {
  let albums = a.table()
  let scrobbles = sc.table()
  let counts =
    select(
      scrobbles,
      pair(
        aliased_field("album_id", sc.album_id(scrobbles)),
        pair(
          aliased_field("plays", count()),
          aliased_field("listeners", count_distinct(sc.user_id(scrobbles))),
        ),
      ),
    )
    // Filter before aggregation: never count unrelated artists' scrobbles.
    |> where(in_array(sc.album_id(scrobbles), list.map(ids, Some)))
    |> group_by([reference(sc.album_id(scrobbles))])
    |> subquery("counts")
  use rows <- task.map(
    select(
      albums,
      pair(
        nested("album", all_columns(albums)),
        pair(
          field("plays", column(counts, "plays", optional(integer()))),
          field("listeners", column(counts, "listeners", optional(integer()))),
        ),
      ),
    )
    |> left_join(
      counts,
      eq_columns(
        nullable(a.id(albums)),
        column(counts, "album_id", optional(text())),
      ),
    )
    |> where(in_array(a.id(albums), ids))
    |> all(ctx.read_db),
  )
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
      play_count: Some(option.unwrap(r.1.0, 0)),
      unique_listeners: Some(option.unwrap(r.1.1, 0)),
    )
  })
}
