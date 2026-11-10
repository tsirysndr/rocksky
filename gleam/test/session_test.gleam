import gleam/javascript/promise
import rocksky_api/error
import rocksky_api/session/status
import rocksky_api/task

pub fn missing_session_test() {
  use result <- promise.map(
    status.check(fn() { task.ok(False) }, fn() {
      panic as "must not restore a missing session"
    }),
  )
  assert result == Error(error.PdsSessionExpired)
}

pub fn active_session_test() {
  use result <- promise.map(
    status.check(fn() { task.ok(True) }, fn() { task.ok(True) }),
  )
  assert result == Ok(Nil)
}

pub fn temporary_restore_failure_test() {
  use result <- promise.map(
    status.check(fn() { task.ok(True) }, fn() { task.ok(False) }),
  )
  assert result == Error(error.Upstream(503, "session_unavailable"))
}

pub fn database_failure_test() {
  let unavailable = error.Message("database unavailable")
  use result <- promise.map(
    status.check(fn() { task.fail(unavailable) }, fn() { task.ok(True) }),
  )
  assert result == Error(unavailable)
}
