//// Promise helpers replacing the Effect pipelines of the TypeScript API.

import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/error.{type Error}
import rocksky_api/node/js

pub type Task(a) =
  Promise(Result(a, Error))

pub fn ok(value: a) -> Task(a) {
  promise.resolve(Ok(value))
}

pub fn fail(error: Error) -> Task(a) {
  promise.resolve(Error(error))
}

pub fn from_result(r: Result(a, Error)) -> Task(a) {
  promise.resolve(r)
}

/// Wraps a promise from a binding, turning rejections into `error.Js`.
pub fn attempt(p: Promise(a)) -> Task(a) {
  promise.map(js.attempt(p), error.map_js)
}

/// Lifts a binding that already resolves to `Result(a, Exception)`.
pub fn attempt_result(p: Promise(Result(a, js.Exception))) -> Task(a) {
  promise.map(p, error.map_js)
}

pub fn then(t: Task(a), f: fn(a) -> Task(b)) -> Task(b) {
  promise.try_await(t, f)
}

pub fn map(t: Task(a), f: fn(a) -> b) -> Task(b) {
  promise.map(t, result.map(_, f))
}

pub fn map_error(t: Task(a), f: fn(Error) -> Error) -> Task(a) {
  promise.map(t, fn(r) {
    case r {
      Ok(v) -> Ok(v)
      Error(e) -> Error(f(e))
    }
  })
}

pub fn try_map(t: Task(a), f: fn(a) -> Result(b, Error)) -> Task(b) {
  promise.map_try(t, f)
}

/// Recovers from any error.
pub fn rescue(t: Task(a), f: fn(Error) -> Task(a)) -> Task(a) {
  promise.await(t, fn(r) {
    case r {
      Ok(v) -> promise.resolve(Ok(v))
      Error(e) -> f(e)
    }
  })
}

pub fn unwrap_or(t: Task(a), f: fn(Error) -> a) -> Promise(a) {
  promise.map(t, fn(r) {
    case r {
      Ok(v) -> v
      Error(e) -> f(e)
    }
  })
}

pub fn tap_error(t: Task(a), f: fn(Error) -> Nil) -> Task(a) {
  promise.tap(t, fn(r) {
    case r {
      Ok(_) -> Nil
      Error(e) -> f(e)
    }
  })
}

pub fn sleep(ms: Int) -> Promise(Nil) {
  promise.wait(ms)
}

/// Fails with `error.Timeout` when the task takes longer than `ms`.
pub fn timeout(t: Task(a), ms: Int, label: String) -> Task(a) {
  timeout_ffi(
    t,
    ms,
    Error(error.Timeout(label <> " timed out after " <> ms_to_string(ms))),
  )
}

@external(javascript, "./task_ffi.mjs", "timeout")
fn timeout_ffi(task: Task(a), ms: Int, expired: Result(a, Error)) -> Task(a)

fn ms_to_string(ms: Int) -> String {
  case ms >= 1000 {
    True -> int_to_string(ms / 1000) <> "s"
    False -> int_to_string(ms) <> "ms"
  }
}

@external(javascript, "./node/js_ffi.mjs", "stringify")
fn int_to_string(i: Int) -> String

/// Runs tasks concurrently and fails with the first error.
pub fn all(tasks: List(Task(a))) -> Task(List(a)) {
  promise.map(promise.await_list(tasks), result_all)
}

