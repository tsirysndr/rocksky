import gleam/list
import gleam/string

pub fn preset_rkey(name: String) -> String {
  name
  |> string.trim
  |> string.lowercase
  |> string.to_graphemes
  |> list.filter_map(fn(c) {
    case string.trim(c) == "" || c == "_" {
      True -> Ok("-")
      False ->
        case string.contains("abcdefghijklmnopqrstuvwxyz0123456789.-", c) {
          True -> Ok(c)
          False -> Error(Nil)
        }
    }
  })
  |> string.concat
  |> string.split("-")
  |> list.filter(fn(s) { s != "" })
  |> string.join("-")
}
