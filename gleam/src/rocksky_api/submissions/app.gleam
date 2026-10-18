import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/agent as atproto
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/validation
import rocksky_api/lib/agent
import rocksky_api/lib/durable_submission
import rocksky_api/lib/track
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/pg
import rocksky_api/nowplaying/service
import rocksky_api/task
import rocksky_api/tealfm/publication
import rocksky_api/tealfm/push_enabled

fn fail(c: hono.Context, status: Int, message: String) {
  hono.json(c, json.object([#("error", json.string(message))]), status)
}

fn identity_decoder() {
  use did <- decode.field("did", decode.string)
  use id <- decode.field("submissionId", decode.string)
  case string.starts_with(did, "did:") && durable_submission.is_job_id(id) {
    True -> decode.success(#(did, id))
    False -> decode.failure(#(did, id), "DID and submission ID")
  }
}

pub fn app(ctx: Context) {
  app_with_agent_factory(ctx, agent.require(ctx, _))
}

pub fn app_with_agent_factory(
  ctx: Context,
  factory: fn(String) -> task.Task(atproto.Agent),
) {
  hono.new()
  |> hono.post("/process", fn(c) { process(c, ctx, False, factory) })
  |> hono.post("/tealfm/process", fn(c) { process(c, ctx, True, factory) })
}

fn process(
  c: hono.Context,
  ctx: Context,
  teal: Bool,
  factory: fn(String) -> task.Task(atproto.Agent),
) {
  case
    durable_submission.valid_secret(
      hono.header(c, "x-rocksky-submissions-secret"),
      ctx.env.submissions_secret,
    )
  {
    False -> hono.respond(fail(c, 401, "Unauthorized"))
    True -> {
      let work = {
        use body <- task.then(hono.json_body(c) |> task.attempt_result)
        let invalid = case teal {
          True -> "Invalid Teal submission"
          False -> "Invalid submission"
        }
        use identity <- task.then(case decode.run(body, identity_decoder()) {
          Ok(v) -> task.ok(v)
          Error(_) -> task.fail(error.InvalidRequest(invalid))
        })
        let raw_track = js.get(body, "track")
        // Validate the stored payload before obtaining an agent or publishing.
        use decoded <- task.then(case teal {
          True -> {
            use _ <- task.then(
              validation.record(
                publication.play_collection,
                js.coerce(raw_track),
              )
              |> task.from_result
              |> task.map_error(fn(_) {
                error.InvalidRequest("Invalid Teal submission")
              }),
            )
            use play <- task.then(
              decode.run(raw_track, publication.decoder())
              |> error.decode("Teal play", _)
              |> task.from_result
              |> task.map_error(fn(_) {
                error.InvalidRequest("Invalid Teal submission")
              }),
            )
            case pg.to_ms(js.get(raw_track, "playedTime")) {
              None -> task.fail(error.InvalidRequest("Invalid Teal submission"))
              Some(_) -> task.ok(Teal(play))
            }
          }
          False ->
            case track.parse(raw_track) {
              Ok(track) ->
                case track.timestamp {
                  Some(t) if t != 0 -> task.ok(Rocksky(track))
                  _ -> task.fail(error.InvalidRequest("Invalid stored track"))
                }
              Error(_) ->
                task.fail(error.InvalidRequest("Invalid stored track"))
            }
        })
        use rkey <- task.then(
          case decode.run(body, decode.at(["recordKey"], decode.string)) {
            Ok(key) ->
              durable_submission.record_key(key)
              |> task.from_result
              |> task.map_error(fn(_) {
                error.InvalidRequest("Invalid stored record key")
              })
            Error(_) ->
              task.fail(error.InvalidRequest("Invalid stored record key"))
          },
        )
        use _ <- task.then(case decoded {
          Teal(play) -> {
            use enabled <- task.then(push_enabled.is_enabled(ctx, identity.0))
            case enabled {
              False -> task.ok(Nil)
              True -> {
                use agent <- task.then(factory(identity.0))
                publication.publish_teal_record(agent, play, rkey, None)
              }
            }
          }
          Rocksky(track) -> {
            use agent <- task.then(factory(identity.0))
            let skip =
              decode.run(body, decode.at(["skipTeal"], decode.bool)) == Ok(True)
            service.scrobble_track(
              ctx,
              track,
              agent,
              identity.0,
              False,
              None,
              Some(service.Submission(identity.1, rkey, skip)),
            )
          }
        })
        task.ok(identity.1)
      }
      use outcome <- promise.map(work)
      case outcome {
        Ok(id) ->
          hono.json(
            c,
            json.object([
              #("status", json.string("published")),
              #("submissionId", json.string(id)),
            ]),
            200,
          )
        Error(error.InvalidRequest(message)) -> fail(c, 400, message)
        Error(error.PdsSessionExpired) ->
          hono.json(c, agent.pds_session_expired_json(), 401)
        Error(error.ScrobbleBotFlagged(_)) ->
          fail(c, 403, "Account flagged as bot")
        Error(error.ScrobbleBlocked(retry, _)) -> {
          hono.set_header(c, "Retry-After", int.to_string(retry))
          fail(c, 429, "Scrobble temporarily blocked")
        }
        Error(_) ->
          fail(c, 503, case teal {
            True -> "Teal publication failed"
            False -> "Publication failed"
          })
      }
    }
  }
}

type Stored {
  Teal(publication.Play)
  Rocksky(track.Track)
}
