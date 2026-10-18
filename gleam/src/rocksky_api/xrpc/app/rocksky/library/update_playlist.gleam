import rocksky_api/context.{type Context}
import rocksky_api/library/playlist_routes
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) {
  playlist_routes.register(server, ctx, "updatePlaylist")
}
