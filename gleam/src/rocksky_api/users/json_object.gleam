import gleam/json
import gleam/list
import rocksky_api/db/row
import rocksky_api/node/js

pub fn extend(base: json.Json, fields: List(#(String, json.Json))) {
  let keys = list.map(fields, fn(p) { p.0 })
  let original =
    js.entries(js.coerce(base))
    |> list.filter(fn(p) { !list.contains(keys, p.0) })
    |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
  json.object(list.append(original, fields))
}
