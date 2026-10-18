import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/graph/queries
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetKnownFollowersOutput(
      subject: models.new_actor_profile_view_basic(),
      followers: [],
      cursor: None,
    )
  xrpc_server.method(
    server,
    "app.rocksky.graph.getKnownFollowers",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getKnownFollowers")
          |> handler.timeout(120_000)
          |> handler.on_error(
            handler.Fallback(models.encode_get_known_followers_output(fallback)),
          ),
        models.get_known_followers_params_decoder(),
      )
      case handler.caller(req) {
        None -> task.ok(models.encode_get_known_followers_output(fallback))
        Some(did) -> {
          use #(subject, users, cursor, _) <- task.map(queries.page(
            ctx,
            params.actor,
            option.unwrap(params.limit, 50),
            params.cursor,
            [],
            False,
            Some(did),
          ))
          models.GetKnownFollowersOutput(subject, users, cursor)
          |> models.encode_get_known_followers_output
        }
      }
    },
  )
}
