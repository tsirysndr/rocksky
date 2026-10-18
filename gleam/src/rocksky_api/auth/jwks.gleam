import gleam/json

@external(javascript, "./jwks_ffi.mjs", "parseJwks")
pub fn parse(raw: String) -> json.Json
