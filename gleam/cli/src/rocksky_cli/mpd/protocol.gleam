import gleam/int
import gleam/list
import gleam/string

pub const version = "0.23.5"

pub const greeting = "OK MPD 0.23.5\n"

pub fn ack(
  code: Int,
  position: Int,
  command: String,
  message: String,
) -> String {
  "ACK ["
  <> int.to_string(code)
  <> "@"
  <> int.to_string(position)
  <> "] {"
  <> command
  <> "} "
  <> message
  <> "\n"
}

pub fn kv(key: String, value: String) -> String {
  key
  <> ": "
  <> { value |> string.replace("\r\n", " ") |> string.replace("\n", " ") }
  <> "\n"
}

pub fn tokenize(line: String) -> List(String) {
  tokens(string.to_graphemes(line), [])
}

fn tokens(chars: List(String), acc: List(String)) -> List(String) {
  case chars {
    [] -> list.reverse(acc)
    [" ", ..rest] | ["\t", ..rest] -> tokens(rest, acc)
    ["\"", ..rest] -> {
      let #(word, rest) = quoted(rest, "")
      tokens(rest, [word, ..acc])
    }
    _ -> {
      let #(word, rest) = bare(chars, "")
      tokens(rest, [word, ..acc])
    }
  }
}

fn quoted(chars: List(String), acc: String) -> #(String, List(String)) {
  case chars {
    [] -> #(acc, [])
    ["\"", ..rest] -> #(acc, rest)
    ["\\", c, ..rest] -> quoted(rest, acc <> c)
    [c, ..rest] -> quoted(rest, acc <> c)
  }
}

fn bare(chars: List(String), acc: String) -> #(String, List(String)) {
  case chars {
    [] -> #(acc, [])
    [" ", ..rest] | ["\t", ..rest] -> #(acc, rest)
    [c, ..rest] -> bare(rest, acc <> c)
  }
}
