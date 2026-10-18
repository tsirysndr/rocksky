//// Applies the Drizzle migrations in `drizzle/` and records them in
//// `drizzle.__drizzle_migrations`, compatible with `drizzle-kit migrate`.

import filepath
import gleam/dynamic
import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/option.{None}
import gleam/result
import gleam/string
import rocksky_api/db/db
import rocksky_api/env
import rocksky_api/error.{type Error}
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/pg
import rocksky_api/node/process
import rocksky_api/task.{type Task}
import simplifile

type Entry {
  Entry(idx: Int, when: Int, tag: String)
}

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

pub fn run(database: db.Db, dir: String) -> Task(Int) {
  use entries <- task.then(task.from_result(journal(dir)))
  use _ <- task.then(
    db.execute(database, "CREATE SCHEMA IF NOT EXISTS drizzle", []),
  )
  use _ <- task.then(
    db.execute(
      database,
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
      [],
    ),
  )
  use last <- task.then(db.scalar(
    database,
    "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    [],
    decode.one_of(decode.int, [
      decode.string |> decode.map(fn(s) { result.unwrap(int.parse(s), 0) }),
    ]),
  ))
  let last = option.unwrap(last, 0)
  let pending = list.filter(entries, fn(e) { e.when > last })
  use _ <- task.map(
    task.each(pending, fn(entry) { apply(database, dir, entry) }),
  )
  list.length(pending)
}

fn journal(dir: String) -> Result(List(Entry), Error) {
  use raw <- result.try(
    simplifile.read(filepath.join(dir, "meta/_journal.json"))
    |> result.map_error(fn(e) {
      error.Message("journal: " <> simplifile.describe_error(e))
    }),
  )
  use parsed <- result.try(
    parse_json(raw)
    |> result.map_error(fn(_) { error.Message("journal: invalid JSON") }),
  )
  decode.run(
    parsed,
    decode.at(
      ["entries"],
      decode.list({
        use idx <- decode.field("idx", decode.int)
        use when <- decode.field("when", decode.int)
        use tag <- decode.field("tag", decode.string)
        decode.success(Entry(idx:, when:, tag:))
      }),
    ),
  )
  |> error.decode("journal", _)
}

@external(javascript, "./migrate_ffi.mjs", "parseJson")
fn parse_json(s: String) -> Result(dynamic.Dynamic, Nil)

fn apply(database: db.Db, dir: String, entry: Entry) -> Task(Nil) {
  let path = filepath.join(dir, entry.tag <> ".sql")
  use sql <- task.then(task.from_result(
    simplifile.read(path)
    |> result.map_error(fn(e) {
      error.Message(path <> ": " <> simplifile.describe_error(e))
    }),
  ))
  log.info("Applying " <> entry.tag)
  let statements =
    sql
    |> string.split("--> statement-breakpoint")
    |> list.map(string.trim)
    |> list.filter(fn(s) { s != "" })
  db.transaction(database, fn(tx) {
    use _ <- task.then(
      task.each_(statements, fn(statement) { db.execute(tx, statement, []) }),
    )
    db.execute(
      tx,
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      [dynamic.string(crypto.sha256_hex(sql)), dynamic.int(entry.when)],
    )
    |> task.map(fn(_) { Nil })
  })
}