pub fn all2(a: Task(a), b: Task(b)) -> Task(#(a, b)) {
  use results <- promise.map(
    promise.await_list([
      map(a, js.coerce),
      map(b, js.coerce),
    ]),
  )
  case results {
    [Ok(x), Ok(y)] -> Ok(#(js.coerce(x), js.coerce(y)))
    [Error(e), _] | [_, Error(e)] -> Error(e)
    _ -> Error(error.Message("all2: unexpected result shape"))
  }
}

pub fn all3(a: Task(a), b: Task(b), c: Task(c)) -> Task(#(a, b, c)) {
  use results <- promise.map(
    promise.await_list([
      map(a, js.coerce),
      map(b, js.coerce),
      map(c, js.coerce),
    ]),
  )
  case results {
    [Ok(x), Ok(y), Ok(z)] -> Ok(#(js.coerce(x), js.coerce(y), js.coerce(z)))
    [Error(e), _, _] | [_, Error(e), _] | [_, _, Error(e)] -> Error(e)
    _ -> Error(error.Message("all3: unexpected result shape"))
  }
}

pub fn all4(
  a: Task(a),
  b: Task(b),
  c: Task(c),
  d: Task(d),
) -> Task(#(a, b, c, d)) {
  use results <- promise.map(
    promise.await_list([
      map(a, js.coerce),
      map(b, js.coerce),
      map(c, js.coerce),
      map(d, js.coerce),
    ]),
  )
  case results {
    [Ok(w), Ok(x), Ok(y), Ok(z)] ->
      Ok(#(js.coerce(w), js.coerce(x), js.coerce(y), js.coerce(z)))
    [Error(e), _, _, _]
    | [_, Error(e), _, _]
    | [_, _, Error(e), _]
    | [_, _, _, Error(e)] -> Error(e)
    _ -> Error(error.Message("all4: unexpected result shape"))
  }
}

fn result_all(results: List(Result(a, Error))) -> Result(List(a), Error) {
  list.try_map(results, fn(r) { r })
}

/// Runs `f` over the items concurrently.
pub fn parallel_map(items: List(a), f: fn(a) -> Task(b)) -> Task(List(b)) {
  all(list.map(items, f))
}

/// Runs `f` over the items one after another, stopping at the first error.
pub fn each(items: List(a), f: fn(a) -> Task(b)) -> Task(List(b)) {
  each_loop(items, f, [])
}

fn each_loop(
  items: List(a),
  f: fn(a) -> Task(b),
  acc: List(b),
) -> Task(List(b)) {
  case items {
    [] -> ok(list.reverse(acc))
    [x, ..rest] -> {
      use y <- then(f(x))
      each_loop(rest, f, [y, ..acc])
    }
  }
}

/// Sequential loop discarding results.
pub fn each_(items: List(a), f: fn(a) -> Task(b)) -> Task(Nil) {
  map(each(items, f), fn(_) { Nil })
}

/// Runs the items in chunks of `concurrency`, each chunk concurrently.
pub fn parallel_map_limited(
  items: List(a),
  concurrency: Int,
  f: fn(a) -> Task(b),
) -> Task(List(b)) {
  let chunks = list.sized_chunk(items, int_max(concurrency, 1))
  use groups <- map(each(chunks, fn(chunk) { parallel_map(chunk, f) }))
  list.flatten(groups)
}

fn int_max(a: Int, b: Int) -> Int {
  case a > b {
    True -> a
    False -> b
  }
}

/// Retries `run` up to `times` more times when `should_retry` accepts the
/// error, with exponential backoff and jitter from `base_ms`.
pub fn retry(
  run: fn() -> Task(a),
  times: Int,
  base_ms: Int,
  should_retry: fn(Error) -> Bool,
) -> Task(a) {
  retry_loop(run, times, base_ms, should_retry, 0)
}

fn retry_loop(
  run: fn() -> Task(a),
  times: Int,
  base_ms: Int,
  should_retry: fn(Error) -> Bool,
  attempt: Int,
) -> Task(a) {
  use r <- promise.await(run())
  case r {
    Ok(v) -> promise.resolve(Ok(v))
    Error(e) ->
      case attempt < times && should_retry(e) {
        False -> promise.resolve(Error(e))
        True -> {
          let delay = jitter(base_ms * pow2(attempt))
          use _ <- promise.await(promise.wait(delay))
          retry_loop(run, times, base_ms, should_retry, attempt + 1)
        }
      }
  }
}

fn pow2(n: Int) -> Int {
  case n <= 0 {
    True -> 1
    False -> 2 * pow2(n - 1)
  }
}

@external(javascript, "./task_ffi.mjs", "jitter")
fn jitter(ms: Int) -> Int

/// Lifts an optional lookup: `None` becomes `NotFound`.
pub fn require(o: Option(a), message: String) -> Result(a, Error) {
  case o {
    Some(v) -> Ok(v)
    None -> Error(error.NotFound(message))
  }
}

pub fn require_task(t: Task(Option(a)), message: String) -> Task(a) {
  try_map(t, require(_, message))
}

/// Starts a task for its side effects, logging failures through `on_error`.
pub fn background(t: Task(a), on_error: fn(Error) -> Nil) -> Nil {
  js.fire_and_forget(t, on_error)
}
