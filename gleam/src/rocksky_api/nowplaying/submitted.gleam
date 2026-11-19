//// ListenBrainz clients cache playing_now submissions in the scrobbler service.

import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/lib/helpers
import rocksky_api/lib/matching
import rocksky_api/lib/query_cache
import rocksky_api/lib/track
import rocksky_api/node/abort
import rocksky_api/node/js
import rocksky_api/node/redis
import rocksky_api/task.{type Task}
import rocksky_api/tracks/service

/// Keep metadata separate from the playback clock so polling always advances.
pub fn reader(ctx: Context) {
  let lookup =
    query_cache.cached(60_000, 200, fn(raw) { raw }, fn(raw) {
      metadata(ctx, raw)
    })
  fn(did) { get_with(ctx, did, lookup) }
}

pub fn get(ctx: Context, did: String) -> Task(json.Json) {
  get_with(ctx, did, fn(raw) { metadata(ctx, raw) })
}

fn get_with(ctx: Context, did: String, lookup) -> Task(json.Json) {
  use raw <- task.then(
    task.attempt_result(redis.get(ctx.redis, "listenbrainz:playing_now:" <> did)),
  )
  case raw {
    None -> task.ok(json.object([]))
    Some(raw) -> {
      use metadata <- task.map(
        lookup(raw)
        |> task.rescue(fn(_) { task.ok(json.object([])) }),
      )
      render(raw, js.now_ms(), metadata)
    }
  }
}

fn text(value, key) {
  option.from_result(decode.run(value, decode.at([key], decode.string)))
}

pub fn metadata(ctx: Context, raw: String) -> Task(json.Json) {
  let base = from_json(raw, 0) |> js.coerce
  let title = text(base, "title") |> option.unwrap("")
  let artist = text(base, "artist") |> option.unwrap("")
  let album = text(base, "album") |> option.unwrap("")
  let duration =
    decode.run(base, decode.at(["length"], decode.int)) |> result.unwrap(0)
  let track = track.new(title, artist, album, duration)
  use row <- task.then(service.lookup(ctx, track))
  let art = option.then(row, fn(row) { helpers.non_empty(row.album_art) })
  use candidate <- task.map(case art {
    Some(_) -> task.ok(None)
    None -> {
      use request <- task.then(
        task.from_result(matching.matching_request(track)),
      )
      matching.match_track(ctx, request, Some(abort.timeout(2000)))
      |> task.rescue(fn(_) { task.ok(None) })
    }
  })
  let album_art = option.or(art, option.then(candidate, fn(c) { c.album_art }))
  let album_artist =
    option.or(
      option.map(row, fn(r) { r.album_artist }),
      option.then(candidate, fn(c) { c.album_artist }),
    )
    |> option.unwrap(artist)
  let album = case album {
    "" -> option.then(candidate, fn(c) { c.album }) |> option.unwrap("")
    _ -> album
  }
  let duration = case row {
    Some(r) if r.duration > 0 -> r.duration
    _ ->
      option.then(candidate, fn(c) { matching.integer(c.duration_ms) })
      |> option.unwrap(0)
  }
  json.object([
    #("album", json.string(album)),
    #("album_artist", json.string(album_artist)),
    #("album_art", optional_text(album_art)),
    #("duration_ms", json.int(duration)),
    #("song_uri", optional_text(option.then(row, fn(r) { r.uri }))),
    #("album_uri", optional_text(option.then(row, fn(r) { r.album_uri }))),
    #("artist_uri", optional_text(option.then(row, fn(r) { r.artist_uri }))),
  ])
}

fn optional_text(value) {
  option.map(value, json.string) |> option.unwrap(json.null())
}

pub fn from_json(raw: String, now: Int) -> json.Json {
  render(raw, now, json.object([]))
}

pub fn render(raw: String, now: Int, metadata: json.Json) -> json.Json {
  case js.parse_json(raw) {
    Error(_) -> json.object([])
    Ok(listen) -> {
      let meta = js.get(listen, "track_metadata")
      let info = js.get(meta, "additional_info")
      let length =
        decode.run(info, decode.at(["duration_ms"], decode.int))
        |> result.unwrap(0)
      let length = case length > 0 {
        True -> length
        False ->
          decode.run(
            js.coerce(metadata),
            decode.at(["duration_ms"], decode.int),
          )
          |> result.unwrap(0)
      }
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
      let base =
        json.object([
          #("album", optional_text(text(meta, "release_name"))),
          #("title", js.get(meta, "track_name") |> js.coerce),
          #("artist", js.get(meta, "artist_name") |> js.coerce),
          #("length", json.int(length)),
          #("elapsed", json.int(elapsed)),
          #("is_playing", json.bool(True)),
          #("device_name", device),
        ])
      list.fold(
        js.entries(js.coerce(metadata)),
        js.coerce(base),
        fn(base, entry) { js.set(base, entry.0, entry.1) },
      )
      |> js.coerce
    }
  }
}
