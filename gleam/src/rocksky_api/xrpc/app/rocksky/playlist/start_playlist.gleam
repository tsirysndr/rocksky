//// Preserves the unfinished TypeScript route; see xrpc/legacy.gleam.

import rocksky_api/context.{type Context}
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/xrpc/legacy

pub fn register(server: Server, ctx: Context) {
  legacy.register(
    server,
    ctx,
    "app.rocksky.playlist.startPlaylist",
    legacy.PlaylistTransaction,
  )
}
