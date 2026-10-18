import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.updateNowPlaying",
    "updateNowPlaying",
    True,
    False,
    models.update_now_playing_input_decoder(),
    models.encode_update_now_playing_input,
    models.update_now_playing_output_decoder(),
    models.encode_update_now_playing_output,
  )
}
