import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  aliased_field, all, and, column, desc, eq, eq_columns, field, group_by,
  inner_join, is_not_null, left_join_lateral, limit as db_limit, max, nullable,
  offset as db_offset, optional, order_by, pair, reference, select, subquery,
  text, timestamp as db_timestamp, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/users as u
import rocksky_api/task

pub type Listener {
  Listener(
    id: String,
    did: String,
    handle: String,
    name: String,
    avatar: String,
    timestamp: String,
    uri: String,
  )
}

pub fn retrieve(
  ctx: Context,
  subject_id: String,
  artist: Bool,
  limit: Int,
  offset: Int,
) {
  let s = sc.table()
  let users = u.table()
  let subject = case artist {
    True -> sc.artist_id(s)
    False -> sc.track_id(s)
  }
  let latest =
    select(
      s,
      pair(
        aliased_field("user_id", sc.user_id(s)),
        aliased_field("last_timestamp", max(sc.timestamp(s))),
      ),
    )
    |> where(eq(subject, Some(subject_id)))
    |> group_by([reference(sc.user_id(s))])
    |> order_by([desc(max(sc.timestamp(s)))])
    |> db_limit(limit)
    |> db_offset(offset)
    |> subquery("latest")
  let user_id = column(latest, "user_id", optional(text()))
  let last_timestamp =
    column(latest, "last_timestamp", optional(db_timestamp()))
  let recent =
    select(s, aliased_field("uri", sc.uri(s)))
    |> where(
      and([eq_columns(sc.user_id(s), user_id), eq(subject, Some(subject_id))]),
    )
    |> order_by([desc(sc.timestamp(s))])
    |> db_limit(1)
    |> subquery("recent")
  let selection =
    pair(
      pair(
        pair(field("id", u.id(users)), field("did", u.did(users))),
        pair(
          field("handle", u.handle(users)),
          field("name", u.display_name(users)),
        ),
      ),
      pair(
        field("avatar", u.avatar(users)),
        pair(
          field("timestamp", last_timestamp),
          field("uri", column(recent, "uri", optional(text()))),
        ),
      ),
    )
  use rows <- task.map(
    select(latest, selection)
    |> inner_join(users, eq_columns(nullable(u.id(users)), user_id))
    |> left_join_lateral(recent, and([]))
    |> where(is_not_null(last_timestamp))
    |> order_by([desc(last_timestamp)])
    |> all(ctx.db),
  )
  list.filter_map(rows, fn(v) {
    case v.1.1.0 {
      None -> Error(Nil)
      Some(timestamp) ->
        Ok(Listener(
          v.0.0.0,
          v.0.0.1,
          v.0.1.0,
          option.unwrap(v.0.1.1, ""),
          v.1.0,
          row.iso8601(timestamp),
          option.unwrap(v.1.1.1, ""),
        ))
    }
  })
}
