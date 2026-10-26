import gleam/javascript/promise.{type Promise}

/// Launch the original TSX/Ink UI, bundled separately from the Gleam commands.
@external(javascript, "./tui_ffi.mjs", "run")
pub fn run(output: String) -> Promise(Nil)
