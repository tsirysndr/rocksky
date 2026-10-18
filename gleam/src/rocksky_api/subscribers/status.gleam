import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/agent as atproto
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/helpers
import rocksky_api/lib/matching
import rocksky_api/lib/track
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/node/map
import rocksky_api/node/nats
import rocksky_api/node/redis
import rocksky_api/node/timer
import rocksky_api/subscribers/playback
import rocksky_api/task

pub type LastStatus {
  LastStatus(
    key: String,
    source: String,
    started_at: Int,
    duration_ms: Int,
    token: String,
  )
}

pub type State {
  State(
    last: map.Map(String, Option(LastStatus)),
    pending: map.Map(String, timer.Timer),
    rate_limited_until: map.Map(String, Int),
  )
}

pub fn new() {
  State(map.new(), map.new(), map.new())
}

pub type RawTrack {
  RawTrack(
    name: String,
    artist: String,
    artists: Option(List(track.TrackArtist)),
    album: Option(String),
    cover: Option(String),
    duration: Int,
    source: String,
    mbid: Option(String),
    position: Option(Int),
    isrc: Option(String),
    spotify: Option(String),
  )
}

fn opt(name, decoder, next) {
  decode.optional_field(name, None, decode.optional(decoder), next)
}

pub fn raw_decoder() {
  use name <- decode.optional_field("name", "", decode.string)
  use artist <- decode.optional_field("artist", "", decode.string)
  use artists <- opt(
    "artists",
    decode.list({
      use name <- decode.field("name", decode.string)
      decode.success(track.TrackArtist(None, name))
    }),
  )
  use album <- opt(
    "album",
    decode.one_of(decode.string |> decode.map(fn(s) { #(Some(s), None) }), [
      {
        use name <- opt("name", decode.string)
        use cover <- opt("cover", decode.string)
        decode.success(#(name, cover))
      },
    ]),
  )
  use album_name <- opt("album_name", decode.string)
  use cover <- opt("albumCoverUrl", decode.string)
  use duration <- decode.optional_field("duration_ms", 0, decode.int)
  use source <- opt("source", decode.string)
  use mbid <- opt("recording_mb_id", decode.string)
  use position <- opt("track_number", decode.int)
  use camel_position <- opt("trackNumber", decode.int)
  use id <- opt("id", decode.string)
  use spotify <- opt(
    "external_urls",
    decode.optional_field(
      "spotify",
      None,
      decode.optional(decode.string),
      decode.success,
    ),
  )
  use isrc <- opt(
    "external_ids",
    decode.optional_field(
      "isrc",
      None,
      decode.optional(decode.string),
      decode.success,
    ),
  )
  let source =
    option.unwrap(source, case artists {
      Some(_) -> "spotify"
      None -> "listenbrainz"
    })
  let first_artist =
    option.then(artists, fn(a) {
      list.first(a) |> option.from_result |> option.map(fn(a) { a.name })
    })
    |> option.unwrap(artist)
  decode.success(RawTrack(
    name,
    first_artist,
    artists,
    option.or(option.then(album, fn(a) { a.0 }), album_name),
    option.or(option.then(album, fn(a) { a.1 }), cover),
    duration,
    source,
    mbid,
    option.or(position, camel_position)
      |> option.then(fn(p) {
        case p > 0 {
          True -> Some(p)
          False -> None
        }
      }),
    option.flatten(isrc),
    option.or(
      option.flatten(spotify),
      case source == "spotify" || option.is_some(artists) {
        True -> id
        False -> None
      },
    ),
  ))
}

fn resolve(ctx: Context, raw: RawTrack) {
  let fallback = #(raw.mbid, None, raw.position)
  case raw.name == "" || raw.artist == "" {
    True -> task.ok(fallback)
    False -> {
      use candidate <- task.map({
        use request <- task.then(
          matching.request(
            raw.name,
            raw.artist,
            raw.artists,
            raw.album,
            None,
            Some(raw.duration),
            raw.mbid,
            raw.isrc,
            raw.spotify,
          )
          |> task.from_result,
        )
        matching.match_track(ctx, request, None)
        |> task.rescue(fn(e) {
          log.warn("[status] Matching unavailable: " <> error.describe(e))
          task.ok(None)
        })
      })
      case candidate {
        None -> fallback
        Some(c) -> #(
          option.or(raw.mbid, c.identifiers.recording),
          c.album_art,
          option.or(raw.position, option.map(c.track_number, float.truncate)),
        )
      }
    }
  }
}

fn optional(key, value, encode) {
  case value {
    None -> []
    Some(v) -> [#(key, encode(v))]
  }
}

pub fn normalize(
  raw: RawTrack,
  mbid: Option(String),
  art: Option(String),
  position: Option(Int),
) {
  json.object(
    list.flatten([
      [
        #("name", json.string(raw.name)),
        #("artist", json.string(raw.artist)),
        #(
          "albumCoverUrl",
          json.string(
            helpers.with_fallback_album_art(option.or(raw.cover, art)),
          ),
        ),
        #("durationMs", json.int(raw.duration)),
        #("source", json.string(raw.source)),
      ],
      optional("album", raw.album, json.string),
      optional("recordingMbId", mbid, json.string),
      case position {
        Some(p) if p > 0 -> [#("trackNumber", json.int(p))]
        _ -> []
      },
    ]),
  )
}

pub fn is_rate_limited(state: State, did: String, now: Int) {
  case map.get(state.rate_limited_until, did) {
    Some(until) if until > now -> True
    _ -> {
      map.remove(state.rate_limited_until, did)
      False
    }
  }
}

fn status_code(e: error.Error) {
  case e {
    error.Js(e) -> {
      let raw = js.to_dynamic(e)
      [
        js.get(raw, "status"),
        js.get(js.get(raw, "response"), "status"),
        js.get(js.get(raw, "error"), "status"),
      ]
      |> list.find_map(fn(v) {
        decode.run(v, decode.int) |> result.replace_error(Nil)
      })
      |> result.unwrap(0)
    }
    _ -> 0
  }
}

pub fn apply_rate_limit(state: State, did: String, raw: Dynamic, now: Int) {
  let headers =
    [
      js.get(raw, "headers"),
      js.get(js.get(raw, "response"), "headers"),
      js.get(js.get(raw, "error"), "headers"),
    ]
    |> list.find(fn(v) { !js.is_nullish(v) })
    |> result.unwrap(js.null())
  let number =
    decode.one_of(decode.int, [
      decode.string
      |> decode.then(fn(s) {
        case int.parse(s) {
          Ok(v) -> decode.success(v)
          Error(_) -> decode.failure(0, "number")
        }
      }),
    ])
  let header = fn(key) {
    decode.run(js.get(headers, key), number) |> option.from_result
  }
  let until = case
    option.or(header("ratelimit-reset"), header("x-ratelimit-reset")),
    header("retry-after")
  {
    Some(reset), _ -> reset * 1000
    _, Some(seconds) -> now + seconds * 1000
    _, _ -> now + 60_000
  }
  map.set(state.rate_limited_until, did, until)
}

fn recover(state: State, did: String, work: task.Task(Nil), stopped: Bool) {
  work
  |> task.rescue(fn(e) {
    case status_code(e), e {
      429, error.Js(raw) ->
        apply_rate_limit(state, did, js.to_dynamic(raw), js.now_ms())
      400, _ | 404, _ if stopped -> Nil
      _, _ -> log.error("[status] " <> did <> ": " <> error.describe(e))
    }
    task.ok(Nil)
  })
}

fn cancel_pending(state: State, did: String) {
  case map.get(state.pending, did) {
    Some(t) -> timer.cancel(t)
    None -> Nil
  }
  map.remove(state.pending, did)
}

fn swap_cid(agent: atproto.Agent, did: String) {
  atproto.get_record(agent, did, "app.rocksky.actor.status", "self")
  |> task.attempt_result
  |> task.map(fn(r) { r.cid })
  |> task.rescue(fn(e) {
    case status_code(e) {
      400 | 404 -> task.ok(None)
      _ -> task.fail(e)
    }
  })
}

pub fn changed(
  ctx: Context,
  state: State,
  did: String,
  raw: RawTrack,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  let key = raw.name <> ":" <> raw.artist
  let unchanged = case map.get(state.last, did) {
    Some(Some(last)) -> last.key == key && last.source == raw.source
    _ -> False
  }
  case is_rate_limited(state, did, js.now_ms()) || unchanged {
    True -> task.ok(Nil)
    False ->
      change(ctx, state, did, raw, key, factory)
      |> recover(state, did, _, False)
  }
}

fn change(
  ctx: Context,
  state: State,
  did: String,
  raw: RawTrack,
  key: String,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  use resolved <- task.then(task.all2(factory(did), resolve(ctx, raw)))
  case resolved.0 {
    None -> task.ok(Nil)
    Some(agent) -> {
      let started = js.now_ms()
      let record =
        json.object(
          list.append(
            [
              #("$type", json.string("app.rocksky.actor.status")),
              #(
                "track",
                normalize(raw, resolved.1.0, resolved.1.1, resolved.1.2),
              ),
              #(
                "startedAt",
                json.string(row.iso8601(row.from_unix_ms(started))),
              ),
            ],
            case raw.duration {
              0 -> []
              _ -> [
                #(
                  "expiresAt",
                  json.string(
                    row.iso8601(row.from_unix_ms(started + raw.duration)),
                  ),
                ),
              ]
            },
          ),
        )
      use cid <- task.then(swap_cid(agent, did))
      use _ <- task.then(
        atproto.put_record_unchecked(
          agent,
          did,
          "app.rocksky.actor.status",
          "self",
          record,
          cid,
        )
        |> task.attempt_result,
      )
      map.set(
        state.last,
        did,
        Some(LastStatus(
          key,
          raw.source,
          started,
          raw.duration,
          crypto.random_uuid(),
        )),
      )
      cancel_pending(state, did)
      use _ <- task.then(case raw.source {
        "navidrome" ->
          redis.del(ctx.redis, ["ws_lastsong:" <> did])
          |> task.attempt_result
          |> task.map(fn(_) { Nil })
        _ -> task.ok(Nil)
      })
      case raw.duration > 0 {
        True -> {
          let _ =
            timer.schedule(raw.duration + 10_000, fn() {
              case map.get(state.last, did) {
                Some(Some(current))
                  if current.key == key && current.source == raw.source
                -> map.remove(state.last, did)
                _ -> Nil
              }
            })
          Nil
        }
        False -> Nil
      }
      task.ok(Nil)
    }
  }
}

