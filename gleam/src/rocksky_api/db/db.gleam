//// Typed SQL over the `pg` pools: primary, replica, and their cancel pools.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode.{type Decoder}
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/db/retry
import rocksky_api/env.{type Env}
import rocksky_api/error.{type Error}
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/pg.{type Pool}
import rocksky_api/node/process
import rocksky_api/task.{type Task}

pub type Db {
  Db(pool: Pool, cancel: Pool, label: String)
}

pub type Pools {
  Pools(primary: Db, replica: Db, is_split: Bool)
}

fn application_name(env: Env) -> String {
  case env.pg_app_name {
    "" -> {
      let entry = case list.drop(process.argv(), 1) {
        [path, ..] -> basename(path)
        _ -> "unknown"
      }
      "rocksky-api:" <> entry
    }
    name -> name
  }
}

@external(javascript, "./db_ffi.mjs", "basename")
fn basename(path: String) -> String

pub fn open(env: Env) -> Pools {
  let write_url = env.write_url(env)
  let read_url = env.read_url(env)
  let is_split = read_url != write_url
  let app = application_name(env)
  let config = fn(url, name) {
    pg.PoolConfig(
      connection_string: url,
      max: env.pg_max_connections,
      idle_timeout_ms: 30_000,
      connection_timeout_ms: 5000,
      application_name: name,
      statement_timeout_ms: Some(env.pg_statement_timeout),
      idle_in_transaction_timeout_ms: Some(30_000),
    )
  }
  let cancel_config = fn(url, name) {
    pg.PoolConfig(
      connection_string: url,
      max: 2,
      idle_timeout_ms: 10_000,
      connection_timeout_ms: 2000,
      application_name: name,
      statement_timeout_ms: Some(5000),
      idle_in_transaction_timeout_ms: None,
    )
  }
  let primary_pool = pg.new_pool(config(write_url, app <> ":primary"))
  pg.watch(primary_pool, "primary", log.error)
  let primary_cancel =
    pg.new_pool(cancel_config(write_url, app <> ":cancel:primary"))
  pg.watch(primary_cancel, "primary cancel", log.error)
  let primary = Db(primary_pool, primary_cancel, "primary")
  let replica = case is_split {
    False -> primary
    True -> {
      let pool = pg.new_pool(config(read_url, app <> ":replica"))
      pg.watch(pool, "replica", log.error)
      let cancel =
        pg.new_pool(cancel_config(read_url, app <> ":cancel:replica"))
      pg.watch(cancel, "replica cancel", log.error)
      Db(pool, cancel, "replica")
    }
  }
  Pools(primary:, replica:, is_split:)
}

