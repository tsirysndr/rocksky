import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.getGenres",
    "getGenres",
    False,
    False,
    models.get_genres_params_decoder(),
    models.encode_get_genres_params,
    models.get_genres_output_decoder(),
    models.encode_get_genres_output,
  )
}
