import gleam/javascript/promise.{type Promise}

@external(javascript, "./hardware_ffi.mjs", "readers")
pub fn readers() -> Promise(Result(List(String), String))

@external(javascript, "./hardware_ffi.mjs", "read_tag")
pub fn read_tag(
  watch: Bool,
  callback: fn(String, List(String)) -> Nil,
) -> Promise(Result(Nil, String))

@external(javascript, "./hardware_ffi.mjs", "write_tag")
pub fn write_tag(payloads: List(String)) -> Promise(Result(Nil, String))

@external(javascript, "./hardware_ffi.mjs", "read_card")
pub fn read_card() -> Promise(Result(List(String), String))

@external(javascript, "./hardware_ffi.mjs", "write_card")
pub fn write_card(
  payloads: List(String),
  secret: String,
) -> Promise(Result(List(String), String))

@external(javascript, "./hardware_ffi.mjs", "decode_component")
pub fn decode_component(value: String) -> String

@external(javascript, "./hardware_ffi.mjs", "watch")
pub fn watch(callback: fn(List(String)) -> Promise(Nil)) -> fn() -> Nil
