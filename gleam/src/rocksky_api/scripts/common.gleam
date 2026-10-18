//// Shared CLI startup. Importing a script never executes maintenance work.

import gleam/javascript/promise
import gleam/list
import gleam/string
import rocksky_api/atproto/identity
import rocksky_api/context.{type Context}
import rocksky_api/env
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/process
import rocksky_api/task.{type Task}
import rocksky_api/telemetry/metrics

pub fn run(work: fn(Context, List(String)) -> Task(a)) {
  process.set_dns_ipv4_first()
  use started <- promise.await(context.create(env.load(), metrics.new()))
  case started {
    Error(e) -> {
      log.error(error.describe(e))
      process.exit(1)
    }
    Ok(ctx) -> {
      use result <- promise.await(work(ctx, list.drop(process.argv(), 2)))
      case result {
        Ok(_) -> process.exit(0)
        Error(e) -> {
          log.error(error.describe(e))
          process.exit(1)
        }
      }
    }
  }
}

pub fn actor(ctx: Context, value: String) {
  case
    string.starts_with(value, "did:plc:")
    || string.starts_with(value, "did:web:")
  {
    True -> task.ok(value)
    False ->
      identity.resolve_handle(ctx.resolver, value)
      |> task.attempt_result
      |> task.require_task("Handle could not be resolved")
  }
}

pub fn each(items: List(a), work: fn(a) -> Task(b)) -> Task(Nil) {
  case items {
    [] -> task.ok(Nil)
    [item, ..rest] -> {
      use _ <- task.then(work(item))
      each(rest, work)
    }
  }
}

pub fn fold(items: List(a), initial: b, work: fn(a, b) -> Task(b)) -> Task(b) {
  case items {
    [] -> task.ok(initial)
    [item, ..rest] -> {
      use next <- task.then(work(item, initial))
      fold(rest, next, work)
    }
  }
}
