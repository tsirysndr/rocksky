import gleam/dynamic.{type Dynamic}
import gleam/float
import gleam/int
import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/error
import rocksky_api/node/abort.{type Signal}
import rocksky_api/node/http_fetch as fetch
import rocksky_api/node/js
import rocksky_api/task

pub const spotify_timeout_ms = 5000

pub fn spotify_get(
  url: String,
  access_token: String,
  operation: String,
  signal: Option(Signal),
) -> task.Task(Dynamic) {
  attempt(url, access_token, operation, signal, 0)
}

fn failed(status: Int, operation: String) {
  error.Upstream(
    status,
    "Spotify " <> operation <> " failed: " <> int.to_string(status),
  )
}

fn attempt(
  url: String,
  token: String,
  operation: String,
  signal: Option(Signal),
  index: Int,
) -> task.Task(Dynamic) {
  use _ <- task.then(case signal {
    None -> task.ok(Nil)
    Some(s) -> abort.check(s) |> result.map_error(error.Js) |> task.from_result
  })
  let timeout = abort.timeout(spotify_timeout_ms)
  let combined = case signal {
    None -> timeout
    Some(s) -> abort.any([s, timeout])
  }
  let backoff = case index {
    0 -> 1000
    1 -> 2000
    _ -> 4000
  }
  let retry = fn(ms) {
    use _ <- task.then(abort.sleep(ms, signal) |> task.attempt_result)
    attempt(url, token, operation, signal, index + 1)
  }
  use response <- promise.await(fetch.get(
    url,
    [#("Authorization", "Bearer " <> token)],
    combined,
  ))
  case response {
    Error(e) -> {
      let aborted =
        js.name(e) == "AbortError"
        || js.name(e) == "TimeoutError"
        || option.unwrap(option.map(signal, abort.aborted), False)
      case aborted || index == 2 {
        True -> task.fail(error.Js(e))
        False -> retry(backoff)
      }
    }
    Ok(response) -> {
      let status = fetch.status(response)
      case status {
        n if n >= 200 && n < 300 ->
          fetch.json(response)
          |> task.attempt_result
          |> task.map_error(fn(e) {
            error.Upstream(
              status,
              "Spotify "
                <> operation
                <> " returned a malformed body: "
                <> error.to_string(e),
            )
          })
        429 -> {
          let text = option.unwrap(fetch.header(response, "retry-after"), "")
          let after =
            int.parse(text)
            |> result.map(int.to_float)
            |> result.or(float.parse(text))
            |> result.unwrap(0.0)
          let wait_ms = case after >. 0.0 {
            True -> float.truncate(after *. 1000.0)
            False -> backoff
          }
          case index == 2 || wait_ms > 3000 {
            True ->
              task.fail(error.Upstream(
                429,
                "Spotify "
                  <> operation
                  <> " rate limited (retry-after: "
                  <> case after == 0.0 {
                  True -> "unset"
                  False -> text
                }
                  <> "s)",
              ))
            False -> retry(wait_ms)
          }
        }
        n if n >= 500 ->
          case index == 2 {
            True -> task.fail(failed(status, operation))
            False -> retry(backoff)
          }
        _ -> task.fail(failed(status, operation))
      }
    }
  }
}
