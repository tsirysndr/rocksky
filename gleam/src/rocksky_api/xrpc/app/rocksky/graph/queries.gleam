import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  alias, and, count as db_count, desc, eq, eq_columns, exists, field, in_array,
  inner_join, integer, json_rows, left_join, limit as db_limit, lt, one,
  order_by, pair, required, scalar, select, select_values, value, where,
}
import rocksky_api/drizzle/schema/follows as f
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/node/rsql_parser
import rocksky_api/task
import rocksky_api/views/profile

pub fn subject(ctx: Context, did: String) {
  let table = u.table()
  use user <- task.map(
    select(table, profile.selection(table))
    |> where(eq(u.did(table), did))
    |> one(ctx.db),
  )
  option.unwrap(user, models.new_actor_profile_view_basic())
}

pub fn page(
  ctx: Context,
  actor: String,
  limit: Int,
  cursor: Option(String),
  dids: List(String),
  following: Bool,
  known: Option(String),
) {
  let follows = f.table()
  let users = u.table()
  let #(owner, target) = case following {
    True -> #(f.follower_did(follows), f.subject_did(follows))
    False -> #(f.subject_did(follows), f.follower_did(follows))
  }
  let filters = [eq(owner, actor)]
  let filters = case dids {
    [] -> filters
    _ -> [in_array(target, dids), ..filters]
  }
  let count = select(follows, field("count", db_count())) |> where(and(filters))
  use filters <- task.then(case cursor {
    None | Some("") -> task.ok(filters)
    Some(value) ->
      case rsql_parser.number(value) {
        Error(_) -> task.fail(error.InvalidRequest("Invalid graph cursor"))
        Ok(number) ->
          case decode.run(number, row.float()) {
            Error(_) -> task.fail(error.InvalidRequest("Invalid graph cursor"))
            Ok(ms) ->
              task.ok([
                lt(f.created_at(follows), row.from_unix_ms(float.truncate(ms))),
                ..filters
              ])
          }
      }
  })
  let filters = case known {
    None -> filters
    Some(did) -> {
      let other = alias(follows, "f2")
      let query =
        select(other, field("id", f.id(other)))
        |> where(
          and([
            eq_columns(f.subject_did(other), u.did(users)),
            eq(f.follower_did(other), did),
          ]),
        )
      [exists(query), ..filters]
    }
  }
  let query =
    select(
      follows,
      pair(
        profile.selection(users),
        field("followed_at", f.created_at(follows)),
      ),
    )
  let query = case known {
    Some(_) -> inner_join(query, users, eq_columns(u.did(users), target))
    None -> left_join(query, users, eq_columns(u.did(users), target))
  }
  let subjects =
    select(users, profile.selection(users))
    |> where(eq(u.did(users), actor))
    |> db_limit(1)
  let rows =
    query
    |> where(and(filters))
    |> order_by([desc(f.created_at(follows))])
    |> db_limit(limit)
  // A graph page needs one connection, even when the relation is absent.
  // Count remains independent of the cursor, as in the original response.
  use #(subjects, #(rows, count)) <- task.map(
    select_values(pair(
      field("subject", json_rows(subjects)),
      pair(
        field("rows", json_rows(rows)),
        field("count", case known {
          Some(_) -> value(0, integer())
          None -> scalar(count, integer())
        }),
      ),
    ))
    |> required(ctx.db, "Missing graph page"),
  )
  let subject =
    list.first(subjects) |> result.unwrap(models.new_actor_profile_view_basic())
  #(
    subject,
    list.map(rows, fn(r) { r.0 }),
    list.last(rows)
      |> option.from_result
      |> option.map(fn(r) { int.to_string(row.to_unix_ms(r.1)) }),
    count,
  )
}
