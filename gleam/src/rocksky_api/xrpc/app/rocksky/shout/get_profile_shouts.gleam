import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/shout_queries
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.shout.getProfileShouts",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getProfileShouts")
          |> handler.on_error(handler.Fallback(shout_queries.encode([]))),
        models.get_profile_shouts_params_decoder(),
      )
      use views <- task.map(shout_queries.retrieve(
        ctx,
        shout_queries.Profile,
        params.did,
        handler.caller(req),
      ))
      shout_queries.encode(views)
    },
  )
}
