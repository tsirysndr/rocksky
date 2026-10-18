import rocksky_api/context.{type Context}
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/shouts/handler

pub fn register(server: Server, ctx: Context) {
  handler.register(server, ctx, "app.rocksky.like.likeShout", handler.Like)
}
