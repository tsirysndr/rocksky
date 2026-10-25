//// The materialized-view refresher: a 30-minute cron and nothing else.
////
//// This runs as its own process so it cannot take the XRPC API down with it.
//// A refresh is long, synchronous-ish database work, and node-cron has wedged
//// the event loop it shares before now (the October 2026 DST fall-back), which
//// left the HTTP server alive but no longer accepting connections.

import gleam/javascript/promise
import rocksky_api/db/db
import rocksky_api/env
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/cron
import rocksky_api/node/otel
import rocksky_api/node/pg
import rocksky_api/node/process
import rocksky_api/task

pub const version = "0.0.1"

const materialized_views = [
  "user_artists_mv", "top_scrobblers_mv", "scrobbles_per_day_mv",
  "user_hour_scrobbles_mv", "chart_artists_mv", "chart_tracks_mv",
]

pub fn main() {
  otel.start("rocksky-views", version)
  process.set_dns_ipv4_first()
  process.on("unhandledRejection", fn(e) {
    log.error_with("Unhandled rejection:", e)
  })
  process.on("uncaughtException", fn(e) {
    log.error_with("Uncaught exception:", e)
  })
  let env = env.load()
  let pools = db.open(env)
  schedule_view_refresh(pools.primary)
  log.info("Rocksky materialized view refresher is running")
  // The cron timer is the only handle on the loop; hold it open regardless.
  process.keep_alive()
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
  Nil
}
