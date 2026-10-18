import gleam/dict
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  aliased_field, all, and, array_contains, count, count_distinct, desc, eq,
  eq_columns, exists, field, from, group_by, in_array, inner_join,
  integer_as_real, limit as db_limit, nullable, offset as db_offset, or,
  order_by, pair, reference, select, to_sql, where,
}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lexicon/models
import rocksky_api/lib/filtered_page
import rocksky_api/lib/helpers
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/tracks
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn fields() -> rsql.Fields {
  let table = t.table()
  dict.from_list([
    #("title", rsql.Text(nullable(t.title(table)))),
    #("artist", rsql.Text(nullable(t.artist(table)))),
    #("album", rsql.Text(nullable(t.album(table)))),
    #("albumArtist", rsql.Text(nullable(t.album_artist(table)))),
    #("genre", rsql.Text(t.genre(table))),
    #("composer", rsql.Text(t.composer(table))),
    #("label", rsql.Text(t.label(table))),
    #("duration", rsql.Number(integer_as_real(nullable(t.duration(table))))),
    #("trackNumber", rsql.Number(integer_as_real(t.track_number(table)))),
    #("discNumber", rsql.Number(integer_as_real(t.disc_number(table)))),
    #("mbId", rsql.Text(t.mb_id(table))),
    #("isrc", rsql.Text(t.isrc(table))),
    #("sha256", rsql.Text(nullable(t.sha256(table)))),
    #("uri", rsql.Text(t.uri(table))),
    #("albumUri", rsql.Text(t.album_uri(table))),
    #("artistUri", rsql.Text(t.artist_uri(table))),
    #("createdAt", rsql.Date(nullable(t.created_at(table)))),
  ])
}

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(30_000, 200)
  let fallback =
    models.GetSongsOutput(tracks: Some([])) |> models.encode_get_songs_output
  xrpc_server.method(server, "app.rocksky.song.getSongs", None, fn(req) {
    case handler.params(req, models.get_songs_params_decoder()) {
      Error(e) -> promise.resolve(xrpc_server.fail(e))
      Ok(params) ->
        case rsql.compile(params.filter, fields()) {
          Error(message) ->
            promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
          Ok(filter) -> {
            use <- handler.run(
              handler.options("getSongs")
              |> handler.timeout(120_000)
              |> handler.on_error(handler.Fallback(fallback)),
            )
            query_cache.get(
              cache,
              models.encode_get_songs_params(params) |> json.to_string,
              fn() {
                use tracks <- task.map(retrieve(ctx, params, filter))
                models.GetSongsOutput(tracks: Some(tracks))
                |> models.encode_get_songs_output
              },
            )
          }
        }
    }
  })
}

fn retrieve(ctx: Context, params: models.GetSongsParams, filter) {
  let limit = option.unwrap(params.limit, 100)
  let offset = option.unwrap(params.offset, 0)
  let table = t.table()
  let artists = a.table()
  let scrobbles = sc.table()
  let ids =
    list.filter_map(
      [
        option.map(helpers.non_empty(params.mbid), fn(v) {
          eq(t.mb_id(table), Some(v))
        }),
        option.map(helpers.non_empty(params.isrc), fn(v) {
          eq(t.isrc(table), Some(v))
        }),
        option.map(helpers.non_empty(params.spotify_id), fn(v) {
          eq(
            t.spotify_link(table),
            Some("https://open.spotify.com/track/" <> v),
          )
        }),
      ],
      option.to_result(_, Nil),
    )
  let condition = option.unwrap(filter, and([]))
  case ids {
    [_, ..] -> {
      use tracks <- task.map(
        from(table)
        |> where(and([or(ids), condition]))
        |> db_limit(limit)
        |> db_offset(offset)
        |> all(ctx.read_db),
      )
      list.map(tracks, fn(t) { present(t, 0, 0, True) })
    }
    [] -> {
      let genre = case params.genre {
        None | Some("") -> and([])
        Some(genre) ->
          exists(
            select(artists, field("id", a.id(artists)))
            |> where(
              and([
                eq_columns(a.name(artists), t.album_artist(table)),
                array_contains(a.genres(artists), [genre]),
              ]),
            ),
          )
      }
      use page <- task.then(case filter {
        None -> task.ok(None)
        Some(_) -> {
          let candidates =
            select(
              table,
              pair(
                aliased_field("id", t.id(table)),
                aliased_field("created_at", t.created_at(table)),
              ),
            )
            |> where(and([condition, genre]))
            |> to_sql
          filtered_page.run(
            ctx.read_db,
            candidates.sql,
            candidates.params,
            limit,
            offset,
          )
          |> task.map(Some)
        }
      })
      case page {
        Some([]) -> task.ok([])
        _ -> {
          let #(condition, offset) = case page {
            Some(ids) -> #(
              in_array(sc.track_id(scrobbles), list.map(ids, Some)),
              0,
            )
            None -> #(genre, offset)
          }
          use counts <- task.then(
            select(
              scrobbles,
              pair(
                field("id", t.id(table)),
                pair(
                  field("plays", count()),
                  field("listeners", count_distinct(sc.user_id(scrobbles))),
                ),
              ),
            )
            |> inner_join(
              table,
              eq_columns(sc.track_id(scrobbles), nullable(t.id(table))),
            )
            |> where(condition)
            |> group_by([reference(t.id(table))])
            |> order_by([desc(count_distinct(sc.user_id(scrobbles)))])
            |> db_limit(limit)
            |> db_offset(offset)
            |> all(ctx.read_db),
          )
          let ids = option.unwrap(page, list.map(counts, fn(c) { c.0 }))
          case ids {
            [] -> task.ok([])
            _ -> {
              use tracks <- task.map(
                from(table)
                |> where(in_array(t.id(table), ids))
                |> all(ctx.read_db),
              )
              list.filter_map(ids, fn(id) {
                case list.find(tracks, fn(t) { t.id == id }) {
                  Error(_) -> Error(Nil)
                  Ok(track) -> {
                    let counts =
                      list.find(counts, fn(c) { c.0 == id })
                      |> option.from_result
                      |> option.unwrap(#(id, #(0, 0)))
                    Ok(present(track, counts.1.0, counts.1.1, False))
                  }
                }
              })
            }
          }
        }
      }
    }
  }
}

fn present(
  t: tracks.Track,
  plays: Int,
  listeners: Int,
  direct: Bool,
) -> models.SongViewBasic {
  models.SongViewBasic(
    ..models.new_song_view_basic(),
    id: Some(t.id),
    uri: t.uri,
    title: Some(t.title),
    artist: Some(t.artist),
    artist_uri: t.artist_uri,
    album: Some(t.album),
    album_uri: t.album_uri,
    album_art: t.album_art,
    album_artist: Some(t.album_artist),
    copyright_message: t.copyright_message,
    disc_number: t.disc_number,
    duration: Some(t.duration),
    sha256: Some(t.sha256),
    track_number: t.track_number,
    play_count: Some(plays),
    unique_listeners: Some(listeners),
    created_at: Some(row.iso8601(t.created_at)),
    mbid: case direct {
      True -> t.mb_id
      False -> None
    },
    isrc: case direct {
      True -> t.isrc
      False -> None
    },
  )
}
