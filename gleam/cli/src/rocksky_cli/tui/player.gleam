import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_cli/cell.{type Cell}
import rocksky_cli/client
import rocksky_cli/node
import rocksky_cli/tui/cache
import rocksky_cli/tui/library
import rocksky_cli/tui/native
import rocksky_cli/tui/settings.{type Settings}
import rocksky_cli/value

pub type Playback {
  Playback(
    engine: Option(native.Player),
    settings: Settings,
    queue: List(Dynamic),
    index: Int,
    position: Int,
    status: String,
  )
}

pub fn new(output: String) -> Cell(Playback) {
  let prefs = settings.load()
  let prefs = case output {
    "" -> prefs
    _ -> settings.Settings(..prefs, output: output)
  }
  let saved =
    node.read(node.state_path("tui-session.json"))
    |> result.try(value.parse)
    |> result.unwrap(value.null())
  cell.new(Playback(
    None,
    prefs,
    value.items(value.field(saved, "queue")),
    int.clamp(
      value.integer(saved, "index", 0),
      0,
      int.max(0, list.length(value.items(value.field(saved, "queue"))) - 1),
    ),
    int.max(0, value.integer(saved, "positionMs", 0)),
    "paused",
  ))
}

pub fn poll(ref: Cell(Playback)) -> Playback {
  let state = cell.get(ref)
  case state.engine {
    None -> state
    Some(engine) -> {
      let status = native.status(engine)
      let state =
        Playback(
          ..state,
          index: value.integer(status, "index", state.index),
          position: value.integer(status, "position_ms", state.position),
          status: value.string(status, "state"),
        )
      cell.set(ref, state)
      state
    }
  }
}

pub fn save(ref: Cell(Playback)) -> Nil {
  let state = poll(ref)
  let body =
    json.object([
      #("queue", json.array(state.queue, value.to_json)),
      #("index", json.int(state.index)),
      #("positionMs", json.int(state.position)),
    ])
  let _ = node.write(node.state_path("tui-session.json"), json.to_string(body))
  settings.save(state.settings)
}

pub fn from_upload(row: Dynamic) -> Dynamic {
  let track = value.field(row, "track")
  [
    #("uploadId", json.string(value.at(row, ["upload", "id"]) |> value.text)),
    #("trackId", json.string(value.string(track, "id"))),
    #(
      "mimeType",
      json.string(value.at(row, ["upload", "mimeType"]) |> value.text),
    ),
    ..list.map(
      [
        "title",
        "artist",
        "album",
        "albumArtist",
        "albumArt",
        "uri",
        "duration",
        "trackNumber",
        "discNumber",
      ],
      fn(key) { #(key, value.to_json(value.field(track, key))) },
    )
  ]
  |> json.object
  |> json.to_string
  |> value.from_json
}

pub fn from_library(row: Dynamic) -> Dynamic {
  json.object([
    #("uploadId", json.string("")),
    #("trackId", json.string(value.string(row, "id"))),
    #("title", json.string(value.string(row, "title"))),
    #("artist", json.string(value.string(row, "artist"))),
    #("album", json.string(value.string(row, "album"))),
    #("uri", json.string(value.string(row, "uri"))),
    #("albumArtist", json.string(value.string(row, "albumArtist"))),
    #("albumArt", json.string(value.string(row, "albumArt"))),
    #("liked", json.bool(value.string(row, "starred") != "")),
    #("duration", json.int(value.integer(row, "duration", 0) * 1000)),
  ])
  |> json.to_string
  |> value.from_json
}

