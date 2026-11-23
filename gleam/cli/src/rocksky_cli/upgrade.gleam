import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}

@external(javascript, "./upgrade_runtime.mjs", "upgradeGleam")
pub fn run(options: Dynamic, current_version: String) -> Promise(Nil)
