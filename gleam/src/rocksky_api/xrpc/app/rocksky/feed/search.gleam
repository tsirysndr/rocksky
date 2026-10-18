import gleam/dynamic/decode
import gleam/int
import gleam/option.{None}
import rocksky_api/context.{type Context}
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/typesense/search as search_service
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(server, "app.rocksky.feed.search", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("search")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate),
      params_decoder(),
    )
    search_service.federated_search(ctx.typesense, params.0, params.1)
    |> task.map(search_service.encode)
  })
}

fn params_decoder() {
  use query <- decode.field("query", decode.string)
  use size <- decode.optional_field("size", 20, decode.int)
  decode.success(
    #(query, case size > 0 {
      True -> int.min(size, 100)
      False -> 20
    }),
  )
}
