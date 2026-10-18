//// Query parameters for `$1, $2, …` placeholders.

import gleam/dynamic.{type Dynamic}
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/node/js
import rocksky_api/node/pg

pub type Param =
  Dynamic

pub fn string(s: String) -> Param {
  dynamic.string(s)
}

pub fn int(i: Int) -> Param {
  dynamic.int(i)
}

pub fn float(f: Float) -> Param {
  dynamic.float(f)
}

pub fn bool(b: Bool) -> Param {
  dynamic.bool(b)
}

pub fn null() -> Param {
  js.null()
}

pub fn strings(items: List(String)) -> Param {
  dynamic.array(list.map(items, dynamic.string))
}

pub fn ints(items: List(Int)) -> Param {
  dynamic.array(list.map(items, dynamic.int))
}

pub fn timestamp(t: Timestamp) -> Param {
  let #(s, ns) = timestamp.to_unix_seconds_and_nanoseconds(t)
  pg.date_from_ms(s * 1000 + ns / 1_000_000)
}

/// Serialised JSON for `jsonb` columns.
pub fn json(j: Json) -> Param {
  dynamic.string(json.to_string(j))
}

pub fn optional(o: Option(a), f: fn(a) -> Param) -> Param {
  case o {
    Some(v) -> f(v)
    None -> null()
  }
}

pub fn optional_string(o: Option(String)) -> Param {
  optional(o, string)
}

pub fn optional_int(o: Option(Int)) -> Param {
  optional(o, int)
}

pub fn optional_float(o: Option(Float)) -> Param {
  optional(o, float)
}

pub fn optional_bool(o: Option(Bool)) -> Param {
  optional(o, bool)
}

pub fn optional_timestamp(o: Option(Timestamp)) -> Param {
  optional(o, timestamp)
}

pub fn dynamic(d: Dynamic) -> Param {
  d
}
