//// ATProto catalog and listening records shared by track ingestion paths.

import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/atproto/agent
import rocksky_api/db/row
import rocksky_api/lexicon/validation
import rocksky_api/lib/durable_record
import rocksky_api/lib/helpers
import rocksky_api/lib/record_position
import rocksky_api/lib/track.{type Track}
import rocksky_api/node/js
import rocksky_api/node/tid
import rocksky_api/task

fn optional(key: String, value: Option(a), encode: fn(a) -> json.Json) {
  case value {
    Some(v) -> [#(key, encode(v))]
    None -> []
  }
}

fn nonempty(value: Option(String)) {
  case value {
    Some("") -> None
    _ -> value
  }
}

fn now() {
  row.iso8601(row.from_unix_ms(js.now_ms()))
}

fn release_date(value: String) {
  value <> "T00:00:00.000Z"
}

pub fn artist_record(track: Track) {
  json.object([
    #("$type", json.string("app.rocksky.artist")),
    #("name", json.string(track.album_artist)),
    #("createdAt", json.string(now())),
    #("tags", json.array(option.unwrap(track.genres, []), json.string)),
    ..optional("pictureUrl", nonempty(track.artist_picture), json.string)
  ])
}

pub fn album_record(track: Track) {
  json.object([
    #("$type", json.string("app.rocksky.album")),
    #("title", json.string(track.album)),
    #("artist", json.string(track.album_artist)),
    #("createdAt", json.string(now())),
    #(
      "albumArtUrl",
      json.string(helpers.with_fallback_album_art(track.album_art)),
    ),
    ..list.append(
      optional("year", track.year, json.int),
      optional("releaseDate", track.release_date, fn(d) {
        json.string(release_date(d))
      }),
    )
  ])
}

pub fn song_record(track: Track, scrobble: Bool) {
  let collection = case scrobble {
    True -> "app.rocksky.scrobble"
    False -> "app.rocksky.song"
  }
  let created = case scrobble, track.timestamp {
    True, Some(t) if t != 0 -> row.iso8601(row.from_unix_ms(t * 1000))
    _, _ -> now()
  }
  json.object([
    #("$type", json.string(collection)),
    #("title", json.string(track.title)),
    #("artist", json.string(track.artist)),
    #("album", json.string(track.album)),
    #("albumArtist", json.string(track.album_artist)),
    #("duration", json.int(track.duration)),
    #(
      "albumArtUrl",
      json.string(helpers.with_fallback_album_art(track.album_art)),
    ),
    #(
      "trackNumber",
      json.int(record_position.record_position(track.track_number)),
    ),
    #(
      "discNumber",
      json.int(record_position.record_position(track.disc_number)),
    ),
    #("createdAt", json.string(created)),
    #("tags", json.array(option.unwrap(track.genres, []), json.string)),
    ..list.flatten([
      optional("artists", track.artists, fn(artists) {
        json.array(artists, fn(artist) {
          json.object([
            #("name", json.string(artist.name)),
            ..optional("mbid", artist.mbid, json.string)
          ])
        })
      }),
      optional("releaseDate", track.release_date, fn(d) {
        json.string(release_date(d))
      }),
      optional("year", track.year, json.int),
      optional("composer", nonempty(track.composer), json.string),
      optional("lyrics", nonempty(track.lyrics), json.string),
      optional(
        "copyrightMessage",
        nonempty(track.copyright_message),
        json.string,
      ),
      optional("spotifyLink", nonempty(track.spotify_link), json.string),
      optional("mbid", track.mb_id, json.string),
      optional("isrc", track.isrc, json.string),
    ])
  ])
}

fn put(agent: agent.Agent, collection: String, record: json.Json) {
  use _ <- task.then(task.from_result(validation.record(collection, record)))
  use did <- task.then(
    task.from_result(task.require(agent.did(agent), "Missing agent DID")),
  )
  agent.put_record_unchecked(agent, did, collection, tid.next(), record, None)
  |> task.attempt_result
  |> task.map(fn(r) { Some(r.uri) })
  |> task.rescue(fn(_) { task.ok(None) })
}

pub fn put_artist_record(track: Track, agent: agent.Agent) {
  put(agent, "app.rocksky.artist", artist_record(track))
}

pub fn put_album_record(track: Track, agent: agent.Agent) {
  put(agent, "app.rocksky.album", album_record(track))
}

pub fn put_song_record(track: Track, agent: agent.Agent) {
  put(agent, "app.rocksky.song", song_record(track, False))
}

pub fn put_scrobble_record(
  track: Track,
  agent: agent.Agent,
  durable_rkey: Option(String),
) {
  let collection = "app.rocksky.scrobble"
  let record = song_record(track, True)
  use _ <- task.then(task.from_result(validation.record(collection, record)))
  case agent.did(agent) {
    None -> task.ok(None)
    Some(did) -> {
      let rkey = option.lazy_unwrap(durable_rkey, tid.next)
      let create = fn() {
        agent.put_record_create_only(
          agent,
          did,
          collection,
          rkey,
          record,
          option.is_some(durable_rkey),
        )
        |> task.attempt_result
      }
      let publish = case durable_rkey {
        None -> create() |> task.map(fn(r) { r.uri })
        Some(_) ->
          durable_record.publish(create, fn() {
            agent.get_record(agent, did, collection, rkey)
            |> task.attempt_result
          })
      }
      publish |> task.map(Some) |> task.rescue(fn(_) { task.ok(None) })
    }
  }
}
