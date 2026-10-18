import gleam/option.{type Option}

pub type Map(k, v)

@external(javascript, "./map_ffi.mjs", "create")
pub fn new() -> Map(k, v)

@external(javascript, "./map_ffi.mjs", "get")
pub fn get(map: Map(k, v), key: k) -> Option(v)

@external(javascript, "./map_ffi.mjs", "set")
pub fn set(map: Map(k, v), key: k, value: v) -> Nil

@external(javascript, "./map_ffi.mjs", "remove")
pub fn remove(map: Map(k, v), key: k) -> Nil
