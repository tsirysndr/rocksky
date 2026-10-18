//// Binding to `better-sqlite3` (synchronous).

import gleam/dynamic.{type Dynamic}
import rocksky_api/node/js.{type Exception}

pub type Database

@external(javascript, "./sqlite_ffi.mjs", "open")
pub fn open(location: String) -> Database

@external(javascript, "./sqlite_ffi.mjs", "pragma")
pub fn pragma(db: Database, statement: String) -> Nil

@external(javascript, "./sqlite_ffi.mjs", "exec")
pub fn exec(db: Database, sql: String) -> Result(Nil, Exception)

/// INSERT/UPDATE/DELETE; returns the number of changed rows.
@external(javascript, "./sqlite_ffi.mjs", "run")
pub fn run(
  db: Database,
  sql: String,
  params: List(Dynamic),
) -> Result(Int, Exception)

@external(javascript, "./sqlite_ffi.mjs", "all")
pub fn all(
  db: Database,
  sql: String,
  params: List(Dynamic),
) -> Result(List(Dynamic), Exception)

@external(javascript, "./sqlite_ffi.mjs", "close")
pub fn close(db: Database) -> Nil

/// `SQLITE_BUSY` and friends.
@external(javascript, "./sqlite_ffi.mjs", "isBusy")
pub fn is_busy(e: Exception) -> Bool
