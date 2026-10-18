import gleam/javascript/promise
import rocksky_api/error
import rocksky_api/lib/query_cache
import rocksky_api/task

type Counter

@external(javascript, "./query_cache_test_ffi.mjs", "counter")
fn counter() -> Counter

@external(javascript, "./query_cache_test_ffi.mjs", "bump")
fn bump(c: Counter) -> Int

@external(javascript, "./query_cache_test_ffi.mjs", "value")
fn value(c: Counter) -> Int

pub fn shares_concurrent_requests_test() {
  let calls = counter()
  let get =
    query_cache.cached(
      60_000,
      200,
      fn(p: #(String, Int)) { p.0 <> ":" <> int_to_string(p.1) },
      fn(p) {
        let _ = bump(calls)
        use _ <- promise.map(promise.wait(10))
        Ok(p.1)
      },
    )
  use results <- promise.await(
    promise.await_list([
      get(#("test", 2025)),
      get(#("test", 2025)),
      get(#("test", 2025)),
    ]),
  )
  assert results == [Ok(2025), Ok(2025), Ok(2025)]
  use again <- promise.await(get(#("test", 2025)))
  assert again == Ok(2025)
  assert value(calls) == 1
  use _ <- promise.map(get(#("test", 2024)))
  assert value(calls) == 2
}

pub fn does_not_cache_failures_test() {
  let calls = counter()
  let get =
    query_cache.cached(60_000, 200, fn(did: String) { did }, fn(_) {
      case bump(calls) {
        1 -> task.fail(error.Message("database unavailable"))
        _ -> task.ok(42)
      }
    })
  use first <- promise.await(get("test"))
  assert first == Error(error.Message("database unavailable"))
  use second <- promise.map(get("test"))
  assert second == Ok(42)
  assert value(calls) == 2
}

@external(javascript, "./query_cache_test_ffi.mjs", "str")
fn int_to_string(i: Int) -> String
