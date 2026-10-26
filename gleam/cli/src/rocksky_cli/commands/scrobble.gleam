import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import rocksky_cli/client
import rocksky_cli/commands/import_history
import rocksky_cli/commands/reads
import rocksky_cli/node
import rocksky_cli/value

pub fn input(
  title: String,
  artist: String,
  album: String,
  timestamp: Int,
) -> Dynamic {
  json.object([
    #("title", json.string(title)),
    #("artist", json.string(artist)),
    #("album", json.string(album)),
    #("timestamp", json.int(timestamp)),
  ])
  |> json.to_string
  |> value.from_json
}

pub fn run(args: List(String), options: Dynamic) -> promise.Promise(Nil) {
  let title = list.first(args) |> result.unwrap("")
  let artist = args |> list.drop(1) |> list.first |> result.unwrap("")
  let album = value.string(options, "album")
  let timestamp = value.integer(options, "timestamp", node.now())
  case value.boolean(options, "dryRun") {
    True -> {
      use matched <- promise.map(
        client.xrpc("song.matchSong", [
          #("title", title),
          #("artist", artist),
          #("album", album),
        ]),
      )
      reads.show(matched, fn(track) {
        node.print(
          "Dry run — nothing will be written\n" <> value.stringify(track),
        )
      })
    }
    False ->
      import_history.publish(
        "scrobble:" <> title <> ":" <> artist,
        "manual",
        [input(title, artist, album, timestamp)],
        options,
      )
  }
}
