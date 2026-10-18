import gleam/dynamic/decode
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{eq, field, gte, lte, one, or, select, where}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/node/rsql_parser
import rocksky_api/task

pub fn conditions(ctx: Context, scrobbles, did, start, end) {
  use dates <- task.then(
    task.each([#(start, True), #(end, False)], fn(bound) {
      case bound.0 {
        None | Some("") -> task.ok(None)
        Some(value) -> {
          use date <- task.then(task.from_result(
            rsql_parser.date(value) |> map_error,
          ))
          use timestamp <- task.map(task.from_result(
            decode.run(date, row.timestamp()) |> error.decode("chart date", _),
          ))
          Some(case bound.1 {
            True -> gte(sc.timestamp(scrobbles), timestamp)
            False -> lte(sc.timestamp(scrobbles), timestamp)
          })
        }
      }
    }),
  )
  let dates = list.filter_map(dates, option.to_result(_, Nil))
  case did {
    None | Some("") -> task.ok(dates)
    Some(did) -> {
      let users = u.table()
      use user <- task.map(
        select(users, field("id", u.id(users)))
        |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
        |> one(ctx.read_db),
      )
      case user {
        None -> [or([])]
        Some(id) -> [eq(sc.user_id(scrobbles), Some(id)), ..dates]
      }
    }
  }
}

fn map_error(result) {
  case result {
    Ok(v) -> Ok(v)
    Error(message) -> Error(error.InvalidRequest(message))
  }
}
