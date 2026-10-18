import gleam/option.{None}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, one, where}
import rocksky_api/drizzle/schema/feeds as f
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/feed/generators
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(server, "app.rocksky.feed.getFeedGenerator", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getFeedGenerator")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate),
      models.get_feed_generator_params_decoder(),
    )
    use view <- task.map(
      generators.query()
      |> where(eq(f.uri(f.table()), params.feed))
      |> one(ctx.read_db),
    )
    models.GetFeedGeneratorOutput(view)
    |> models.encode_get_feed_generator_output
  })
}
