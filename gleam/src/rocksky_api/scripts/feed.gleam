import gleam/json
import gleam/option.{Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/prompts
import rocksky_api/scripts/common
import rocksky_api/task

pub fn validate(name: String, description: String, did: String, rkey: String) {
  case
    js.string_length(name) >= 3 && js.string_length(name) <= 240,
    js.string_length(description) <= 3000,
    js.regex_test("^did:web:[a-zA-Z0-9_.-]{3,30}$", did),
    js.regex_test("^[a-zA-Z0-9_-]{3,30}$", rkey)
  {
    False, _, _, _ ->
      Error(error.InvalidRequest(
        "Feed name must be between 3 and 240 characters.",
      ))
    _, False, _, _ ->
      Error(error.InvalidRequest(
        "Description is too long. Maximum length is 3000 characters.",
      ))
    _, _, False, _ -> Error(error.InvalidRequest("Invalid feed DID."))
    _, _, _, False -> Error(error.InvalidRequest("Invalid record key."))
    _, _, _, _ -> Ok(Nil)
  }
}

pub fn create(
  ctx: Context,
  actor: String,
  name: String,
  description: String,
  feed_did: String,
  rkey: String,
) {
  use _ <- task.then(
    validate(name, description, feed_did, rkey) |> task.from_result,
  )
  use did <- task.then(common.actor(ctx, actor))
  use agent <- task.then(agent.require(ctx, did))
  atp.create_record(
    agent,
    did,
    "app.rocksky.feed.generator",
    Some(rkey),
    json.object([
      #("$type", json.string("app.rocksky.feed.generator")),
      #("displayName", json.string(name)),
      #("description", json.string(description)),
      #("did", json.string(feed_did)),
      #("createdAt", json.string(row.iso8601(row.from_unix_ms(js.now_ms())))),
    ]),
  )
  |> task.attempt_result
}

fn ask(message) {
  prompts.text(message)
  |> task.attempt_result
  |> task.require_task("Feed creation cancelled")
}

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [actor, ..] -> {
      use name <- task.then(ask("What is the feed name?"))
      use description <- task.then(ask(
        "Please provide a short description of the feed",
      ))
      use did <- task.then(ask("What is the feed DID?"))
      use rkey <- task.then(ask("What is the record key (rkey) for the feed?"))
      use _ <- task.then(
        validate(name, description, did, rkey) |> task.from_result,
      )
      log.info(
        "Feed name: "
        <> name
        <> "\nDescription: "
        <> description
        <> "\nDID: "
        <> did
        <> "\nRecord key: "
        <> rkey,
      )
      use confirmed <- task.then(
        prompts.confirm("Do you want to proceed?", True) |> task.attempt_result,
      )
      case confirmed {
        False -> task.ok(Nil)
        True -> {
          use record <- task.map(create(
            ctx,
            actor,
            name,
            description,
            did,
            rkey,
          ))
          log.success("Record created at: " <> record.uri)
        }
      }
    }
    _ ->
      task.fail(error.InvalidRequest(
        "Usage: gleam run -m rocksky_api/scripts/feed -- <handle|did>",
      ))
  }
}

pub fn main() {
  common.run(execute)
}
