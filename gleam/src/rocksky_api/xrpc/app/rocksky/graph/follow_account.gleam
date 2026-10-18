import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/graph/mutate
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let empty =
    models.FollowAccountOutput(models.new_actor_profile_view_basic(), [], None)
    |> models.encode_follow_account_output
  xrpc_server.method(
    server,
    "app.rocksky.graph.followAccount",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("followAccount")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(empty)),
        models.follow_account_params_decoder(),
      )
      use did <- task.then(task.from_result(handler.authenticated(req)))
      use #(subject, followers, _, _) <- task.map(mutate.run(
        ctx,
        did,
        params.account,
        True,
      ))
      let cursor = None
      models.FollowAccountOutput(subject, followers, cursor)
      |> models.encode_follow_account_output
    },
  )
}
