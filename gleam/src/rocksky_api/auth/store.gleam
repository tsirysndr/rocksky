//// OAuth state and session rows, plus app-password sessions under
//// `atp:<did>`: in `atproto.sqlite`, or in Postgres when `AUTH_DATABASE_URL`
//// is set so processes on more than one host can share them.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/oauth
import rocksky_api/db/retry
import rocksky_api/error.{type Error}
import rocksky_api/log
import rocksky_api/node/js.{type Exception}
import rocksky_api/node/pg
import rocksky_api/node/sqlite.{type Database}
import rocksky_api/task.{type Task}

pub type Store {
  Sqlite(db: Database)
  Postgres(pool: pg.Pool)
}

pub type Session {
  Session(key: String, session: String, expires_at: Option(String))
}

/// Opens the database in WAL mode and applies the migrations.
pub fn open(location: String) -> Result(Store, Error) {
  let db = sqlite.open(location)
  sqlite.pragma(db, "journal_mode = WAL")
  sqlite.pragma(db, "busy_timeout = 5000")
  sqlite.pragma(db, "synchronous = NORMAL")
  use _ <- result.try(migrate(db))
  Ok(Sqlite(db))
}

/// A dedicated pool, so exhaustion of the main pool cannot fail a session
/// read or write.
pub fn open_postgres(url: String) -> Task(Store) {
  let pool =
    pg.new_pool(pg.PoolConfig(
      connection_string: url,
      max: 4,
      idle_timeout_ms: 30_000,
      connection_timeout_ms: 5000,
      application_name: "rocksky-auth-store",
      statement_timeout_ms: Some(10_000),
      idle_in_transaction_timeout_ms: None,
    ))
  pg.watch(pool, "auth store", log.warn)
  use _ <- task.map(
    pg.query(pool, postgres_schema, []) |> task.attempt_result,
  )
  Postgres(pool)
}

