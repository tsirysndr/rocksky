import gleam/dynamic.{type Dynamic}
import gleam/float
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/cell.{type Cell}
import rocksky_cli/client
import rocksky_cli/commands/hardware as tags
import rocksky_cli/hardware
import rocksky_cli/node
import rocksky_cli/tui/cache
import rocksky_cli/tui/library
import rocksky_cli/tui/player
import rocksky_cli/tui/remote
import rocksky_cli/tui/settings
import rocksky_cli/value

pub fn start(playback: Cell(player.Playback)) -> promise.Promise(fn() -> Nil) {
  let handler = fn(name, data) { command(playback, name, data) }
  use remote <- promise.await(case node.env("ROCKSKY_NO_REMOTE") {
    "" ->
      remote.connect(
        cell.get(playback).settings.remote_name,
        case node.env("ROCKSKY_WS") {
          "" -> string.replace(client.base_url(), "http", "ws") <> "/ws"
          url -> url
        },
        client.token,
        handler,
      )
    _ -> promise.resolve(Error("disabled"))
  })
  use mpris <- promise.map(
    remote.mpris(fn(name, data) {
      command(
        playback,
        case name {
          "playpause" -> "toggle"
          "stop" -> "pause"
          "seek" -> "relative-seek"
          "position" -> "absolute-seek"
          _ -> name
        },
        data,
      )
    }),
  )
  let stop_tags = case node.env("ROCKSKY_NO_NFC") {
    "" -> hardware.watch(fn(payloads) { play_tag(playback, payloads) })
    _ -> fn() { Nil }
  }
  let key = cell.new("")
  let scrobbled = cell.new(False)
  let swapped = cell.new("")
  let stop =
    remote.interval(2000, fn() {
      let state = player.poll(playback)
      let current =
        state.queue
        |> list.drop(state.index)
        |> list.first
        |> result.unwrap(value.null())
      let identity = int.to_string(state.index) <> ":" <> cache.id(current)
      case cell.get(key) != identity || state.status == "stopped" {
        True -> {
          cell.set(key, identity)
          cell.set(scrobbled, False)
          cell.set(swapped, "")
        }
        False -> Nil
      }
      let duration = value.integer(current, "duration", 0)
      case
        !cell.get(scrobbled)
        && client.token() != ""
        && state.status != "stopped"
        && duration >= 30_000
        && state.position >= int.min(duration / 2, 240_000)
      {
        True -> {
          cell.set(scrobbled, True)
          let _ =
            client.post(
              "/now-playing",
              json.object([
                #("title", json.string(value.string(current, "title"))),
                #("artist", json.string(value.string(current, "artist"))),
                #("album", json.string(value.string(current, "album"))),
                #(
                  "albumArtist",
                  json.string(value.string(current, "albumArtist")),
                ),
                #("duration", json.int(duration)),
                #("albumArt", json.string(value.string(current, "albumArt"))),
                #("timestamp", json.int(node.now())),
              ]),
            )
          Nil
        }
        False -> Nil
      }
      let now = track_data(current, state.position, state.status == "playing")
      let queue =
        list.map(state.queue, fn(track) { track_data(track, 0, False) })
      case remote {
        Ok(remote) -> remote.push(remote, state.status, now, queue, state.index)
        Error(_) -> Nil
      }
      case mpris {
        Ok(mpris) -> remote.mpris_update(mpris, state.status, now, state.index)
        Error(_) -> Nil
      }
      player.save(playback)
      let next =
        state.queue
        |> list.drop(state.index + 1)
        |> list.first
        |> result.unwrap(value.null())
      case
        state.status == "playing"
        && cache.find(current) != ""
        && state.position
        >= case duration {
          0 -> 15_000
          _ -> duration / 2
        }
        && cache.id(next) != ""
        && cache.id(next) != cell.get(swapped)
      {
        True -> {
          use path <- promise.map(cache.store(next, player.remote_stream))
          case path {
            Error(_) -> Nil
            Ok(path) -> {
              player.swap_local(playback, state.index + 1, path)
              cell.set(swapped, cache.id(next))
            }
          }
        }
        False -> promise.resolve(Nil)
      }
    })
  fn() {
    stop()
    stop_tags()
    player.close(playback)
    case remote {
      Ok(r) -> remote.disconnect(r)
      Error(_) -> Nil
    }
    case mpris {
      Ok(m) -> remote.mpris_close(m)
      Error(_) -> Nil
    }
  }
}

