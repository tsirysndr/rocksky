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
import rocksky_cli/mpd/protocol
import rocksky_cli/node
import rocksky_cli/tui/library
import rocksky_cli/tui/player
import rocksky_cli/tui/runtime
import rocksky_cli/tui/settings
import rocksky_cli/value

pub type Context {
  Context(
    player: Cell(player.Playback),
    tracks: Cell(List(Dynamic)),
    version: Cell(Int),
  )
}

pub type Connection {
  Connection(
    context: Context,
    commands: List(String),
    in_list: Bool,
    list_ok: Bool,
    idle: Bool,
    requested: List(String),
    observed: List(#(String, String)),
  )
}

@external(javascript, "./server_ffi.mjs", "serve")
fn serve(
  bind: String,
  port: Int,
  greeting: String,
  connection: fn() -> fn(String) -> promise.Promise(String),
  cleanup: fn() -> Nil,
  cover: fn(String) -> promise.Promise(Result(Dynamic, String)),
) -> promise.Promise(#(Int, fn() -> Nil))

@external(javascript, "./server_ffi.mjs", "fetch_cover")
fn fetch_cover(url: String) -> promise.Promise(Result(Dynamic, String))

pub fn run(options: Dynamic) -> promise.Promise(Nil) {
  let playback = player.new(value.string(options, "output"))
  use stop <- promise.await(runtime.start(playback))
  use started <- promise.map(start(playback, options, stop))
  node.print("Rocksky MPD listening on port " <> int.to_string(started.0))
}

pub fn start(
  playback: Cell(player.Playback),
  options: Dynamic,
  cleanup: fn() -> Nil,
) -> promise.Promise(#(Int, fn() -> Nil)) {
  let prefs = cell.get(playback).settings
  let cached =
    node.read(node.state_path("mpd-library.json"))
    |> result.try(value.parse)
    |> result.map(value.items)
    |> result.unwrap([])
  let context = Context(playback, cell.new(cached), cell.new(0))
  let bind = case value.string(options, "bind") {
    "" -> prefs.mpd_bind
    x -> x
  }
  serve(
    bind,
    value.integer(options, "port", prefs.mpd_port),
    protocol.greeting,
    fn() {
      let connection =
        cell.new(Connection(
          context,
          [],
          False,
          False,
          False,
          [],
          snapshot(context),
        ))
      fn(line) { dispatch(connection, line) }
    },
    fn() {
      player.save(playback)
      cleanup()
    },
    fn(path) { cover(context, path) },
  )
}

fn dispatch(ref: Cell(Connection), line: String) -> promise.Promise(String) {
  let conn = cell.get(ref)
  let tokens = protocol.tokenize(line)
  let name = list.first(tokens) |> result.unwrap("")
  case name {
    "__poll__" ->
      case conn.idle {
        False -> promise.resolve("")
        True -> wake(ref, False)
      }
    "idle" -> {
      cell.set(
        ref,
        Connection(..conn, idle: True, requested: list.drop(tokens, 1)),
      )
      wake(ref, False)
    }
    "noidle" -> wake(ref, True)
    "command_list_begin" | "command_list_ok_begin" -> {
      cell.set(
        ref,
        Connection(
          ..conn,
          commands: [],
          in_list: True,
          list_ok: line == "command_list_ok_begin",
        ),
      )
      promise.resolve("")
    }
    "command_list_end" -> {
      cell.set(ref, Connection(..conn, commands: [], in_list: False))
      execute_list(
        conn.context,
        list.reverse(conn.commands),
        conn.list_ok,
        0,
        "",
      )
    }
    _ ->
      case conn.in_list {
        True -> {
          cell.set(ref, Connection(..conn, commands: [line, ..conn.commands]))
          promise.resolve("")
        }
        False -> execute_list(conn.context, [line], False, 0, "")
      }
  }
}

fn snapshot(ctx: Context) -> List(#(String, String)) {
  let state = player.poll(ctx.player)
  [
    #("player", state.status <> ":" <> int.to_string(state.index)),
    #("playlist", value.stringify_list(state.queue)),
    #("mixer", float.to_string(state.settings.volume)),
    #(
      "options",
      bool(state.settings.shuffle)
        <> ":"
        <> int.to_string(state.settings.repeat),
    ),
    #("database", value.stringify_list(cell.get(ctx.tracks))),
  ]
}

fn wake(ref: Cell(Connection), cancel: Bool) -> promise.Promise(String) {
  let conn = cell.get(ref)
  let now = snapshot(conn.context)
  let changed =
    list.filter(now, fn(entry) {
      !list.contains(conn.observed, entry)
      && { conn.requested == [] || list.contains(conn.requested, entry.0) }
    })
  case conn.idle && { cancel || changed != [] } {
    False -> promise.resolve("")
    True -> {
      cell.set(ref, Connection(..conn, idle: False, observed: now))
      promise.resolve(
        list.map(changed, fn(e) { protocol.kv("changed", e.0) })
        |> string.join("")
        |> string.append("OK\n"),
      )
    }
  }
}

fn execute_list(
  ctx: Context,
  lines: List(String),
  list_ok: Bool,
  index: Int,
  output: String,
) -> promise.Promise(String) {
  case lines {
    [] -> promise.resolve(output <> "OK\n")
    [line, ..rest] -> {
      let tokens = protocol.tokenize(line)
      let command = list.first(tokens) |> result.unwrap("")
      use response <- promise.await(execute(ctx, command, list.drop(tokens, 1)))
      case response {
        Error(#(code, message)) ->
          promise.resolve(output <> protocol.ack(code, index, command, message))
        Ok(body) ->
          execute_list(
            ctx,
            rest,
            list_ok,
            index + 1,
            output
              <> body
              <> case list_ok {
              True -> "list_OK\n"
              False -> ""
            },
          )
      }
    }
  }
}

fn arg(args: List(String), index: Int) -> String {
  args |> list.drop(index) |> list.first |> result.unwrap("")
}

fn number(args: List(String), index: Int, default: Int) -> Int {
  arg(args, index) |> int.parse |> result.unwrap(default)
}

fn success(text: String) -> promise.Promise(Result(String, #(Int, String))) {
  promise.resolve(Ok(text))
}

fn failure(message: String) -> promise.Promise(Result(String, #(Int, String))) {
  promise.resolve(Error(#(2, message)))
}

fn tracks(ctx: Context) -> promise.Promise(Result(List(Dynamic), String)) {
  case cell.get(ctx.tracks) {
    [] -> load_tracks(ctx, 0, [])
    values -> promise.resolve(Ok(values))
  }
}

fn load_tracks(
  ctx: Context,
  offset: Int,
  acc: List(Dynamic),
) -> promise.Promise(Result(List(Dynamic), String)) {
  use response <- promise.await(
    client.get("/uploads", [
      #("offset", int.to_string(offset)),
      #("size", "500"),
    ]),
  )
  case response {
    Error(e) -> promise.resolve(Error(e))
    Ok(data) -> {
      let batch = value.items(data) |> list.map(player.from_upload)
      let all = list.append(acc, batch)
      case list.length(batch) < 500 {
        True -> {
          cell.set(ctx.tracks, all)
          let _ =
            node.write(
              node.state_path("mpd-library.json"),
              value.stringify_list(all),
            )
          promise.resolve(Ok(all))
        }
        False -> load_tracks(ctx, offset + 500, all)
      }
    }
  }
}

pub fn uri(track: Dynamic) -> String {
  case value.string(track, "uploadId") {
    "" -> "rocksky:track:" <> value.string(track, "trackId")
    id -> "rocksky:upload:" <> id
  }
}

fn tag(track: Dynamic, name: String) -> String {
  value.string(track, case string.lowercase(name) {
    "albumartist" -> "albumArtist"
    "track" -> "trackNumber"
    "disc" -> "discNumber"
    "file" -> ""
    _ -> string.lowercase(name)
  })
}

fn song(track: Dynamic, position: Int) -> String {
  protocol.kv("file", uri(track))
  <> protocol.kv(
    "Time",
    int.to_string(value.integer(track, "duration", 0) / 1000),
  )
  <> protocol.kv(
    "duration",
    float.to_string(int.to_float(value.integer(track, "duration", 0)) /. 1000.0),
  )
  <> {
    [
      "Title",
      "Artist",
      "Album",
      "AlbumArtist",
      "Track",
      "Disc",
      "Genre",
      "Date",
    ]
    |> list.map(fn(name) {
      let val = tag(track, name)
      case val {
        "" -> ""
        _ -> protocol.kv(name, val)
      }
    })
    |> string.join("")
  }
  <> case position {
    -1 -> ""
    _ ->
      protocol.kv("Pos", int.to_string(position))
      <> protocol.kv("Id", int.to_string(position))
  }
}

fn song_list(tracks: List(Dynamic)) -> String {
  tracks |> list.map(fn(t) { song(t, -1) }) |> string.join("")
}

fn bool(value: Bool) -> String {
  case value {
    True -> "1"
    False -> "0"
  }
}

const commands = [
  "ping",
  "albumart",
  "readpicture",
  "binarylimit",
  "status",
  "stats",
  "currentsong",
  "play",
  "playid",
  "pause",
  "stop",
  "next",
  "previous",
  "seek",
  "seekid",
  "seekcur",
  "setvol",
  "volume",
  "random",
  "repeat",
  "single",
  "consume",
  "crossfade",
  "replay_gain_mode",
  "replay_gain_status",
  "playlistinfo",
  "playlistid",
  "playlist",
  "plchanges",
  "plchangesposid",
  "add",
  "addid",
  "delete",
  "deleteid",
  "clear",
  "swap",
  "swapid",
  "move",
  "moveid",
  "shuffle",
  "lsinfo",
  "listall",
  "listallinfo",
  "find",
  "search",
  "findadd",
  "searchadd",
  "list",
  "count",
  "listplaylists",
  "listplaylist",
  "listplaylistinfo",
  "load",
  "save",
  "rm",
  "playlistadd",
  "playlistdelete",
  "update",
  "rescan",
  "idle",
  "noidle",
  "commands",
  "notcommands",
  "tagtypes",
  "urlhandlers",
  "decoders",
  "channels",
  "outputs",
  "enableoutput",
  "disableoutput",
  "password",
  "close",
  "partition",
  "listpartitions",
  "config",
]

pub fn execute(
  ctx: Context,
  command: String,
  args: List(String),
) -> promise.Promise(Result(String, #(Int, String))) {
  let state = player.poll(ctx.player)
  let prefs = state.settings
  let current =
    state.queue
    |> list.drop(state.index)
    |> list.first
    |> result.unwrap(value.null())
  case command {
    "ping"
    | "noidle"
    | "password"
    | "close"
    | "enableoutput"
    | "disableoutput"
    | "consume"
    | "partition" -> success("")
    "commands" ->
      success(
        list.map(commands, fn(c) { protocol.kv("command", c) })
        |> string.join(""),
      )
    "notcommands" | "channels" | "decoders" -> success("")
    "listpartitions" -> success("partition: default\n")
    "config" -> success("music_directory: rocksky://library\n")
    "outputs" -> success("outputid: 0\noutputname: Rocksky\noutputenabled: 1\n")
    "urlhandlers" ->
      success("handler: rocksky\nhandler: http\nhandler: https\n")
    "tagtypes" ->
      success(
        "tagtype: Artist\ntagtype: Album\ntagtype: AlbumArtist\ntagtype: Title\ntagtype: Track\ntagtype: Disc\ntagtype: Genre\ntagtype: Date\n",
      )
    "idle" -> success("")
    "status" ->
      success(
        protocol.kv("volume", int.to_string(float.round(prefs.volume *. 100.0)))
        <> protocol.kv("repeat", bool(prefs.repeat != 0))
        <> protocol.kv("random", bool(prefs.shuffle))
        <> protocol.kv("single", bool(prefs.repeat == 1))
        <> "consume: 0\n"
        <> protocol.kv("playlist", int.to_string(cell.get(ctx.version)))
        <> protocol.kv(
          "playlistlength",
          int.to_string(list.length(state.queue)),
        )
        <> protocol.kv("state", case state.status {
          "playing" -> "play"
          "paused" -> "pause"
          _ -> "stop"
        })
        <> protocol.kv("song", int.to_string(state.index))
        <> protocol.kv("songid", int.to_string(state.index))
        <> protocol.kv(
          "elapsed",
          float.to_string(int.to_float(state.position) /. 1000.0),
        )
        <> protocol.kv(
          "duration",
          float.to_string(
            int.to_float(value.integer(current, "duration", 0)) /. 1000.0,
          ),
        )
        <> protocol.kv("xfade", int.to_string(prefs.fade_in_duration)),
      )
    "currentsong" ->
      success(case value.is_null(current) {
        True -> ""
        False -> song(current, state.index)
      })
    "play"
    | "playid"
    | "pause"
    | "stop"
    | "next"
    | "previous"
    | "seek"
    | "seekid"
    | "seekcur" -> {
      let operation = case command {
        "play" | "playid" ->
          case args {
            [] -> "play"
            _ -> "skipTo"
          }
        "pause" ->
          case arg(args, 0) {
            "0" -> "play"
            "1" -> "pause"
            _ -> "toggle"
          }
        "seek" | "seekid" | "seekcur" -> "seek"
        _ -> command
      }
      let argument = case command {
        "seek" | "seekid" -> number(args, 1, 0) * 1000
        "seekcur" -> number(args, 0, 0) * 1000
        _ -> number(args, 0, 0)
      }
      use response <- promise.map(player.transport(
        ctx.player,
        operation,
        argument,
      ))
      response
      |> result.map(fn(_) { "" })
      |> result.map_error(fn(e) { #(52, e) })
    }
    "setvol"
    | "volume"
    | "random"
    | "repeat"
    | "single"
    | "crossfade"
    | "replay_gain_mode" -> {
      let n = number(args, 0, 0)
      let prefs = case command {
        "setvol" ->
          settings.Settings(
            ..prefs,
            volume: float.clamp(int.to_float(n) /. 100.0, 0.0, 1.0),
          )
        "volume" ->
          settings.Settings(
            ..prefs,
            volume: float.clamp(
              prefs.volume +. int.to_float(n) /. 100.0,
              0.0,
              1.0,
            ),
          )
        "random" -> settings.Settings(..prefs, shuffle: n != 0)
        "repeat" ->
          settings.Settings(..prefs, repeat: case n {
            0 -> 0
            _ -> 2
          })
        "single" ->
          settings.Settings(..prefs, repeat: case n {
            0 ->
              case prefs.repeat {
                1 -> 2
                _ -> prefs.repeat
              }
            _ -> 1
          })
        "crossfade" ->
          settings.Settings(
            ..prefs,
            crossfade: case n {
              0 -> 0
              _ -> 5
            },
            fade_in_duration: n,
            fade_out_duration: n,
          )
        _ ->
          settings.Settings(..prefs, replaygain: case arg(args, 0) {
            "track" -> 1
            "album" -> 2
            _ -> 0
          })
      }
      player.configure(ctx.player, prefs)
      success("")
    }
    "replay_gain_status" ->
      success(
        protocol.kv("replay_gain_mode", case prefs.replaygain {
          1 -> "track"
          2 -> "album"
          _ -> "off"
        }),
      )
    "playlistinfo"
    | "playlistid"
    | "playlist"
    | "plchanges"
    | "plchangesposid" -> {
      let rows =
        state.queue
        |> list.index_map(fn(t, i) { #(t, i) })
        |> list.filter(fn(p) {
          args == []
          || command == "plchanges"
          || command == "plchangesposid"
          || p.1 == number(args, 0, -1)
        })
      success(rows |> list.map(fn(p) { song(p.0, p.1) }) |> string.join(""))
    }
    "delete" | "deleteid" -> {
      player.remove(ctx.player, number(args, 0, -1))
      cell.set(ctx.version, cell.get(ctx.version) + 1)
      success("")
    }
    "clear" -> {
      let count = list.length(state.queue)
      list.each(list.repeat(Nil, count), fn(_) { player.remove(ctx.player, 0) })
      cell.set(ctx.version, cell.get(ctx.version) + 1)
      success("")
    }
    "move" | "moveid" | "swap" | "swapid" | "shuffle" ->
      failure("Queue reordering is not supported by the player")
    "update" | "rescan" -> {
      cell.set(ctx.tracks, [])
      use _ <- promise.map(tracks(ctx))
      Ok("updating_db: 1\n")
    }
    "add" | "addid" -> {
      use records <- promise.await(tracks(ctx))
      case records {
        Error(e) -> promise.resolve(Error(#(52, e)))
        Ok(records) ->
          case
            list.find(records, fn(t) {
              uri(t) == arg(args, 0)
              || value.string(t, "trackId") == arg(args, 0)
            })
          {
            Error(_) -> promise.resolve(Error(#(50, "No such song")))
            Ok(track) -> {
              use response <- promise.map(player.enqueue(
                ctx.player,
                [track],
                False,
              ))
              cell.set(ctx.version, cell.get(ctx.version) + 1)
              response
              |> result.map(fn(_) {
                case command {
                  "addid" ->
                    protocol.kv("Id", int.to_string(list.length(state.queue)))
                  _ -> ""
                }
              })
              |> result.map_error(fn(e) { #(52, e) })
            }
          }
      }
    }
    "listplaylists" -> {
      use response <- promise.map(library.call("getPlaylists", []))
      response
      |> result.map(fn(data) {
        value.at(data, ["playlists", "playlist"])
        |> value.items
        |> list.map(fn(p) {
          protocol.kv("playlist", value.string(p, "name"))
          <> protocol.kv("Last-Modified", node.iso_date(node.now()))
        })
        |> string.join("")
      })
      |> result.map_error(fn(e) { #(52, e) })
    }
    "listplaylist"
    | "listplaylistinfo"
    | "load"
    | "rm"
    | "playlistadd"
    | "playlistdelete"
    | "save" -> playlist_command(ctx, command, args)
    "lsinfo"
    | "listall"
    | "listallinfo"
    | "find"
    | "search"
    | "findadd"
    | "searchadd"
    | "list"
    | "count"
    | "stats" -> browse(ctx, command, args)
    _ -> promise.resolve(Error(#(5, "Unknown command")))
  }
}

fn matches(track: Dynamic, args: List(String), exact: Bool) -> Bool {
  case args {
    [name, query, ..rest] -> {
      let field = case string.lowercase(name) {
        "any" -> value.stringify(track)
        "file" -> uri(track)
        _ -> tag(track, name)
      }
      let yes = case exact {
        True -> field == query
        False ->
          string.contains(string.lowercase(field), string.lowercase(query))
      }
      yes && matches(track, rest, exact)
    }
    _ -> True
  }
}

fn browse(
  ctx: Context,
  command: String,
  args: List(String),
) -> promise.Promise(Result(String, #(Int, String))) {
  use loaded <- promise.await(tracks(ctx))
  case loaded {
    Error(e) -> promise.resolve(Error(#(52, e)))
    Ok(all) -> {
      let rows = case command {
        "find" | "findadd" | "search" | "searchadd" | "count" ->
          list.filter(all, fn(t) {
            matches(t, args, command == "find" || command == "findadd")
          })
        "list" ->
          list.filter(all, fn(t) { matches(t, list.drop(args, 1), True) })
        _ -> all
      }
      case command {
        "findadd" | "searchadd" -> {
          use response <- promise.map(player.enqueue(ctx.player, rows, False))
          response
          |> result.map(fn(_) { "" })
          |> result.map_error(fn(e) { #(52, e) })
        }
        "list" ->
          success(
            rows
            |> list.map(fn(t) { tag(t, arg(args, 0)) })
            |> list.unique
            |> list.map(fn(t) { protocol.kv(arg(args, 0), t) })
            |> string.join(""),
          )
        "count" ->
          success(
            protocol.kv("songs", int.to_string(list.length(rows)))
            <> protocol.kv(
              "playtime",
              int.to_string(
                list.fold(rows, 0, fn(acc, t) {
                  acc + value.integer(t, "duration", 0) / 1000
                }),
              ),
            ),
          )
        "stats" ->
          success(
            protocol.kv("songs", int.to_string(list.length(all)))
            <> protocol.kv(
              "artists",
              int.to_string(
                all
                |> list.map(fn(t) { value.string(t, "artist") })
                |> list.unique
                |> list.length,
              ),
            )
            <> protocol.kv(
              "albums",
              int.to_string(
                all
                |> list.map(fn(t) { value.string(t, "album") })
                |> list.unique
                |> list.length,
              ),
            )
            <> "uptime: 0\nplaytime: 0\ndb_playtime: 0\ndb_update: 0\n",
          )
        "lsinfo" -> directories(ctx, rows, arg(args, 0))
        "listall" | "listallinfo" if args != [] ->
          directories(ctx, rows, arg(args, 0))
        "listall" ->
          success(
            rows
            |> list.map(fn(t) { protocol.kv("file", uri(t)) })
            |> string.join(""),
          )
        _ -> success(song_list(rows))
      }
    }
  }
}

fn playlist_command(
  ctx: Context,
  command: String,
  args: List(String),
) -> promise.Promise(Result(String, #(Int, String))) {
  use response <- promise.await(library.call("getPlaylists", []))
  case response {
    Error(e) -> promise.resolve(Error(#(52, e)))
    Ok(data) -> {
      let name = arg(args, 0)
      let found =
        value.at(data, ["playlists", "playlist"])
        |> value.items
        |> list.find(fn(p) {
          value.string(p, "name") == name || value.string(p, "id") == name
        })
        |> result.unwrap(value.null())
      let id = value.string(found, "id")
      case command {
        "save" -> {
          use response <- promise.await(library.procedure(
            "createPlaylist",
            json.object([#("name", json.string(name))]),
          ))
          case response {
            Error(e) -> promise.resolve(Error(#(52, e)))
            Ok(data) ->
              add_playlist(
                value.at(data, ["playlist", "id"]) |> value.text,
                cell.get(ctx.player).queue,
              )
          }
        }
        _ ->
          case id {
            "" -> promise.resolve(Error(#(50, "No such playlist")))
            _ ->
              case command {
                "rm" | "playlistadd" | "playlistdelete" -> {
                  let fields = case command {
                    "rm" -> [#("id", json.string(id))]
                    "playlistdelete" -> [
                      #("playlistId", json.string(id)),
                      #("songIndexToRemove", json.int(number(args, 1, 0))),
                    ]
                    _ -> [
                      #("playlistId", json.string(id)),
                      #("songIdToAdd", json.string(arg(args, 1))),
                    ]
                  }
                  use response <- promise.map(library.procedure(
                    case command {
                      "rm" -> "deletePlaylist"
                      _ -> "updatePlaylist"
                    },
                    json.object(fields),
                  ))
                  response
                  |> result.map(fn(_) { "" })
                  |> result.map_error(fn(e) { #(52, e) })
                }
                _ -> {
                  use response <- promise.await(
                    library.call("getPlaylist", [#("id", id)]),
                  )
                  case response {
                    Error(e) -> promise.resolve(Error(#(52, e)))
                    Ok(data) -> {
                      let songs =
                        value.at(data, ["playlist", "entry"])
                        |> value.items
                        |> list.map(player.from_library)
                      case command {
                        "load" -> {
                          use response <- promise.map(player.enqueue(
                            ctx.player,
                            songs,
                            False,
                          ))
                          response
                          |> result.map(fn(_) { "" })
                          |> result.map_error(fn(e) { #(52, e) })
                        }
                        _ -> success(song_list(songs))
                      }
                    }
                  }
                }
              }
          }
      }
    }
  }
}

fn add_playlist(
  id: String,
  tracks: List(Dynamic),
) -> promise.Promise(Result(String, #(Int, String))) {
  case tracks {
    [] -> success("")
    [track, ..rest] -> {
      use response <- promise.await(library.procedure(
        "updatePlaylist",
        json.object([
          #("playlistId", json.string(id)),
          #("songIdToAdd", json.string(value.string(track, "trackId"))),
        ]),
      ))
      case response {
        Error(e) -> promise.resolve(Error(#(52, e)))
        Ok(_) -> add_playlist(id, rest)
      }
    }
  }
}

fn directories(
  ctx: Context,
  rows: List(Dynamic),
  path: String,
) -> promise.Promise(Result(String, #(Int, String))) {
  let parts = string.split(path, "/") |> list.filter(fn(p) { p != "" })
  case parts {
    [] ->
      success("directory: Artists\ndirectory: Albums\ndirectory: Playlists\n")
    ["Artists"] -> success(directory_names(rows, "albumArtist", "Artists/"))
    ["Artists", artist] ->
      success(directory_names(
        list.filter(rows, fn(t) { tag(t, "albumArtist") == artist }),
        "album",
        "Artists/" <> artist <> "/",
      ))
    ["Artists", artist, album] ->
      success(
        song_list(
          list.filter(rows, fn(t) {
            tag(t, "albumArtist") == artist && tag(t, "album") == album
          }),
        ),
      )
    ["Albums"] -> success(directory_names(rows, "album", "Albums/"))
    ["Albums", album] ->
      success(song_list(list.filter(rows, fn(t) { tag(t, "album") == album })))
    ["Playlists"] -> {
      use response <- promise.map(library.call("getPlaylists", []))
      response
      |> result.map(fn(data) {
        value.at(data, ["playlists", "playlist"])
        |> value.items
        |> list.map(fn(p) {
          protocol.kv("directory", "Playlists/" <> value.string(p, "name"))
        })
        |> string.join("")
      })
      |> result.map_error(fn(e) { #(52, e) })
    }
    ["Playlists", name] -> playlist_command(ctx, "listplaylistinfo", [name])
    _ -> success("")
  }
}

fn directory_names(
  rows: List(Dynamic),
  field: String,
  prefix: String,
) -> String {
  rows
  |> list.map(fn(t) { tag(t, field) })
  |> list.unique
  |> list.map(fn(name) { protocol.kv("directory", prefix <> name) })
  |> string.join("")
}

fn cover(
  ctx: Context,
  path: String,
) -> promise.Promise(Result(Dynamic, String)) {
  use rows <- promise.await(tracks(ctx))
  case rows {
    Error(e) -> promise.resolve(Error(e))
    Ok(rows) -> {
      let track =
        list.append(cell.get(ctx.player).queue, rows)
        |> list.find(fn(t) { uri(t) == path })
        |> result.unwrap(value.null())
      case value.string(track, "albumArt") {
        "" -> promise.resolve(Error("No cover art for this song"))
        url -> fetch_cover(url)
      }
    }
  }
}
