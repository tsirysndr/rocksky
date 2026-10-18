//// Applies the Drizzle migrations in `drizzle/` and records them in
//// `drizzle.__drizzle_migrations` using the shared runner (including concurrent indexes).

import gleam/int
import gleam/javascript/promise
import gleam/option.{None}
import rocksky_api/db/db
import rocksky_api/env
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/pg
import rocksky_api/node/process
import rocksky_api/task.{type Task}

pub fn main() {
  let env = env.load()
  let pool =
    pg.new_pool(pg.PoolConfig(
      connection_string: env.write_url(env),
      max: 1,
      idle_timeout_ms: 10_000,
      connection_timeout_ms: 10_000,
      application_name: "rocksky-api:migrate",
      statement_timeout_ms: None,
      idle_in_transaction_timeout_ms: None,
    ))
  let database = db.Db(pool:, cancel: pool, label: "migrate")
  use outcome <- promise.await(run(database, "drizzle"))
  use _ <- promise.await(pg.end(pool))
  case outcome {
    Ok(n) -> {
      log.success(int.to_string(n) <> " migration(s) applied")
      promise.resolve(Nil)
    }
    Error(e) -> {
      log.error(error.describe(e))
      process.exit(1)
    }
  }
}

// Shared runner tracks individual hashes and supports concurrent index DDL.
@external(javascript, "./migrate_ffi.mjs", "runMigrations")
pub fn run(database: db.Db, dir: String) -> Task(Int)
