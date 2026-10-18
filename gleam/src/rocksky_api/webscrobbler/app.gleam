import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  eq, eq_columns, from, inner_join, insert, one, returning_one, set, update,
  where,
}
import rocksky_api/drizzle/schema/users as u
import rocksky_api/drizzle/schema/webscrobblers as w
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/crypto
import rocksky_api/node/hono
import rocksky_api/schema/webscrobblers
import rocksky_api/task

pub fn valid_uuid(value: String) {
  let parts = string.split(value, "-")
  list.map(parts, string.length) == [8, 4, 4, 4, 12]
  && list.all(parts, fn(p) {
    string.to_graphemes(p)
    |> list.all(fn(c) {
      list.contains(string.to_graphemes("0123456789abcdef"), c)
    })
  })
}

fn identity(ctx: Context, c: hono.Context) {
  use did <- task.then(auth.did(ctx, c))
  use user <- task.then(auth.user_by_did_or_handle(ctx, did))
  case user {
    None -> task.fail(error.Unauthorized("Unauthorized"))
    Some(user) -> task.ok(#(did, user.id))
  }
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/", fn(c) {
    let work = {
      use identity <- task.then(identity(ctx, c))
      let table = w.table()
      let users = u.table()
      use existing <- task.then(
        from(table)
        |> inner_join(users, eq_columns(w.user_id(table), u.id(users)))
        |> where(eq(u.did(users), identity.0))
        |> one(ctx.db),
      )
      case existing {
        Some(record) -> task.ok(webscrobblers.to_json(record))
        None ->
          insert(table, [
            set(w.uuid(table), crypto.random_uuid()),
            set(w.user_id(table), identity.1),
            set(w.name(table), "webscrobbler"),
          ])
          |> returning_one(ctx.db, "Webscrobbler insert failed")
          |> task.map(webscrobblers.to_json)
      }
    }
    respond.json(c, work)
  })
  |> hono.put("/:id", fn(c) {
    let work = {
      use identity <- task.then(identity(ctx, c))
      let id = hono.param(c, "id")
      case valid_uuid(id) {
        False -> task.fail(error.InvalidRequest("Invalid id"))
        True -> {
          let table = w.table()
          use existing <- task.then(
            from(table)
            |> where(eq(w.user_id(table), identity.1))
            |> one(ctx.db),
          )
          let values = [
            set(w.uuid(table), id),
            set(w.user_id(table), identity.1),
            set(w.name(table), "webscrobbler"),
          ]
          let mutation = case existing {
            None -> insert(table, values)
            Some(row) -> update(table, values, eq(w.id(table), row.id))
          }
          mutation
          |> returning_one(ctx.db, "Webscrobbler write failed")
          |> task.map(webscrobblers.to_json)
        }
      }
    }
    respond.json(c, work)
  })
}
