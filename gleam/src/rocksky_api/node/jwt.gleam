//// Binding to `jsonwebtoken`.

import gleam/dynamic.{type Dynamic}
import gleam/json.{type Json}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

/// Verifies the signature; expiry is ignored (long-lived tokens).
@external(javascript, "./jwt_ffi.mjs", "verifyIgnoringExpiration")
pub fn verify_ignoring_expiration(
  token: String,
  secret: String,
) -> Result(Dynamic, Exception)

@external(javascript, "./jwt_ffi.mjs", "verify")
pub fn verify(token: String, secret: String) -> Result(Dynamic, Exception)

/// Signs `payload`; `expires_in` is a jsonwebtoken duration such as `"1h"`.
@external(javascript, "./jwt_ffi.mjs", "sign")
pub fn sign(payload: Json, secret: String, expires_in: Option(String)) -> String

@external(javascript, "./jwt_ffi.mjs", "decode")
pub fn decode(token: String) -> Option(Dynamic)
