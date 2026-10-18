import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/list
import gleam/result
import rocksky_api/error
import rocksky_api/node/js
import rocksky_api/task

pub fn is_transient(value: Dynamic) -> Bool {
  let code =
    decode.run(js.get(value, "code"), decode.string) |> result.unwrap("")
  let status =
    decode.run(js.get(value, "httpStatus"), decode.int) |> result.unwrap(0)
  let cause = js.get(value, "cause")
  list.contains(
    [
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ECONNRESET",
      "EAI_AGAIN",
      "ENOTFOUND",
      "EPIPE",
      "ENETUNREACH",
      "EHOSTUNREACH",
    ],
    code,
  )
  || status >= 500
  || { !js.is_nullish(cause) && is_transient(cause) }
}

pub fn run(operation: fn() -> task.Task(a)) -> task.Task(a) {
  with_options(operation, 3, 200)
}

pub fn with_options(
  operation: fn() -> task.Task(a),
  attempts: Int,
  base_delay_ms: Int,
) -> task.Task(a) {
  use result <- promise.await(operation())
  case result {
    Error(error.Js(e)) if attempts > 1 ->
      case is_transient(js.to_dynamic(e)) {
        False -> promise.resolve(result)
        True -> {
          use _ <- promise.await(task.sleep(base_delay_ms + js.random_int(100)))
          with_options(operation, attempts - 1, base_delay_ms * 2)
        }
      }
    _ -> promise.resolve(result)
  }
}
