import gleam/dynamic.{type Dynamic}
import gleam/json.{type Json}
import gleam/result
import rocksky_api/error
import rocksky_api/lexicon/loader
import rocksky_api/node/js

pub fn record(collection: String, value: Json) {
  use docs <- result.try(loader.load(loader.default_root()))
  validate(docs, collection, value) |> error.map_js
}

@external(javascript, "./validation_ffi.mjs", "validate")
fn validate(
  docs: List(Dynamic),
  collection: String,
  value: Json,
) -> Result(Nil, js.Exception)
