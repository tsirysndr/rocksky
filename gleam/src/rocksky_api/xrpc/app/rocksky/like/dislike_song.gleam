import rocksky_api/context.{type Context}
import rocksky_api/lovedtracks/handler
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) {
  handler.register(server, ctx, True)
}
