import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/result
import rocksky_cli/node
import rocksky_cli/value

@external(javascript, "./cache_ffi.mjs", "directory")
pub fn directory() -> String

@external(javascript, "./cache_ffi.mjs", "entries")
pub fn entries() -> List(Dynamic)

@external(javascript, "./cache_ffi.mjs", "download")
fn download(
  url: String,
  path: String,
) -> promise.Promise(Result(String, String))

pub fn id(track: Dynamic) -> String {
  case value.string(track, "uploadId") {
    "" -> value.string(track, "trackId")
    id -> id
  }
}

pub fn find(track: Dynamic) -> String {
  let id = id(track)
  case id {
    "" -> ""
    _ ->
      entries()
      |> list.find(fn(file) { value.string(file, "id") == id })
      |> result.map(fn(file) { value.string(file, "path") })
      |> result.unwrap("")
  }
}

pub fn total() -> Int {
  list.fold(entries(), 0, fn(total, file) {
    total + value.integer(file, "size", 0)
  })
}

pub fn prune(protected: String) -> Nil {
  let files =
    entries()
    |> list.sort(fn(a, b) {
      int.compare(
        value.integer(a, "modified", 0),
        value.integer(b, "modified", 0),
      )
    })
  let _ =
    list.fold(files, total(), fn(size, file) {
      case size > 2_147_483_648 && value.string(file, "path") != protected {
        True -> {
          node.remove(value.string(file, "path"))
          size - value.integer(file, "size", 0)
        }
        False -> size
      }
    })
  Nil
}

pub fn store(
  track: Dynamic,
  resolve: fn(Dynamic) -> promise.Promise(Result(String, String)),
) -> promise.Promise(Result(String, String)) {
  case find(track) {
    "" ->
      case id(track) {
        "" -> promise.resolve(Error("No upload or track ID to cache"))
        id -> {
          use url <- promise.await(resolve(track))
          case url {
            Error(e) -> promise.resolve(Error(e))
            Ok(url) -> {
              let extension = case value.string(track, "mimeType") {
                "audio/flac" | "audio/x-flac" -> "flac"
                "audio/mp4" | "audio/x-m4a" -> "m4a"
                "audio/ogg" | "application/ogg" -> "ogg"
                "audio/opus" -> "opus"
                "audio/wav" | "audio/x-wav" -> "wav"
                _ -> "mp3"
              }
              let path =
                directory() <> "/" <> node.encode(id) <> "." <> extension
              use response <- promise.map(download(url, path))
              case response {
                Ok(path) -> prune(path)
                Error(_) -> Nil
              }
              response
            }
          }
        }
      }
    path -> promise.resolve(Ok(path))
  }
}

pub fn clear() -> Nil {
  entries() |> list.each(fn(file) { node.remove(value.string(file, "path")) })
}
