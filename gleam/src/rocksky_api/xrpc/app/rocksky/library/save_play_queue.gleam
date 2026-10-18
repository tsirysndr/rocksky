import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.savePlayQueue",
    "savePlayQueue",
    True,
    False,
    models.save_play_queue_input_decoder(),
    models.encode_save_play_queue_input,
    models.save_play_queue_output_decoder(),
    models.encode_save_play_queue_output,
  )
}
