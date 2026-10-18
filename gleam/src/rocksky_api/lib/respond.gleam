//// Turning `Task` results into Hono responses.

import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import rocksky_api/error.{type Error}
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/node/hono.{type Context as Request, type Response}
import rocksky_api/task.{type Task}

/// Maps a failure to the status the TypeScript routes used.
pub fn error(c: Request, err: Error) -> Response {
  case err {
    error.Unauthorized(_) -> hono.text(c, "Unauthorized", 401)
    error.PdsSessionExpired ->
      hono.json(c, agent.pds_session_expired_json(), 401)
    error.ScrobbleBotFlagged(m) -> hono.text(c, m, 403)
    error.ScrobbleBlocked(_, m) -> hono.text(c, m, 429)
    error.Forbidden(m) -> hono.text(c, m, 403)
    error.NotFound(m) -> hono.text(c, m, 404)
    error.InvalidRequest(m) -> hono.text(c, m, 400)
    error.Decode(_, _) ->
      hono.text(c, "Invalid request: " <> error.to_string(err), 400)
    error.Timeout(m) -> hono.text(c, m, 504)
    error.Upstream(status, m) -> hono.text(c, m, status)
    _ -> {
      log.error(error.describe(err))
      hono.text(c, error.to_string(err), 500)
    }
  }
}

/// JSON on success, the mapped error otherwise.
pub fn json(c: Request, t: Task(Json)) -> Promise(Response) {
  promise.map(t, fn(r) {
    case r {
      Ok(body) -> hono.json(c, body, 200)
      Error(e) -> error(c, e)
    }
  })
}

/// A custom success renderer with the shared error mapping.
pub fn with(
  c: Request,
  t: Task(a),
  render: fn(a) -> Response,
) -> Promise(Response) {
  promise.map(t, fn(r) {
    case r {
      Ok(v) -> render(v)
      Error(e) -> error(c, e)
    }
  })
}

pub fn status_ok(c: Request, t: Task(a)) -> Promise(Response) {
  with(c, t, fn(_) {
    hono.json(c, json.object([#("status", json.string("ok"))]), 200)
  })
}
