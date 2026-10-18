//// Legacy NATS messages use xata metadata and nested relationship references.

import gleam/json
import gleam/list
import gleam/string
import rocksky_api/db/row
import rocksky_api/lib/helpers
import rocksky_api/node/js

pub fn reference(id: String) {
  json.object([#("xata_id", json.string(id))])
}

pub fn encode(value: json.Json, relations: List(#(String, json.Json))) {
  let pairs =
    js.entries(js.coerce(value))
    |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
  let aliases =
    list.filter_map(pairs, fn(p) {
      case p.0 {
        "id" -> Ok(#("xata_id", p.1))
        "createdAt" -> Ok(#("xata_createdat", p.1))
        "updatedAt" -> Ok(#("xata_updatedat", p.1))
        _ -> Error(Nil)
      }
    })
  let keys = list.map(relations, fn(p) { p.0 })
  let pairs = list.filter(pairs, fn(p) { !list.contains(keys, p.0) })
  json.object(list.append(list.append(pairs, aliases), relations))
  |> helpers.deep_snake_case_keys
}

pub fn stringify(value: json.Json) {
  json.to_string(value) |> string.replace("sha_256", "sha256")
}
