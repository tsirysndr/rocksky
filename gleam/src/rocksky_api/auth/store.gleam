//// The shared `atproto.sqlite` database: OAuth state and session rows,
//// plus app-password sessions under `atp:<did>`.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/oauth
import rocksky_api/error.{type Error}
import rocksky_api/log
import rocksky_api/node/js.{type Exception}
import rocksky_api/node/sqlite.{type Database}
import rocksky_api/task.{type Task}

pub type Store {
  Store(db: Database)
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
  Ok(Store(db))
}

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

/// Retries while SQLite reports the file as locked. A transient lock must
/// never reach the OAuth SDK: it treats a failed read as a deleted session
/// and a failed write as a reason to revoke the refresh token.
fn retry_on_busy(
  label: String,
  op: fn() -> Result(a, Exception),
) -> Promise(Result(a, Exception)) {
  retry_loop(label, op, busy_delays)
}

fn retry_loop(
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
          retry_loop(label, op, rest)
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
      retry_on_busy("state.get", fn() {
        sqlite.all(store.db, "SELECT state FROM auth_state WHERE key = ?", [
          dynamic.string(key),
        ])
        |> one_string("state")
      })
    },
    set: fn(key, state, _) {
      retry_on_busy("state.set", fn() {
        sqlite.run(
          store.db,
          "INSERT INTO auth_state (key, state) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET state = excluded.state",
          [dynamic.string(key), dynamic.string(state)],
        )
        |> result.replace(Nil)
      })
    },
    del: fn(key) {
      retry_on_busy("state.del", fn() {
        sqlite.run(store.db, "DELETE FROM auth_state WHERE key = ?", [
          dynamic.string(key),
        ])
        |> result.replace(Nil)
      })
    },
  )
}

pub fn session_store(store: Store) -> oauth.Store {
  oauth.Store(
    get: fn(key) {
      retry_on_busy("session.get", fn() {
        sqlite.all(store.db, "SELECT session FROM auth_session WHERE key = ?", [
          dynamic.string(key),
        ])
        |> one_string("session")
      })
    },
    set: fn(key, session, expires_at) {
      retry_on_busy("session.set", fn() {
        sqlite.run(
          store.db,
          "INSERT INTO auth_session (key, session, expiresAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET session = excluded.session, expiresAt = excluded.expiresAt",
          [dynamic.string(key), dynamic.string(session), optional(expires_at)],
        )
        |> result.replace(Nil)
      })
    },
    del: fn(key) {
      retry_on_busy("session.del", fn() {
        sqlite.run(store.db, "DELETE FROM auth_session WHERE key = ?", [
          dynamic.string(key),
        ])
        |> result.replace(Nil)
      })
    },
  )
}

fn optional(o: Option(String)) -> Dynamic {
  case o {
    Some(s) -> dynamic.string(s)
    None -> js.null()
  }
}

/// The stored app-password session JSON for `atp:<did>`, if any.
pub fn get_session(store: Store, key: String) -> Task(Option(String)) {
  retry_on_busy("session.get", fn() {
    sqlite.all(store.db, "SELECT session FROM auth_session WHERE key = ?", [
      dynamic.string(key),
    ])
    |> one_string("session")
  })
  |> task.attempt_result
}

pub fn put_session(store: Store, key: String, session: String) -> Task(Nil) {
  session_store(store).set(key, session, None) |> task.attempt_result
}

pub fn delete_session(store: Store, key: String) -> Task(Nil) {
  session_store(store).del(key) |> task.attempt_result
}

pub fn all_sessions(store: Store) -> Task(List(Session)) {
  sqlite.all(store.db, "SELECT key, session, expiresAt FROM auth_session", [])
  |> error.map_js
  |> result.try(fn(rows) {
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
  })
  |> task.from_result
}

pub fn update_expires_at(
  store: Store,
  key: String,
  expires_at: Option(String),
) -> Task(Nil) {
  sqlite.run(store.db, "UPDATE auth_session SET expiresAt = ? WHERE key = ?", [
    optional(expires_at),
    dynamic.string(key),
  ])
  |> error.map_js
  |> result.replace(Nil)
  |> task.from_result
}
