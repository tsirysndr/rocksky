import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/client
import rocksky_cli/commands/reads
import rocksky_cli/host
import rocksky_cli/node
import rocksky_cli/value

pub fn collect(paths: List(String)) -> List(String) {
  list.flat_map(paths, fn(path) {
    case node.is_directory(path) {
      True -> collect(node.files(path))
      False ->
        case mime(path) {
          "" -> []
          _ -> [path]
        }
    }
  })
}

pub fn mime(path: String) -> String {
  let ext =
    string.split(path, ".")
    |> list.last
    |> result.unwrap("")
    |> string.lowercase
  case ext {
    "mp3" -> "audio/mpeg"
    "flac" -> "audio/flac"
    "m4a" -> "audio/mp4"
    "ogg" -> "audio/ogg"
    "wav" -> "audio/wav"
    "aiff" | "aif" -> "audio/aiff"
    _ -> ""
  }
}

pub fn resolve_storage(
  ref: String,
  providers: List(Dynamic),
) -> Result(String, String) {
  let normalized = string.lowercase(string.trim(ref))
  let matches =
    list.filter(providers, fn(p) {
      value.string(p, "id") == ref
      || string.lowercase(value.string(p, "label")) == normalized
      || string.lowercase(value.string(p, "bucket")) == normalized
    })
  let names =
    list.map(providers, fn(p) {
      value.string(p, "label")
      <> " · "
      <> value.string(p, "bucket")
      <> " ("
      <> value.string(p, "id")
      <> ")"
    })
    |> string.join("\n")
  case matches {
    [one] -> Ok(value.string(one, "id"))
    [] ->
      Error("No storage matches " <> ref <> ". Connected storage:\n" <> names)
    _ -> Error("Ambiguous storage " <> ref <> ". Use its id:\n" <> names)
  }
}

pub fn run(paths: List(String), options: Dynamic) -> promise.Promise(Nil) {
  case client.token() {
    "" -> {
      reads.fail("You are not logged in. Run rocksky login <handle> first.")
      promise.resolve(Nil)
    }
    _ -> {
      let files = collect(paths)
      let ref = value.string(options, "storage")
      use storage <- promise.await(case ref {
        "" -> promise.resolve(Ok(""))
        _ ->
          client.get("/storage/providers", [])
          |> promise.map(fn(result) {
            result
            |> result.try(fn(data) { resolve_storage(ref, value.items(data)) })
          })
      })
      case storage {
        Error(message) -> {
          reads.fail(message)
          promise.resolve(Nil)
        }
        Ok(storage) ->
          case files {
            [] -> {
              reads.fail(
                "No audio files found. Supported: mp3, flac, m4a, ogg, wav, aiff.",
              )
              promise.resolve(Nil)
            }
            _ -> send(files, storage)
          }
      }
    }
  }
}

fn send(files: List(String), storage: String) -> promise.Promise(Nil) {
  case files {
    [] -> promise.resolve(Nil)
    [file, ..rest] -> {
      node.print("Uploading " <> file)
      use response <- promise.await(
        host.upload(
          client.base_url() <> "/uploads/track",
          client.token(),
          file,
          mime(file),
          storage,
          fn(percent) { node.print(int.to_string(percent) <> "% " <> file) },
        ),
      )
      case response {
        Ok(_) -> node.print("Uploaded " <> file)
        Error(message) ->
          case string.starts_with(message, "409 ") {
            True -> node.print("Already in library: " <> file)
            False -> reads.fail(file <> ": " <> message)
          }
      }
      send(rest, storage)
    }
  }
}
