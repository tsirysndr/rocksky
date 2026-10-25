import rocksky_api/db/row
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, eq, field, now_minus_seconds, required, returning_one, select, set,
  set_expression, update, where,
}
import rocksky_api/drizzle/schema/api_keys as k
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.apikey.updateApikey",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("updateApikey")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate)

      use input <- handler.procedure_body(
        req,
        options,
        models.update_apikey_input_decoder(),
      )

      use did <- task.then(handler.authenticated(req) |> task.from_result)

      use _ <- task.then(case string.trim(input.id) {
        "" -> task.fail(error.InvalidRequest("API key ID is required"))
        _ -> task.ok(Nil)
      })

      let name = string.trim(input.name)
      use _ <- task.then(case name {
        "" -> task.fail(error.InvalidRequest("Name is required"))
        _ -> task.ok(Nil)
      })

      let users = u.table()
      use user_id <- task.then(
        select(users, field("id", u.id(users)))
        |> where(eq(u.did(users), did))
        |> required(ctx.db, "User not found"),
      )

      let table = k.table()
      let values = [
        set(k.name(table), name),
        set_expression(k.updated_at(table), now_minus_seconds(0)),
      ]

      let values = case input.description {
        Some(description) -> [
          set(k.description(table), Some(description)),
          ..values
        ]
        None -> values
      }

      use key <- task.map(
        update(
          table,
          values,
          and([
            eq(k.id(table), input.id),
            eq(k.user_id(table), user_id),
          ]),
        )
        |> returning_one(ctx.db, "API key not found"),
      )

      models.encode_api_key_view(models.ApiKeyView(
        id: Some(key.id),
        name: Some(key.name),
        description: key.description,
        created_at: Some(row.iso8601(key.created_at)),
      ))
    },
  )
}
