//// Drizzle SQL construction and execution bindings. Values are bound, never interpolated.

import gleam/javascript/promise.{type Promise}
import rocksky_feeds/types.{type Query, type Row, type Sql}

pub type Database

@external(javascript, "./drizzle_ffi.mjs", "raw")
pub fn raw(text: String) -> Sql

@external(javascript, "./drizzle_ffi.mjs", "text")
pub fn text(value: String) -> Sql

@external(javascript, "./drizzle_ffi.mjs", "integer")
pub fn integer(value: Int) -> Sql

@external(javascript, "./drizzle_ffi.mjs", "table")
pub fn table(name: String) -> Sql

@external(javascript, "./drizzle_ffi.mjs", "join")
pub fn join(parts: List(Sql)) -> Sql

@external(javascript, "./drizzle_ffi.mjs", "compile")
pub fn compile(statement: Sql) -> Query

@external(javascript, "./drizzle_ffi.mjs", "execute")
pub fn execute(
  database: Database,
  query: Query,
) -> Promise(Result(List(Row), String))
