//// Finite Jetstream v2 archive replay into the Rust indexer's durable inbox.

import gleam/int
import gleam/io
import gleam/javascript/promise.{type Promise}
import gleam/json
import gleam/list
import rocksky_api/error
import rocksky_api/node/crypto
import rocksky_api/node/process
import rocksky_api/task.{type Task}

pub type Options {
  Options(help: Bool, dry_run: Bool, batch_size: Int, limit: Int)
}

pub type Event {
  Event(
    seq: Int,
    did: String,
    collection: String,
    rkey: String,
    rev: String,
    payload: String,
  )
}

pub type Job {
  Job(
    id: String,
    request_hash: String,
    payload: String,
    collection: String,
    actor: String,
  )
}

pub type Session

@external(javascript, "./backfill_jetstream_v2_ffi.mjs", "options")
fn options() -> Promise(Options)

@external(javascript, "./backfill_jetstream_v2_ffi.mjs", "open")
fn open(options: Options) -> Promise(Session)

@external(javascript, "./backfill_jetstream_v2_ffi.mjs", "close")
fn close(session: Session) -> Promise(Nil)

@external(javascript, "./backfill_jetstream_v2_ffi.mjs", "next")
fn next(session: Session, size: Int) -> Promise(List(Event))

@external(javascript, "./backfill_jetstream_v2_ffi.mjs", "capture")
fn capture(session: Session, jobs: List(Job), cursor: Int) -> Promise(Int)

/// Match Queue::ingest_batch's identity, including live/archive deduplication.
pub fn job(event: Event) -> Job {
  let key =
    event.did
    <> "|"
    <> event.collection
    <> "|"
    <> event.rkey
    <> "|"
    <> event.rev
  let identity =
    json.array(["jetstream.commit.v1", key], json.string) |> json.to_string
  Job(
    crypto.sha256_hex(identity),
    crypto.sha256_hex(event.payload),
    event.payload,
    event.collection,
    event.did,
  )
}

/// Consume bounded batches; checkpoint only after a successful durable capture.
pub fn replay(
  session: Session,
  opts: Options,
  seen: Int,
  inserted: Int,
) -> Task(Nil) {
  case opts.limit > 0 && seen >= opts.limit {
    True -> finished(opts, seen, inserted)
    False -> {
      let size = case opts.limit > 0 {
        True -> int.min(opts.batch_size, opts.limit - seen)
        False -> opts.batch_size
      }
      use events <- task.then(next(session, size) |> task.attempt)
      case events {
        [] -> finished(opts, seen, inserted)
        _ -> {
          let assert Ok(last) = list.last(events)
          use count <- task.then(case opts.dry_run {
            True -> task.ok(0)
            False ->
              capture(session, list.map(events, job), last.seq) |> task.attempt
          })
          let total = seen + list.length(events)
          io.println(
            "Read "
            <> int.to_string(total)
            <> "; queued "
            <> int.to_string(inserted + count)
            <> "; sequence "
            <> int.to_string(last.seq),
          )
          replay(session, opts, total, inserted + count)
        }
      }
    }
  }
}

fn finished(opts: Options, seen: Int, inserted: Int) -> Task(Nil) {
  let suffix = case opts.dry_run {
    True -> " (dry-run; no database writes)."
    False ->
      "; "
      <> int.to_string(inserted)
      <> " new commits queued for the Jetstream indexer."
  }
  io.println("Finished: " <> int.to_string(seen) <> " commits read" <> suffix)
  task.ok(Nil)
}

fn run(opts: Options) -> Task(Nil) {
  case opts.help {
    True -> {
      io.println(
        "Usage: bun run backfill:jetstream-v2 [--service URL] [--cursor N | --after-seq N] [--before-seq N] [--batch-size N] [--limit N] [--dry-run]\n\nReplays app.rocksky.* commits from a finite Jetstream v2 archive snapshot.\nSet JETSTREAM_API_KEY for hosted archives and SUBMISSIONS_DATABASE_URL for the initialized Rust durable queue.\nSequences are host-specific, after is exclusive, before is inclusive. --cursor is an alias for --after-seq. Resume by rerunning without either.\nDry-run downloads/validates only; it does not open the database or save a checkpoint.",
      )
      task.ok(Nil)
    }
    False -> {
      use session <- task.then(open(opts) |> task.attempt)
      use outcome <- promise.await(replay(session, opts, 0, 0))
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
