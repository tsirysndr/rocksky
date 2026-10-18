import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{eq, field, required, select, where}
import rocksky_api/drizzle/schema/users
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/extract_pds
import rocksky_api/node/js
import rocksky_api/task.{type Task}

pub fn now() -> String {
  row.iso8601(row.from_unix_ms(js.now_ms()))
}

pub fn actor(
  ctx: Context,
  requested: Option(String),
  caller: Option(String),
) -> Task(String) {
  use did <- task.then(
    task.from_result(case requested, caller {
      Some(did), _ | None, Some(did) -> Ok(did)
      _, _ ->
        Error(error.Unauthorized(
          "Provide a `did` param for public access or include an auth token.",
        ))
    }),
  )
  case string.starts_with(did, "did:") {
    True -> task.ok(did)
    False -> {
      let table = users.table()
      select(table, field("did", users.did(table)))
      |> where(eq(users.handle(table), did))
      |> required(ctx.db, "Handle not found: " <> did)
    }
  }
}

pub fn reader(ctx: Context, did: String) -> Task(atp.Agent) {
  use agent <- task.then(agent.create(ctx, did))
  case agent {
    Some(agent) -> task.ok(agent)
    None -> {
      use pds <- task.map(extract_pds.from_did(ctx.env.plc_directory_url, did))
      atp.atp_agent(pds)
    }
  }
}

pub fn existing(
  agent: atp.Agent,
  did: String,
  collection: String,
  rkey: String,
) -> Task(Option(atp.Record)) {
  task.attempt_result(atp.get_record(agent, did, collection, rkey))
  |> task.map(Some)
  |> task.rescue(fn(e) {
    case e {
      error.Js(ex) ->
        case js.status(ex) {
          Some(400) | Some(404) -> task.ok(None)
          _ -> task.fail(e)
        }
      _ -> task.fail(e)
    }
  })
}

pub fn record(collection: String, body: json.Json) -> json.Json {
  let fields = js.entries(js.coerce(body))
  json.object([
    #("$type", json.string(collection)),
    ..list.map(fields, fn(pair) { #(pair.0, js.coerce(pair.1)) })
  ])
}

pub fn decoded(
  record: Option(atp.Record),
  decoder: decode.Decoder(a),
) -> Option(a) {
  option.then(record, fn(rec) {
    decode.run(rec.value, decoder) |> option.from_result
  })
}

pub fn prefer(patch: Option(a), stored: Option(a)) -> Option(a) {
  case patch {
    Some(_) -> patch
    None -> stored
  }
}
