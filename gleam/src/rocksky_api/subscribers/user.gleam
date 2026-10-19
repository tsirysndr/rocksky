import gleam/dynamic/decode
import gleam/list
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, from, in_array, where}
import rocksky_api/drizzle/schema/users
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/task
import rocksky_api/typesense/search

pub fn handle(ctx: Context, payload: String) {
  use raw <- task.then(
    js.parse_json(payload) |> result.map_error(error.Js) |> task.from_result,
  )
  let id =
    decode.one_of(decode.field("xata_id", decode.string, decode.success), [
      decode.field("id", decode.string, decode.success),
    ])
  use ids <- task.then(
    decode.run(
      raw,
      decode.one_of(decode.map(id, fn(value) { [value] }), [decode.list(id)]),
    )
    |> result.map_error(error.Decode("rocksky.user", _))
    |> task.from_result,
  )
  case list.unique(ids) {
    [] -> task.ok(Nil)
    ids -> {
      let table = users.table()
      use rows <- task.then(
        from(table) |> where(in_array(users.id(table), ids)) |> all(ctx.db),
      )
      search.index_users(ctx.typesense, rows)
    }
  }
}

pub fn start(ctx: Context) {
  nats.subscribe(ctx.nc, "rocksky.user", fn(payload) {
    handle(ctx, payload)
    |> task.unwrap_or(fn(e) {
      log.error("rocksky.user handler: " <> error.describe(e))
    })
  })
}
