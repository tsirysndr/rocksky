import gleam/javascript/promise.{type Promise}

@external(javascript, "./cron_ffi.mjs", "schedule")
pub fn schedule(expression: String, task: fn() -> Promise(Nil)) -> Nil
