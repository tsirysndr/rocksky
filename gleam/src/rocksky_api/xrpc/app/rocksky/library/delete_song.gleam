import rocksky_api/context.{type Context}
import rocksky_api/library/delete_routes
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) {
  delete_routes.register(server, ctx, False)
}
