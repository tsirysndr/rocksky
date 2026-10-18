import gleam/int
import gleam/io
import gleam/javascript/promise.{type Promise}
import rocksky_api/error
import rocksky_api/node/process
import rocksky_api/task.{type Task}

pub type Options {
  Options(help: Bool, dry_run: Bool, limit: Int, batch_size: Int)
}

pub type Counts {
  Counts(scanned: Int, matched: Int, updated: Int)
}

pub type Session

@external(javascript, "./repair_artist_pictures_ffi.mjs", "options")
fn options() -> Promise(Options)

@external(javascript, "./repair_artist_pictures_ffi.mjs", "help")
fn help() -> String

@external(javascript, "./repair_artist_pictures_ffi.mjs", "open")
fn open(opts: Options) -> Promise(Session)

@external(javascript, "./repair_artist_pictures_ffi.mjs", "close")
fn close(session: Session) -> Promise(Nil)

@external(javascript, "./repair_artist_pictures_ffi.mjs", "batch")
fn batch(session: Session, size: Int) -> Promise(Counts)

fn repair(opts: Options, session: Session, totals: Counts) -> Task(Nil) {
  let size = case opts.limit {
    0 -> opts.batch_size
    n -> int.min(opts.batch_size, n - totals.scanned)
  }
  case size <= 0 {
    True -> finished(opts, totals)
    False -> {
      use result <- task.then(batch(session, size) |> task.attempt)
      case result.scanned == 0 {
        True -> finished(opts, totals)
        False -> {
          let total =
            Counts(
              totals.scanned + result.scanned,
              totals.matched + result.matched,
              totals.updated + result.updated,
            )
          io.println(
            "Scanned "
            <> int.to_string(total.scanned)
            <> "; pictures found "
            <> int.to_string(total.matched)
            <> "; updated "
            <> int.to_string(total.updated),
          )
          repair(opts, session, total)
        }
      }
    }
  }
}

fn finished(opts: Options, total: Counts) -> Task(Nil) {
  let suffix = case opts.dry_run {
    True -> " Dry run: no writes."
    False -> ""
  }
  io.println(
    "Artist picture repair finished: "
    <> int.to_string(total.updated)
    <> " updated; "
    <> int.to_string(total.scanned - total.matched)
    <> " without a picture from Rocksky."
    <> suffix,
  )
  task.ok(Nil)
}

fn run(opts: Options) -> Task(Nil) {
  case opts.help {
    True -> {
      io.println(help())
      task.ok(Nil)
    }
    False -> {
      use session <- task.then(open(opts) |> task.attempt)
      use outcome <- promise.await(repair(opts, session, Counts(0, 0, 0)))
      use closed <- promise.await(close(session) |> task.attempt)
      task.from_result(case outcome {
        Error(_) -> outcome
        Ok(_) -> closed
      })
    }
  }
}

pub fn main() {
  use outcome <- promise.map(options() |> task.attempt |> task.then(run))
  case outcome {
    Ok(_) -> Nil
    Error(e) -> {
      io.println(error.to_string(e))
      process.exit(1)
    }
  }
}
