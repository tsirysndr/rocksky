import gleam/list
import gleam/string

pub fn parse(input: String) -> List(List(String)) {
  walk(string.to_graphemes(input), False, "", [], [])
}

fn walk(
  chars: List(String),
  quoted: Bool,
  field: String,
  row: List(String),
  rows: List(List(String)),
) -> List(List(String)) {
  case chars, quoted {
    [], _ ->
      case field != "" || row != [] {
        True -> list.reverse([list.reverse([field, ..row]), ..rows])
        False -> list.reverse(rows)
      }
    ["\"", "\"", ..rest], True -> walk(rest, True, field <> "\"", row, rows)
    ["\"", ..rest], True -> walk(rest, False, field, row, rows)
    [c, ..rest], True -> walk(rest, True, field <> c, row, rows)
    ["\"", ..rest], False -> walk(rest, True, field, row, rows)
    [",", ..rest], False -> walk(rest, False, "", [field, ..row], rows)
    ["\n", ..rest], False | ["\r\n", ..rest], False ->
      walk(rest, False, "", [], [list.reverse([field, ..row]), ..rows])
    ["\r", ..rest], False -> walk(rest, False, field, row, rows)
    [c, ..rest], False -> walk(rest, False, field <> c, row, rows)
  }
}
