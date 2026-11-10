import rocksky_api/error
import rocksky_api/task.{type Task}

/// A failed restore alone is never evidence of expiry: database and PDS
/// outages must preserve the login. The SDK removes rejected OAuth sessions.
pub fn check(
  has_session: fn() -> Task(Bool),
  restore: fn() -> Task(Bool),
) -> Task(Nil) {
  use exists <- task.then(has_session())
  case exists {
    False -> task.fail(error.PdsSessionExpired)
    True -> {
      use restored <- task.then(restore())
      case restored {
        True -> task.ok(Nil)
        False -> {
          use still_exists <- task.then(has_session())
          case still_exists {
            False -> task.fail(error.PdsSessionExpired)
            True -> task.fail(error.Upstream(503, "session_unavailable"))
          }
        }
      }
    }
  }
}