/// Same tables and columns as `atproto.sqlite`, in their own schema, so the
/// Kysely queries in apps/api run unchanged against either.
const postgres_schema = "
CREATE SCHEMA IF NOT EXISTS atproto_auth;
CREATE TABLE IF NOT EXISTS atproto_auth.auth_session (key text PRIMARY KEY, session text NOT NULL, \"expiresAt\" text);
CREATE TABLE IF NOT EXISTS atproto_auth.auth_state (key text PRIMARY KEY, state text NOT NULL);
"

fn migrate(db: Database) -> Result(Nil, Error) {
  use _ <- result.try(
    sqlite.exec(
      db,
      "CREATE TABLE IF NOT EXISTS kysely_migration (name varchar(255) PRIMARY KEY, timestamp varchar(255) NOT NULL);
       CREATE TABLE IF NOT EXISTS kysely_migration_lock (id varchar(255) PRIMARY KEY, is_locked integer NOT NULL DEFAULT 0);",
    )
    |> error.map_js,
  )
  use applied <- result.try(
    sqlite.all(db, "SELECT name FROM kysely_migration", [])
    |> error.map_js,
  )
  let applied =
    list.filter_map(applied, fn(row) {
      decode.run(row, decode.at(["name"], decode.string))
    })
  use _ <- result.try(apply(db, applied, "001", migration_001))
  apply(db, applied, "002", migration_002)
}

const migration_001 =
  "
CREATE TABLE IF NOT EXISTS status (uri varchar PRIMARY KEY, authorDid varchar NOT NULL, status varchar NOT NULL, createdAt varchar NOT NULL, indexedAt varchar NOT NULL);
CREATE TABLE IF NOT EXISTS auth_session (key varchar PRIMARY KEY, session varchar NOT NULL);
CREATE TABLE IF NOT EXISTS auth_state (key varchar PRIMARY KEY, state varchar NOT NULL);
"

const migration_002 =
  "ALTER TABLE auth_session ADD COLUMN expiresAt text DEFAULT NULL;"

fn apply(
  db: Database,
  applied: List(String),
  name: String,
  sql: String,
) -> Result(Nil, Error) {
  case list.contains(applied, name) {
    True -> Ok(Nil)
    False -> {
      use _ <- result.try(sqlite.exec(db, sql) |> error.map_js)
      sqlite.run(
        db,
        "INSERT INTO kysely_migration (name, timestamp) VALUES (?, ?)",
        [
          dynamic.string(name),
          dynamic.string(js.date_to_iso(dynamic.int(js.now_ms()))),
        ],
      )
      |> error.map_js
      |> result.replace(Nil)
    }
  }
}

const busy_delays = [10, 25, 50, 100, 250]

const connection_delays = [50, 100, 250, 500, 1000, 2000]

/// Retries while SQLite reports the file as locked, or while Postgres cannot
/// be reached. A transient failure must never reach the OAuth SDK: it treats
/// a failed read as a deleted session and a failed write as a reason to
/// revoke the refresh token.
fn retry_sqlite(
  label: String,
  op: fn() -> Result(a, Exception),
  delays: List(Int),
) -> Promise(Result(a, Exception)) {
  case op() {
    Ok(v) -> promise.resolve(Ok(v))
    Error(e) ->
      case sqlite.is_busy(e), delays {
        True, [delay, ..rest] -> {
          use _ <- promise.await(promise.wait(delay))
          retry_sqlite(label, op, rest)
        }
        True, [] -> {
          log.error_exception(
            "auth store " <> label <> " still locked after retries",
            e,
          )
          promise.resolve(Error(e))
        }
        False, _ -> promise.resolve(Error(e))
      }
  }
}

fn retry_postgres(
  label: String,
  pool: pg.Pool,
  sql: String,
  params: List(Dynamic),
  delays: List(Int),
) -> Promise(Result(pg.QueryResult, Exception)) {
  use r <- promise.await(pg.query(pool, sql, params))
  case r {
    Ok(v) -> promise.resolve(Ok(v))
    Error(e) ->
      case retry.is_connection_error(error.Js(e)), delays {
        True, [delay, ..rest] -> {
          use _ <- promise.await(promise.wait(delay))
          retry_postgres(label, pool, sql, params, rest)
        }
        True, [] -> {
          log.error_exception(
            "auth store " <> label <> " unreachable after retries",
            e,
          )
          promise.resolve(Error(e))
        }
        False, _ -> promise.resolve(Error(e))
      }
  }
}

fn rows(
  store: Store,
  label: String,
  sqlite_sql: String,
  postgres_sql: String,
  params: List(Dynamic),
) -> Promise(Result(List(Dynamic), Exception)) {
  case store {
    Sqlite(db) ->
      retry_sqlite(label, fn() { sqlite.all(db, sqlite_sql, params) }, busy_delays)
    Postgres(pool) ->
      retry_postgres(label, pool, postgres_sql, params, connection_delays)
      |> promise.map(result.map(_, fn(r) { r.rows }))
  }
}

fn write(
  store: Store,
  label: String,
  sqlite_sql: String,
  postgres_sql: String,
  params: List(Dynamic),
) -> Promise(Result(Nil, Exception)) {
  case store {
    Sqlite(db) ->
      retry_sqlite(
        label,
        fn() { sqlite.run(db, sqlite_sql, params) |> result.replace(Nil) },
        busy_delays,
      )
    Postgres(pool) ->
      retry_postgres(label, pool, postgres_sql, params, connection_delays)
      |> promise.map(result.replace(_, Nil))
  }
}

fn one_string(
  rows: Result(List(Dynamic), Exception),
  column: String,
) -> Result(Option(String), Exception) {
  use rows <- result.map(rows)
  case rows {
    [row, ..] ->
      decode.run(row, decode.at([column], decode.string)) |> option.from_result
    [] -> None
  }
}

pub fn state_store(store: Store) -> oauth.Store {
  oauth.Store(
    get: fn(key) {
      rows(
        store,
        "state.get",
        "SELECT state FROM auth_state WHERE key = ?",
        "SELECT state FROM atproto_auth.auth_state WHERE key = $1",
        [dynamic.string(key)],
      )
      |> promise.map(one_string(_, "state"))
    },
    set: fn(key, state, _) {
      write(
        store,
        "state.set",
        "INSERT INTO auth_state (key, state) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET state = excluded.state",
        "INSERT INTO atproto_auth.auth_state (key, state) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET state = excluded.state",
        [dynamic.string(key), dynamic.string(state)],
      )
    },
    del: fn(key) {
      write(
        store,
        "state.del",
        "DELETE FROM auth_state WHERE key = ?",
        "DELETE FROM atproto_auth.auth_state WHERE key = $1",
        [dynamic.string(key)],
      )
    },
  )
}

pub fn session_store(store: Store) -> oauth.Store {
  oauth.Store(
    get: fn(key) { read_session(store, key) },
    set: fn(key, session, expires_at) {
      write(
        store,
        "session.set",
        "INSERT INTO auth_session (key, session, expiresAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET session = excluded.session, expiresAt = excluded.expiresAt",
        "INSERT INTO atproto_auth.auth_session (key, session, \"expiresAt\") VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET session = excluded.session, \"expiresAt\" = excluded.\"expiresAt\"",
        [dynamic.string(key), dynamic.string(session), optional(expires_at)],
      )
    },
    del: fn(key) {
      write(
        store,
        "session.del",
        "DELETE FROM auth_session WHERE key = ?",
        "DELETE FROM atproto_auth.auth_session WHERE key = $1",
        [dynamic.string(key)],
      )
    },
  )
}

fn read_session(
  store: Store,
  key: String,
) -> Promise(Result(Option(String), Exception)) {
  rows(
    store,
    "session.get",
    "SELECT session FROM auth_session WHERE key = ?",
    "SELECT session FROM atproto_auth.auth_session WHERE key = $1",
    [dynamic.string(key)],
  )
  |> promise.map(one_string(_, "session"))
}

fn optional(o: Option(String)) -> Dynamic {
  case o {
    Some(s) -> dynamic.string(s)
    None -> js.null()
  }
}

/// The stored app-password session JSON for `atp:<did>`, if any.
pub fn get_session(store: Store, key: String) -> Task(Option(String)) {
  read_session(store, key) |> task.attempt_result
}

pub fn put_session(store: Store, key: String, session: String) -> Task(Nil) {
  session_store(store).set(key, session, None) |> task.attempt_result
}

pub fn delete_session(store: Store, key: String) -> Task(Nil) {
  session_store(store).del(key) |> task.attempt_result
}

pub fn all_sessions(store: Store) -> Task(List(Session)) {
  use rows <- task.then(
    rows(
      store,
      "session.all",
      "SELECT key, session, expiresAt FROM auth_session",
      "SELECT key, session, \"expiresAt\" FROM atproto_auth.auth_session",
      [],
    )
    |> task.attempt_result,
  )
  list.try_map(rows, fn(row) {
    decode.run(row, {
      use key <- decode.field("key", decode.string)
      use session <- decode.field("session", decode.string)
      use expires_at <- decode.field(
        "expiresAt",
        decode.optional(decode.string),
      )
      decode.success(Session(key, session, expires_at))
    })
  })
  |> error.decode("auth_session rows", _)
  |> task.from_result
}

pub fn update_expires_at(
  store: Store,
  key: String,
  expires_at: Option(String),
) -> Task(Nil) {
  write(
    store,
    "session.expiry",
    "UPDATE auth_session SET expiresAt = ? WHERE key = ?",
    "UPDATE atproto_auth.auth_session SET \"expiresAt\" = $1 WHERE key = $2",
    [optional(expires_at), dynamic.string(key)],
  )
  |> task.attempt_result
}
