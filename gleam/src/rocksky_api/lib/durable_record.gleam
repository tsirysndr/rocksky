//// Publishing records so that a lost reply never produces a duplicate.

import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import rocksky_api/atproto/agent
import rocksky_api/error
import rocksky_api/task.{type Task}

/// Only a confirmed absence allows publication; a failed lookup is retryable.
pub fn find(lookup: fn() -> Task(agent.Record)) -> Task(Option(String)) {
  use r <- promise.await(lookup())
  case r {
    Ok(record) -> task.ok(Some(record.uri))
    Error(error.Js(e)) ->
      case agent.xrpc_error_name(e) {
        Some("RecordNotFound") -> task.ok(None)
        _ -> task.fail(error.Js(e))
      }
    Error(error.NotFound(_)) -> task.ok(None)
    Error(e) -> task.fail(e)
  }
}

/// `create` must use the persisted rkey with `swapRecord: null`.
pub fn publish(
  create: fn() -> Task(agent.RecordRef),
  lookup: fn() -> Task(agent.Record),
) -> Task(String) {
  use created <- promise.await(create())
  case created {
    Ok(ref) -> task.ok(ref.uri)
    Error(e) -> {
      use found <- promise.await(find(lookup))
      case found {
        Ok(Some(uri)) -> task.ok(uri)
        _ -> task.fail(e)
      }
    }
  }
}
