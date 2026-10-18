//// Backfill expiry metadata and refresh future-dated sessions every minute.

import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/order
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/auth/store
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/env
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/node/cron
import rocksky_api/node/js
import rocksky_api/node/process
import rocksky_api/scripts/common
import rocksky_api/task
import rocksky_api/telemetry/metrics

pub fn update_expires_at(ctx: Context) {
  use sessions <- task.then(store.all_sessions(ctx.sqlite))
  common.each(sessions, fn(session) {
    use expiry <- task.then(
      json.parse(
        session.session,
        decode.at(["tokenSet"], {
          use expiry <- decode.optional_field(
            "expires_at",
            None,
            decode.optional(decode.string),
          )
          decode.success(expiry)
        }),
      )
      |> result.map_error(fn(_) { error.Message("Invalid session expiry") })
      |> task.from_result,
    )
    store.update_expires_at(ctx.sqlite, session.key, expiry)
  })
}

pub fn refresh(ctx: Context) {
  let now = row.iso8601(row.from_unix_ms(js.now_ms()))
  use sessions <- task.then(store.all_sessions(ctx.sqlite))
  sessions
  |> list.filter(fn(s) {
    case s.expires_at {
      Some(expiry) ->
        expiry != "NULL" && string.compare(expiry, now) == order.Gt
      _ -> False
    }
  })
  |> list.sort(fn(a, b) {
    string.compare(
      option.unwrap(a.expires_at, ""),
      option.unwrap(b.expires_at, ""),
    )
  })
  |> common.each(fn(session) {
    use agent <- task.then(agent.require(ctx, session.key))
    use _ <- task.then(atp.get_preferences(agent) |> task.attempt_result)
    task.sleep(200) |> task.attempt
  })
}

pub fn main() {
  use result <- promise.await(
    context.create(env.load(), metrics.new())
    |> task.then(fn(ctx) {
      use _ <- task.then(update_expires_at(ctx))
      use _ <- task.map(refresh(ctx))
      cron.schedule("* * * * *", fn() {
        refresh(ctx) |> task.unwrap_or(fn(e) { log.error(error.describe(e)) })
      })
    }),
  )
  case result {
    Ok(_) -> promise.resolve(Nil)
    Error(e) -> {
      log.error(error.describe(e))
      process.exit(1)
    }
  }
}
