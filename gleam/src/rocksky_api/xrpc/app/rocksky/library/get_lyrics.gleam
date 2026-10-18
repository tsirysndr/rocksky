import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.getLyrics",
    "getLyrics",
    False,
    False,
    models.get_lyrics_params_decoder(),
    models.encode_get_lyrics_params,
    models.get_lyrics_output_decoder(),
    models.encode_get_lyrics_output,
  )
}
