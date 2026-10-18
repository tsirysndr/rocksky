import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/agent as atproto
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/durable_submission
import rocksky_api/lib/scrobble_guard
import rocksky_api/lib/track
import rocksky_api/node/express
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task.{type Task}
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(
    server,
    "app.rocksky.scrobble.createScrobble",
    Some(auth.verifier(ctx)),
    fn(req) {
      submit(
        ctx,
        handler.caller(req),
        option.unwrap(req.input, js.null()),
        express.headers(req.req),
        agent.create(ctx, _),
      )
    },
  )
}

pub fn submit(
  ctx: Context,
  did: Option(String),
  body: Dynamic,
  headers: Dynamic,
  factory: fn(String) -> Task(Option(atproto.Agent)),
) {
  let work = {
    use did <- task.then(case did {
      Some(did) if did != "" -> task.ok(did)
      _ -> task.fail(error.InvalidRequest("Missing authenticated DID."))
    })
    use track <- task.then(
      track.parse(body)
      |> result.map_error(fn(e) {
        error.InvalidRequest("Invalid scrobble: " <> error.to_string(e))
      })
      |> task.from_result,
    )
    use blocked <- task.then(scrobble_guard.check(ctx, did))
    use _ <- task.then(case blocked {
      None -> task.ok(Nil)
      Some(block) ->
        task.fail(error.Upstream(
          429,
          error.to_string(scrobble_guard.to_error(block)),
        ))
    })
    use agent <- task.then(factory(did))
    use _ <- task.then(case agent {
      None -> task.fail(error.PdsSessionExpired)
      Some(_) -> task.ok(Nil)
    })
    let explicit =
      decode.run(
        headers,
        decode.optional_field(
          "idempotency-key",
          None,
          decode.map(decode.string, Some),
          decode.success,
        ),
      )
    use explicit <- task.then(case explicit {
      Ok(Some(key)) ->
        case js.string_length(key) <= 512 {
          True -> task.ok(Some(key))
          False -> task.fail(error.InvalidRequest("Invalid Idempotency-Key."))
        }
      Ok(None) -> task.ok(None)
      Error(_) -> task.fail(error.InvalidRequest("Invalid Idempotency-Key."))
    })
    let skip_teal =
      decode.run(
        headers,
        decode.at(["x-rocksky-mirror-provider"], decode.string),
      )
      == Ok("tealfm")
    durable_submission.enqueue(
      durable_submission.Config(
        ctx.env.submissions_url,
        ctx.env.submissions_secret,
      ),
      did,
      track,
      explicit,
      skip_teal,
    )
  }
  use outcome <- promise.map(work)
  case outcome {
    Ok(_) -> xrpc_server.Json(json.object([]))
    Error(error.InvalidRequest(_) as e)
    | Error(error.PdsSessionExpired as e)
    | Error(error.Upstream(_, _) as e) -> xrpc_server.fail(e)
    Error(_) ->
      xrpc_server.Fail(
        500,
        "InternalServerError",
        "Internal error while creating scrobble.",
      )
  }
}