fn clear_status(
  state: State,
  did: String,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  use agent <- task.then(factory(did))
  case agent {
    None -> task.ok(Nil)
    Some(agent) -> {
      use _ <- task.map(
        atproto.delete_record(agent, did, "app.rocksky.actor.status", "self")
        |> task.attempt_result,
      )
      map.set(state.last, did, None)
    }
  }
}

pub fn stopped(
  state: State,
  did: String,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  let last = map.get(state.last, did)
  case is_rate_limited(state, did, js.now_ms()) || last == Some(None) {
    True -> task.ok(Nil)
    False -> {
      let remaining =
        playback.remaining_playback_ms(
          option.flatten(last)
            |> option.map(fn(s) { #(s.started_at, s.duration_ms) }),
          js.now_ms(),
        )
      case remaining > 0 {
        False ->
          clear_status(state, did, factory) |> recover(state, did, _, True)
        True -> {
          cancel_pending(state, did)
          let t =
            timer.schedule(remaining + 5000, fn() {
              map.remove(state.pending, did)
              case map.get(state.last, did) == last {
                False -> Nil
                True ->
                  task.background(clear_status(state, did, factory), fn(e) {
                    log.error(
                      "[status] deferred clear failed: " <> error.describe(e),
                    )
                  })
              }
            })
          map.set(state.pending, did, t)
          task.ok(Nil)
        }
      }
    }
  }
}

pub fn start(ctx: Context, state: State) {
  let changed =
    nats.subscribe(ctx.nc, "rocksky.song.changed", fn(payload) {
      let work = {
        use raw <- task.then(
          js.parse_json(payload)
          |> result.map_error(error.Js)
          |> task.from_result,
        )
        use value <- task.then(
          decode.run(raw, {
            use did <- decode.field("did", decode.string)
            use track <- decode.field("track", raw_decoder())
            decode.success(#(did, track))
          })
          |> result.map_error(error.Decode("song.changed", _))
          |> task.from_result,
        )
        changed(ctx, state, value.0, value.1, agent.create(ctx, _))
      }
      task.unwrap_or(work, fn(e) { log.error(error.describe(e)) })
    })
  let stopped =
    nats.subscribe(ctx.nc, "rocksky.song.stopped", fn(payload) {
      let work = {
        use raw <- task.then(
          js.parse_json(payload)
          |> result.map_error(error.Js)
          |> task.from_result,
        )
        use did <- task.then(
          decode.run(raw, decode.field("did", decode.string, decode.success))
          |> result.map_error(error.Decode("song.stopped", _))
          |> task.from_result,
        )
        stopped(state, did, agent.create(ctx, _))
      }
      task.unwrap_or(work, fn(e) { log.error(error.describe(e)) })
    })
  #(changed, stopped)
}
