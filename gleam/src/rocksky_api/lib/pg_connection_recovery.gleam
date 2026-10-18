import gleam/int
import gleam/javascript/promise.{type Promise}
import rocksky_api/db/retry
import rocksky_api/node/pg
import rocksky_api/task.{type Task}

pub fn handle_pg_connection_errors(
  pool: pg.Pool,
  label: String,
  report: fn(String) -> Nil,
) {
  pg.watch(pool, label, report)
}

pub fn is_pg_connection_error(error) {
  retry.is_connection_error(error)
}

pub fn retry_pg_connection(work: fn() -> Task(a)) -> Task(a) {
  retry_with(work, 6, task.sleep, fn(_, _) { Nil })
}

pub fn retry_with(
  work: fn() -> Task(a),
  attempts: Int,
  sleep: fn(Int) -> Promise(Nil),
  on_retry: fn(Int, Int) -> Nil,
) {
  attempt(work, attempts, sleep, on_retry, 1, 1000)
}

fn attempt(
  work: fn() -> Task(a),
  attempts: Int,
  sleep: fn(Int) -> Promise(Nil),
  on_retry: fn(Int, Int) -> Nil,
  number: Int,
  delay: Int,
) {
  use outcome <- promise.await(work())
  case outcome {
    Ok(value) -> task.ok(value)
    Error(e) ->
      case number < attempts && retry.is_connection_error(e) {
        False -> task.fail(e)
        True -> {
          on_retry(number, delay)
          use _ <- promise.await(sleep(delay))
          attempt(
            work,
            attempts,
            sleep,
            on_retry,
            number + 1,
            int.min(delay * 2, 30_000),
          )
        }
      }
  }
}
