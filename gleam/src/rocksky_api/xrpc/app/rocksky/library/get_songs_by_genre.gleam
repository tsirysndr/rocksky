import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.getSongsByGenre",
    "getSongsByGenre",
    False,
    False,
    models.get_songs_by_genre_params_decoder(),
    models.encode_get_songs_by_genre_params,
    models.get_songs_by_genre_output_decoder(),
    models.encode_get_songs_by_genre_output,
  )
}
