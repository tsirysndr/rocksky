//// Keep the logical PDS URL intact for DPoP and metadata validation; only
//// rewrite the physical fetch destination.

import gleam/dict
import gleam/list
import gleam/option.{None}
import gleam/result
import gleam/string
import rocksky_api/log
import rocksky_api/node/web_url

pub fn parse_overrides(raw: String) -> List(#(String, String)) {
  raw
  |> string.split(",")
  |> list.filter_map(fn(entry) {
    let trimmed = string.trim(entry)
    case
      string.split(trimmed, "=")
      |> list.map(fn(s) { string.trim(s) |> string.lowercase })
    {
      [from, to, ..] if from != "" && to != "" -> Ok(#(from, to))
      [""] -> Error(Nil)
      _ -> {
        log.warn(
          "Ignoring malformed PDS_HOST_OVERRIDES entry: \"" <> trimmed <> "\"",
        )
        Error(Nil)
      }
    }
  })
  |> dict.from_list
  |> dict.to_list
}

pub fn destination(pairs: List(#(String, String)), target: String) {
  case list.any(pairs, fn(pair) { string.contains(target, pair.0) }) {
    False -> None
    True ->
      {
        use url <- result.try(
          web_url.parse(target) |> result.replace_error(Nil),
        )
        use host <- result.try(
          dict.get(dict.from_list(pairs), string.lowercase(web_url.host(url)))
          |> result.replace_error(Nil),
        )
        web_url.set_host(url, host)
        web_url.set_port(url, "")
        Ok(web_url.href(url))
      }
      |> option.from_result
  }
}
