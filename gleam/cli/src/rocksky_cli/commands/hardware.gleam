import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/client
import rocksky_cli/commands/reads
import rocksky_cli/hardware
import rocksky_cli/node
import rocksky_cli/tui/library
import rocksky_cli/value

pub type Target {
  Target(kind: String, reference: String)
}

pub fn parse(payload: String) -> Result(Target, Nil) {
  let payload = string.trim(payload)
  case string.split(payload, "/") {
    ["at:", "", did, "app.rocksky.album", key] if did != "" && key != "" ->
      Ok(Target("album", payload))
    ["at:", "", did, "app.rocksky.playlist", key] if did != "" && key != "" ->
      Ok(Target("playlist", payload))
    ["rocksky:", "", "library", kind, ..reference] ->
      case list.contains(["album", "playlist"], kind) && reference != [] {
        True ->
          Ok(Target(
            kind,
            hardware.decode_component(string.join(reference, "/")),
          ))
        False -> Error(Nil)
      }
    ["rocksky:", "", "favorites", did] if did != "" ->
      Ok(Target("favorites", hardware.decode_component(did)))
    _ -> Error(Nil)
  }
}

pub fn payloads(kind: String, uri: String, id: String) -> List(String) {
  [
    string.trim(uri),
    case string.trim(id) {
      "" -> ""
      id -> "rocksky://library/" <> kind <> "/" <> id
    },
  ]
  |> list.filter(fn(x) { x != "" })
}

pub fn resolve(
  options: Dynamic,
) -> promise.Promise(Result(List(String), String)) {
  case value.boolean(options, "favorites") {
    True ->
      client.actor("")
      |> promise.map(fn(did) {
        result.map(did, fn(did) { ["rocksky://favorites/" <> node.encode(did)] })
      })
    False -> {
      let kind = case value.string(options, "album") {
        "" -> "playlist"
        _ -> "album"
      }
      let ref = value.string(options, kind)
      case ref {
        "" ->
          promise.resolve(Error(
            "Pass --album <ref>, --playlist <ref> or --favorites.",
          ))
        _ -> {
          let fallback = case string.starts_with(ref, "at://") {
            True -> [ref]
            False -> payloads(kind, "", ref)
          }
          case client.token() {
            "" -> promise.resolve(Ok(fallback))
            _ -> {
              use response <- promise.map(
                library.call(
                  case kind {
                    "album" -> "getAlbum"
                    _ -> "getPlaylist"
                  },
                  [#("id", ref)],
                ),
              )
              Ok(case response {
                Error(_) -> fallback
                Ok(data) -> {
                  let found = value.field(data, kind)
                  case value.string(found, "id") {
                    "" -> fallback
                    id -> payloads(kind, value.string(found, "uri"), id)
                  }
                }
              })
            }
          }
        }
      }
    }
  }
}

pub fn run(command: String, options: Dynamic) -> promise.Promise(Nil) {
  case command {
    "nfc status" -> {
      use response <- promise.map(hardware.readers())
      case response {
        Error(e) -> reads.fail(e)
        Ok([]) -> reads.fail("No NFC reader connected.")
        Ok(readers) -> list.each(readers, node.print)
      }
    }
    "nfc read" -> {
      node.print("Hold a tag on the reader…")
      use response <- promise.map(
        hardware.read_tag(value.boolean(options, "watch"), fn(uid, payloads) {
          node.print(uid)
          list.each(payloads, node.print)
        }),
      )
      case response {
        Error(e) -> reads.fail(e)
        Ok(_) -> Nil
      }
    }
    "card read" -> {
      use response <- promise.map(hardware.read_card())
      case response {
        Error(e) -> reads.fail(e)
        Ok(records) -> list.each(records, node.print)
      }
    }
    _ -> {
      use records <- promise.await(resolve(options))
      case records {
        Error(e) -> {
          reads.fail(e)
          promise.resolve(Nil)
        }
        Ok(records) -> {
          node.print("Writing records:")
          list.each(records, node.print)
          case command {
            "nfc write" -> {
              use response <- promise.map(hardware.write_tag(records))
              case response {
                Error(e) -> reads.fail(e)
                Ok(_) -> node.print("Tag written.")
              }
            }
            _ -> {
              use response <- promise.map(hardware.write_card(
                records,
                value.string(options, "secret"),
              ))
              case response {
                Error(e) -> reads.fail(e)
                Ok(written) -> {
                  node.print("Wrote and verified:")
                  list.each(written, node.print)
                }
              }
            }
          }
        }
      }
    }
  }
}
