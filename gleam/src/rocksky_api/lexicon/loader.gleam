//// Loads every lexicon JSON document under `lexicons/`.

import filepath
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/result
import gleam/string
import rocksky_api/error.{type Error}
import rocksky_api/node/js
import simplifile

pub fn load(root: String) -> Result(List(Dynamic), Error) {
  use files <- result.try(
    simplifile.get_files(root)
    |> result.map_error(fn(e) {
      error.Message("lexicons: " <> simplifile.describe_error(e))
    }),
  )
  files
  |> list.filter(fn(f) { string.ends_with(f, ".json") })
  |> list.sort(string.compare)
  |> list.try_map(fn(path) {
    use raw <- result.try(
      simplifile.read(path)
      |> result.map_error(fn(e) {
        error.Message(path <> ": " <> simplifile.describe_error(e))
      }),
    )
    js.parse_json(raw)
    |> result.map_error(fn(e) { error.Message(path <> ": " <> js.message(e)) })
  })
  |> result.map(dedupe)
}

fn dedupe(docs: List(Dynamic)) -> List(Dynamic) {
  docs
  |> list.fold(#([], []), fn(acc, doc) {
    let #(seen, kept) = acc
    case decode.run(doc, decode.at(["id"], decode.string)) {
      Ok(id) ->
        case list.contains(seen, id) {
          True -> acc
          False -> #([id, ..seen], [doc, ..kept])
        }
      Error(_) -> acc
    }
  })
  |> fn(acc) { list.reverse(acc.1) }
}

pub fn default_root() -> String {
  filepath.join(cwd(), "lexicons")
}

@external(javascript, "./loader_ffi.mjs", "cwd")
fn cwd() -> String
