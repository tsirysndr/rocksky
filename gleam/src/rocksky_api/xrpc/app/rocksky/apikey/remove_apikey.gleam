import gleam/option.{Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  and, delete, eq, field, required, returning_one, select, where,
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
    "app.rocksky.apikey.removeApikey",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("removeApikey")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate)

      use params <- handler.query(
        req,
        options,
        models.remove_apikey_params_decoder(),
      )

      use did <- task.then(handler.authenticated(req) |> task.from_result)

      use _ <- task.then(case string.trim(params.id) {
        "" -> task.fail(error.InvalidRequest("API key ID is required"))
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
        delete(
          table,
          and([
            eq(k.id(table), params.id),
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
