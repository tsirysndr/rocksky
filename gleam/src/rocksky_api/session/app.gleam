//// Explicit session health, independent of cached profile data.

import gleam/javascript/promise
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/auth/store
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/node/hono
import rocksky_api/session/status
import rocksky_api/task.{type Task}

pub fn app(ctx: Context) -> hono.App {
  hono.new()
  |> hono.get("/status", fn(c) {
    hono.set_header(c, "Cache-Control", "no-store")
    let checked = {
      use did <- task.then(auth.did(ctx, c))
      status.check(fn() { has_session(ctx, did) }, fn() {
        task.map(agent.create(ctx, did), fn(a) { a != None })
      })
    }
    promise.map(checked, fn(result) {
      case result {
        Ok(_) -> hono.json(c, json.object([#("active", json.bool(True))]), 200)
        Error(error.Unauthorized(_)) ->
          hono.json(
            c,
            json.object([#("error", json.string("Unauthorized"))]),
            401,
          )
        Error(error.PdsSessionExpired) ->
          hono.json(c, agent.pds_session_expired_json(), 401)
        Error(_) ->
          hono.json(
            c,
            json.object([#("error", json.string("session_unavailable"))]),
            503,
          )
      }
    })
  })
}

fn has_session(ctx: Context, did: String) -> Task(Bool) {
  use oauth <- task.then(store.get_session(ctx.sqlite, did))
  case oauth {
    Some(_) -> task.ok(True)
    None ->
      task.map(store.get_session(ctx.sqlite, "atp:" <> did), fn(a) { a != None })
  }
}
