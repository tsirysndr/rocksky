import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import rocksky_cli/tui/settings.{type Settings}

pub type Player

@external(javascript, "./native_ffi.mjs", "create")
pub fn create(settings: Settings) -> Promise(Player)

@external(javascript, "./native_ffi.mjs", "configure")
pub fn configure(player: Player, settings: Settings) -> Nil

@external(javascript, "./native_ffi.mjs", "queue")
pub fn queue(player: Player, urls: List(String), index: Int) -> Nil

@external(javascript, "./native_ffi.mjs", "command")
pub fn command(player: Player, name: String, argument: Int) -> Nil

@external(javascript, "./native_ffi.mjs", "status")
pub fn status(player: Player) -> Dynamic

@external(javascript, "./native_ffi.mjs", "insert")
pub fn insert(
  player: Player,
  urls: List(String),
  position: Int,
  index: Int,
) -> Nil

@external(javascript, "./native_ffi.mjs", "close")
pub fn close(player: Player) -> Nil
