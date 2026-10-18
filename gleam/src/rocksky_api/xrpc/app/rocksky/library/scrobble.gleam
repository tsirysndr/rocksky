import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.scrobble",
    "scrobble",
    True,
    False,
    models.scrobble_input_decoder(),
    models.encode_scrobble_input,
    models.scrobble_output_decoder(),
    models.encode_scrobble_output,
  )
}
