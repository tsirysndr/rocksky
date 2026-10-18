//// The XRPC service (port 3004): `@atproto/xrpc-server` over Express, with
//// everything else proxied to the REST service on 8000.

import gleam/int
import gleam/javascript/promise
import gleam/list
import rocksky_api/context
import rocksky_api/db/db
import rocksky_api/env
import rocksky_api/error
import rocksky_api/lexicon/loader
import rocksky_api/log
import rocksky_api/node/cron
import rocksky_api/node/express
import rocksky_api/node/otel
import rocksky_api/node/pg
import rocksky_api/node/process
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/telemetry/metrics
import rocksky_api/telemetry/xrpc_telemetry
import rocksky_api/xrpc/routes

pub const version = "0.0.1"

const materialized_views = [
  "user_artists_mv", "top_scrobblers_mv", "scrobbles_per_day_mv",
  "user_hour_scrobbles_mv", "chart_artists_mv", "chart_tracks_mv",
]

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
      schedule_view_refresh(ctx.db)
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

/// A concurrent refresh outlives the pool's statement_timeout, so it runs on
/// its own client with the cap lifted.
fn schedule_view_refresh(primary: db.Db) -> Nil {
  cron.schedule("*/30 * * * *", fn() {
    use client <- promise.await(pg.connect(primary.pool))
    case client {
      Error(e) -> {
        log.error_with(
          "Failed to run materialized view refresh:",
          error.to_js(e),
        )
        promise.resolve(Nil)
      }
      Ok(client) -> {
        use _ <- promise.await(
          pg.client_query(client, "SET statement_timeout = 0", []),
        )
        use _ <- promise.await(
          task.each(materialized_views, fn(view) {
            {
              use _ <- task.then(
                task.attempt_result(
                  pg.client_query(
                    client,
                    "REFRESH MATERIALIZED VIEW CONCURRENTLY " <> view,
                    [],
                  ),
                ),
              )
              case view {
                // A concurrent refresh clears visibility bits; restore index-only lookups.
                "user_artists_mv" ->
                  task.attempt_result(
                    pg.client_query(
                      client,
                      "VACUUM (ANALYZE, TRUNCATE FALSE) user_artists_mv",
                      [],
                    ),
                  )
                  |> task.map(fn(_) { Nil })
                _ -> task.ok(Nil)
              }
            }
            |> task.rescue(fn(e) {
              log.error(
                "Failed to refresh " <> view <> ": " <> error.to_string(e),
              )
              task.ok(Nil)
            })
          }),
        )
        pg.release(client, True)
        promise.resolve(Nil)
      }
    }
  })
  let _ = list.length(materialized_views)
  Nil
}
