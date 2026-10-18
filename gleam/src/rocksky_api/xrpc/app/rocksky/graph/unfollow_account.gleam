import gleam/dynamic/decode
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/lexicon/models
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/graph/mutate
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let empty =
    models.UnfollowAccountOutput(
      models.new_actor_profile_view_basic(),
      [],
      None,
    )
    |> models.encode_unfollow_account_output
  xrpc_server.method(
    server,
    "app.rocksky.graph.unfollowAccount",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("unfollowAccount")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(empty)),
        models.unfollow_account_params_decoder(),
      )
      use did <- task.then(task.from_result(handler.authenticated(req)))
      use #(subject, followers, _, _) <- task.map(mutate.run(
        ctx,
        did,
        params.account,
        False,
      ))
      let cursor = case list.length(followers) == 50 {
        False -> None
        True ->
          list.last(followers)
          |> option.from_result
          |> option.then(fn(p) { p.created_at })
          |> option.then(fn(date) {
            decode.run(js.coerce(date), row.timestamp())
            |> option.from_result
            |> option.map(fn(t) { row.to_unix_ms(t) |> int.to_string })
          })
      }
      models.UnfollowAccountOutput(subject, followers, cursor)
      |> models.encode_unfollow_account_output
    },
  )
}
