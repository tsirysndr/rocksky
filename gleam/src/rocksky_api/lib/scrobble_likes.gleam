//// Exact track-id like totals and viewer state in one database round trip.

import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, count, count_matching, eq, eq_columns, field, group_by, in_array,
  left_join, pair, reference, select, where,
}
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/users as us
import rocksky_api/task

pub fn retrieve(ctx: Context, ids: List(String), did: Option(String)) {
  let loved = lt.table()
  let users = us.table()
  case ids, did {
    [], _ -> task.ok(#([], []))
    _, None | _, Some("") -> {
      use counts <- task.map(
        select(
          loved,
          pair(field("id", lt.track_id(loved)), field("count", count())),
        )
        |> where(in_array(lt.track_id(loved), ids))
        |> group_by([reference(lt.track_id(loved))])
        |> all(ctx.db),
      )
      #(counts, [])
    }
    _, Some(viewer) -> {
      use rows <- task.map(
        select(
          loved,
          pair(
            field("id", lt.track_id(loved)),
            pair(
              field("count", count()),
              field("viewerCount", count_matching(eq(us.did(users), viewer))),
            ),
          ),
        )
        |> left_join(users, eq_columns(lt.user_id(loved), us.id(users)))
        |> where(in_array(lt.track_id(loved), ids))
        |> group_by([reference(lt.track_id(loved))])
        |> all(ctx.db),
      )
      #(
        list.map(rows, fn(r) { #(r.0, r.1.0) }),
        rows |> list.filter(fn(r) { r.1.1 > 0 }) |> list.map(fn(r) { r.0 }),
      )
    }
  }
}
