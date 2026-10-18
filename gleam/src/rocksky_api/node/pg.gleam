//// Binding to `pg` (node-postgres): pools, clients and raw queries.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Pool

pub type Client

pub type PoolConfig {
  PoolConfig(
    connection_string: String,
    max: Int,
    idle_timeout_ms: Int,
    connection_timeout_ms: Int,
    application_name: String,
    statement_timeout_ms: Option(Int),
    idle_in_transaction_timeout_ms: Option(Int),
  )
}

pub type QueryResult {
  QueryResult(rows: List(Dynamic), row_count: Int)
}

@external(javascript, "./pg_ffi.mjs", "newPool")
pub fn new_pool(config: PoolConfig) -> Pool

/// Pool `error` plus per-connection `error` handlers.
@external(javascript, "./pg_ffi.mjs", "watch")
pub fn watch(pool: Pool, label: String, report: fn(String) -> Nil) -> Nil

@external(javascript, "./pg_ffi.mjs", "query")
pub fn query(
  pool: Pool,
  sql: String,
  params: List(Dynamic),
) -> Promise(Result(QueryResult, Exception))

@external(javascript, "./pg_ffi.mjs", "connect")
pub fn connect(pool: Pool) -> Promise(Result(Client, Exception))

@external(javascript, "./pg_ffi.mjs", "clientQuery")
pub fn client_query(
  client: Client,
  sql: String,
  params: List(Dynamic),
) -> Promise(Result(QueryResult, Exception))

/// `destroy` discards the connection instead of returning it to the pool.
@external(javascript, "./pg_ffi.mjs", "release")
pub fn release(client: Client, destroy: Bool) -> Nil

@external(javascript, "./pg_ffi.mjs", "processId")
pub fn process_id(client: Client) -> Option(Int)

@external(javascript, "./pg_ffi.mjs", "end")
pub fn end(pool: Pool) -> Promise(Nil)

/// A JS `Date` for a timestamp parameter, from unix milliseconds.
@external(javascript, "./pg_ffi.mjs", "dateFromMs")
pub fn date_from_ms(ms: Int) -> Dynamic

/// Unix milliseconds of a `Date`, ISO string or number; `None` otherwise.
@external(javascript, "./pg_ffi.mjs", "toMs")
pub fn to_ms(value: Dynamic) -> Option(Int)
