//// Small shared helpers from the TypeScript `lib/index.ts` and `lib/credits.ts`.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/regexp
import gleam/string
import rocksky_api/node/js

pub const default_album_art =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"

pub fn with_fallback_album_art(url: Option(String)) -> String {
  case url {
    Some(u) -> u
    None -> default_album_art
  }
}

/// Lower-cased, without diacritics, with typographic punctuation flattened.
pub fn fold(value: String) -> String {
  normalize(value, "NFKD")
  |> replace_pattern("\\p{M}", "")
  |> replace_pattern("[‐-―−]", "-")
  |> replace_pattern("[‘’ʼ]", "'")
  |> replace_pattern("[“”]", "\"")
  |> replace_pattern("\\s+", " ")
  |> string.trim
  |> string.lowercase
}

@external(javascript, "./helpers_ffi.mjs", "normalize")
fn normalize(value: String, form: String) -> String

fn replace_pattern(value: String, pattern: String, replacement: String) {
  let assert Ok(regex) = regexp.from_string(pattern)
  regexp.replace(regex, value, replacement)
}

/// Does a track credit this artist? Containment in either direction on the
/// folded forms, never equality: neither string is canonical.
pub fn credits_artist(
  artist_name: Option(String),
  artist: Option(String),
  album_artist: Option(String),
) -> Bool {
  let name = fold(option.unwrap(artist_name, ""))
  case name {
    "" -> False
    _ ->
      list.any([artist, album_artist], fn(credited) {
        let other = fold(option.unwrap(credited, ""))
        other != ""
        && { string.contains(other, name) || string.contains(name, other) }
      })
  }
}

fn words(value: String) {
  let value =
    value
    |> replace_pattern("([a-z0-9])([A-Z])", "$1 $2")
    |> replace_pattern("([A-Z]+)([A-Z][a-z])", "$1 $2")
  let assert Ok(separator) = regexp.from_string("[^A-Za-z0-9]+")
  regexp.split(separator, value) |> list.filter(fn(word) { word != "" })
}

pub fn camel_case(value: String) -> String {
  case words(value) {
    [] -> ""
    [first, ..rest] ->
      string.lowercase(first)
      <> string.join(
        list.map(rest, fn(word) {
          string.uppercase(string.slice(word, 0, 1))
          <> string.lowercase(string.drop_start(word, 1))
        }),
        "",
      )
  }
}

pub fn snake_case(value: String) -> String {
  words(value) |> list.map(string.lowercase) |> string.join("_")
}

@external(javascript, "./helpers_ffi.mjs", "isObject")
fn is_object(value: Dynamic) -> Bool

@external(javascript, "./helpers_ffi.mjs", "array")
fn array(items: List(Dynamic)) -> Dynamic

fn deep(value: Dynamic, rename: fn(String) -> String) -> Dynamic {
  case decode.run(value, decode.list(decode.dynamic)) {
    Ok(items) -> array(list.map(items, fn(item) { deep(item, rename) }))
    Error(_) ->
      case is_object(value) {
        True ->
          js.entries(value)
          |> list.map(fn(pair) { #(rename(pair.0), deep(pair.1, rename)) })
          |> js.object
        False -> value
      }
  }
}

pub fn deep_snake_case_keys(value: a) -> a {
  js.coerce(deep(js.coerce(value), snake_case))
}

pub fn deep_camel_case_keys(value: a) -> a {
  js.coerce(deep(js.coerce(value), camel_case))
}

/// `’` → `'` so "Guns N’ Roses" and "Guns N' Roses" collapse together.
pub fn canonical_text(s: String) -> String {
  string.replace(string.trim(s), "’", "'")
}

/// `None` for empty or whitespace-only strings.
pub fn non_empty(s: Option(String)) -> Option(String) {
  case s {
    Some(v) ->
      case string.trim(v) {
        "" -> None
        t -> Some(t)
      }
    None -> None
  }
}

/// Positions in published records must be positive integers; zero means unknown.
pub fn record_position(value: Option(Int)) -> Int {
  case value {
    Some(v) if v >= 1 -> v
    _ -> 1
  }
}

pub fn or_else(o: Option(a), default: a) -> a {
  option.unwrap(o, default)
}
