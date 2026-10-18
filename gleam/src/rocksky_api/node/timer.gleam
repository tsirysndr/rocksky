pub type Timer

@external(javascript, "./timer_ffi.mjs", "schedule")
pub fn schedule(delay_ms: Int, callback: fn() -> Nil) -> Timer

@external(javascript, "./timer_ffi.mjs", "cancel")
pub fn cancel(timer: Timer) -> Nil