fn track_data(track: Dynamic, position: Int, playing: Bool) -> Dynamic {
  case value.is_null(track) {
    True -> value.null()
    False ->
      json.object([
        #("title", json.string(value.string(track, "title"))),
        #("artist", json.string(value.string(track, "artist"))),
        #("album", json.string(value.string(track, "album"))),
        #("albumArtist", json.string(value.string(track, "albumArtist"))),
        #("albumArt", json.string(value.string(track, "albumArt"))),
        #("durationMs", json.int(value.integer(track, "duration", 0))),
        #("elapsedMs", json.int(position)),
        #("isPlaying", json.bool(playing)),
        #("uploadId", json.string(value.string(track, "uploadId"))),
        #("trackId", json.string(value.string(track, "trackId"))),
        #("songUri", json.string(value.string(track, "uri"))),
        #("albumUri", json.string(value.string(track, "albumUri"))),
      ])
      |> json.to_string
      |> value.from_json
  }
}

pub fn command(
  playback: Cell(player.Playback),
  name: String,
  data: Dynamic,
) -> promise.Promise(Nil) {
  let state = player.poll(playback)
  let n = value.text(data) |> int.parse |> result.unwrap(0)
  case name {
    "queueRemove" -> {
      player.remove(playback, n)
      promise.resolve(Nil)
    }
    "volume" -> {
      let volume =
        value.text(data) |> float.parse |> result.unwrap(state.settings.volume)
      player.configure(
        playback,
        settings.Settings(
          ..state.settings,
          volume: float.clamp(volume, 0.0, 1.0),
        ),
      )
      promise.resolve(Nil)
    }
    "shuffle" -> {
      player.configure(
        playback,
        settings.Settings(..state.settings, shuffle: !state.settings.shuffle),
      )
      promise.resolve(Nil)
    }
    "enqueue" -> {
      let tracks =
        value.field(data, "tracks")
        |> value.items
        |> list.map(fn(track) {
          json.object([
            #("duration", value.to_json(value.field(track, "durationMs"))),
            #("uri", value.to_json(value.field(track, "songUri"))),
            ..value.entries(track)
            |> list.map(fn(p) { #(p.0, value.to_json(p.1)) })
          ])
          |> json.to_string
          |> value.from_json
        })
      let tracks = case value.boolean(data, "shuffle") {
        True -> node.shuffled(tracks)
        False -> tracks
      }
      let operation = case value.string(data, "mode") {
        "next" -> player.enqueue(playback, tracks, True)
        "last" -> player.enqueue(playback, tracks, False)
        _ -> player.play(playback, tracks, value.integer(data, "startIndex", 0))
      }
      operation |> promise.map(fn(_) { Nil })
    }
    _ -> {
      let operation = case name {
        "queueJump" -> "skipTo"
        "relative-seek" | "absolute-seek" -> "seek"
        _ -> name
      }
      let argument = case name {
        "relative-seek" -> int.max(0, state.position + n / 1000)
        "absolute-seek" -> value.integer(data, "position", 0) / 1000
        _ -> n
      }
      player.transport(playback, operation, argument)
      |> promise.map(fn(_) { Nil })
    }
  }
}

pub fn play_tag(
  playback: Cell(player.Playback),
  payloads: List(String),
) -> promise.Promise(Nil) {
  case payloads {
    [] -> promise.resolve(Nil)
    [payload, ..rest] ->
      case tags.parse(payload) {
        Error(_) -> play_tag(playback, rest)
        Ok(target) -> {
          use allowed <- promise.await(case target.kind {
            "favorites" ->
              client.actor("")
              |> promise.map(fn(did) { did == Ok(target.reference) })
            _ -> promise.resolve(True)
          })
          case allowed {
            False -> promise.resolve(Nil)
            True -> {
              use response <- promise.await(
                library.call(
                  case target.kind {
                    "favorites" -> "getStarred2"
                    "album" -> "getAlbum"
                    _ -> "getPlaylist"
                  },
                  case target.kind {
                    "favorites" -> []
                    _ -> [#("id", target.reference)]
                  },
                ),
              )
              case response {
                Error(_) -> promise.resolve(Nil)
                Ok(data) -> {
                  let root = case target.kind {
                    "favorites" -> "starred2"
                    _ -> target.kind
                  }
                  let field = case target.kind {
                    "playlist" -> "entry"
                    _ -> "song"
                  }
                  let tracks =
                    value.at(data, [root, field])
                    |> value.items
                    |> list.map(player.from_library)
                  case tracks {
                    [] -> play_tag(playback, rest)
                    _ ->
                      player.play(playback, tracks, 0)
                      |> promise.map(fn(_) { Nil })
                  }
                }
              }
            }
          }
        }
      }
  }
}
