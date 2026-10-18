import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.star",
    "star",
    True,
    False,
    models.star_input_decoder(),
    models.encode_star_input,
    models.star_output_decoder(),
    models.encode_star_output,
  )
}
