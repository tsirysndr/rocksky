//// A SQLite key/value store (the former unstorage driver), plus the
//// process-local map the OAuth login flow uses for one-shot tokens.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None}
import gleam/result
import rocksky_api/error.{type Error}
import rocksky_api/node/js
import rocksky_api/node/sqlite.{type Database}

pub type Kv {
  Kv(db: Database, table: String)
}

pub fn open(location: String) -> Result(Kv, Error) {
  let db = sqlite.open(location)
  sqlite.pragma(db, "journal_mode = WAL")
  use _ <- result.try(
    sqlite.exec(
      db,
      "CREATE TABLE IF NOT EXISTS kv (id text PRIMARY KEY, value text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)",
    )
    |> error.map_js,
  )
  Ok(Kv(db, "kv"))
}

pub fn get(kv: Kv, key: String) -> Result(Option(String), Error) {
  use rows <- result.map(
    sqlite.all(kv.db, "SELECT value FROM " <> kv.table <> " WHERE id = ?", [
      dynamic.string(key),
    ])
    |> error.map_js,
  )
  case rows {
    [row, ..] ->
      decode.run(row, decode.at(["value"], decode.string)) |> option.from_result
    [] -> None
  }
}

pub fn has(kv: Kv, key: String) -> Result(Bool, Error) {
  use v <- result.map(get(kv, key))
  option.is_some(v)
}

pub fn set(kv: Kv, key: String, value: String) -> Result(Nil, Error) {
  let now = js.date_to_iso(dynamic.int(js.now_ms()))
  sqlite.run(
    kv.db,
    "INSERT INTO "
      <> kv.table
      <> " (id, value, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [
      dynamic.string(key),
      dynamic.string(value),
      dynamic.string(now),
      dynamic.string(now),
    ],
  )
  |> error.map_js
  |> result.replace(Nil)
}

pub fn remove(kv: Kv, key: String) -> Result(Nil, Error) {
  sqlite.run(kv.db, "DELETE FROM " <> kv.table <> " WHERE id = ?", [
    dynamic.string(key),
  ])
  |> error.map_js
  |> result.replace(Nil)
}

pub fn keys(kv: Kv, prefix: String) -> Result(List(String), Error) {
  use rows <- result.map(
    sqlite.all(kv.db, "SELECT id FROM " <> kv.table <> " WHERE id LIKE ?", [
      dynamic.string(prefix <> "%"),
    ])
    |> error.map_js,
  )
  list.filter_map(rows, fn(row) {
    decode.run(row, decode.at(["id"], decode.string))
  })
}

pub fn clear(kv: Kv, prefix: String) -> Result(Nil, Error) {
  sqlite.run(kv.db, "DELETE FROM " <> kv.table <> " WHERE id LIKE ?", [
    dynamic.string(prefix <> "%"),
  ])
  |> error.map_js
  |> result.replace(Nil)
}

/// Mutable in-process `Map<string, string>`.
pub type Memory

@external(javascript, "./kv_ffi.mjs", "newMemory")
pub fn new_memory() -> Memory

@external(javascript, "./kv_ffi.mjs", "memoryGet")
pub fn memory_get(m: Memory, key: String) -> Option(String)

@external(javascript, "./kv_ffi.mjs", "memorySet")
pub fn memory_set(m: Memory, key: String, value: String) -> Nil

@external(javascript, "./kv_ffi.mjs", "memoryDelete")
pub fn memory_delete(m: Memory, key: String) -> Nil

pub fn to_dict(entries: List(#(String, Dynamic))) -> Dict(String, Dynamic) {
  dict.from_list(entries)
}
