//// The shape every XRPC method shares: decode params, run the pipeline with
//// a deadline and transient-DB retry, and turn the result into an output.

import gleam/dynamic/decode.{type Decoder}
import gleam/javascript/promise.{type Promise}
import gleam/json.{type Json}
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/db/db
import rocksky_api/error.{type Error}
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Output, type Request}
import rocksky_api/task.{type Task}

/// What to answer when the pipeline fails.
pub type OnError {
  /// Log and answer `{}` (what most TypeScript handlers did).
  EmptyObject
  /// Log and answer the given body.
  Fallback(Json)
  FallbackExceptRequest(Json)
  /// Answer the XRPC error for the failure.
  Propagate
}

pub type Options {
  Options(label: String, timeout_ms: Int, on_error: OnError, retry: Bool)
}

pub fn options(label: String) -> Options {
  Options(label:, timeout_ms: 10_000, on_error: EmptyObject, retry: True)
}

pub fn timeout(o: Options, ms: Int) -> Options {
  Options(..o, timeout_ms: ms)
}

pub fn on_error(o: Options, on_error: OnError) -> Options {
  Options(..o, on_error:)
}

pub fn no_retry(o: Options) -> Options {
  Options(..o, retry: False)
}

pub fn params(req: Request, decoder: Decoder(p)) -> Result(p, Error) {
  decode.run(req.params, decoder)
  |> error.decode("params", _)
  |> result.map_error(fn(e) { error.InvalidRequest(error.to_string(e)) })
}

pub fn input(req: Request, decoder: Decoder(i)) -> Result(i, Error) {
  case req.input {
    Some(body) -> decode.run(body, decoder) |> error.decode("input", _)
    None -> Error(error.InvalidRequest("Missing request body"))
  }
}

/// Runs `work` under the options and renders the output.
pub fn run(o: Options, work: fn() -> Task(Json)) -> Promise(Output) {
  let deadline = js.now_ms() + o.timeout_ms
  let attempt = fn() {
    case js.now_ms() >= deadline {
      True -> task.fail(error.Timeout(o.label <> " timed out"))
      False -> work()
    }
  }
  let t =
    case o.retry {
      True -> db.with_transient_retry(attempt)
      False -> attempt()
    }
    |> task.timeout(o.timeout_ms, o.label)
  use result <- promise.map(t)
  case result {
    Ok(body) -> xrpc_server.Json(body)
    Error(e) ->
      case o.on_error {
        Propagate -> {
          log_failure(o.label, e)
          xrpc_server.fail(e)
        }
        EmptyObject -> {
          log.error("Error in " <> o.label <> ": " <> error.describe(e))
          xrpc_server.Json(json.object([]))
        }
        FallbackExceptRequest(body) ->
          case e {
            error.NotFound(_)
            | error.InvalidRequest(_)
            | error.RequestError(_, _) -> xrpc_server.fail(e)
            _ -> {
              log_failure(o.label, e)
              xrpc_server.Json(body)
            }
          }
        Fallback(body) -> {
          log.error("Error in " <> o.label <> ": " <> error.describe(e))
          xrpc_server.Json(body)
        }
      }
  }
}

fn log_failure(label: String, e: Error) -> Nil {
  case e {
    error.Unauthorized(_)
    | error.NotFound(_)
    | error.InvalidRequest(_)
    | error.RequestError(_, _)
    | error.Forbidden(_) -> Nil
    _ -> log.error("Error in " <> label <> ": " <> error.describe(e))
  }
}

/// A query: decode params, then run.
pub fn query(
  req: Request,
  o: Options,
  decoder: Decoder(p),
  work: fn(p) -> Task(Json),
) -> Promise(Output) {
  case params(req, decoder) {
    Ok(p) -> run(o, fn() { work(p) })
    Error(e) -> promise.resolve(xrpc_server.invalid_request(error.to_string(e)))
  }
}

/// A procedure: decode params and body, then run.
pub fn procedure(
  req: Request,
  o: Options,
  params_decoder: Decoder(p),
  input_decoder: Decoder(i),
  work: fn(p, i) -> Task(Json),
) -> Promise(Output) {
  case params(req, params_decoder), input(req, input_decoder) {
    Ok(p), Ok(i) -> run(o, fn() { work(p, i) })
    Error(e), _ | _, Error(e) ->
      promise.resolve(xrpc_server.invalid_request(error.to_string(e)))
  }
}

/// A procedure without parameters.
pub fn procedure_body(
  req: Request,
  o: Options,
  input_decoder: Decoder(i),
  work: fn(i) -> Task(Json),
) -> Promise(Output) {
  case input(req, input_decoder) {
    Ok(i) -> run(o, fn() { work(i) })
    Error(e) -> promise.resolve(xrpc_server.invalid_request(error.to_string(e)))
  }
}

pub fn authenticated(req: Request) -> Result(String, Error) {
  case xrpc_server.did(req.auth) {
    Some(did) -> Ok(did)
    None -> Error(error.Unauthorized("Authentication required"))
  }
}

pub fn caller(req: Request) -> Option(String) {
  xrpc_server.did(req.auth)
}
