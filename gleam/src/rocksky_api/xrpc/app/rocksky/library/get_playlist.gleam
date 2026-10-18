import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.getPlaylist",
    "getPlaylist",
    False,
    False,
    models.library_get_playlist_params_decoder(),
    models.encode_library_get_playlist_params,
    models.library_get_playlist_output_decoder(),
    models.encode_library_get_playlist_output,
  )
}
