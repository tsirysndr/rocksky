import rocksky_api/db/row
import gleam/list
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, desc, eq, field, from, limit, offset, order_by, required, select, where,
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
    "app.rocksky.apikey.getApikeys",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("getApikeys")
        |> handler.on_error(handler.Propagate)

      use params <- handler.query(
        req,
        options,
        models.get_apikeys_params_decoder(),
      )

      use did <- task.then(handler.authenticated(req) |> task.from_result)

      let page_limit = option.unwrap(params.limit, 20)
      let page_offset = option.unwrap(params.offset, 0)

      use _ <- task.then(case page_limit < 1 || page_limit > 100 {
        True ->
          task.fail(error.InvalidRequest("Limit must be between 1 and 100"))
        False -> task.ok(Nil)
      })

      use _ <- task.then(case page_offset < 0 {
        True -> task.fail(error.InvalidRequest("Offset must be non-negative"))
        False -> task.ok(Nil)
      })

      let users = u.table()
      use user_id <- task.then(
        select(users, field("id", u.id(users)))
        |> where(eq(u.did(users), did))
        |> required(ctx.db, "User not found"),
      )

      let table = k.table()
      use keys <- task.map(
        from(table)
        |> where(eq(k.user_id(table), user_id))
        |> order_by([desc(k.created_at(table)), desc(k.id(table))])
        |> limit(page_limit)
        |> offset(page_offset)
        |> all(ctx.db),
      )

      let views =
        list.map(keys, fn(key) {
          models.ApiKeyView(
            id: Some(key.id),
            name: Some(key.name),
            description: key.description,
            created_at: Some(row.iso8601(key.created_at)),
          )
        })
      models.encode_get_apikeys_output(models.GetApikeysOutput(Some(views)))
    },
  )
}
