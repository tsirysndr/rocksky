import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

pub type Database

@external(javascript, "./database_ffi.mjs", "open")
pub fn open() -> Promise(Database)

@external(javascript, "./database_ffi.mjs", "query")
pub fn query(db: Database, sql: String, values: List(Dynamic)) -> List(Dynamic)

@external(javascript, "./database_ffi.mjs", "run")
pub fn run(db: Database, sql: String, values: List(Dynamic)) -> Nil

@external(javascript, "./database_ffi.mjs", "insert")
pub fn insert(
  db: Database,
  table: String,
  fields: List(#(String, Dynamic)),
  conflict: String,
) -> Dynamic

@external(javascript, "./database_ffi.mjs", "transaction")
pub fn transaction(db: Database, work: fn() -> Nil) -> Nil

@external(javascript, "./database_ffi.mjs", "close")
pub fn close(db: Database) -> Nil
