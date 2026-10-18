import gleam/javascript/promise
import gleam/option.{None, Some}
import rocksky_api/atproto/agent
import rocksky_api/error
import rocksky_api/lib/durable_record
import rocksky_api/node/js
import rocksky_api/task

const uri = "at://did:plc:a/app.rocksky.scrobble/3mv234567abcd"

fn not_found() -> error.Error {
  error.Js(js.coerce(js.object([#("error", js.coerce("RecordNotFound"))])))
}

pub fn reconciles_a_lost_reply_test() {
  use result <- promise.map(
    durable_record.publish(
      fn() { task.fail(error.Message("connection reset after commit")) },
      fn() { task.ok(agent.Record(uri, None, js.null())) },
    ),
  )
  assert result == Ok(uri)
}

pub fn outage_is_not_a_missing_record_test() {
  use result <- promise.await(
    durable_record.find(fn() { task.fail(error.Message("timeout")) }),
  )
  assert result == Error(error.Message("timeout"))
  use absent <- promise.map(
    durable_record.find(fn() { task.fail(not_found()) }),
  )
  assert absent == Ok(None)
}

pub fn failed_write_with_absent_record_fails_test() {
  use result <- promise.map(
    durable_record.publish(
      fn() { task.fail(error.Message("write failed")) },
      fn() { task.fail(not_found()) },
    ),
  )
  assert result == Error(error.Message("write failed"))
}

pub fn found_record_test() {
  use result <- promise.map(
    durable_record.find(fn() {
      task.ok(agent.Record(uri, Some("cid"), js.null()))
    }),
  )
  assert result == Ok(Some(uri))
}
