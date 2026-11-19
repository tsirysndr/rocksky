//// ListenBrainz clients cache playing_now submissions in the scrobbler service.

import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/node/js
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

pub fn get(ctx: Context, did: String) -> Task(json.Json) {
  use raw <- task.map(
    task.attempt_result(redis.get(ctx.redis, "listenbrainz:playing_now:" <> did)),
  )
  case raw {
    None -> json.object([])
    Some(raw) -> from_json(raw, js.now_ms())
  }
}

pub fn from_json(raw: String, now: Int) -> json.Json {
  case js.parse_json(raw) {
    Error(_) -> json.object([])
    Ok(listen) -> {
      let meta = js.get(listen, "track_metadata")
      let info = js.get(meta, "additional_info")
      let length =
        decode.run(info, decode.at(["duration_ms"], decode.int))
        |> result.unwrap(0)
      let started_at =
        decode.run(listen, decode.at(["inserted_at"], decode.int))
        |> result.unwrap(0)
      let elapsed = case length == 0 {
        True -> 0
        False -> int.min(int.max(now - started_at * 1000, 0), length)
      }
      let device = case
        decode.run(info, decode.at(["music_service_name"], decode.string))
      {
        Ok(name) -> json.string(name)
        Error(_) ->
          case
            decode.run(info, decode.at(["submission_client"], decode.string))
          {
            Ok(name) -> json.string(name)
            Error(_) -> json.null()
          }
      }
      json.object([
        #("title", js.get(meta, "track_name") |> js.coerce),
        #("artist", js.get(meta, "artist_name") |> js.coerce),
        #("length", json.int(length)),
        #("elapsed", json.int(elapsed)),
        #("is_playing", json.bool(True)),
        #("device_name", device),
      ])
    }
  }
}