/// Fails unless the primary can actually write.
pub fn ensure_writable(db: Db) -> Task(Nil) {
  use row <- task.then(
    one(
      db,
      "select pg_is_in_recovery() as in_recovery, current_setting('transaction_read_only') as read_only",
      [],
      {
        use in_recovery <- decode.field("in_recovery", decode.bool)
        use read_only <- decode.field("read_only", decode.string)
        decode.success(#(in_recovery, read_only))
      },
    ),
  )
  case row {
    Some(#(True, _)) | Some(#(_, "on")) ->
      task.fail(error.Message(
        "The write endpoint is read-only. Point XATA_WRITE_POSTGRES_URL at the primary — XATA_POSTGRES_URL is currently a replica and cannot accept writes.",
      ))
    _ -> task.ok(Nil)
  }
}

/// Raw rows.
pub fn query(
  db: Db,
  sql: String,
  params: List(Dynamic),
) -> Task(List(Dynamic)) {
  use result <- task.map(task.attempt_result(pg.query(db.pool, sql, params)))
  result.rows
}

/// Rows decoded with `decoder`.
pub fn all(
  db: Db,
  sql: String,
  params: List(Dynamic),
  decoder: Decoder(a),
) -> Task(List(a)) {
  use rows <- task.try_map(query(db, sql, params))
  decode_rows(rows, decoder, sql)
}

/// The first row, if any.
pub fn one(
  db: Db,
  sql: String,
  params: List(Dynamic),
  decoder: Decoder(a),
) -> Task(Option(a)) {
  use rows <- task.map(all(db, sql, params, decoder))
  list.first(rows) |> option.from_result
}

/// The first row, or `NotFound`.
pub fn required(
  db: Db,
  sql: String,
  params: List(Dynamic),
  decoder: Decoder(a),
  not_found: String,
) -> Task(a) {
  task.require_task(one(db, sql, params, decoder), not_found)
}

/// Statements without a result set; returns the affected row count.
pub fn execute(db: Db, sql: String, params: List(Dynamic)) -> Task(Int) {
  use result <- task.map(task.attempt_result(pg.query(db.pool, sql, params)))
  result.row_count
}

/// A single scalar from the first column of the first row.
pub fn scalar(
  db: Db,
  sql: String,
  params: List(Dynamic),
  decoder: Decoder(a),
) -> Task(Option(a)) {
  use rows <- task.try_map(query(db, sql, params))
  case rows {
    [] -> Ok(None)
    [row, ..] ->
      case js.entries(row) {
        [#(_, value), ..] ->
          decode.run(value, decoder)
          |> error.decode("scalar: " <> head(sql), _)
          |> option_wrap
        [] -> Ok(None)
      }
  }
}

fn option_wrap(r: Result(a, Error)) -> Result(Option(a), Error) {
  case r {
    Ok(v) -> Ok(Some(v))
    Error(e) -> Error(e)
  }
}

pub fn count(db: Db, sql: String, params: List(Dynamic)) -> Task(Int) {
  use n <- task.map(scalar(db, sql, params, lenient_int()))
  option.unwrap(n, 0)
}

fn lenient_int() -> Decoder(Int) {
  decode.one_of(decode.int, [
    decode.string
    |> decode.then(fn(s) {
      case int.parse(s) {
        Ok(i) -> decode.success(i)
        Error(_) -> decode.failure(0, "Int")
      }
    }),
  ])
}

pub fn decode_rows(
  rows: List(Dynamic),
  decoder: Decoder(a),
  context: String,
) -> Result(List(a), Error) {
  list.try_map(rows, fn(row) { decode.run(row, decoder) })
  |> error.decode("row decode (" <> head(context) <> ")", _)
}

fn head(sql: String) -> String {
  sql |> string.replace("\n", " ") |> string.slice(0, 80)
}

/// A query with its own pooled client, cancelled server-side when `ms`
/// elapses so the backend does not keep running after the handler gave up.
pub fn query_with_timeout(
  db: Db,
  label: String,
  ms: Int,
  run: fn(Db) -> Task(a),
) -> Task(a) {
  use client <- task.then(task.attempt_result(pg.connect(db.pool)))
  let scoped = Db(..db, pool: client_pool(client))
  let work = run(scoped)
  use result <- promise.await(task.timeout(work, ms, label))
  case result {
    Error(error.Timeout(_)) -> {
      case pg.process_id(client) {
        Some(pid) -> cancel_backend(db.cancel, pid)
        None -> Nil
      }
      // The client may still be draining the killed statement.
      promise.tap(work, fn(_) { pg.release(client, True) })
      promise.resolve(result)
    }
    _ -> {
      pg.release(client, False)
      promise.resolve(result)
    }
  }
}

fn cancel_backend(canceller: Pool, pid: Int) -> Nil {
  task.background(
    task.attempt_result(
      pg.query(canceller, "SELECT pg_cancel_backend($1)", [dynamic.int(pid)]),
    ),
    fn(e) {
      log.warn(
        "Failed to cancel pg backend "
        <> int.to_string(pid)
        <> ": "
        <> error.to_string(e),
      )
    },
  )
}

@external(javascript, "./db_ffi.mjs", "clientAsPool")
fn client_pool(client: pg.Client) -> Pool

/// Retries transient connection failures with backoff, at most twice.
pub fn with_transient_retry(run: fn() -> Task(a)) -> Task(a) {
  task.retry(run, 2, 100, retry.is_transient)
}

/// Runs `body` inside a transaction on a dedicated client.
pub fn transaction(db: Db, body: fn(Db) -> Task(a)) -> Task(a) {
  use client <- task.then(task.attempt_result(pg.connect(db.pool)))
  let scoped = Db(..db, pool: client_pool(client))
  use begun <- promise.await(execute(scoped, "BEGIN", []))
  case begun {
    Error(e) -> {
      pg.release(client, True)
      task.fail(e)
    }
    Ok(_) -> {
      use result <- promise.await(body(scoped))
      case result {
        Ok(v) -> {
          use commit <- promise.await(execute(scoped, "COMMIT", []))
          case commit {
            Ok(_) -> {
              pg.release(client, False)
              task.ok(v)
            }
            Error(e) -> {
              pg.release(client, True)
              task.fail(e)
            }
          }
        }
        Error(e) -> {
          use rolled_back <- promise.await(execute(scoped, "ROLLBACK", []))
          pg.release(client, case rolled_back {
            Ok(_) -> False
            Error(_) -> True
          })
          task.fail(e)
        }
      }
    }
  }
}

/// `$1, $2, …` placeholders for `IN (...)` lists, starting at `from`.
pub fn placeholders(count: Int, from: Int) -> String {
  list.repeat(Nil, count)
  |> list.index_map(fn(_, i) { "$" <> int.to_string(from + i) })
  |> string.join(", ")
}
