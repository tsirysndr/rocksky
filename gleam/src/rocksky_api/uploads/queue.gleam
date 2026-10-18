import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, and, conflict_target, eq, eq_columns, field, from, in_array,
  inner_join, insert, nested, on_conflict_update, one, pair, run, select, set,
  where,
}
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/upload_queue_state as qs
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/error
import rocksky_api/node/js
import rocksky_api/schema/tracks
import rocksky_api/task

fn response(rows: List(#(String, tracks.Track)), index: Int) {
  json.object([
    #(
      "queue",
      json.array(rows, fn(r) {
        let t = r.1
        json.object([
          #("uploadId", json.string(r.0)),
          #("title", json.string(t.title)),
          #("artist", json.string(t.artist)),
          #("albumArtist", json.string(t.album_artist)),
          #("album", json.string(t.album)),
          #("albumArt", json.nullable(t.album_art, json.string)),
          #("duration", json.int(t.duration)),
          #("sha256", json.string(t.sha256)),
          #("songUri", json.string(option.unwrap(t.uri, ""))),
        ])
      }),
    ),
    #("currentIndex", json.int(index)),
  ])
}

pub fn retrieve(ctx: Context, user_id: String) {
  let state = qs.table()
  use stored <- task.then(
    from(state) |> where(eq(qs.user_id(state), user_id)) |> one(ctx.db),
  )
  case stored {
    None -> task.ok(response([], 0))
    Some(stored) -> {
      use ids <- task.then(
        json.parse(stored.upload_ids, decode.list(decode.string))
        |> result.map_error(fn(_) {
          error.Message("Invalid saved upload queue")
        })
        |> task.from_result,
      )
      case ids {
        [] -> task.ok(response([], 0))
        _ -> {
          let uploads = up.table()
          let tracks = tr.table()
          use rows <- task.map(
            select(
              uploads,
              pair(
                field("uploadId", up.id(uploads)),
                nested("track", all_columns(tracks)),
              ),
            )
            |> inner_join(
              tracks,
              eq_columns(up.track_id(uploads), tr.id(tracks)),
            )
            |> where(
              and([
                eq(up.user_id(uploads), user_id),
                in_array(up.id(uploads), ids),
              ]),
            )
            |> all(ctx.db),
          )
          response(
            list.filter_map(ids, fn(id) { list.find(rows, fn(r) { r.0 == id }) }),
            stored.current_index,
          )
        }
      }
    }
  }
}

pub fn put(ctx: Context, user_id: String, ids: List(String), index: Int) {
  let state = qs.table()
  let values = [
    set(qs.upload_ids(state), json.array(ids, json.string) |> json.to_string),
    set(qs.current_index(state), index),
  ]
  insert(state, [set(qs.user_id(state), user_id), ..values])
  |> on_conflict_update([conflict_target(qs.user_id(state))], [
    set(qs.updated_at(state), row.from_unix_ms(js.now_ms())),
    ..values
  ])
  |> run(ctx.db)
  |> task.map(fn(_) { json.object([#("status", json.string("ok"))]) })
}
