import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, limit}
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/feed/generators
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.feed.getFeedGenerators",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getFeedGenerators")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.get_feed_generators_params_decoder(),
      )
      use view <- task.map(
        generators.query()
        |> limit(case option.unwrap(params.size, 100) {
          0 -> 100
          n -> n
        })
        |> all(ctx.read_db),
      )
      models.FeedGeneratorsView(Some(view))
      |> models.encode_feed_generators_view
    },
  )
}
