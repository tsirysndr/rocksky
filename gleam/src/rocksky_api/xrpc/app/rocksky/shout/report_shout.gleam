import gleam/option.{Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, eq, field, insert, one, required, run, select, set, where,
}
import rocksky_api/drizzle/schema/shout_reports as sr
import rocksky_api/drizzle/schema/shouts as s
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
    "app.rocksky.shout.reportShout",
    Some(auth.verifier(ctx)),
    fn(req) {
      use input <- handler.procedure_body(
        req,
        handler.options("reportShout") |> handler.no_retry,
        models.report_shout_input_decoder(),
      )
      use did <- task.then(task.from_result(handler.authenticated(req)))
      use _ <- task.then(case input.shout_id {
        "" -> task.fail(error.InvalidRequest("Missing shout id"))
        _ -> task.ok(Nil)
      })
      let users = u.table()
      let shouts = s.table()
      let reports = sr.table()
      use user <- task.then(
        select(users, field("id", u.id(users)))
        |> where(eq(u.did(users), did))
        |> required(ctx.db, "User not found"),
      )
      let identifier = case string.starts_with(input.shout_id, "at://") {
        True -> s.uri(shouts)
        False -> s.id(shouts)
      }
      use shout <- task.then(
        select(shouts, field("id", s.id(shouts)))
        |> where(eq(identifier, input.shout_id))
        |> required(ctx.db, "Shout not found"),
      )
      use existing <- task.then(
        select(reports, field("id", sr.id(reports)))
        |> where(
          and([eq(sr.user_id(reports), user), eq(sr.shout_id(reports), shout)]),
        )
        |> one(ctx.db),
      )
      use _ <- task.map(case existing {
        Some(_) -> task.ok(0)
        option.None ->
          insert(reports, [
            set(sr.user_id(reports), user),
            set(sr.shout_id(reports), shout),
          ])
          |> run(ctx.db)
      })
      models.new_shout_view() |> models.encode_shout_view
    },
  )
}
