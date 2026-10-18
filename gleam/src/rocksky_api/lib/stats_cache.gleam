//// Profile-card counts cached in Redis for five minutes.

import gleam/dynamic/decode
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

pub type Stats {
  Stats(
    scrobbles: Int,
    artists: Int,
    loved_tracks: Int,
    albums: Int,
    tracks: Int,
  )
}

const ttl_seconds = 300

fn key(actor: String) -> String {
  "stats:v1:" <> actor
}

pub fn to_json(s: Stats) -> Json {
  json.object([
    #("scrobbles", json.int(s.scrobbles)),
    #("artists", json.int(s.artists)),
    #("loved_tracks", json.int(s.loved_tracks)),
    #("albums", json.int(s.albums)),
    #("tracks", json.int(s.tracks)),
  ])
}

pub fn decoder() -> decode.Decoder(Stats) {
  use scrobbles <- decode.field("scrobbles", decode.int)
  use artists <- decode.field("artists", decode.int)
  use loved_tracks <- decode.field("loved_tracks", decode.int)
  use albums <- decode.field("albums", decode.int)
  use tracks <- decode.field("tracks", decode.int)
  decode.success(Stats(scrobbles:, artists:, loved_tracks:, albums:, tracks:))
}

pub fn read(ctx: Context, actor: String) -> Task(Option(Stats)) {
  task.attempt_result(redis.get(ctx.redis, key(actor)))
  |> task.map(fn(raw) {
    case raw {
      Some(raw) ->
        case js.parse_json(raw) {
          Ok(d) -> decode.run(d, decoder()) |> option.from_result
          Error(_) -> None
        }
      None -> None
    }
  })
  |> task.rescue(fn(e) {
    log.warn("readStats failed: " <> error.to_string(e))
    task.ok(None)
  })
}

/// Never caches an empty profile: zero scrobbles means "new user" to the clients.
pub fn write(ctx: Context, actor: String, stats: Stats) -> Task(Nil) {
  case stats.scrobbles {
    0 -> task.ok(Nil)
    _ ->
      task.attempt_result(redis.set_ex(
        ctx.redis,
        key(actor),
        ttl_seconds,
        json.to_string(to_json(stats)),
      ))
      |> task.rescue(fn(e) {
        log.warn("writeStats failed: " <> error.to_string(e))
        task.ok(Nil)
      })
  }
}

/// Drops the entries for every identifier a user is reached by (DID and handle).
pub fn invalidate(ctx: Context, actors: List(Option(String))) -> Task(Nil) {
  let keys = list.filter_map(actors, option.to_result(_, Nil)) |> list.map(key)
  case keys {
    [] -> task.ok(Nil)
    _ ->
      task.attempt_result(redis.del(ctx.redis, keys))
      |> task.map(fn(_) { Nil })
      |> task.rescue(fn(e) {
        log.warn("invalidateStats failed: " <> error.to_string(e))
        task.ok(Nil)
      })
  }
}
