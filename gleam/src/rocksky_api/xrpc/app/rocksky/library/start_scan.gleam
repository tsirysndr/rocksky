import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/navidrome
import rocksky_api/node/xrpc_server.{type Server}

pub fn register(server: Server, ctx: Context) -> Nil {
  navidrome.register(
    server,
    ctx,
    "app.rocksky.library.startScan",
    "startScan",
    False,
    False,
    models.start_scan_params_decoder(),
    models.encode_start_scan_params,
    models.start_scan_output_decoder(),
    models.encode_start_scan_output,
  )
}
