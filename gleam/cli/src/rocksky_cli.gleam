import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/list
import gleam/result
import rocksky_cli/cli
import rocksky_cli/commands/hardware
import rocksky_cli/commands/import_history
import rocksky_cli/commands/login
import rocksky_cli/commands/reads
import rocksky_cli/commands/scrobble
import rocksky_cli/commands/scrobble_api
import rocksky_cli/commands/sync
import rocksky_cli/commands/upload
import rocksky_cli/host
import rocksky_cli/mpd/server
import rocksky_cli/node
import rocksky_cli/tui
import rocksky_cli/value

pub fn dispatch(
  command: String,
  args: List(String),
  options: Dynamic,
) -> promise.Promise(Nil) {
  case command {
    "login" -> login.run(list.first(args) |> result.unwrap(""))
    "whoami"
    | "nowplaying"
    | "scrobbles"
    | "search"
    | "stats"
    | "artists"
    | "albums"
    | "tracks"
    | "create apikey" -> reads.run(command, args, options)
    "upload" -> upload.run(args, options)
    "import" ->
      import_history.run(list.first(args) |> result.unwrap(""), options)
    "scrobble" -> scrobble.run(args, options)
    "sync" -> sync.run()
    "scrobble-api" -> scrobble_api.run(options)
    "nfc status" | "nfc read" | "nfc write" | "card read" | "card write" ->
      hardware.run(command, options)
    "mcp" -> {
      let args =
        [
          #("--device", "device"),
          #("--api-url", "apiUrl"),
          #("--ws-url", "wsUrl"),
          #("--token-path", "tokenPath"),
        ]
        |> list.flat_map(fn(pair) {
          case value.string(options, pair.1) {
            "" -> []
            value -> [pair.0, value]
          }
        })
      use binary <- promise.map(host.mcp_binary())
      host.spawn(binary, args)
    }
    "mpd" -> server.run(options)
    "tui" -> tui.run(value.string(options, "output"))
    _ -> {
      reads.fail("Unknown command: " <> command)
      promise.resolve(Nil)
    }
  }
}

pub fn main() -> promise.Promise(Nil) {
  cli.parse(cli.specification(), cli.version, dispatch)
  |> promise.rescue(fn(error) {
    node.error(node.error_text(error))
    node.exit_code(1)
  })
}
