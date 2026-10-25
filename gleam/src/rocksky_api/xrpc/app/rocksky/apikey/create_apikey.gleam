import gleam/option.{Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  eq, field, insert, required, returning_one, select, set, where,
}
import rocksky_api/drizzle/schema/api_keys as k
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/node/crypto
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.apikey.createApikey",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("createApikey")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate)

      use input <- handler.procedure_body(
        req,
        options,
        models.create_apikey_input_decoder(),
      )

      use did <- task.then(handler.authenticated(req) |> task.from_result)

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
      use key <- task.map(
        insert(table, [
          set(k.name(table), name),
          set(k.description(table), input.description),
          set(k.enabled(table), True),
          set(k.api_key(table), crypto.random_bytes_hex(16)),
          set(k.shared_secret(table), crypto.random_bytes_hex(16)),
          set(k.user_id(table), user_id),
        ])
        |> returning_one(ctx.db, "API key not created"),
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
