import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

/// An XRPC query parameter pair (already stringified, ready to encode).
pub type QueryParam =
  #(String, String)

pub fn string_param(name: String, value: String) -> QueryParam {
  #(name, value)
}

pub fn int_param(name: String, value: Int) -> QueryParam {
  #(name, int.to_string(value))
}

pub fn bool_param(name: String, value: Bool) -> QueryParam {
  #(name, bool_to_string(value))
}

fn bool_to_string(value: Bool) -> String {
  case value {
    True -> "true"
    False -> "false"
  }
}

/// Append an optional string param to a params list when present.
pub fn maybe_string(
  params: List(QueryParam),
  name: String,
  value: Option(String),
) -> List(QueryParam) {
  case value {
    Some(v) -> [#(name, v), ..params]
    None -> params
  }
}

/// Append an optional integer param to a params list when present.
pub fn maybe_int(
  params: List(QueryParam),
  name: String,
  value: Option(Int),
) -> List(QueryParam) {
  case value {
    Some(v) -> [#(name, int.to_string(v)), ..params]
    None -> params
  }
}

/// Append an optional boolean param to a params list when present.
pub fn maybe_bool(
  params: List(QueryParam),
  name: String,
  value: Option(Bool),
) -> List(QueryParam) {
  case value {
    Some(v) -> [#(name, bool_to_string(v)), ..params]
    None -> params
  }
}

/// Repeat a list-valued parameter once per value (XRPC convention for arrays).
pub fn repeated_string(
  params: List(QueryParam),
  name: String,
  values: List(String),
) -> List(QueryParam) {
  list.fold(values, params, fn(acc, v) { [#(name, v), ..acc] })
}

/// Render params as a `?a=1&b=2` query string. Returns "" if the list is empty.
/// Values are percent-encoded.
pub fn encode(params: List(QueryParam)) -> String {
  case params {
    [] -> ""
    _ -> {
      let pairs =
        params
        |> list.reverse
        |> list.map(fn(p) {
          let #(k, v) = p
          percent_encode(k) <> "=" <> percent_encode(v)
        })
      "?" <> string.join(pairs, "&")
    }
  }
}

/// Conservative percent-encoder for query string components.
/// Only unreserved characters per RFC 3986 are left as-is; everything else
/// is encoded to %XX (UTF-8 byte-wise).
pub fn percent_encode(input: String) -> String {
  input
  |> string.to_utf_codepoints
  |> list.map(encode_codepoint)
  |> string.concat
}

fn encode_codepoint(cp: UtfCodepoint) -> String {
  let code = string.utf_codepoint_to_int(cp)
  case is_unreserved(code) {
    True -> codepoint_to_string(cp)
    False -> encode_to_bytes(code)
  }
}

fn codepoint_to_string(cp: UtfCodepoint) -> String {
  string.from_utf_codepoints([cp])
}

fn is_unreserved(code: Int) -> Bool {
  // A-Z a-z 0-9 - . _ ~
  { code >= 0x41 && code <= 0x5A }
  || { code >= 0x61 && code <= 0x7A }
  || { code >= 0x30 && code <= 0x39 }
  || code == 0x2D
  || code == 0x2E
  || code == 0x5F
  || code == 0x7E
}

fn encode_to_bytes(code: Int) -> String {
  case code {
    c if c < 0x80 -> hex_byte(c)
    c if c < 0x800 -> {
      let b1 = 0xC0 + c / 64
      let b2 = 0x80 + c % 64
      hex_byte(b1) <> hex_byte(b2)
    }
    c if c < 0x10_000 -> {
      let b1 = 0xE0 + c / 4096
      let b2 = 0x80 + { c / 64 } % 64
      let b3 = 0x80 + c % 64
      hex_byte(b1) <> hex_byte(b2) <> hex_byte(b3)
    }
    c -> {
      let b1 = 0xF0 + c / 262_144
      let b2 = 0x80 + { c / 4096 } % 64
      let b3 = 0x80 + { c / 64 } % 64
      let b4 = 0x80 + c % 64
      hex_byte(b1) <> hex_byte(b2) <> hex_byte(b3) <> hex_byte(b4)
    }
  }
}

fn hex_byte(byte: Int) -> String {
  "%" <> hex_nibble(byte / 16) <> hex_nibble(byte % 16)
}

fn hex_nibble(n: Int) -> String {
  case n {
    0 -> "0"
    1 -> "1"
    2 -> "2"
    3 -> "3"
    4 -> "4"
    5 -> "5"
    6 -> "6"
    7 -> "7"
    8 -> "8"
    9 -> "9"
    10 -> "A"
    11 -> "B"
    12 -> "C"
    13 -> "D"
    14 -> "E"
    _ -> "F"
  }
}
