//// The XRPC service (port 3004): `@atproto/xrpc-server` over Express, with
//// everything else proxied to the REST service on 8000.

import gleam/int
import gleam/javascript/promise
import gleam/json
import rocksky_api/context
import rocksky_api/env
import rocksky_api/error
import rocksky_api/lexicon/loader
import rocksky_api/log
import rocksky_api/node/express
import rocksky_api/node/otel
import rocksky_api/node/process
import rocksky_api/node/xrpc_server
import rocksky_api/telemetry/metrics
import rocksky_api/telemetry/xrpc_telemetry
import rocksky_api/xrpc/routes

pub const version = "0.0.1"

pub fn main() {
  otel.start("rocksky-xrpc", version)
  process.set_dns_ipv4_first()
  process.on("unhandledRejection", fn(e) {
    log.error_with("Unhandled rejection:", e)
  })
  process.on("uncaughtException", fn(e) {
    log.error_with("Uncaught exception:", e)
  })
  let env = env.load()
  let metrics = metrics.new()
  use started <- promise.await(context.create(env, metrics))
  case started {
    Error(e) -> {
      log.error("Failed to start: " <> error.describe(e))
      process.exit(1)
    }
    Ok(ctx) -> {
      case loader.load(loader.default_root()) {
        Error(e) -> {
          log.error(error.describe(e))
          process.exit(1)
        }
        Ok(lexicons) -> {
          let server =
            xrpc_server.create(
              lexicons,
              xrpc_server.Options(
                validate_response: False,
                json_limit: 100 * 1024,
                text_limit: 100 * 1024,
                blob_limit: 5 * 1024 * 1024,
              ),
            )
            |> routes.register(ctx)
          let port = env.rocksky_xrpc_port
          express.new()
          |> express.use_(express.cors())
          |> express.use_(xrpc_telemetry.middleware(metrics))
          |> express.use_(health())
          |> express.use_(xrpc_server.router(server))
          |> express.use_(express.proxy("http://localhost:8000"))
          |> express.listen(port, fn() {
            log.info(
              "Rocksky XRPC API is running on port " <> int.to_string(port),
            )
          })
          promise.resolve(Nil)
        }
      }
    }
  }
}

/// Liveness of this XRPC process; does not depend on REST or storage.
pub fn health() -> express.Middleware {
  express.middleware(fn(req, res, next) {
    case
      express.path(req) == "/xrpc/_health"
      && { express.method(req) == "GET" || express.method(req) == "HEAD" }
    {
      True -> {
        express.set_header(res, "Cache-Control", "no-store")
        express.send_json(
          res,
          json.object([
            #("status", json.string("ok")),
            #("version", json.string(version)),
          ]),
        )
      }
      False -> next()
    }
  })
}
