import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/graph/queries
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetFollowsOutput(
      subject: models.new_actor_profile_view_basic(),
      follows: [],
      cursor: None,
      count: Some(0),
    )
  xrpc_server.method(server, "app.rocksky.graph.getFollows", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getFollows")
        |> handler.timeout(120_000)
        |> handler.on_error(
          handler.Fallback(models.encode_get_follows_output(fallback)),
        ),
      models.get_follows_params_decoder(),
    )
    use #(subject, users, cursor, count) <- task.map(queries.page(
      ctx,
      params.actor,
      option.unwrap(params.limit, 50),
      params.cursor,
      option.unwrap(params.dids, []),
      True,
      None,
    ))
    models.GetFollowsOutput(subject, users, cursor, Some(count))
    |> models.encode_get_follows_output
  })
}
