import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.unstar",
    "unstar",
    True,
    False,
    models.unstar_input_decoder(),
    models.encode_unstar_input,
    models.unstar_output_decoder(),
    models.encode_unstar_output,
  )
}
