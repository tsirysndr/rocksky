import gleam/dynamic
import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent
import rocksky_api/db/row
import rocksky_api/error
import rocksky_api/lexicon/json_value
import rocksky_api/lexicon/validation
import rocksky_api/lib/durable_record
import rocksky_api/lib/track.{type TrackArtist}
import rocksky_api/node/js
import rocksky_api/node/pg
import rocksky_api/task

pub type MusicbrainzTrack {
  MusicbrainzTrack(
    recording: String,
    release: String,
    name: String,
    artists: List(TrackArtist),
    album: String,
    timestamp: String,
  )
}

pub type Play {
  Play(
    track: MusicbrainzTrack,
    duration: Option(Int),
    original: Option(json_value.JsonValue),
  )
}

pub const play_collection = "fm.teal.feed.play"

pub const status_collection = "fm.teal.actor.status"

fn mbid(value: String) {
  case string.starts_with(value, "mbid:") {
    True -> value
    False -> "mbid:" <> value
  }
}

fn optional_mbid(key: String, value: String) {
  case value {
    "" -> []
    _ -> [#(key, json.string(mbid(value)))]
  }
}

pub fn encode(play: Play, type_: String) {
  let track = play.track
  let generated =
    json.object([
      #("$type", json.string(type_)),
      #("duration", json.nullable(play.duration, json.int)),
      #("trackName", json.string(track.name)),
      #("playedTime", json.string(track.timestamp)),
      #(
        "artists",
        json.array(track.artists, fn(a) {
          json.object([
            #("artistName", json.string(a.name)),
            ..optional_mbid("artistMbId", option.unwrap(a.mbid, ""))
          ])
        }),
      ),
      #("releaseName", json.string(track.album)),
      #("submissionClientAgent", json.string("rocksky/v0.0.1")),
      ..list.append(
        optional_mbid("releaseMbId", track.release),
        optional_mbid("recordingMbId", track.recording),
      )
    ])
  case play.original {
    Some(json_value.Object(fields)) ->
      json.object([
        #("$type", json.string(type_)),
        ..fields
        |> list.filter(fn(p) { p.0 != "$type" })
        |> list.map(fn(p) { #(p.0, json_value.encode(p.1)) })
      ])
    _ -> generated
  }
}

pub fn teal_record(track: MusicbrainzTrack, duration: Int) {
  let play = Play(track, Some(duration), None)
  validation.record(play_collection, encode(play, play_collection))
  |> result.map(fn(_) { play })
}

fn listening_time(play: Play) {
  pg.to_ms(dynamic.string(play.track.timestamp))
  |> option.to_result(error.Message("Invalid Teal listening time"))
}

pub fn publish_teal_status(agent: agent.Agent, play: Play, now: Int) {
  use time <- task.then(task.from_result(listening_time(play)))
  let expiry = time + 600_000
  case expiry <= now {
    True -> task.ok(Nil)
    False -> {
      use did <- task.then(
        task.from_result(task.require(agent.did(agent), "Missing agent DID")),
      )
      use existing <- promise.await(
        task.attempt_result(agent.get_record(
          agent,
          did,
          status_collection,
          "self",
        )),
      )
      use state <- task.then(case existing {
        Error(error.Js(e)) ->
          case agent.xrpc_error_name(e) {
            Some("RecordNotFound") -> task.ok(#(False, None))
            _ -> task.fail(error.Js(e))
          }
        Error(e) -> task.fail(e)
        Ok(record) -> {
          use current <- task.then(
            decode.run(record.value, decode.at(["time"], decode.string))
            |> error.decode("Teal status time", _)
            |> task.from_result,
          )
          use current <- task.then(
            pg.to_ms(dynamic.string(current))
            |> option.to_result(error.Message(
              "Invalid existing Teal status time",
            ))
            |> task.from_result,
          )
          case current >= time {
            True -> task.ok(#(True, None))
            False -> {
              use cid <- task.map(
                task.require(record.cid, "Missing Teal status CID")
                |> task.from_result,
              )
              #(False, Some(cid))
            }
          }
        }
      })
      case state.0 {
        True -> task.ok(Nil)
        False -> {
          let record =
            json.object([
              #("$type", json.string(status_collection)),
              #("item", encode(play, "fm.teal.feed.defs#playView")),
              #("time", json.string(row.iso8601(row.from_unix_ms(time)))),
              #("expiry", json.string(row.iso8601(row.from_unix_ms(expiry)))),
            ])
          agent.put_record_cas(
            agent,
            did,
            status_collection,
            "self",
            record,
            state.1,
          )
          |> task.attempt_result
          |> task.map(fn(_) { Nil })
        }
      }
    }
  }
}

fn duplicate(record: agent.Record, play: Play, time: Int) {
  let decoder = {
    use name <- decode.optional_field(
      "trackName",
      None,
      decode.optional(decode.string),
    )
    use duration <- decode.optional_field(
      "duration",
      None,
      decode.optional(decode.float),
    )
    use played <- decode.field("playedTime", decode.string)
    use recording <- decode.optional_field(
      "recordingMbId",
      None,
      decode.optional(decode.string),
    )
    decode.success(#(name, duration, played, recording))
  }
  case decode.run(record.value, decoder) {
    Error(_) -> False
    Ok(value) -> {
      let identity = case play.track.recording, value.3 {
        "", _ | _, None -> False
        id, Some(other) ->
          other == mbid(id) || other == string.replace(mbid(id), "mbid:", "")
      }
      let same_track =
        identity
        || case play.duration, value.1 {
          Some(duration), Some(other) ->
            value.0 == Some(play.track.name)
            && other -. int.to_float(duration) >. -4.0
            && other -. int.to_float(duration) <. 4.0
          _, _ -> False
        }
      case pg.to_ms(dynamic.string(value.2)) {
        None -> False
        Some(other_time) ->
          same_track && int.absolute_value(time - other_time) < 60_000
      }
    }
  }
}

pub fn publish_teal_record(
  agent: agent.Agent,
  play: Play,
  rkey: String,
  now: Option(Int),
) {
  use time <- task.then(task.from_result(listening_time(play)))
  use did <- task.then(
    task.from_result(task.require(agent.did(agent), "Missing agent DID")),
  )
  let lookup = fn() {
    agent.get_record(agent, did, play_collection, rkey) |> task.attempt_result
  }
  use existing <- task.then(durable_record.find(lookup))
  use duplicate <- task.then(case existing {
    Some(_) -> task.ok(False)
    None -> {
      use pages <- task.then(
        task.all([
          agent.list_records(
            agent,
            did,
            "fm.teal.alpha.feed.play",
            5,
            None,
            False,
          )
            |> task.attempt_result,
          agent.list_records(agent, did, play_collection, 5, None, False)
            |> task.attempt_result,
        ]),
      )
      let duplicate =
        list.any(pages, fn(page) {
          list.any(page.records, duplicate(_, play, time))
        })
      case duplicate {
        True -> task.ok(True)
        False -> {
          use _ <- task.map(durable_record.publish(
            fn() {
              agent.put_record_create_only(
                agent,
                did,
                play_collection,
                rkey,
                encode(play, play_collection),
                True,
              )
              |> task.attempt_result
            },
            lookup,
          ))
          False
        }
      }
    }
  })
  case duplicate {
    True -> task.ok(Nil)
    False ->
      publish_teal_status(agent, play, option.lazy_unwrap(now, js.now_ms))
  }
}

pub fn decoder() {
  use original <- decode.then(json_value.decoder())
  use name <- decode.field("trackName", decode.string)
  use played <- decode.field("playedTime", decode.string)
  use duration <- decode.optional_field(
    "duration",
    None,
    decode.map(decode.int, Some),
  )
  use album <- decode.optional_field("releaseName", "", decode.string)
  use recording <- decode.optional_field("recordingMbId", "", decode.string)
  use release <- decode.optional_field("releaseMbId", "", decode.string)
  use artists <- decode.optional_field(
    "artists",
    [],
    decode.list({
      use name <- decode.field("artistName", decode.string)
      use mbid <- decode.optional_field(
        "artistMbId",
        None,
        decode.map(decode.string, Some),
      )
      decode.success(track.TrackArtist(mbid, name))
    }),
  )
  decode.success(Play(
    MusicbrainzTrack(recording, release, name, artists, album, played),
    duration,
    Some(original),
  ))
}
