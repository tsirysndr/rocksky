//// Shared five-minute recommendation cache and Drift-to-local fallback.

import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/db/db
import rocksky_api/error
import rocksky_api/lexicon/json_value
import rocksky_api/lib/query_cache
import rocksky_api/log
import rocksky_api/node/abort
import rocksky_api/node/http_fetch
import rocksky_api/node/process
import rocksky_api/node/web_url
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn drift(base: String, path: String, actor: String, size: Int) {
  use url <- task.then(
    web_url.resolve(path, base) |> error.map_js |> task.from_result,
  )
  web_url.set_query(url, "did", actor)
  web_url.set_query(url, "limit", int.to_string(int.min(size, 100)))
  use response <- task.then(
    http_fetch.get(web_url.href(url), [], abort.timeout(3000))
    |> task.attempt_result,
  )
  case http_fetch.status(response) >= 200 && http_fetch.status(response) < 300 {
    False ->
      task.fail(error.Message(
        "drift responded " <> int.to_string(http_fetch.status(response)),
      ))
    True -> {
      use data <- task.then(http_fetch.json(response) |> task.attempt_result)
      decode.run(data, json_value.decoder())
      |> error.decode("Drift recommendations", _)
      |> task.from_result
      |> task.map(json_value.encode)
    }
  }
}

pub fn register(server, method, path, field, decoder, params, retrieve) {
  let cache = query_cache.new(300_000, 200)
  let drift_url = process.env("DRIFT_URL")
  xrpc_server.method(server, method, None, fn(req) {
    use p <- handler.query(
      req,
      handler.options(method)
        |> handler.timeout(34_000)
        |> handler.no_retry
        |> handler.on_error(
          handler.Fallback(json.object([#(field, json.array([], json.string))])),
        ),
      decoder,
    )
    let #(actor, size) = params(p)
    query_cache.get(cache, actor <> "|" <> int.to_string(size), fn() {
      let local = fn() {
        db.with_transient_retry(fn() { retrieve(actor, size) })
        |> task.timeout(30_000, method)
      }
      case drift_url {
        Some(base) if base != "" ->
          drift(base, path, actor, size)
          |> task.rescue(fn(e) {
            log.warn(
              "drift unavailable, using legacy pipeline: " <> error.to_string(e),
            )
            local()
          })
        _ -> local()
      }
    })
  })
}