pub fn remote_stream(
  track: Dynamic,
) -> promise.Promise(Result(String, String)) {
  case value.string(track, "uploadId") {
    "" -> {
      use creds <- promise.map(library.credentials())
      result.map(creds, fn(creds) {
        library.url("stream", creds, [#("id", value.string(track, "trackId"))])
      })
    }
    upload -> {
      use response <- promise.map(client.get("/uploads/stream-token", []))
      result.map(response, fn(data) {
        client.base_url()
        <> "/uploads/"
        <> node.encode(upload)
        <> "/stream?token="
        <> node.encode(value.string(data, "token"))
      })
    }
  }
}

fn urls(
  tracks: List(Dynamic),
  acc: List(String),
) -> promise.Promise(Result(List(String), String)) {
  case tracks {
    [] -> promise.resolve(Ok(list.reverse(acc)))
    [track, ..rest] -> {
      use url <- promise.await(stream(track))
      case url {
        Error(e) -> promise.resolve(Error(e))
        Ok(url) -> urls(rest, [url, ..acc])
      }
    }
  }
}

fn ensure(ref: Cell(Playback)) -> promise.Promise(native.Player) {
  case cell.get(ref).engine {
    Some(engine) -> promise.resolve(engine)
    None -> {
      use engine <- promise.map(native.create(cell.get(ref).settings))
      cell.set(ref, Playback(..cell.get(ref), engine: Some(engine)))
      engine
    }
  }
}

pub fn play(
  ref: Cell(Playback),
  tracks: List(Dynamic),
  index: Int,
) -> promise.Promise(Result(Nil, String)) {
  case tracks {
    [] -> promise.resolve(Ok(Nil))
    _ -> {
      use resolved <- promise.await(urls(tracks, []))
      case resolved {
        Error(e) -> promise.resolve(Error(e))
        Ok(urls) -> {
          use engine <- promise.map(ensure(ref))
          native.queue(
            engine,
            urls,
            int.clamp(index, 0, list.length(tracks) - 1),
          )
          cell.set(
            ref,
            Playback(
              ..cell.get(ref),
              queue: tracks,
              index: int.clamp(index, 0, list.length(tracks) - 1),
              position: 0,
              status: "playing",
            ),
          )
          save(ref)
          Ok(Nil)
        }
      }
    }
  }
}

pub fn transport(
  ref: Cell(Playback),
  command: String,
  argument: Int,
) -> promise.Promise(Result(Nil, String)) {
  let state = poll(ref)
  case state.engine {
    None ->
      case command {
        "skipTo" -> play(ref, state.queue, argument)
        "next" -> play(ref, state.queue, state.index + 1)
        "previous" -> play(ref, state.queue, state.index - 1)
        "seek" -> {
          cell.set(ref, Playback(..state, position: int.max(0, argument)))
          promise.resolve(Ok(Nil))
        }
        "stop" -> {
          cell.set(ref, Playback(..state, position: 0, status: "stopped"))
          promise.resolve(Ok(Nil))
        }
        "play" | "toggle" -> {
          use response <- promise.map(play(ref, state.queue, state.index))
          case cell.get(ref).engine {
            Some(engine) -> native.command(engine, "seek", state.position)
            None -> Nil
          }
          response
        }
        _ -> promise.resolve(Ok(Nil))
      }
    Some(engine) -> {
      let command = case command {
        "toggle" ->
          case state.status {
            "playing" -> "pause"
            _ -> "play"
          }
        _ -> command
      }
      native.command(engine, command, argument)
      promise.resolve(Ok(Nil))
    }
  }
}

pub fn configure(ref: Cell(Playback), prefs: Settings) -> Nil {
  let state = cell.get(ref)
  case state.engine {
    Some(engine) -> native.configure(engine, prefs)
    None -> Nil
  }
  cell.set(ref, Playback(..state, settings: prefs))
  settings.save(prefs)
}

pub fn remove(ref: Cell(Playback), index: Int) -> Nil {
  let state = cell.get(ref)
  case state.engine {
    Some(engine) -> native.command(engine, "remove", index)
    None -> Nil
  }
  let queue =
    list.index_map(state.queue, fn(item, i) { #(item, i) })
    |> list.filter(fn(p) { p.1 != index })
    |> list.map(fn(p) { p.0 })
  cell.set(
    ref,
    Playback(
      ..state,
      queue: queue,
      index: int.max(0, case index < state.index {
        True -> state.index - 1
        False -> state.index
      }),
    ),
  )
  save(ref)
}

pub fn enqueue(
  ref: Cell(Playback),
  tracks: List(Dynamic),
  next: Bool,
) -> promise.Promise(Result(Nil, String)) {
  let state = poll(ref)
  case state.queue {
    [] -> play(ref, tracks, 0)
    _ -> {
      use resolved <- promise.await(urls(tracks, []))
      case resolved {
        Error(e) -> promise.resolve(Error(e))
        Ok(urls) -> {
          let index = case next {
            True -> state.index + 1
            False -> list.length(state.queue)
          }
          case state.engine {
            Some(engine) -> native.insert(engine, urls, 7, index)
            None -> Nil
          }
          let queue =
            list.append(
              list.take(state.queue, index),
              list.append(tracks, list.drop(state.queue, index)),
            )
          cell.set(ref, Playback(..cell.get(ref), queue: queue))
          save(ref)
          promise.resolve(Ok(Nil))
        }
      }
    }
  }
}

pub fn stream(track: Dynamic) -> promise.Promise(Result(String, String)) {
  case cache.find(track) {
    "" -> remote_stream(track)
    path -> promise.resolve(Ok(path))
  }
}

pub fn swap_local(ref: Cell(Playback), index: Int, path: String) -> Nil {
  let state = poll(ref)
  case state.engine {
    Some(engine) if index > state.index -> {
      native.insert(engine, [path], 7, index)
      native.command(engine, "remove", index + 1)
    }
    _ -> Nil
  }
}

pub fn insert_at(
  ref: Cell(Playback),
  tracks: List(Dynamic),
  mode: Int,
) -> promise.Promise(Result(Nil, String)) {
  let state = poll(ref)
  let tracks = case mode {
    4 | 5 -> node.shuffled(tracks)
    _ -> tracks
  }
  case mode {
    6 -> play(ref, tracks, 0)
    _ ->
      case state.queue {
        [] -> play(ref, tracks, 0)
        _ -> {
          use resolved <- promise.await(urls(tracks, []))
          case resolved {
            Error(e) -> promise.resolve(Error(e))
            Ok(urls) -> {
              let index = case mode {
                0 -> 0
                3 | 5 -> list.length(state.queue)
                7 -> state.index
                _ -> state.index + 1
              }
              case state.engine {
                Some(engine) -> native.insert(engine, urls, 7, index)
                None -> Nil
              }
              let queue =
                list.append(
                  list.take(state.queue, index),
                  list.append(tracks, list.drop(state.queue, index)),
                )
              cell.set(ref, Playback(..cell.get(ref), queue: queue))
              save(ref)
              promise.resolve(Ok(Nil))
            }
          }
        }
      }
  }
}

pub fn close(ref: Cell(Playback)) -> Nil {
  save(ref)
  let state = cell.get(ref)
  case state.engine {
    Some(engine) -> native.close(engine)
    None -> Nil
  }
  cell.set(ref, Playback(..state, engine: None, status: "paused"))
}
